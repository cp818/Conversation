// Enhanced Express API for Vercel with Voice Support
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');
const axios = require('axios');

// Using direct API calls for all external services instead of SDKs
console.log('[INFO] Using direct API calls for all services');

// Direct API helpers for external services (no SDKs)
const deepgramApiHelper = {
  async transcribeAudio(audioBuffer, options = {}) {
    try {
      console.log('[DEBUG] Using direct Deepgram API call');
      
      if (!process.env.DEEPGRAM_API_KEY) {
        throw new Error('DEEPGRAM_API_KEY is not defined');
      }
      
      const url = 'https://api.deepgram.com/v1/listen';
      
      // Build query parameters
      const queryParams = new URLSearchParams({
        model: options.model || 'nova-3',
        language: options.language || 'en-US',
        smart_format: 'true',
        diarize: 'false'
      }).toString();
      
      // Make the API request
      const response = await axios.post(`${url}?${queryParams}`, audioBuffer, {
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'audio/webm'
        }
      });
      
      console.log('[DEBUG] Deepgram direct API response status:', response.status);
      
      return response.data;
    } catch (error) {
      console.error('[ERROR] Deepgram direct API error:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
      throw error;
    }
  }
};

// Direct API helper for ElevenLabs
const elevenLabsApiHelper = {
  async generateSpeech(text, options = {}) {
    try {
      console.log('[DEBUG] Using direct ElevenLabs API call');
      
      if (!process.env.ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY is not defined');
      }
      
      const voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
      console.log(`[DEBUG] Using voice ID: ${voiceId}`);
      
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
      
      // Prepare the request payload
      const payload = {
        text: text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      };
      
      console.log('[DEBUG] Sending TTS request to ElevenLabs with payload:', JSON.stringify(payload).substring(0, 200) + '...');
      
      // Make the API request
      const response = await axios.post(url, payload, {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer' // Important: we want binary data
      });
      
      console.log('[DEBUG] ElevenLabs direct API response status:', response.status);
      
      return response.data; // Binary audio data
    } catch (error) {
      console.error('[ERROR] ElevenLabs direct API error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        // Don't log binary response data
      }
      throw error;
    }
  }
};

// Initialize Express app
const app = express();
app.use(express.json({ limit: '50mb' }));

// Debug logging middleware
app.use((req, res, next) => {
  console.log(`[DEBUG] ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.stack}`);
  res.status(500).json({
    success: false,
    error: 'Server error',
    debug: process.env.NODE_ENV !== 'production' ? err.message : undefined
  });
});

// Api handlers
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Default system prompt
const defaultSystemPrompt = "You are Emma AI, a helpful voice assistant that provides concise and natural responses. Your tone is friendly but professional.";

// Environment variable handling with safe fallbacks
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Default voice ID

// Initialize OpenAI (only if API key is available)
let openai = null;
if (OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  } catch (error) {
    console.error('Error initializing OpenAI:', error);
  }
}

// We're using direct API calls for Deepgram, no SDK initialization needed
console.log('[INFO] Using direct Deepgram API calls instead of SDK');

// Using direct API calls, no SDK initialization needed
console.log('[INFO] Using direct ElevenLabs API calls');

// Stats tracking
const conversationStats = {
  totalConversations: 0,
  activeConversations: 0,
  totalMessages: 0,
  averageLatency: 0
};

// In-memory store for conversations
const conversations = new Map();

// API Routes
app.get('/api/stats', (req, res) => {
  res.json(conversationStats);
});

app.get('/api/system-prompt', (req, res) => {
  res.json({ prompt: defaultSystemPrompt });
});

app.post('/api/system-prompt', (req, res) => {
  res.json({ success: true, prompt: defaultSystemPrompt });
});

// Start conversation endpoint
app.post('/api/conversation/start', (req, res) => {
  const { userName } = req.body;
  
  if (!userName) {
    return res.status(400).json({ success: false, error: 'Username is required' });
  }
  
  const conversationId = Date.now().toString();
  
  // Store conversation data
  conversations.set(conversationId, {
    id: conversationId,
    userName,
    messages: [],
    startTime: Date.now()
  });
  
  // Update stats
  conversationStats.totalConversations++;
  conversationStats.activeConversations++;
  
  // Initial welcome message
  const welcomeMessage = {
    role: 'assistant',
    content: `Hello ${userName}! I'm Emma AI. How can I help you today?`,
    timestamp: Date.now()
  };
  
  res.json({
    success: true,
    conversationId,
    message: welcomeMessage,
    stats: conversationStats
  });
});

// End conversation endpoint
app.post('/api/conversation/:id/end', (req, res) => {
  const { id } = req.params;
  
  if (conversations.has(id)) {
    conversations.delete(id);
    conversationStats.activeConversations = Math.max(0, conversationStats.activeConversations - 1);
    
    res.json({
      success: true,
      stats: conversationStats
    });
  } else {
    res.status(404).json({
      success: false,
      error: 'Conversation not found'
    });
  }
});

