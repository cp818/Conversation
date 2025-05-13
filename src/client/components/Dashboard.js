import React, { useState } from 'react';

const Dashboard = ({ 
  stats, 
  user, 
  setUser, 
  startConversation, 
  endConversation,
  isConnected,
  hasActiveConversation
}) => {
  const [userName, setUserName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setUser(userName);
    startConversation();
  };

  const handleEndConversation = () => {
    endConversation();
  };

  const formatNumber = (num) => {
    return Number.isInteger(num) ? num : num.toFixed(2);
  };

  return (
    <div className="sidebar">
      <div className="stats-container">
        <h2 className="stats-title">Dashboard</h2>
        <div className="stat-item">
          <span className="stat-label">Status:</span>
          <span className="stat-value" style={{ color: isConnected ? '#16a34a' : '#dc2626' }}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Active Users:</span>
          <span className="stat-value">{stats.activeUsers}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Conversations:</span>
          <span className="stat-value">{stats.totalConversations}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Messages:</span>
          <span className="stat-value">{stats.totalMessages}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Avg. Conversation Length:</span>
          <span className="stat-value">{formatNumber(stats.averageConversationLength)}</span>
        </div>
      </div>

      {!hasActiveConversation ? (
        <form className="user-form" onSubmit={handleSubmit}>
          <h3 className="stats-title">Start a Conversation</h3>
          <input
            type="text"
            placeholder="Enter your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            required
          />
          <button 
            type="submit" 
            className="button"
            disabled={!isConnected || !userName.trim()}
          >
            Start Conversation
          </button>
        </form>
      ) : (
        <div className="user-form">
          <h3 className="stats-title">Current Conversation</h3>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
            You are chatting as: <strong>{user}</strong>
          </p>
          <button 
            onClick={handleEndConversation} 
            className="button"
            style={{ backgroundColor: '#dc2626' }}
          >
            End Conversation
          </button>
        </div>
      )}

      <div className="about-section">
        <h3 className="stats-title">About</h3>
        <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          This demo showcases Retell AI's real-time conversation capabilities in a simple web application.
        </p>
        <p style={{ fontSize: '0.9rem' }}>
          The AI responses are simulated for demonstration purposes.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
