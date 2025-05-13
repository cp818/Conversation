// Initialize app state
const appState = {
  isConnected: false,
  connectionId: null,
  user: null,
  activeConversation: false,
  messages: [],
  isRecording: false,
  isProcessingAudio: false,
  mediaRecorder: null,
  audioChunks: [],
  isAiTyping: false,
  isAiSpeaking: false,
  systemPrompt: '',
  useGlobalPrompt: true,
  defaultSystemPrompt: 'You are Emma, an AI assistant created to have natural voice conversations. Be helpful, concise, and friendly.',
  latencyMeasurements: {
    stt: [],
    llm: [],
    tts: [],
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
  recordingIndicator: document.getElementById('recording-indicator'),
  messagesContainer: document.getElementById('messages-container'),
  emptyState: document.getElementById('empty-state'),
  conversationMessages: document.getElementById('conversation-messages'),
  aiTyping: document.getElementById('ai-typing'),
  aiSpeaking: document.getElementById('ai-speaking'),
  transcriptionDisplay: document.getElementById('transcription-display'),
  
  // System prompt elements
  systemPromptTextarea: document.getElementById('system-prompt-textarea'),
  updatePromptBtn: document.getElementById('update-prompt-btn'),
  globalPromptToggle: document.getElementById('global-prompt-toggle'),
  
  // Latency metrics elements
  sttLatency: document.getElementById('stt-latency'),
  llmLatency: document.getElementById('llm-latency'),
  ttsLatency: document.getElementById('tts-latency'),
  totalLatency: document.getElementById('total-latency'),
  sttBar: document.getElementById('stt-bar'),
  llmBar: document.getElementById('llm-bar'),
  ttsBar: document.getElementById('tts-bar'),
  totalBar: document.getElementById('total-bar'),
  
  // Audio output
  aiVoice: document.getElementById('ai-voice'),
  
  // Legacy elements (still used in code)
  latencyDisplay: document.getElementById('latency-display') || { innerHTML: '' }
};

// WebSocket setup
let ws = null;

function connectWebSocket() {
  // Use secure WebSocket in production
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const host = window.location.hostname;
  const port = window.location.port || (protocol === 'wss://' ? '443' : '80');
  const wsUrl = `${protocol}${host}:${port}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
    appState.isConnected = true;
    updateConnectionStatus();
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    appState.isConnected = false;
    updateConnectionStatus();
    
    // Try to reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    appState.isConnected = false;
    updateConnectionStatus();
  };
  
  ws.onmessage = handleWebSocketMessage;
}

// Handle WebSocket messages
function handleWebSocketMessage(event) {
  try {
    const data = JSON.parse(event.data);
    console.log('Received message:', data);
    
    switch (data.type) {
      case 'connection_established':
        appState.connectionId = data.connectionId;
        break;
        
      case 'stats_update':
        updateStats(data.stats);
        break;
        
      case 'transcription':
        handleTranscription(data);
        break;
        
      case 'ai_response_chunk':
        handleAiResponseChunk(data);
        break;
        
      case 'ai_response_complete':
        handleAiResponseComplete(data);
        break;
        
      case 'speech_ready':
        handleSpeech(data);
        break;
        
      case 'error':
        handleError(data);
        break;
    }
  } catch (error) {
    console.error('Error parsing WebSocket message:', error);
  }
}

// Update connection status
function updateConnectionStatus() {
  elements.connectionStatus.textContent = appState.isConnected ? 'Connected' : 'Disconnected';
  elements.connectionStatus.className = appState.isConnected ? 'stat-value connected' : 'stat-value disconnected';
  
  elements.startConversationBtn.disabled = !appState.isConnected;
}

// Update dashboard stats
function updateStats(stats) {
  elements.activeConversations.textContent = stats.activeConversations;
  elements.totalConversations.textContent = stats.totalConversations;
  elements.totalMessages.textContent = stats.totalMessages;
  elements.avgLatency.textContent = `${stats.averageLatency.toFixed(0)} ms`;
}

// Handle transcription
function handleTranscription(data) {
  elements.transcriptionDisplay.textContent = data.text;
  
  // Add user message to UI
  const messageElement = createMessageElement({
    sender: appState.user,
    content: data.text,
    timestamp: data.timestamp,
    isUser: true
  });
  
  elements.conversationMessages.appendChild(messageElement);
  scrollToBottom();
  
  // Show AI typing indicator
  setAiTyping(true);
}

// Handle AI response chunks (streaming)
let currentAiResponse = '';
let currentAiMessageElement = null;

function handleAiResponseChunk(data) {
  // Ensure we're showing typing indicator
  setAiTyping(true);
  
  // Add to current response
  currentAiResponse += data.content;
  
  // Create or update message element
  if (!currentAiMessageElement) {
    currentAiMessageElement = createMessageElement({
      sender: 'Emma AI',
      content: currentAiResponse,
      timestamp: data.timestamp,
      isUser: false,
      isPartial: true
    });
    elements.conversationMessages.appendChild(currentAiMessageElement);
  } else {
    // Update existing element
    const contentElement = currentAiMessageElement.querySelector('.message-content');
    if (contentElement) {
      contentElement.textContent = currentAiResponse;
    }
  }
  
  scrollToBottom();
}

// Handle complete AI response
function handleAiResponseComplete(data) {
  setAiTyping(false);
  currentAiResponse = data.content;
  
  // If we have a partial message element, update it
  if (currentAiMessageElement) {
    const contentElement = currentAiMessageElement.querySelector('.message-content');
    if (contentElement) {
      contentElement.textContent = data.content;
    }
    
    // Add latency info
    const latencyElement = document.createElement('div');
    latencyElement.classList.add('latency-info');
    latencyElement.textContent = `Response latency: ${data.latency}ms`;
    currentAiMessageElement.appendChild(latencyElement);
    
    // Remove partial flag
    currentAiMessageElement.dataset.partial = 'false';
  } else {
    // Create new message element
    const messageElement = createMessageElement({
      sender: 'Emma AI',
      content: data.content,
      timestamp: data.timestamp,
      isUser: false,
      latency: data.latency
    });
    elements.conversationMessages.appendChild(messageElement);
  }
  
  // Update latency display
  appState.latencyMeasurements.llm.push(data.latency);
  updateLatencyDisplay();
  
  // Reset for next response
  currentAiMessageElement = null;
  currentAiResponse = '';
  
  scrollToBottom();
}

// Handle speech synthesis
function handleSpeech(data) {
  const audioData = atob(data.audioBase64);
  const arrayBuffer = new ArrayBuffer(audioData.length);
  const view = new Uint8Array(arrayBuffer);
  
  for (let i = 0; i < audioData.length; i++) {
    view[i] = audioData.charCodeAt(i);
  }
  
  const audioBlob = new Blob([arrayBuffer], { type: 'audio/mp3' });
  const audioUrl = URL.createObjectURL(audioBlob);
  
  // Add TTS latency to measurements
  appState.latencyMeasurements.tts.push(data.speechLatency);
  updateLatencyDisplay();
  
  // Play audio
  elements.aiVoice.src = audioUrl;
  elements.aiVoice.onplay = () => {
    setAiSpeaking(true);
  };
  
  elements.aiVoice.onended = () => {
    setAiSpeaking(false);
    URL.revokeObjectURL(audioUrl);
  };
  
  elements.aiVoice.play().catch(error => {
    console.error('Error playing audio:', error);
    setAiSpeaking(false);
  });
}

// Handle errors
function handleError(data) {
  console.error('Server error:', data.error);
  alert(`Error: ${data.error}`);
}

// Create message element
function createMessageElement({ sender, content, timestamp, isUser, isPartial = false, latency = null }) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', isUser ? 'user' : 'ai');
  if (isPartial) {
    messageDiv.dataset.partial = 'true';
  }
  
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

// Set AI speaking indicator
function setAiSpeaking(isSpeaking) {
  appState.isAiSpeaking = isSpeaking;
  elements.aiSpeaking.style.display = isSpeaking ? 'flex' : 'none';
}

// Update latency display
function updateLatencyDisplay() {
  // Calculate average latencies
  const calculateAvg = (arr) => arr.length ? arr.reduce((sum, val) => sum + val, 0) / arr.length : 0;
  
  const avgStt = calculateAvg(appState.latencyMeasurements.stt);
  const avgLlm = calculateAvg(appState.latencyMeasurements.llm);
  const avgTts = calculateAvg(appState.latencyMeasurements.tts);
  const avgTotal = avgStt + avgLlm + avgTts;
  
  // Maximum latency for bar scaling (adjust as needed)
  const maxLatency = 3000; // 3 seconds
  
  // Update metric values
  elements.sttLatency.textContent = `${avgStt.toFixed(0)} ms`;
  elements.llmLatency.textContent = `${avgLlm.toFixed(0)} ms`;
  elements.ttsLatency.textContent = `${avgTts.toFixed(0)} ms`;
  elements.totalLatency.textContent = `${avgTotal.toFixed(0)} ms`;
  
  // Update progress bars (clamped to max)
  elements.sttBar.style.width = `${Math.min(100, (avgStt / maxLatency) * 100)}%`;
  elements.llmBar.style.width = `${Math.min(100, (avgLlm / maxLatency) * 100)}%`;
  elements.ttsBar.style.width = `${Math.min(100, (avgTts / maxLatency) * 100)}%`;
  elements.totalBar.style.width = `${Math.min(100, (avgTotal / maxLatency) * 100)}%`;
  
  // Update legacy display if it exists
  if (elements.latencyDisplay.innerHTML !== undefined) {
    elements.latencyDisplay.innerHTML = `
      <strong>Latency Metrics:</strong><br>
      STT: ${avgStt.toFixed(0)}ms | LLM: ${avgLlm.toFixed(0)}ms | TTS: ${avgTts.toFixed(0)}ms<br>
      Total: ${avgTotal.toFixed(0)}ms
    `;
  }
}

// Scroll to bottom of messages
function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

// Start a conversation
function startConversation() {
  const userName = elements.userNameInput.value.trim();
  if (!userName || !appState.isConnected) return;
  
  appState.user = userName;
  appState.activeConversation = true;
  appState.messages = [];
  
  // Update UI
  elements.conversationForm.style.display = 'none';
  elements.activeConversation.style.display = 'block';
  elements.currentUser.textContent = userName;
  elements.emptyState.style.display = 'none';
  elements.conversationMessages.style.display = 'flex';
  elements.conversationMessages.style.flexDirection = 'column';
  elements.conversationMessages.innerHTML = '';
  
  // Send start conversation message to server
  sendWebSocketMessage({
    type: 'start_conversation',
    userName: userName
  });
}

// End the conversation
function endConversation() {
  if (!appState.activeConversation) return;
  
  // Stop recording if active
  stopRecording();
  
  // Reset state
  appState.activeConversation = false;
  appState.isRecording = false;
  appState.isAiTyping = false;
  appState.isAiSpeaking = false;
  
  // Update UI
  elements.conversationForm.style.display = 'block';
  elements.activeConversation.style.display = 'none';
  elements.emptyState.style.display = 'flex';
  elements.conversationMessages.style.display = 'none';
  elements.aiTyping.style.display = 'none';
  elements.aiSpeaking.style.display = 'none';
  elements.transcriptionDisplay.textContent = 'Speak to start a conversation...';
  
  // Send end conversation message to server
  sendWebSocketMessage({
    type: 'end_conversation'
  });
}

// Toggle microphone recording
async function toggleMicrophone() {
  if (!appState.activeConversation) return;
  
  if (appState.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// Start recording audio
async function startRecording() {
  try {
    // Check if we are already processing audio
    if (appState.isProcessingAudio) return;
    
    // Request audio permissions
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Setup media recorder
    appState.mediaRecorder = new MediaRecorder(stream);
    appState.audioChunks = [];
    
    // Collect audio chunks
    appState.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        appState.audioChunks.push(event.data);
      }
    };
    
    // Handle recording stop
    appState.mediaRecorder.onstop = async () => {
      // Create audio blob
      const audioBlob = new Blob(appState.audioChunks, { type: 'audio/webm' });
      
      // Reset audio chunks
      appState.audioChunks = [];
      
      // Only process if we have audio data
      if (audioBlob.size > 0) {
        // Mark as processing
        appState.isProcessingAudio = true;
        
        try {
          // Record STT start time
          const sttStartTime = Date.now();
          
          // Convert blob to base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = function() {
            const base64data = reader.result.split(',')[1];
            
            // Send audio to server
            sendWebSocketMessage({
              type: 'audio_data',
              audioBase64: base64data,
              timestamp: sttStartTime
            });
            
            // Add STT latency measurement when we receive transcription
            // (handled in the transcription handler)
          };
        } catch (error) {
          console.error('Error processing audio:', error);
        } finally {
          // Mark as no longer processing
          appState.isProcessingAudio = false;
        }
      }
      
      // Stop all audio tracks
      stream.getTracks().forEach(track => track.stop());
    };
    
    // Start recording
    appState.mediaRecorder.start();
    appState.isRecording = true;
    
    // Update UI
    elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Stop Speaking';
    elements.toggleMicBtn.classList.add('recording');
    elements.recordingIndicator.classList.add('active');
    elements.transcriptionDisplay.textContent = 'Listening...';
    
  } catch (error) {
    console.error('Error starting recording:', error);
    alert('Could not access microphone. Please check permissions and try again.');
  }
}

// Stop recording audio
function stopRecording() {
  if (appState.mediaRecorder && appState.isRecording) {
    appState.mediaRecorder.stop();
    appState.isRecording = false;
    
    // Update UI
    elements.toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i> Start Speaking';
    elements.toggleMicBtn.classList.remove('recording');
    elements.recordingIndicator.classList.remove('active');
  }
}

// Send WebSocket message
function sendWebSocketMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error('WebSocket not connected');
  }
}

// System prompt configuration
function initializeSystemPrompt() {
  // Load default prompt into the textarea
  elements.systemPromptTextarea.value = appState.defaultSystemPrompt;
  appState.systemPrompt = appState.defaultSystemPrompt;
  
  // Initialize global prompt toggle
  elements.globalPromptToggle.checked = appState.useGlobalPrompt;
}

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
  
  // Notify server about prompt update
  sendWebSocketMessage({
    type: 'update_system_prompt',
    prompt: appState.systemPrompt,
    global: appState.useGlobalPrompt
  });
  
  // Update UI to confirm
  const originalBtnText = elements.updatePromptBtn.textContent;
  elements.updatePromptBtn.textContent = 'Prompt Updated!';
  setTimeout(() => {
    elements.updatePromptBtn.textContent = originalBtnText;
  }, 1500);
}

// Modified start conversation to include system prompt
function startConversation() {
  const userName = elements.userNameInput.value.trim();
  if (!userName || !appState.isConnected) return;
  
  appState.user = userName;
  appState.activeConversation = true;
  appState.messages = [];
  
  // Update UI
  elements.conversationForm.style.display = 'none';
  elements.activeConversation.style.display = 'block';
  elements.currentUser.textContent = userName;
  elements.emptyState.style.display = 'none';
  elements.conversationMessages.style.display = 'flex';
  elements.conversationMessages.style.flexDirection = 'column';
  elements.conversationMessages.innerHTML = '';
  
  // Send start conversation message with system prompt
  sendWebSocketMessage({
    type: 'start_conversation',
    userName: userName,
    systemPrompt: appState.systemPrompt
  });
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

elements.toggleMicBtn.addEventListener('click', (e) => {
  e.preventDefault();
  toggleMicrophone();
});

// System prompt event listeners
elements.updatePromptBtn.addEventListener('click', (e) => {
  e.preventDefault();
  updateSystemPrompt();
});

elements.globalPromptToggle.addEventListener('change', () => {
  appState.useGlobalPrompt = elements.globalPromptToggle.checked;
});

// Initialize WebSocket connection
connectWebSocket();

// Initialize UI components
updateConnectionStatus();
initializeSystemPrompt();
