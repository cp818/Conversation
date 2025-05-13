require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { OpenAI } = require('openai');

// Initialize Express app
const app = express();

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
  averageLatency: 0
};

// Store for active conversations
const conversations = new Map();

// Get stats
app.get('/api/stats', (req, res) => {
  res.json(conversationStats);
});

// Get system prompt
app.get('/api/system-prompt', (req, res) => {
  res.json({ prompt: defaultSystemPrompt });
});

// Update system prompt
app.post('/api/system-prompt', (req, res) => {
  const { prompt } = req.body;
  if (prompt && prompt.trim()) {
    defaultSystemPrompt = prompt;
    res.json({ success: true, prompt: defaultSystemPrompt });
  } else {
    res.status(400).json({ success: false, error: 'Invalid prompt' });
  }
});

// Start conversation
app.post('/api/conversation/start', (req, res) => {
  const { userName, systemPrompt } = req.body;
  
  if (!userName) {
    return res.status(400).json({ success: false, error: 'Username is required' });
  }
  
  const conversationId = Date.now().toString();
  
  // Store conversation data
  conversations.set(conversationId, {
    id: conversationId,
    userName,
    systemPrompt: systemPrompt || defaultSystemPrompt,
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
  
  conversations.get(conversationId).messages.push(welcomeMessage);
  
  res.json({
    success: true,
    conversationId,
    message: welcomeMessage,
    stats: conversationStats
  });
});

// End conversation
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

// Send message
app.post('/api/conversation/:id/message', async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  
  if (!conversations.has(id)) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found'
    });
  }
  
  const conversation = conversations.get(id);
  
  // Add user message to history
  const userMessage = {
    role: 'user',
    content: text,
    timestamp: Date.now()
  };
  
  conversation.messages.push(userMessage);
  
  try {
    // Start timer for latency measurement
    const startTime = Date.now();
    
    // Build message history for OpenAI
    const messages = [
      { role: 'system', content: conversation.systemPrompt },
      ...conversation.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];
    
    // Generate AI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 250
    });
    
    const responseContent = completion.choices[0].message.content;
    const latency = Date.now() - startTime;
    
    // Add assistant message to history
    const assistantMessage = {
      role: 'assistant',
      content: responseContent,
      timestamp: Date.now(),
      latency
    };
    
    conversation.messages.push(assistantMessage);
    
    // Update stats
    conversationStats.totalMessages++;
    
    // If we've measured latency before, update the average
    if (conversationStats.averageLatency > 0) {
      conversationStats.averageLatency = 
        (conversationStats.averageLatency * (conversationStats.totalMessages - 1) + latency) / 
        conversationStats.totalMessages;
    } else {
      conversationStats.averageLatency = latency;
    }
    
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

// Get conversation history
app.get('/api/conversation/:id', (req, res) => {
  const { id } = req.params;
  
  if (!conversations.has(id)) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found'
    });
  }
  
  const conversation = conversations.get(id);
  
  res.json({
    success: true,
    conversation: {
      id: conversation.id,
      userName: conversation.userName,
      systemPrompt: conversation.systemPrompt,
      messages: conversation.messages,
      startTime: conversation.startTime
    }
  });
});

// Ensure proper static file serving
app.use(express.static(path.join(__dirname, 'public')));

// Default route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export for Vercel
module.exports = app;

// Start server in non-Vercel environments
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3003;
  app.listen(PORT, () => {
    console.log(`Emma AI REST API server running on port ${PORT}`);
  });
}
