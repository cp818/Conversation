# Emma AI Demo

A web application demonstrating Emma AI's real-time voice conversation capabilities with a latency-tracking dashboard.

## Overview

This application implements real-time voice conversation with an AI assistant, allowing users to:

- Start a conversation with an AI assistant using voice input
- Speak to the AI and hear verbal responses through synthesized speech
- View detailed latency metrics for each part of the conversation process
- Track conversation statistics in a dashboard
- End conversations when finished

## Features

1. **Voice Conversations**: Real-time voice-to-voice communication with an AI assistant
2. **Speech-to-Text**: Uses Deepgram for fast and accurate speech recognition
3. **Text-to-Speech**: Uses ElevenLabs for natural-sounding AI voice responses
4. **Streaming LLM Responses**: Uses OpenAI's GPT-4o model for lowest latency responses
5. **Latency Tracking**: Measures and displays performance metrics for each component (STT, LLM, TTS)
6. **Real-time Dashboard**: Displays conversation stats and average latency
7. **Responsive Design**: Works on both desktop and mobile devices

## Technology

This demo is built with:

- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js, Express
- WebSockets: For real-time bidirectional communication
- Deepgram API: For speech-to-text
- ElevenLabs API: For text-to-speech
- OpenAI API: For streaming LLM responses
- LiveKit: For voice streaming

## Running the Demo Locally

1. Install the required dependencies:
   ```
   npm install
   ```

2. Create a `.env` file in the root directory with your API keys:
   ```
   DEEPGRAM_API_KEY=your_deepgram_api_key
   DEEPGRAM_PROJECT_ID=your_deepgram_project_id
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id
   OPENAI_API_KEY=your_openai_api_key
   LIVEKIT_API_KEY=your_livekit_api_key
   LIVEKIT_API_SECRET=your_livekit_api_secret
   LIVEKIT_WS_URL=your_livekit_ws_url
   ```

3. Choose the server implementation you want to run:
   ```
   # Start the simple text-only server (recommended for testing)
   node simple-server.js
   
   # Start the full server with speech synthesis
   node production-server.js
   
   # Start the basic server implementation
   node basic-server.js
   ```

4. Open your browser and navigate to the appropriate localhost URL:
   - `http://localhost:3002` for simple-server.js
   - `http://localhost:3001` for production-server.js
   - `http://localhost:3000` for basic-server.js

## Deploying to GitHub and Vercel

### 1. Push to GitHub

1. Create a new repository on GitHub

2. Initialize Git and push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Emma AI voice conversation system"
   git remote add origin https://github.com/yourusername/emma-ai-demo.git
   git push -u origin main
   ```

### 2. Deploy to Vercel

1. Sign up for a Vercel account at [vercel.com](https://vercel.com) if you don't have one

2. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

3. Deploy using Vercel CLI:
   ```bash
   vercel
   ```

4. Follow the prompts to connect to your GitHub repository

5. Set up your environment variables (API keys) in the Vercel dashboard:
   - Go to your project settings
   - Navigate to the "Environment Variables" tab
   - Add all the API keys from your `.env` file

6. Your application will be deployed and available at a Vercel URL

### Important Notes for Deployment

- The default configuration in `vercel.json` deploys the `simple-server.js` implementation, which is more reliable for production as it doesn't depend on speech synthesis
- For WebSocket support, you may need to upgrade to a paid Vercel plan
- Consider implementing proper authentication before exposing API keys in a production environment

## How to Use

1. Enter your name in the sidebar form
2. Click "Start Conversation" to begin a voice conversation with Emma AI
3. Click the microphone button and speak - your voice will be transcribed
4. The AI will respond with both text and voice
5. View detailed latency metrics for each part of the conversation pipeline
6. Click "End Conversation" when finished

## About Emma AI

Emma AI is a platform that provides AI voice technology for creating interactive, conversational AI experiences. This demo showcases their real-time voice conversation capability, including:

- Speech-to-text processing with Deepgram for fast, accurate transcription
- Text generation with OpenAI's GPT-4o model for low-latency responses
- Voice synthesis with ElevenLabs for natural-sounding speech
- Comprehensive latency tracking for each step in the conversation pipeline

## Implementation Details

### Architecture

- **Client-Server Model**: Browser client communicates with Node.js server via WebSockets
- **Audio Pipeline**: Browser microphone → WebSocket → Deepgram STT → GPT-4o → ElevenLabs TTS → Browser audio playback
- **Streaming Responses**: Both the LLM responses and audio synthesis are streamed for lower perceived latency

### Latency Optimization

The application tracks and displays three key latency metrics:

1. **STT Latency**: Time from speech capture to text transcription
2. **LLM Latency**: Time from transcription to complete AI response
3. **TTS Latency**: Time from AI response to speech synthesis

These metrics help identify bottlenecks in the conversation pipeline and optimize the overall user experience.

## Note

This demonstration requires API keys for Deepgram, OpenAI, and ElevenLabs. In production, these would be secured server-side and not exposed in client code.
