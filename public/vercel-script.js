// Initialize app state
const appState = {
  connected: true, // Always connected in HTTP mode
  conversationId: null,
  user: null,
  activeConversation: false,
  messages: [],
  systemPrompt: '',
  useGlobalPrompt: true,
  defaultSystemPrompt: 'You are Emma AI, a helpful assistant created to have natural conversations. Be helpful, concise, and friendly.',
  latencyMeasurements: {
    llm: [],
    total: []
  }
};

// DOM Elements
const elements = {
  // Status elements
  connectionStatus: document.getElementById('connection-status'),
  activeConversations: document.getElementById('active-conversations'),
  totalConversations: document.getElementById('total-conversations'),
  totalMessages: document.getElementById('total-messages'),
  avgLatency: document.getElementById('avg-latency'),
  
  // Conversation UI elements
  conversationForm: document.getElementById('conversation-form'),
  activeConversation: document.getElementById('active-conversation'),
  userNameInput: document.getElementById('user-name-input'),
  currentUser: document.getElementById('current-user'),
  startConversationBtn: document.getElementById('start-conversation-btn'),
  endConversationBtn: document.getElementById('end-conversation-btn'),
  toggleMicBtn: document.getElementById('toggle-mic-btn'),
  messagesContainer: document.getElementById('messages-container'),
  emptyState: document.getElementById('empty-state'),
  conversationMessages: document.getElementById('conversation-messages'),
  aiTyping: document.getElementById('ai-typing'),
  transcriptionDisplay: document.getElementById('transcription-display'),
  
  // System prompt elements
  systemPromptTextarea: document.getElementById('system-prompt-textarea'),
  updatePromptBtn: document.getElementById('update-prompt-btn'),
  globalPromptToggle: document.getElementById('global-prompt-toggle'),
  
  // Latency metrics elements
  llmLatency: document.getElementById('llm-latency'),
  totalLatency: document.getElementById('total-latency'),
  llmBar: document.getElementById('llm-bar'),
  totalBar: document.getElementById('total-bar')
};

// Fetch wrapper with error handling
async function fetchWithErrorHandling(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    alert(`Error: ${error.message}`);
    throw error;
  }
}

