import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Dashboard from './Dashboard';
import Chat from './Chat';

// Connect to server
const socket = io('http://localhost:12345');

const App = () => {
  const [user, setUser] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({
    totalConversations: 0,
    totalMessages: 0,
    averageConversationLength: 0,
    activeUsers: 0
  });
  const [isTyping, setIsTyping] = useState(false);

  // Connect to socket
  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Listen for stats updates
    socket.on('stats_update', (newStats) => {
      setStats(newStats);
    });

    // Clean up on component unmount
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('stats_update');
    };
  }, []);

  // Listen for messages when active conversation changes
  useEffect(() => {
    if (!activeConversation) return;

    const handleMessageReceived = (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
      
      // If message is from AI, stop typing indicator
      if (message.sender === 'AI') {
        setIsTyping(false);
      }
    };

    const handleConversationStarted = (conversation) => {
      setActiveConversation(conversation);
      setMessages([]);
    };

    // Set up event listeners
    socket.on('message_received', handleMessageReceived);
    socket.on('conversation_started', handleConversationStarted);

    // Clean up
    return () => {
      socket.off('message_received', handleMessageReceived);
      socket.off('conversation_started', handleConversationStarted);
    };
  }, [activeConversation]);

  // Start a new conversation
  const startConversation = () => {
    if (!user) return;
    
    // End current conversation if exists
    if (activeConversation) {
      socket.emit('end_conversation', activeConversation.id);
    }
    
    socket.emit('start_conversation', user);
  };

  // Send a message
  const sendMessage = (content) => {
    if (!activeConversation || !content.trim()) return;

    const messageData = {
      conversationId: activeConversation.id,
      message: content,
      user: user
    };
    
    socket.emit('send_message', messageData);
    setIsTyping(true);
  };

  // End current conversation
  const endConversation = () => {
    if (!activeConversation) return;
    
    socket.emit('end_conversation', activeConversation.id);
    setActiveConversation(null);
    setMessages([]);
  };

  return (
    <div className="app">
      <header>
        <div className="logo">Retell AI Demo</div>
        <div className="tagline">Real-time AI Conversations</div>
      </header>
      
      <div className="main-content">
        <Dashboard 
          stats={stats}
          user={user}
          setUser={setUser}
          startConversation={startConversation}
          endConversation={endConversation}
          isConnected={isConnected}
          hasActiveConversation={!!activeConversation}
        />
        
        <Chat 
          messages={messages}
          sendMessage={sendMessage}
          isTyping={isTyping}
          activeConversation={activeConversation}
        />
      </div>
    </div>
  );
};

export default App;
