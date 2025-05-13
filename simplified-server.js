const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const cors = require('cors');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mock responses for simulating AI behavior
const mockResponses = [
  "I understand what you're saying. Can you tell me more about that?",
  "That's an interesting perspective. Let me think about that for a moment.",
  "I'd be happy to help you with that. What specific information are you looking for?",
  "Based on what you've shared, I think we should explore this topic in more depth.",
  "Thank you for explaining that. Let me offer a different perspective.",
  "That's a great question. The answer involves several factors we should consider.",
  "I appreciate your thoughts on this matter. Have you considered an alternative approach?",
  "From my analysis, there are several ways we could address this situation.",
  "I'm processing what you've shared. Could you clarify a few details for me?",
  "Your input is valuable. Let me suggest some possible next steps."
];

// Stats tracking
const stats = {
  totalConversations: 0,
  activeConversations: 0,
  totalMessages: 0,
  averageLatency: 0,
  latencyMeasurements: []
};

// Websocket connections
const connections = new Map();

// Get a random response
function getRandomResponse(text) {
  // Simple keyword matching for more contextual responses
  if (text.toLowerCase().includes('hello') || text.toLowerCase().includes('hi')) {
    return "Hello! I'm Emma AI. How can I help you today?";
  }
  
  if (text.toLowerCase().includes('help') || text.toLowerCase().includes('question')) {
    return "I'd be happy to help you with that. What specific information are you looking for?";
  }
  
  if (text.toLowerCase().includes('thank') || text.toLowerCase().includes('thanks')) {
    return "You're welcome! Is there anything else I can help you with?";
  }
  
  // Default random response
  return mockResponses[Math.floor(Math.random() * mockResponses.length)];
}

// Simulate speech-to-text latency
function simulateSTT(duration = 500) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

// Simulate LLM processing latency
function simulateLLM(duration = 1000) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

// Simulate text-to-speech latency
function simulateTTS(duration = 700) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

// Generate mock audio data (just random bytes for demo)
function generateMockAudio(text) {
  // Create a buffer with random data proportional to text length
  const length = text.length * 100; // Arbitrary multiplier
  const buffer = Buffer.alloc(length);
  
  // Fill with random data
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  
  return buffer;
}

// Process audio data (simulated)
async function processAudio(audioData, connectionId) {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  try {
    // Simulate STT processing
    const sttStartTime = Date.now();
    await simulateSTT();
    
    // Generate a fake transcript based on connection message count
    let transcript;
    const messageCount = connection.messageCount || 0;
    
    if (messageCount === 0) {
      transcript = "Hello, I'd like to learn more about voice AI technology.";
    } else if (messageCount === 1) {
      transcript = "Can you tell me how speech recognition works?";
    } else if (messageCount === 2) {
      transcript = "That's interesting. What about voice synthesis?";
    } else if (messageCount === 3) {
      transcript = "How accurate is the speech recognition?";
    } else {
      transcript = "Thank you for explaining. That was very helpful.";
    }
    
    // Update connection state
    connection.messageCount = (connection.messageCount || 0) + 1;
    
    // Calculate STT latency
    const sttEndTime = Date.now();
    const sttLatency = sttEndTime - sttStartTime;
    stats.latencyMeasurements.push(sttLatency);
    
    // Send transcription to client
    connection.ws.send(JSON.stringify({
      type: 'transcription',
      text: transcript,
      timestamp: Date.now()
    }));
    
    // Generate AI response
    generateResponse(transcript, connectionId);
  } catch (error) {
    console.error('Audio processing error:', error);
    connection.ws.send(JSON.stringify({
      type: 'error',
      error: 'Audio processing failed'
    }));
  }
}

