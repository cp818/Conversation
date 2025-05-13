require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { createClient } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const { ElevenLabsClient } = require('elevenlabs'); // Updated to correct import
const { RoomServiceClient } = require('livekit-server-sdk');
const { LivekitClient } = require('./livekit-client');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Keys from environment variables
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_PROJECT_ID = process.env.DEEPGRAM_PROJECT_ID;
const DEEPGRAM_IDENTIFIER = process.env.DEEPGRAM_IDENTIFIER;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL;

// Initialize clients
const deepgram = createClient(DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const elevenlabs = new ElevenLabsClient({
  apiKey: ELEVENLABS_API_KEY
});
const roomService = new RoomServiceClient(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL);
const livekitClient = new LivekitClient(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL);

// Default system prompt
let defaultSystemPrompt = "You are Emma AI, a helpful voice assistant that provides concise and natural responses. Your tone is friendly but professional. You should give detailed responses, but keep them under a minute when spoken aloud. If you don't know something, be honest about it.";

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

// Update system prompt
function updateSystemPrompt(newPrompt) {
  defaultSystemPrompt = newPrompt;
  console.log("System prompt updated:", defaultSystemPrompt);
  return defaultSystemPrompt;
}

// Deepgram transcription streaming
async function transcribeAudio(audioData, connectionId) {
  try {
    // Create a buffer from audio data
    const buffer = Buffer.from(audioData);
    
    // Use the Deepgram SDK to transcribe the audio
    const { result } = await deepgram.listen.prerecorded.transcribeFile(buffer, {
      mimetype: 'audio/webm',
      options: {
        punctuate: true,
        model: 'nova-3',
        language: 'en-US'
      }
    });
    
    // Extract the transcript
    const text = result?.results?.channels[0]?.alternatives[0]?.transcript || '';
    
    // Record STT latency
    const connection = connections.get(connectionId);
    if (connection && text.trim()) {
      connection.transcribedText = text;
      
      // Calculate STT latency
      const sttEndTime = Date.now();
      const sttLatency = sttEndTime - connection.sttStartTime;
      
      // Update connection with STT latency
      connection.latencyMeasurements.stt.push(sttLatency);
      
      // Send transcription to client
      connection.ws.send(JSON.stringify({
        type: 'transcription',
        text: text,
        sttLatency: sttLatency,
        timestamp: Date.now()
      }));
      
      // Generate AI response
      generateResponse(text, connectionId);
    }
  } catch (error) {
    console.error('Deepgram transcription error:', error);
    const connection = connections.get(connectionId);
    if (connection && connection.ws.readyState === 1) {
      connection.ws.send(JSON.stringify({
        type: 'error',
        error: 'Transcription failed',
        details: error.message
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
    const llmStartTime = Date.now();
    connection.llmStartTime = llmStartTime;
    
    // Build the conversation history
    const messages = [
      { role: 'system', content: connection.systemPrompt || defaultSystemPrompt },
      ...connection.messageHistory,
      { role: 'user', content: text }
    ];
    
    // Add user message to history
    connection.messageHistory.push({ role: 'user', content: text });
    
    // Generate AI response with streaming
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 250
    });
    
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
    const llmEndTime = Date.now();
    const llmLatency = llmEndTime - llmStartTime;
    
    // Update stats
    conversationStats.totalMessages++;
    connection.latencyMeasurements.llm.push(llmLatency);
    
    // Calculate average latencies
    updateAverageLatency(connection);
    
    // Add AI response to history
    connection.messageHistory.push({ role: 'assistant', content: fullResponse });
    
    // Send final complete response
    connection.ws.send(JSON.stringify({
      type: 'ai_response_complete',
      content: fullResponse,
      llmLatency: llmLatency,
      timestamp: llmEndTime
    }));
    
    // Generate speech with ElevenLabs
    try {
      generateSpeech(fullResponse, connectionId);
    } catch (error) {
      console.error('Failed to initiate speech generation:', error);
      // Fallback: Send message to client that speech failed but conversation can continue
      connection.ws.send(JSON.stringify({
        type: 'speech_fallback',
        message: 'Speech synthesis unavailable, but conversation can continue via text',
        timestamp: Date.now()
      }));
    }
  } catch (error) {
    console.error('OpenAI generation error:', error);
    if (connection.ws.readyState === 1) {
      connection.ws.send(JSON.stringify({
        type: 'error',
        error: 'AI response generation failed',
        details: error.message
      }));
    }
  }
}

// ElevenLabs speech synthesis
async function generateSpeech(text, connectionId) {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  try {
    // Record TTS start time
    const ttsStartTime = Date.now();
    console.log('Starting TTS generation with text:', text.substring(0, 50) + '...');
    
    // Use fetch directly due to compatibility issues with elevenlabs library
    const headers = {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    };

    const body = JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    });

    console.log('Sending request to ElevenLabs API');
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`, 
      {
        method: 'POST',
        headers,
        body
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
    }
    
    // Get audio as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('Received audio response, size:', buffer.length);
    
    // Calculate TTS latency
    const ttsEndTime = Date.now();
    const ttsLatency = ttsEndTime - ttsStartTime;
    
    // Update latency measurements
    connection.latencyMeasurements.tts.push(ttsLatency);
    
    // Calculate total latency (STT + LLM + TTS)
    const totalLatency = 
      connection.latencyMeasurements.stt[connection.latencyMeasurements.stt.length - 1] +
      connection.latencyMeasurements.llm[connection.latencyMeasurements.llm.length - 1] +
      ttsLatency;
    
    connection.latencyMeasurements.total.push(totalLatency);
    
    // Update average latencies
    updateAverageLatency(connection);
    
    // Send audio to client
    connection.ws.send(JSON.stringify({
      type: 'speech_ready',
      audioBase64: buffer.toString('base64'),
      ttsLatency: ttsLatency,
      totalLatency: totalLatency,
      timestamp: ttsEndTime
    }));
    
    // Send latency update to client
    sendLatencyUpdate(connectionId);
  } catch (error) {
    console.error('ElevenLabs speech generation error:', error);
    if (connection.ws.readyState === 1) {
      connection.ws.send(JSON.stringify({
        type: 'error',
        error: 'Speech synthesis failed',
        details: error.message
      }));
    }
  }
}

// Update average latency calculations
function updateAverageLatency(connection) {
  // Calculate average for the connection
  calculateConnectionAverages(connection);
  
  // Update global stats
  updateGlobalLatencyStats();
}

// Calculate connection-specific averages
function calculateConnectionAverages(connection) {
  const calcAvg = arr => arr.length ? arr.reduce((sum, val) => sum + val, 0) / arr.length : 0;
  
  connection.averageLatencies = {
    stt: calcAvg(connection.latencyMeasurements.stt),
    llm: calcAvg(connection.latencyMeasurements.llm),
    tts: calcAvg(connection.latencyMeasurements.tts),
    total: calcAvg(connection.latencyMeasurements.total)
  };
}

// Update global latency statistics
function updateGlobalLatencyStats() {
  let allTotalLatencies = [];
  
  // Collect all total latency measurements
  for (const connection of connections.values()) {
    allTotalLatencies = allTotalLatencies.concat(connection.latencyMeasurements.total);
  }
  
  // Calculate global average
  if (allTotalLatencies.length > 0) {
    conversationStats.averageLatency = 
      allTotalLatencies.reduce((sum, val) => sum + val, 0) / allTotalLatencies.length;
  }
}

// Send latency update to client
function sendLatencyUpdate(connectionId) {
  const connection = connections.get(connectionId);
  if (!connection || connection.ws.readyState !== 1) return;
  
  connection.ws.send(JSON.stringify({
    type: 'latency_update',
    averageLatencies: connection.averageLatencies,
    globalAverageLatency: conversationStats.averageLatency,
    timestamp: Date.now()
  }));
}

// Send stats update to all clients
function broadcastStats() {
  for (const connection of connections.values()) {
    if (connection.ws.readyState === 1) {
      connection.ws.send(JSON.stringify({
        type: 'stats_update',
        stats: conversationStats,
        timestamp: Date.now()
      }));
    }
  }
}

// WebSocket handling
wss.on('connection', (ws) => {
  const connectionId = Date.now().toString();
  console.log(`New client connected: ${connectionId}`);
  
  // Initialize connection object
  connections.set(connectionId, {
    ws,
    messageHistory: [],
    transcribedText: '',
    systemPrompt: defaultSystemPrompt,
    sttStartTime: 0,
    llmStartTime: 0,
    latencyMeasurements: {
      stt: [],
      llm: [],
      tts: [],
      total: []
    },
    averageLatencies: {
      stt: 0,
      llm: 0,
      tts: 0,
      total: 0
    }
  });
  
  // Send connection ID to client
  ws.send(JSON.stringify({
    type: 'connection_established',
    connectionId,
    defaultPrompt: defaultSystemPrompt,
    timestamp: Date.now()
  }));
  
  // Send current stats
  ws.send(JSON.stringify({
    type: 'stats_update',
    stats: conversationStats,
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
        connection.systemPrompt = data.systemPrompt || defaultSystemPrompt;

        // Create a LiveKit room for this conversation if needed
        try {
          const roomName = `emma-conversation-${connectionId}`;
          const roomInfo = await livekitClient.createRoom(roomName, {
            emptyTimeout: 300, // 5 minutes timeout
            maxParticipants: 2 // Only user and AI
          });

          // Store room info
          connection.livekitRoom = roomName;

          // Create a token for the user
          const userToken = livekitClient.createToken(
            connection.userName,
            roomName,
            ['publish', 'subscribe']
          );

          // Send LiveKit connection info to client
          ws.send(JSON.stringify({
            type: 'livekit_info',
            roomName: roomName,
            token: userToken,
            url: LIVEKIT_WS_URL,
            timestamp: Date.now()
          }));
        } catch (error) {
          console.error('LiveKit room creation error:', error);
          // Continue without LiveKit integration
        }

        // Update stats
        conversationStats.totalConversations++;
        conversationStats.activeConversations++;

        // Reset conversation history
        connection.messageHistory = [];
        connection.latencyMeasurements = {
          stt: [],
          llm: [],
          tts: [],
          total: []
        };

        // Send stats update
        broadcastStats();

        // Welcome message
        const welcomeResponse = `Hello ${connection.userName}! I'm Emma AI. How can I help you today?`;

        // Add welcome message to history
        connection.messageHistory = [];
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
        // Record STT start time
        connection.sttStartTime = Date.now();

        // Handle audio data for transcription
        const audioData = Buffer.from(data.audioBase64, 'base64');
        transcribeAudio(audioData, connectionId);
      }
      else if (data.type === 'update_system_prompt') {
        // Update system prompt
        const newPrompt = data.prompt;
        if (newPrompt && newPrompt.trim()) {
          if (data.global) { // Changed from isGlobal to global to match client
            // Update global default prompt
            const updatedPrompt = updateSystemPrompt(newPrompt);

            // Notify all clients
            for (const conn of connections.values()) {
              if (conn.ws.readyState === 1) {
                conn.ws.send(JSON.stringify({
                  type: 'system_prompt_updated',
                  prompt: updatedPrompt,
                  global: true,
                  timestamp: Date.now()
                }));
              }
            }
          } else {
            // Update just for this connection
            connection.systemPrompt = newPrompt;

            // Confirm update
            ws.send(JSON.stringify({
              type: 'system_prompt_updated',
              prompt: newPrompt,
              global: false,
              timestamp: Date.now()
            }));
          }
        }
      }
      else if (data.type === 'end_conversation') {
        // Handle conversation end
        conversationStats.activeConversations = Math.max(0, conversationStats.activeConversations - 1);

        // If there was a LiveKit room, clean it up
        if (connection.livekitRoom) {
          try {
            // Could add room cleanup here if needed
            console.log(`Ending LiveKit room: ${connection.livekitRoom}`);
          } catch (error) {
            console.error('Error ending LiveKit room:', error);
          }
        }

        // Send stats update
        broadcastStats();
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    console.log(`Client disconnected: ${connectionId}`);
    const connection = connections.get(connectionId);
    if (connection) {
      conversationStats.activeConversations = Math.max(0, conversationStats.activeConversations - 1);
      connections.delete(connectionId);
      
      // Update stats for remaining clients
      broadcastStats();
    }
  });
});

// API endpoints
app.get('/api/stats', (req, res) => {
  res.json(conversationStats);
});

app.get('/api/system-prompt', (req, res) => {
  res.json({ prompt: defaultSystemPrompt });
});

app.post('/api/system-prompt', (req, res) => {
  const { prompt } = req.body;
  
  if (prompt && prompt.trim()) {
    const updatedPrompt = updateSystemPrompt(prompt);
    res.json({ success: true, prompt: updatedPrompt });
  } else {
    res.status(400).json({ success: false, error: 'Invalid prompt' });
  }
});

// Default route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle 404s by serving the index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3001; // Changed port to 3001
server.listen(PORT, () => {
  console.log(`Emma AI server running on port ${PORT}`);
});
