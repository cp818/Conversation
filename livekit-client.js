const { AccessToken } = require('livekit-server-sdk');
const axios = require('axios');

class LivekitClient {
  constructor(apiKey, apiSecret, wsUrl) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.wsUrl = wsUrl;
  }

  /**
   * Create a access token for a user to connect to LiveKit
   * @param {string} userId - Unique identifier for the user
   * @param {string} roomName - Room name to join
   * @param {Array<string>} permissions - Array of permissions to grant
   * @returns {string} - Access token
   */
  createToken(userId, roomName, permissions = []) {
    try {
      // Create a new access token
      const at = new AccessToken(this.apiKey, this.apiSecret, {
        identity: userId,
      });

      // Grant appropriate permissions
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: permissions.includes('publish'),
        canSubscribe: permissions.includes('subscribe'),
        canPublishData: permissions.includes('data'),
      });

      // Generate and return token
      return at.toJwt();
    } catch (error) {
      console.error('Error creating LiveKit token:', error);
      throw new Error('Failed to create LiveKit access token');
    }
  }

  /**
   * Create a new room in LiveKit
   * @param {string} roomName - Name for the room
   * @param {Object} options - Room configuration options
   * @returns {Promise<Object>} - Room information
   */
  async createRoom(roomName, options = {}) {
    try {
      // Build URL for LiveKit server API
      const url = `${this.wsUrl.replace('wss://', 'https://')}/twirp/livekit.RoomService/CreateRoom`;

      // Create access token for admin
      const token = this.createToken('admin', roomName, ['publish', 'subscribe', 'data']);

      // Make request to create room
      const response = await axios.post(
        url,
        {
          name: roomName,
          empty_timeout: options.emptyTimeout || 300,
          max_participants: options.maxParticipants || 10
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error creating LiveKit room:', error);
      throw new Error('Failed to create LiveKit room');
    }
  }

  /**
   * Get a list of active rooms
   * @returns {Promise<Array<Object>>} - List of active rooms
   */
  async listRooms() {
    try {
      // Build URL for LiveKit server API
      const url = `${this.wsUrl.replace('wss://', 'https://')}/twirp/livekit.RoomService/ListRooms`;

      // Create access token for admin
      const token = this.createToken('admin', '*', ['publish', 'subscribe', 'data']);

      // Make request to list rooms
      const response = await axios.post(
        url,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.rooms || [];
    } catch (error) {
      console.error('Error listing LiveKit rooms:', error);
      return [];
    }
  }

  /**
   * Get connection information for a room
   * @param {string} userId - User identifier
   * @param {string} roomName - Room to connect to
   * @returns {Object} - Connection information
   */
  getConnectionInfo(userId, roomName) {
    try {
      const token = this.createToken(userId, roomName, ['publish', 'subscribe', 'data']);
      
      return {
        url: this.wsUrl,
        token: token,
        roomName: roomName,
        userId: userId
      };
    } catch (error) {
      console.error('Error getting connection info:', error);
      throw new Error('Failed to get LiveKit connection information');
    }
  }
}

module.exports = { LivekitClient };
