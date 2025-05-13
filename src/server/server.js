const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Mock database for conversation history and statistics
const conversations = [];
const stats = {
  totalConversations: 0,
  totalMessages: 0,
  averageConversationLength: 0,
  activeUsers: 0
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../../dist')));

// Routes
app.get('/api/conversations', (req, res) => {
  res.json(conversations);
});

app.get('/api/stats', (req, res) => {
  res.json(stats);
});

// Simple AI response generator
const generateAIResponse = (message) => {
  const responses = [
    "I understand what you're saying. Can you tell me more?",
    "That's interesting! How does that make you feel?",
    "I'm processing that information. Could you elaborate?",
    "I see your point. What else would you like to discuss?",
    "That's a fascinating perspective. Let me think about that.",
    "I'm here to help. What specific information are you looking for?",
    "Thanks for sharing that with me. How can I assist you further?",
    "I'm designed to have natural conversations. What's on your mind?",
    "I'm analyzing what you've said. Can you provide more context?",
    "I appreciate your input. Let's continue our conversation.",
  ];
  
  // Simulate AI thinking delay
  return new Promise(resolve => {
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * responses.length);
      resolve(responses[randomIndex]);
    }, 1000);
  });
};

// Socket connection
io.on('connection', (socket) => {
  console.log('New client connected');
  stats.activeUsers++;
  
  // Update all clients with new stats
  io.emit('stats_update', stats);
  
  // Handle new conversation
  socket.on('start_conversation', (userName) => {
    const conversationId = Date.now().toString();
    const newConversation = {
      id: conversationId,
      user: userName,
      messages: [],
      startTime: new Date(),
      endTime: null
    };
    
    conversations.push(newConversation);
    stats.totalConversations++;
    
    socket.emit('conversation_started', newConversation);
    io.emit('stats_update', stats);
  });
  
  // Handle incoming messages
  socket.on('send_message', async (data) => {
    const { conversationId, message, user } = data;
    const conversation = conversations.find(conv => conv.id === conversationId);
    
    if (conversation) {
      // Add user message
      const userMessage = {
        id: Date.now().toString(),
        sender: user,
        content: message,
        timestamp: new Date()
      };
      
      conversation.messages.push(userMessage);
      stats.totalMessages++;
      
      // Generate AI response
      const aiResponse = await generateAIResponse(message);
      
      // Add AI message
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'AI',
        content: aiResponse,
        timestamp: new Date()
      };
      
      conversation.messages.push(aiMessage);
      stats.totalMessages++;
      
      // Calculate average conversation length
      stats.averageConversationLength = stats.totalMessages / stats.totalConversations;
      
      // Send messages to client
      socket.emit('message_received', userMessage);
      
      // Simulate AI typing delay
      setTimeout(() => {
        socket.emit('message_received', aiMessage);
        io.emit('stats_update', stats);
      }, 1500);
    }
  });
  
  // Handle end conversation
  socket.on('end_conversation', (conversationId) => {
    const conversation = conversations.find(conv => conv.id === conversationId);
    
    if (conversation) {
      conversation.endTime = new Date();
      io.emit('stats_update', stats);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    stats.activeUsers--;
    io.emit('stats_update', stats);
  });
});

// Serve React app for any other routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../dist/index.html'));
});

// Handle 404s by serving the index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../../../dist/index.html'));
});

const PORT = process.env.PORT || 12345;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
