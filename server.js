const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { createClient } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const { ElevenLabs } = require('elevenlabs');
const { Room, RoomServiceClient, RoomServiceClientProvider } = require('livekit-server-sdk');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API keys (in production these should be in environment variables)
const DEEPGRAM_API_KEY = 'YOUR_DEEPGRAM_API_KEY';
const ELEVENLABS_API_KEY = 'YOUR_ELEVENLABS_API_KEY';
const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY';
const LIVEKIT_API_KEY = 'YOUR_LIVEKIT_API_KEY';
const LIVEKIT_API_SECRET = 'YOUR_LIVEKIT_API_SECRET';
const LIVEKIT_WS_URL = 'wss://your-livekit-instance.com';

// Initialize clients
const deepgram = createClient(DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const elevenlabs = new ElevenLabs({ apiKey: ELEVENLABS_API_KEY });
const roomService = new RoomServiceClient(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL);

// Stats tracking
const conversationStats = {
  totalConversations: 0,
  activeConversations: 0,
  totalMessages: 0,
  averageLatency: 0,
  latencyMeasurements: []
};

// Websocket connections
const connections = new Map();

// Deepgram transcription streaming
async function transcribeAudio(audioData, connectionId) {
  try {
    // Create a buffer from audio data
    const buffer = Buffer.from(audioData);
    
    // Use the new Deepgram SDK format
    const { result } = await deepgram.listen.prerecorded.transcribeFile(buffer, {
      mimetype: 'audio/webm',
      options: {
        punctuate: true,
        model: 'nova-2',
        language: 'en-US'
      }
    });
    
    // Extract the transcript
    const text = result?.results?.channels[0]?.alternatives[0]?.transcript || '';
    if (text.trim()) {
      const connection = connections.get(connectionId);
      if (connection) {
        connection.transcribedText = text;
        generateResponse(text, connectionId);
      }
    }
  } catch (error) {
    console.error('Deepgram transcription error:', error);
    const connection = connections.get(connectionId);
    if (connection && connection.ws.readyState === 1) {
      connection.ws.send(JSON.stringify({
        type: 'error',
        error: 'Transcription failed'
      }));
    }
  }
}

// OpenAI streaming response
async function generateResponse(text, connectionId) {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  try {
    // Record start time for latency measurement
    const startTime = Date.now();
    connection.responseStartTime = startTime;
    
    // Send transcribed text to client
    connection.ws.send(JSON.stringify({
      type: 'transcription',
      text: text,
      timestamp: startTime
    }));
    
    // Generate AI response
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are Emma AI, a helpful voice assistant that provides concise and natural responses.' },
        ...connection.messageHistory,
        { role: 'user', content: text }
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 200
    });
    
    // Add user message to history
    connection.messageHistory.push({ role: 'user', content: text });
    
    // Initialize response
    let fullResponse = '';
    
    // Process streaming response
    for await (const chunk of response) {
      if (chunk.choices[0]?.delta?.content) {
        const content = chunk.choices[0].delta.content;
        fullResponse += content;
        
        // Send chunk to client
        connection.ws.send(JSON.stringify({
          type: 'ai_response_chunk',
          content: content,
          timestamp: Date.now()
        }));
      }
    }
    
    // Record end time for latency measurement
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    // Update stats
    conversationStats.totalMessages++;
    conversationStats.latencyMeasurements.push(latency);
    const totalLatency = conversationStats.latencyMeasurements.reduce((sum, val) => sum + val, 0);
    conversationStats.averageLatency = totalLatency / conversationStats.latencyMeasurements.length;
    
    // Add AI response to history
    connection.messageHistory.push({ role: 'assistant', content: fullResponse });
    
    // Send final complete response
    connection.ws.send(JSON.stringify({
      type: 'ai_response_complete',
      content: fullResponse,
      latency: latency,
      timestamp: endTime
    }));
    
    // Generate speech with Elevenlabs
    generateSpeech(fullResponse, connectionId);
  } catch (error) {
    console.error('OpenAI generation error:', error);
    if (connection.ws.readyState === 1) {
      connection.ws.send(JSON.stringify({
        type: 'error',
        error: 'AI response generation failed'
      }));
    }
  }
}

