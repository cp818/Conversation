import React, { useState, useRef, useEffect } from 'react';

const Chat = ({ messages, sendMessage, isTyping, activeConversation }) => {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);

  // Scroll to bottom of messages when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!message.trim() || !activeConversation) return;
    
    sendMessage(message);
    setMessage('');
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-container">
      <div className="messages-container">
        {!activeConversation ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <i className="fas fa-comments"></i>
            </div>
            <div className="empty-state-text">No active conversation</div>
            <div className="empty-state-subtext">
              Enter your name and start a conversation from the dashboard to begin chatting with the AI.
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <i className="fas fa-robot"></i>
            </div>
            <div className="empty-state-text">Start the conversation</div>
            <div className="empty-state-subtext">
              Send a message to begin your conversation with the AI assistant.
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.sender === 'AI' ? 'ai' : 'user'}`}>
                <div className="message-meta">
                  <span className="message-sender">{msg.sender}</span>
                  <span className="message-time">{formatTime(msg.timestamp)}</span>
                </div>
                <div className="message-content">{msg.content}</div>
              </div>
            ))}
            {isTyping && (
              <div className="ai-typing">
                AI is typing
                <div className="typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="message-input-container">
        <input
          type="text"
          className="message-input"
          placeholder={activeConversation ? "Type your message..." : "Start a conversation to chat"}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={!activeConversation}
        />
        <button 
          type="submit" 
          className="send-button"
          disabled={!activeConversation || !message.trim()}
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </form>
    </div>
  );
};

export default Chat;
