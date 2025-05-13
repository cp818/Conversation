// Initialize app state
const appState = {
  isConnected: true,
  user: null,
  activeConversation: null,
  messages: [],
  stats: {
    totalConversations: 0,
    totalMessages: 0,
    averageConversationLength: 0,
    activeUsers: 1
  },
  isTyping: false
};

// DOM Elements
const elements = {
  connectionStatus: document.getElementById('connection-status'),
  activeUsers: document.getElementById('active-users'),
  totalConversations: document.getElementById('total-conversations'),
  totalMessages: document.getElementById('total-messages'),
  avgConversationLength: document.getElementById('avg-conversation-length'),
  conversationForm: document.getElementById('conversation-form'),
  activeConversation: document.getElementById('active-conversation'),
  userNameInput: document.getElementById('user-name-input'),
  currentUser: document.getElementById('current-user'),
  startConversationBtn: document.getElementById('start-conversation-btn'),
  endConversationBtn: document.getElementById('end-conversation-btn'),
  messagesContainer: document.getElementById('messages-container'),
  emptyState: document.getElementById('empty-state'),
  conversationMessages: document.getElementById('conversation-messages'),
  messageForm: document.getElementById('message-form'),
  messageInput: document.getElementById('message-input'),
  aiTyping: document.getElementById('ai-typing')
};

// AI Response Generator
const aiResponses = [
  "I understand what you're saying. Can you tell me more?",
  "That's interesting! How does that make you feel?",
  "I'm processing that information. Could you elaborate?",
  "I see your point. What else would you like to discuss?",
  "That's a fascinating perspective. Let me think about that.",
  "I'm here to help. What specific information are you looking for?",
  "Thanks for sharing that with me. How can I assist you further?",
  "I'm designed to have natural conversations. What's on your mind?",
  "I'm analyzing what you've said. Can you provide more context?",
  "I appreciate your input. Let's continue our conversation."
];

// More contextual responses based on keywords
const contextualResponses = [
  {
    keywords: ['hello', 'hi', 'hey', 'greetings'],
    responses: [
      "Hello there! How can I help you today?",
      "Hi! I'm the Emma AI assistant. What would you like to talk about?",
      "Hey! Nice to meet you. What's on your mind?"
    ]
  },
  {
    keywords: ['how are you', 'how do you feel', 'are you well'],
    responses: [
      "I'm functioning perfectly! How are you doing today?",
      "I'm here and ready to assist. How about you?",
      "I'm just a program, but I'm operating optimally. How can I help you today?"
    ]
  },
  {
    keywords: ['voice', 'assistant', 'ai voice', 'speech', 'talk', 'speak'],
    responses: [
      "Emma AI specializes in creating realistic AI voices for interactive conversations.",
      "Our voice technology allows for natural-sounding AI conversations in various applications.",
      "Would you like to know more about how our voice AI technology works?"
    ]
  },
  {
    keywords: ['help', 'support', 'question', 'explain'],
    responses: [
      "I'd be happy to help. What specifically would you like assistance with?",
      "I'm here to support you. Could you provide more details about your question?",
      "Sure, I can explain that. What aspect are you most interested in?"
    ]
  },
  {
    keywords: ['thanks', 'thank you', 'appreciate', 'grateful'],
    responses: [
      "You're welcome! Is there anything else I can help with?",
      "Happy to help! Let me know if you have any other questions.",
      "Anytime! That's what I'm here for."
    ]
  }
];

// Voice cloning responses
const voiceResponses = [
  {
    keywords: ['clone', 'voice clone', 'custom voice', 'my voice', 'voice cloning'],
    responses: [
      "Emma AI's voice cloning technology can create a digital twin of your voice with just a few minutes of audio.",
      "Our platform allows you to create custom AI voices that sound just like you or your brand's spokesperson.",
      "Voice cloning is one of our core technologies - it allows for personalized voice experiences in applications."
    ]
  },
  {
    keywords: ['integration', 'api', 'developer', 'implement', 'code'],
    responses: [
      "Our API makes it easy to integrate Emma AI's voice technology into your applications.",
      "Developers love our simple SDK that can be implemented with just a few lines of code.",
      "The Emma AI platform provides comprehensive documentation for seamless integration."
    ]
  },
  {
    keywords: ['use case', 'application', 'example', 'demo', 'showcase'],
    responses: [
      "Common use cases for Emma AI include customer service bots, virtual assistants, and interactive characters.",
      "Our technology is being used in industries ranging from healthcare to entertainment for more engaging user experiences.",
      "This demo showcases just one application - real-time conversations with an AI. Our voice API enables much more."
    ]
  }
];

// Generate AI response based on user input
function generateAIResponse(message) {
  // Convert message to lowercase for keyword matching
  const lowerMessage = message.toLowerCase();
  
  // Check for contextual responses based on keywords
  for (const context of [...contextualResponses, ...voiceResponses]) {
    for (const keyword of context.keywords) {
      if (lowerMessage.includes(keyword)) {
        const responses = context.responses;
        return responses[Math.floor(Math.random() * responses.length)];
      }
    }
  }
  
  // Fallback to general responses
  return aiResponses[Math.floor(Math.random() * aiResponses.length)];
}

// Format time for messages
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Create message element
function createMessageElement(message) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', message.sender === 'AI' ? 'ai' : 'user');
  
  const metaDiv = document.createElement('div');
  metaDiv.classList.add('message-meta');
  
  const senderSpan = document.createElement('span');
  senderSpan.classList.add('message-sender');
  senderSpan.textContent = message.sender;
  
  const timeSpan = document.createElement('span');
  timeSpan.classList.add('message-time');
  timeSpan.textContent = formatTime(message.timestamp);
  
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  contentDiv.textContent = message.content;
  
  metaDiv.appendChild(senderSpan);
  metaDiv.appendChild(timeSpan);
  messageDiv.appendChild(metaDiv);
  messageDiv.appendChild(contentDiv);
  
  return messageDiv;
}