// Generate AI response
async function generateResponse(text, connectionId) {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  stats.totalMessages++;
  
  try {
    // Record response time
    const responseStartTime = Date.now();
    
    // Simulate LLM thinking with added delay for realism
    await simulateLLM();
    
    // Get AI response
    const response = getRandomResponse(text);
    
    // Stream the response word by word
    const words = response.split(' ');
    let currentResponse = '';
    
    for (let i = 0; i < words.length; i++) {
      // Add word to current response
      currentResponse += (i > 0 ? ' ' : '') + words[i];
      
      // Send chunk to client
      connection.ws.send(JSON.stringify({
        type: 'ai_response_chunk',
        content: (i > 0 ? ' ' : '') + words[i],
        timestamp: Date.now()
      }));
      
      // Slight delay between words for realism
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    }
    
    // Calculate LLM latency
    const responseEndTime = Date.now();
    const llmLatency = responseEndTime - responseStartTime;
    
    // Send complete response
    connection.ws.send(JSON.stringify({
      type: 'ai_response_complete',
      content: response,
      latency: llmLatency,
      timestamp: responseEndTime
    }));
    
    // Generate speech
    generateSpeech(response, connectionId);
    
    // Update average latency
    stats.latencyMeasurements.push(llmLatency);
    updateAverageLatency();
  } catch (error) {
    console.error('Response generation error:', error);
    connection.ws.send(JSON.stringify({
      type: 'error',
      error: 'Response generation failed'
    }));
  }
}

// Generate speech (simulated)
async function generateSpeech(text, connectionId) {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  try {
    // Record start time
    const ttsStartTime = Date.now();
    
    // Simulate TTS processing
    await simulateTTS();
    
    // Generate mock audio data
    const audioBuffer = generateMockAudio(text);
    
    // Calculate TTS latency
    const ttsEndTime = Date.now();
    const ttsLatency = ttsEndTime - ttsStartTime;
    
    // Send audio to client
    connection.ws.send(JSON.stringify({
      type: 'speech_ready',
      audioBase64: audioBuffer.toString('base64'),
      speechLatency: ttsLatency,
      timestamp: ttsEndTime
    }));
    
    // Update latency stats
    stats.latencyMeasurements.push(ttsLatency);
    updateAverageLatency();
  } catch (error) {
    console.error('Speech generation error:', error);
    connection.ws.send(JSON.stringify({
      type: 'error',
      error: 'Speech generation failed'
    }));
  }
}

// Update average latency calculation
function updateAverageLatency() {
  if (stats.latencyMeasurements.length > 0) {
    const totalLatency = stats.latencyMeasurements.reduce((sum, val) => sum + val, 0);
    stats.averageLatency = totalLatency / stats.latencyMeasurements.length;
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  // Create a unique connection ID
  const connectionId = Date.now().toString();
  console.log(`New client connected: ${connectionId}`);
  
  // Store connection
  connections.set(connectionId, { ws, messageCount: 0 });
  
  // Send connection established message
  ws.send(JSON.stringify({
    type: 'connection_established',
    connectionId,
    timestamp: Date.now()
  }));
  
  // Handle messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'start_conversation') {
        // Handle conversation start
        stats.totalConversations++;
        stats.activeConversations++;
        
        connections.get(connectionId).userName = data.userName;
        
        // Send stats update
        ws.send(JSON.stringify({
          type: 'stats_update',
          stats,
          timestamp: Date.now()
        }));
        
        // Send welcome message after a short delay
        setTimeout(() => {
          const welcomeMessage = `Hello ${data.userName}! I'm Emma AI. How can I help you today?`;
          
          // Send complete response
          ws.send(JSON.stringify({
            type: 'ai_response_complete',
            content: welcomeMessage,
            latency: 0,
            timestamp: Date.now()
          }));
          
          // Generate speech
          generateSpeech(welcomeMessage, connectionId);
        }, 500);
      }
      else if (data.type === 'audio_data') {
        // Process audio data (simulated)
        processAudio(Buffer.from(data.audioBase64, 'base64'), connectionId);
      }
      else if (data.type === 'end_conversation') {
        // Handle conversation end
        stats.activeConversations = Math.max(0, stats.activeConversations - 1);
        
        // Send stats update
        ws.send(JSON.stringify({
          type: 'stats_update',
          stats,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`Client disconnected: ${connectionId}`);
    stats.activeConversations = Math.max(0, stats.activeConversations - 1);
    connections.delete(connectionId);
  });
});

// API routes
app.get('/api/stats', (req, res) => {
  res.json(stats);
});

// Serve the application for any route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Simplified Emma AI server running on port ${PORT}`);
});