// Speech-to-text endpoint
app.post('/api/speech-to-text', async (req, res) => {
  console.log('[DEBUG] Speech-to-text request received');

  // Add direct environment variable check
  console.log('[DEBUG] DEEPGRAM_API_KEY available:', !!process.env.DEEPGRAM_API_KEY);

  if (!process.env.DEEPGRAM_API_KEY) {
    console.log('[ERROR] Missing DEEPGRAM_API_KEY environment variable');
    return res.json({
      success: false,
      error: 'Speech-to-text service is unavailable. API key not configured.',
      mockTranscript: 'This is a fallback response since speech recognition is unavailable. Please type your message instead.'
    });
  }

  try {
    // Extract base64 audio from request
    const { audio } = req.body;
    
    if (!audio) {
      return res.status(400).json({
        success: false,
        error: 'No audio data provided'
      });
    }
    
    console.log('[DEBUG] Audio data received, length:', audio.length);
    
    // Convert base64 to buffer
    const audioData = audio.split(',');
    if (audioData.length < 2) {
      throw new Error('Invalid audio data format');
    }
    
    const audioBuffer = Buffer.from(audioData[1], 'base64');
    console.log('[DEBUG] Audio buffer created, size:', audioBuffer.length);
    
    // Use direct API call instead of SDK
    console.log('[DEBUG] Using direct API call to Deepgram');
    const dgResponse = await deepgramApiHelper.transcribeAudio(audioBuffer, {
      model: 'nova-3',
      language: 'en-US'
    });
    
    console.log('[DEBUG] Received response from Deepgram');
    
    // Extract transcript
    const transcript = dgResponse.results?.channels[0]?.alternatives[0]?.transcript || '';
    console.log('[DEBUG] Transcript:', transcript);
    
    res.json({
      success: true,
      transcript: transcript.trim(),
      confidence: dgResponse.results?.channels[0]?.alternatives[0]?.confidence || 0
    });
    
  } catch (error) {
    console.error('[ERROR] Error in speech-to-text:', error);
    res.status(200).json({
      success: false,
      error: `Failed to process audio: ${error.message}`,
      mockTranscript: 'Speech recognition failed. Please type your message instead.'
    });
  }
});

// Text-to-speech endpoint
app.post('/api/text-to-speech', async (req, res) => {
  console.log('[DEBUG] Text-to-speech request received');
  
  // Check if ElevenLabs API key is available
  if (!process.env.ELEVENLABS_API_KEY) {
    console.log('[DEBUG] ELEVENLABS_API_KEY is not set');
    // Return success with null audio to allow the app to continue without TTS
    return res.json({
      success: true,
      audio: null,
      message: 'Text-to-speech service is unavailable, continuing without voice'
    });
  }

  try {
    const { text, voiceId } = req.body;
    console.log(`[DEBUG] Processing TTS request for text: "${text.substring(0, 50)}..."`);
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'No text provided'
      });
    }
    
    // Generate audio using direct ElevenLabs API
    const options = {
      voiceId: voiceId || process.env.ELEVENLABS_VOICE_ID
    };
    
    // Get audio via direct API
    const audioBuffer = await elevenLabsApiHelper.generateSpeech(text, options);
    
    console.log('[DEBUG] Successfully received audio response from ElevenLabs');
    
    // Convert the audio to base64
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    
    res.json({
      success: true,
      audio: `data:audio/mp3;base64,${audioBase64}`
    });
    
  } catch (error) {
    console.error('[ERROR] Error in text-to-speech:', error);
    // Return success with null audio to allow the app to continue without TTS
    res.json({
      success: true,
      audio: null,
      message: 'Text-to-speech failed, continuing without voice',
      error: error.message
    });
  }
});

// Send message endpoint
app.post('/api/conversation/:id/message', async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  
  if (!conversations.has(id)) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found'
    });
  }
  
  // If OpenAI isn't available, use a mock response
  if (!openai) {
    const mockResponse = {
      role: 'assistant',
      content: "I'm sorry, I can't process your request right now. The OpenAI API key might be missing or invalid.",
      timestamp: Date.now(),
      latency: 100
    };
    
    conversationStats.totalMessages++;
    
    return res.json({
      success: true,
      message: mockResponse,
      stats: conversationStats
    });
  }
  
  try {
    // Start timer for latency measurement
    const startTime = Date.now();
    
    // Generate simple response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: defaultSystemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.7,
      max_tokens: 250
    });
    
    const responseContent = completion.choices[0].message.content;
    const latency = Date.now() - startTime;
    
    // Response message
    const assistantMessage = {
      role: 'assistant',
      content: responseContent,
      timestamp: Date.now(),
      latency
    };
    
    // Update stats
    conversationStats.totalMessages++;
    
    res.json({
      success: true,
      message: assistantMessage,
      stats: conversationStats
    });
    
  } catch (error) {
    console.error('Error generating response:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI response',
      details: error.message
    });
  }
});

// Export the Express API for Vercel
module.exports = app;