// Update UI based on app state
function updateUI() {
  // Update dashboard stats
  elements.totalConversations.textContent = appState.stats.totalConversations;
  elements.totalMessages.textContent = appState.stats.totalMessages;
  elements.avgConversationLength.textContent = appState.stats.averageConversationLength.toFixed(2);
  elements.activeUsers.textContent = appState.stats.activeUsers;
  
  // Update connection status
  elements.connectionStatus.textContent = appState.isConnected ? 'Connected' : 'Disconnected';
  elements.connectionStatus.className = appState.isConnected ? 'stat-value connected' : 'stat-value disconnected';
  
  // Show/hide conversation forms
  if (appState.activeConversation) {
    elements.conversationForm.style.display = 'none';
    elements.activeConversation.style.display = 'block';
    elements.currentUser.textContent = appState.user;
    elements.emptyState.style.display = 'none';
    elements.conversationMessages.style.display = 'flex';
    elements.conversationMessages.style.flexDirection = 'column';
    elements.messageInput.disabled = false;
    elements.messageInput.placeholder = "Type your message...";
    elements.messageForm.querySelector('button').disabled = false;
  } else {
    elements.conversationForm.style.display = 'block';
    elements.activeConversation.style.display = 'none';
    elements.emptyState.style.display = 'flex';
    elements.conversationMessages.style.display = 'none';
    elements.messageInput.disabled = true;
    elements.messageInput.placeholder = "Start a conversation to chat";
    elements.messageForm.querySelector('button').disabled = true;
  }
  
  // Show/hide AI typing indicator
  elements.aiTyping.style.display = appState.isTyping ? 'flex' : 'none';
}

// Start a new conversation
function startConversation() {
  const userName = elements.userNameInput.value.trim();
  if (!userName) return;
  
  appState.user = userName;
  appState.activeConversation = {
    id: Date.now().toString(),
    startTime: new Date()
  };
  appState.messages = [];
  appState.stats.totalConversations++;
  
  updateUI();
  
  // Add welcome message
  setTimeout(() => {
    appState.isTyping = true;
    updateUI();
    
    setTimeout(() => {
      const welcomeMessage = {
        id: Date.now().toString(),
        sender: 'AI',
        content: `Hello ${userName}! I'm the Emma AI assistant. How can I help you today?`,
        timestamp: new Date()
      };
      
      appState.messages.push(welcomeMessage);
      appState.stats.totalMessages++;
      appState.isTyping = false;
      
      elements.conversationMessages.appendChild(createMessageElement(welcomeMessage));
      updateUI();
      scrollToBottom();
    }, 1500);
  }, 500);
}

// End the current conversation
function endConversation() {
  if (!appState.activeConversation) return;
  
  appState.activeConversation.endTime = new Date();
  appState.activeConversation = null;
  
  // Clear messages from UI
  elements.conversationMessages.innerHTML = '';
  
  updateUI();
}

// Send a message
function sendMessage(content) {
  if (!appState.activeConversation || !content.trim()) return;
  
  // Create user message
  const userMessage = {
    id: Date.now().toString(),
    sender: appState.user,
    content: content,
    timestamp: new Date()
  };
  
  // Add to messages
  appState.messages.push(userMessage);
  appState.stats.totalMessages++;
  
  // Update UI
  elements.conversationMessages.appendChild(createMessageElement(userMessage));
  updateUI();
  scrollToBottom();
  
  // Show AI typing indicator
  setTimeout(() => {
    appState.isTyping = true;
    updateUI();
    scrollToBottom();
    
    // Generate AI response
    const aiResponse = generateAIResponse(content);
    
    // Add AI message after delay
    setTimeout(() => {
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'AI',
        content: aiResponse,
        timestamp: new Date()
      };
      
      appState.messages.push(aiMessage);
      appState.stats.totalMessages++;
      appState.stats.averageConversationLength = (appState.messages.length / appState.stats.totalConversations);
      appState.isTyping = false;
      
      elements.conversationMessages.appendChild(createMessageElement(aiMessage));
      updateUI();
      scrollToBottom();
    }, 1500 + Math.random() * 1000); // Random delay between 1.5-2.5 seconds
  }, 500);
}

// Scroll to bottom of messages
function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

// Event Listeners
elements.startConversationBtn.addEventListener('click', (e) => {
  e.preventDefault();
  startConversation();
});

elements.endConversationBtn.addEventListener('click', (e) => {
  e.preventDefault();
  endConversation();
});

elements.messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = elements.messageInput.value.trim();
  if (content) {
    sendMessage(content);
    elements.messageInput.value = '';
  }
});

// Initialize UI
updateUI();

// Simulated network connection events (for demo purposes)
function simulateConnectionEvents() {
  // Randomly disconnect and reconnect (uncomment for demo)
  /*
  setInterval(() => {
    if (Math.random() < 0.05) { // 5% chance of connection change
      appState.isConnected = !appState.isConnected;
      updateUI();
      
      // Reconnect after a few seconds if disconnected
      if (!appState.isConnected) {
        setTimeout(() => {
          appState.isConnected = true;
          updateUI();
        }, 3000);
      }
    }
  }, 10000);
  */
  
  // Simulate other users joining/leaving
  setInterval(() => {
    if (Math.random() < 0.1) { // 10% chance of user count change
      const change = Math.random() < 0.5 ? 1 : -1;
      appState.stats.activeUsers = Math.max(1, appState.stats.activeUsers + change);
      updateUI();
    }
  }, 20000);
}

// Start simulation
simulateConnectionEvents();
