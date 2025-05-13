// Minimal Express API for Vercel
const express = require('express');
const { OpenAI } = require('openai');

// Initialize Express app
const app = express();
app.use(express.json());

// Api handlers
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Default system prompt
const defaultSystemPrompt = "You are Emma AI, a helpful voice assistant that provides concise and natural responses. Your tone is friendly but professional.";

// Environment variable handling with safe fallbacks
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Initialize OpenAI (only if API key is available)
let openai = null;
if (OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  } catch (error) {
    console.error('Error initializing OpenAI:', error);
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
