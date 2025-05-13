require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { OpenAI } = require('openai');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Keys from environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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

// OpenAI response generation
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
    
    // Add AI response to history
    connection.messageHistory.push({ role: 'assistant', content: fullResponse });
    
    // Send final complete response
    connection.ws.send(JSON.stringify({
      type: 'ai_response_complete',
      content: fullResponse,
      llmLatency: llmLatency,
      timestamp: llmEndTime
    }));
    
    // Send basic text-only message for now
    connection.ws.send(JSON.stringify({
      type: 'speech_fallback',
      message: 'Speech synthesis is temporarily disabled. Please continue with text chat.',
      timestamp: Date.now()
    }));
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

// Update average latency calculations
function updateAverageLatency() {
  let allLatencies = [];
  
  // Collect all latency measurements
  for (const connection of connections.values()) {
    allLatencies = allLatencies.concat(connection.latencyMeasurements.llm);
  }
  
  // Calculate global average
  if (allLatencies.length > 0) {
    conversationStats.averageLatency = 
      allLatencies.reduce((sum, val) => sum + val, 0) / allLatencies.length;
  }
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
    systemPrompt: defaultSystemPrompt,
    latencyMeasurements: {
      llm: []
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
        
        // Update stats
        conversationStats.totalConversations++;
        conversationStats.activeConversations++;
        
        // Reset conversation history
        connection.messageHistory = [];
        connection.latencyMeasurements = {
          llm: []
        };
        
        // Send stats update
        broadcastStats();
        
        // Welcome message
        const welcomeResponse = `Hello ${connection.userName}! I'm Emma AI. How can I help you today?`;
        
        // Add welcome message to history
        connection.messageHistory.push({ role: 'assistant', content: welcomeResponse });
        
        // Send welcome message
        ws.send(JSON.stringify({
          type: 'ai_response_complete',
          content: welcomeResponse,
          latency: 0,
          timestamp: Date.now()
        }));
        
        // Send speech fallback message
        ws.send(JSON.stringify({
          type: 'speech_fallback',
          message: 'Speech synthesis is temporarily disabled. Please continue with text chat.',
          timestamp: Date.now()
        }));
      }
      else if (data.type === 'text_input') {
        // Handle direct text input
        const text = data.text;
        if (text && text.trim()) {
          // Add user message to history
          connection.messageHistory.push({ role: 'user', content: text });
          
          // Send user message to client for display
          ws.send(JSON.stringify({
            type: 'transcription',
            text: text,
            timestamp: Date.now()
          }));
          
          // Generate AI response
          generateResponse(text, connectionId);
        }
      }
      else if (data.type === 'update_system_prompt') {
        // Update system prompt
        const newPrompt = data.prompt;
        if (newPrompt && newPrompt.trim()) {
          if (data.global) {
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
const PORT = process.env.PORT || 3002; // Using port 3002
server.listen(PORT, () => {
  console.log(`Emma AI simple server running on port ${PORT}`);
});
