// Enhanced Express API for Vercel with Voice Support
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');
const { Deepgram } = require('@deepgram/sdk');
const axios = require('axios');

// ElevenLabs requires a different import approach
let ElevenLabs;
try {
  ElevenLabs = require('elevenlabs');
} catch (error) {
  console.error('Error importing ElevenLabs:', error);
  ElevenLabs = null;
}

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

// Initialize Deepgram (only if API key is available)
let deepgram = null;
if (DEEPGRAM_API_KEY) {
  try {
    deepgram = new Deepgram(DEEPGRAM_API_KEY);
  } catch (error) {
    console.error('Error initializing Deepgram:', error);
  }
}

// Initialize ElevenLabs (only if API key is available)
let elevenLabs = null;
if (ELEVENLABS_API_KEY && ElevenLabs) {
  try {
    elevenLabs = new ElevenLabs({
      apiKey: ELEVENLABS_API_KEY
    });
    console.log('ElevenLabs initialized successfully');
  } catch (error) {
    console.error('Error initializing ElevenLabs:', error);
  }
}

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
  if (!deepgram) {
    return res.status(503).json({
      success: false,
      error: 'Speech-to-text service is unavailable'
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
    
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio.split(',')[1], 'base64');
    
    // Send to Deepgram for transcription
    const response = await deepgram.transcription.preRecorded(
      { buffer: audioBuffer, mimetype: 'audio/webm' },
      { 
        model: 'nova-3',
        language: 'en-US',
        smart_format: true,
        diarize: false
      }
    );
    
    // Extract transcript
    const transcript = response.results?.channels[0]?.alternatives[0]?.transcript || '';
    
    res.json({
      success: true,
      transcript: transcript.trim(),
      confidence: response.results?.channels[0]?.alternatives[0]?.confidence || 0
    });
    
  } catch (error) {
    console.error('Error in speech-to-text:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process audio',
      details: error.message
    });
  }
});

// Text-to-speech endpoint
app.post('/api/text-to-speech', async (req, res) => {
  console.log('[DEBUG] Text-to-speech request received');
  
  // Check if ElevenLabs is available
  if (!elevenLabs) {
    console.log('[DEBUG] ElevenLabs service is not initialized');
    // Return success with null audio to allow the app to continue without TTS
    return res.json({
      success: true,
      audio: null,
      message: 'Text-to-speech service is unavailable, continuing without voice'
    });
  }

  try {
    const { text, voiceId = ELEVENLABS_VOICE_ID } = req.body;
    console.log(`[DEBUG] Processing TTS request for text: "${text.substring(0, 50)}..."`);
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'No text provided'
      });
    }
    
    // Generate audio using ElevenLabs
    console.log(`[DEBUG] Using voice ID: ${voiceId}`);
    
    // Check method availability
    if (typeof elevenLabs.textToSpeech !== 'function') {
      console.error('[ERROR] elevenLabs.textToSpeech is not a function. Available methods:', Object.keys(elevenLabs));
      throw new Error('Invalid ElevenLabs SDK configuration');
    }
    
    const audioResponse = await elevenLabs.textToSpeech({
      voice_id: voiceId,
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    });
    
    console.log('[DEBUG] Successfully received audio response from ElevenLabs');
    
    // Convert the audio to base64
    const audioBase64 = Buffer.from(audioResponse).toString('base64');
    
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