// Elevenlabs speech synthesis
async function generateSpeech(text, connectionId) {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  try {
    // Generate speech
    const speechStartTime = Date.now();
    
    // Using the updated ElevenLabs API
    const audio = await elevenlabs.generate({
      text: text,
      voice_id: 'Rachel', // Using a default voice
      model_id: 'eleven_monolingual_v1'
    });
    
    // Get audio as buffer
    const audioBuffer = await audio.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);
    
    // Calculate speech generation latency
    const speechEndTime = Date.now();
    const speechLatency = speechEndTime - speechStartTime;
    
    // Send audio to client
    connection.ws.send(JSON.stringify({
      type: 'speech_ready',
      audioBase64: buffer.toString('base64'),
      speechLatency: speechLatency,
      timestamp: speechEndTime
    }));
  } catch (error) {
    console.error('Elevenlabs speech generation error:', error);
    if (connection.ws.readyState === 1) {
      connection.ws.send(JSON.stringify({
        type: 'error',
        error: 'Speech synthesis failed'
      }));
    }
  }
}

// WebSocket handling
wss.on('connection', (ws) => {
  const connectionId = Date.now().toString();
  
  // Initialize connection object
  connections.set(connectionId, {
    ws,
    messageHistory: [],
    transcribedText: '',
    responseStartTime: 0,
    userName: ''
  });
  
  // Send connection ID to client
  ws.send(JSON.stringify({
    type: 'connection_established',
    connectionId,
    timestamp: Date.now()
  }));
  
  // Handle messages from client
  ws.on('message', async (message) => {
    try {
      // Parse message
      const data = JSON.parse(message);
      const connection = connections.get(connectionId);
      
      if (!connection) return;
      
      if (data.type === 'start_conversation') {
        // Handle conversation start
        connection.userName = data.userName;
        conversationStats.totalConversations++;
        conversationStats.activeConversations++;
        
        // Send stats update
        ws.send(JSON.stringify({
          type: 'stats_update',
          stats: conversationStats,
          timestamp: Date.now()
        }));
        
        // Welcome message
        const welcomeResponse = `Hello ${connection.userName}! I'm Emma AI. How can I help you today?`;
        
        // Add system message to history
        connection.messageHistory = [
          { role: 'system', content: 'You are Emma AI, a helpful voice assistant that provides concise and natural responses.' }
        ];
        
        // Add welcome message to history
        connection.messageHistory.push({ role: 'assistant', content: welcomeResponse });
        
        // Send welcome message
        ws.send(JSON.stringify({
          type: 'ai_response_complete',
          content: welcomeResponse,
          latency: 0,
          timestamp: Date.now()
        }));
        
        // Generate speech for welcome message
        generateSpeech(welcomeResponse, connectionId);
      }
      else if (data.type === 'audio_data') {
        // Handle audio data for transcription
        const audioData = Buffer.from(data.audioBase64, 'base64');
        transcribeAudio(audioData, connectionId);
      }
      else if (data.type === 'end_conversation') {
        // Handle conversation end
        conversationStats.activeConversations = Math.max(0, conversationStats.activeConversations - 1);
        
        // Send stats update
        ws.send(JSON.stringify({
          type: 'stats_update',
          stats: conversationStats,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    const connection = connections.get(connectionId);
    if (connection) {
      conversationStats.activeConversations = Math.max(0, conversationStats.activeConversations - 1);
      connections.delete(connectionId);
    }
  });
});

// API endpoints
app.get('/api/stats', (req, res) => {
  res.json(conversationStats);
});

// Default route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