// Initialize app
async function initializeApp() {
  try {
    // Get system prompt
    const { prompt } = await fetchWithErrorHandling('/api/system-prompt');
    appState.defaultSystemPrompt = prompt;
    appState.systemPrompt = prompt;
    
    // Update system prompt textarea
    elements.systemPromptTextarea.value = prompt;
    
    // Initialize global prompt toggle
    elements.globalPromptToggle.checked = appState.useGlobalPrompt;
    
    // Get stats
    const stats = await fetchWithErrorHandling('/api/stats');
    updateStats(stats);
    
    // Update connection status (always connected in HTTP mode)
    updateConnectionStatus();
    
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

// Update connection status
function updateConnectionStatus() {
  elements.connectionStatus.textContent = 'Connected';
  elements.connectionStatus.className = 'stat-value connected';
  elements.startConversationBtn.disabled = false;
}

// Update stats display
function updateStats(stats) {
  elements.activeConversations.textContent = stats.activeConversations;
  elements.totalConversations.textContent = stats.totalConversations;
  elements.totalMessages.textContent = stats.totalMessages;
  elements.avgLatency.textContent = `${stats.averageLatency.toFixed(0)} ms`;
}

// Start conversation
async function startConversation() {
  const userName = elements.userNameInput.value.trim();
  if (!userName) return;
  
  try {
    const data = await fetchWithErrorHandling('/api/conversation/start', {
      method: 'POST',
      body: JSON.stringify({
        userName,
        systemPrompt: appState.systemPrompt
      })
    });
    
    // Update application state
    appState.conversationId = data.conversationId;
    appState.user = userName;
    appState.activeConversation = true;
    appState.messages = [data.message];
    
    // Update stats
    updateStats(data.stats);
    
    // Update UI
    elements.conversationForm.style.display = 'none';
    elements.activeConversation.style.display = 'block';
    elements.currentUser.textContent = userName;
    elements.emptyState.style.display = 'none';
    elements.conversationMessages.style.display = 'flex';
    elements.conversationMessages.style.flexDirection = 'column';
    elements.conversationMessages.innerHTML = '';
    
    // Display welcome message
    const messageElement = createMessageElement({
      sender: 'Emma AI',
      content: data.message.content,
      timestamp: data.message.timestamp,
      isUser: false
    });
    
    elements.conversationMessages.appendChild(messageElement);
    scrollToBottom();
    
  } catch (error) {
    console.error('Failed to start conversation:', error);
  }
}

// End conversation
async function endConversation() {
  if (!appState.activeConversation) return;
  
  try {
    const data = await fetchWithErrorHandling(`/api/conversation/${appState.conversationId}/end`, {
      method: 'POST'
    });
    
    // Update application state
    appState.activeConversation = false;
    appState.conversationId = null;
    appState.messages = [];
    
    // Update stats
    updateStats(data.stats);
    
    // Update UI
    elements.conversationForm.style.display = 'block';
    elements.activeConversation.style.display = 'none';
    elements.emptyState.style.display = 'flex';
    elements.conversationMessages.style.display = 'none';
    elements.transcriptionDisplay.textContent = 'Type to start a conversation...';
    
  } catch (error) {
    console.error('Failed to end conversation:', error);
  }
}

// Send message
async function sendMessage(text) {
  if (!appState.activeConversation || !text.trim()) return;
  
  // Add user message to UI
  const userMessageElement = createMessageElement({
    sender: appState.user,
    content: text,
    timestamp: Date.now(),
    isUser: true
  });
  
  elements.conversationMessages.appendChild(userMessageElement);
  scrollToBottom();
  
  // Update transcription display
  elements.transcriptionDisplay.textContent = text;
  
  // Show AI typing indicator
  setAiTyping(true);
  
  try {
    const data = await fetchWithErrorHandling(`/api/conversation/${appState.conversationId}/message`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    
    // Hide AI typing indicator
    setAiTyping(false);
    
    // Add message to state
    appState.messages.push(data.message);
    
    // Update stats
    updateStats(data.stats);
    
    // Update latency measurements
    if (data.message.latency) {
      appState.latencyMeasurements.llm.push(data.message.latency);
      appState.latencyMeasurements.total.push(data.message.latency);
      updateLatencyDisplay();
    }
    
    // Display AI response
    const aiMessageElement = createMessageElement({
      sender: 'Emma AI',
      content: data.message.content,
      timestamp: data.message.timestamp,
      isUser: false,
      latency: data.message.latency
    });
    
    elements.conversationMessages.appendChild(aiMessageElement);
    scrollToBottom();
    
  } catch (error) {
    console.error('Failed to send message:', error);
    setAiTyping(false);
  }
}

// Create message element
function createMessageElement({ sender, content, timestamp, isUser, latency = null }) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', isUser ? 'user' : 'ai');
  
  const metaDiv = document.createElement('div');
  metaDiv.classList.add('message-meta');
  
  const senderSpan = document.createElement('span');
  senderSpan.classList.add('message-sender');
  senderSpan.textContent = sender;
  
  const timeSpan = document.createElement('span');
  timeSpan.classList.add('message-time');
  timeSpan.textContent = formatTime(timestamp);
  
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  contentDiv.textContent = content;
  
  metaDiv.appendChild(senderSpan);
  metaDiv.appendChild(timeSpan);
  messageDiv.appendChild(metaDiv);
  messageDiv.appendChild(contentDiv);
  
  if (latency) {
    const latencyDiv = document.createElement('div');
    latencyDiv.classList.add('latency-info');
    latencyDiv.textContent = `Response latency: ${latency}ms`;
    messageDiv.appendChild(latencyDiv);
  }
  
  return messageDiv;
}

// Format time for messages
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Set AI typing indicator
function setAiTyping(isTyping) {
  appState.isAiTyping = isTyping;
  elements.aiTyping.style.display = isTyping ? 'flex' : 'none';
}

// Update latency display
function updateLatencyDisplay() {
  // Calculate average latencies
  const calculateAvg = (arr) => arr.length ? arr.reduce((sum, val) => sum + val, 0) / arr.length : 0;
  
  const avgLlm = calculateAvg(appState.latencyMeasurements.llm);
  const avgTotal = avgLlm; // In this simplified version, LLM is the only metric
  
  // Maximum latency for bar scaling
  const maxLatency = 3000; // 3 seconds
  
  // Update metric values
  elements.llmLatency.textContent = `${avgLlm.toFixed(0)} ms`;
  elements.totalLatency.textContent = `${avgTotal.toFixed(0)} ms`;
  
  // Update progress bars
  elements.llmBar.style.width = `${Math.min(100, (avgLlm / maxLatency) * 100)}%`;
  elements.totalBar.style.width = `${Math.min(100, (avgTotal / maxLatency) * 100)}%`;
}

// Scroll to bottom of messages
function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

// System prompt configuration
function updateSystemPrompt() {
  const newPrompt = elements.systemPromptTextarea.value.trim();
  if (!newPrompt) {
    // Revert to default if empty
    elements.systemPromptTextarea.value = appState.defaultSystemPrompt;
    appState.systemPrompt = appState.defaultSystemPrompt;
  } else {
    appState.systemPrompt = newPrompt;
  }
  
  // Set as global if toggle is on
  const useGlobal = elements.globalPromptToggle.checked;
  appState.useGlobalPrompt = useGlobal;
  
  // Update system prompt on server
  updateSystemPromptOnServer(appState.systemPrompt, useGlobal);
  
  // Update UI to confirm
  const originalBtnText = elements.updatePromptBtn.textContent;
  elements.updatePromptBtn.textContent = 'Prompt Updated!';
  setTimeout(() => {
    elements.updatePromptBtn.textContent = originalBtnText;
  }, 1500);
}

// Update system prompt on server
async function updateSystemPromptOnServer(prompt, global) {
  try {
    await fetchWithErrorHandling('/api/system-prompt', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
  } catch (error) {
    console.error('Failed to update system prompt:', error);
  }
}

// Add input field and button for text input (since we're not using voice in this version)
function setupTextInput() {
  // Create text input container
  const textInputContainer = document.createElement('div');
  textInputContainer.className = 'text-input-container';
  
  // Create text input
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.id = 'text-input';
  textInput.placeholder = 'Type your message here...';
  textInput.className = 'text-input';
  
  // Create send button
  const sendButton = document.createElement('button');
  sendButton.id = 'send-button';
  sendButton.className = 'button';
  sendButton.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
  
  // Add event listener to send button
  sendButton.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) {
      sendMessage(text);
      textInput.value = '';
    }
  });
  
  // Add event listener to text input (send on Enter)
  textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const text = textInput.value.trim();
      if (text) {
        sendMessage(text);
        textInput.value = '';
      }
    }
  });
  
  // Append elements to container
  textInputContainer.appendChild(textInput);
  textInputContainer.appendChild(sendButton);
  
  // Add to page
  const conversationControls = document.querySelector('.voice-controls');
  conversationControls.style.display = 'none'; // Hide voice controls
  
  // Insert after conversation controls
  conversationControls.parentNode.insertBefore(textInputContainer, conversationControls.nextSibling);
  
  // Update the transcription display text
  elements.transcriptionDisplay.textContent = 'Type to start a conversation...';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Initialize app
  initializeApp();
  
  // Set up text input
  setupTextInput();
  
  // Event listeners
  elements.startConversationBtn.addEventListener('click', (e) => {
    e.preventDefault();
    startConversation();
  });
  
  elements.endConversationBtn.addEventListener('click', (e) => {
    e.preventDefault();
    endConversation();
  });
  
  elements.updatePromptBtn.addEventListener('click', (e) => {
    e.preventDefault();
    updateSystemPrompt();
  });
  
  elements.globalPromptToggle.addEventListener('change', () => {
    appState.useGlobalPrompt = elements.globalPromptToggle.checked;
  });
});
