# After Hours Call Agent (AHCA) - Voice AI Client with VAD

## Overview

The After Hours Call Agent client is a React/Next.js web application that provides a natural voice interface with **automatic Voice Activity Detection (VAD)**. Users can have hands-free conversations with the AI assistant without needing to press any buttons - just speak naturally and the system automatically detects when you start and stop talking.

## 🎤 Voice Activity Detection (VAD) Features

- **Hands-Free Operation**: No push-to-talk button required
- **Real-Time Audio Streaming**: Continuous microphone capture and processing  
- **Automatic Speech Detection**: Uses OpenAI Realtime API for server-side VAD
- **Natural Conversation Flow**: 2.5-second silence detection for natural pauses
- **Visual Feedback**: Real-time status indicators for listening, speaking, and processing states

## Architecture

The client implements OpenAI's **Realtime VAD Architecture**:

```
Microphone → WebM Audio → Server VAD → Transcription → AI Response → Audio Playback
     ↓              ↓            ↓             ↓            ↓            ↓
MediaRecorder → Base64 → RealtimeVADService → GPT-5-nano → TTS → HTML5 Audio
```

### Key Components

- **RealtimeVADVoiceAgent**: Main VAD-enabled voice interface component
- **Audio Processing**: WebM recording with automatic chunking and streaming
- **Real-Time Communication**: WebSocket-like polling for instant responses
- **State Management**: Conversation flow, user info, and appointment tracking
- **Visual Interface**: Modern UI with real-time status indicators

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Modern web browser with microphone support
- Backend server running (ahca-server)

### Installation & Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Using the VAD Voice Agent
1. Open http://localhost:3000 in your browser
2. Click the purple "Start Conversation" button
3. **Allow microphone access** when prompted by browser
4. Start speaking naturally - no buttons to press!
5. The system will automatically detect when you start and stop talking
6. Wait for the AI response and continue the conversation

## Frontend (ahca-client) - Detailed Implementation

### VAD Voice Interface Architecture

#### 1. RealtimeVADVoiceAgent Component (`src/features/voice-agent/components/RealtimeVADVoiceAgent.jsx`)

The main React component that handles the entire VAD voice interaction:

```javascript
// Key State Management
const [vadSessionActive, setVadSessionActive] = useState(false);
const [isListening, setIsListening] = useState(false);
const [isSpeaking, setIsSpeaking] = useState(false);
const [vadStatus, setVadStatus] = useState('Ready to start conversation');

// Core VAD Functions
- startConversation() - Initializes microphone and VAD session
- startRealtimeVAD() - Creates server-side VAD session
- startAudioStreaming() - Begins continuous audio capture
- sendAudioChunkToServer() - Streams audio to server for processing
- startResponseMonitoring() - Polls for AI responses
```

#### 2. Audio Processing Pipeline

**MediaRecorder Integration:**
```javascript
// Audio Configuration
const VAD_CONFIG = {
  apiUrl: 'http://localhost:3001',
  chunkIntervalMs: 1000,        // Send audio every 1 second
  statusPollMs: 500,            // Check status every 500ms  
  responsePollMs: 1000          // Check for responses every 1 second
};

// Audio Format Handling
1. Try 'audio/wav' first (preferred)
2. Fallback to 'audio/webm;codecs=opus'
3. Default browser format as last resort
```

**Continuous Audio Streaming:**
- Records audio in 1-second chunks
- Converts to Base64 for transmission
- Sends to `/api/chained-voice/realtime-vad/audio` endpoint
- Handles WebM to PCM16 conversion on server

#### 3. Real-Time Communication

**Status Monitoring:**
```javascript
// Polls server every 500ms for VAD status
GET /api/chained-voice/realtime-vad/status/:sessionId

Response: {
  exists: true,
  isConnected: true, 
  vadMode: "server_vad",
  hasSpeech: false,
  speechDuration: 0
}
```

**Response Monitoring:**
```javascript  
// Polls server every 1 second for AI responses
GET /api/chained-voice/realtime-vad/response/:sessionId

Response: {
  hasResponse: true,
  responseAudio: "base64-mp3-audio",
  userInfo: { name: "John", email: "john@example.com" },
  calendarLink: "https://calendar.link",
  conversationCount: 3
}
```

#### 4. Visual Interface Components

**Main Interface:**
```javascript
// Central microphone button with dynamic states
<div className="relative">
  {/* Animated pulse rings for listening state */}
  {isListening && (
    <div className="absolute inset-0 animate-ping bg-purple-400 rounded-full opacity-75" />
  )}
  
  {/* Main microphone button */}
  <button className="relative bg-gradient-to-br from-purple-600 to-purple-700">
    <Mic className="w-8 h-8 text-white" />
  </button>
</div>
```

**Status Indicators:**
- **Ready**: Purple gradient button, "Ready to start conversation"
- **Listening**: Animated pulse rings, "Listening... (speak naturally)"  
- **Speaking**: Blue accent, "Speaking detected..."
- **Processing**: Loading state, "Processing your request..."
- **Responding**: Green accent, "AI is responding..."

**User Information Display:**
```javascript
// Shows collected user info in real-time
{userInfo.name && (
  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
    <p className="text-white/90 text-sm">
      👤 {userInfo.name} | 📧 {userInfo.email}
    </p>
  </div>
)}
```

**Conversation Counter:**
```javascript
// Tracks conversation progress
<div className="text-white/60 text-xs">
  Conversation: {conversationCount} exchanges
</div>
```

### Error Handling & Fallbacks

#### Microphone Access
```javascript
// Graceful handling of microphone permissions
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  streamRef.current = stream;
} catch (error) {
  console.error('Microphone access denied:', error);
  updateStatus('Microphone access required for voice interaction');
}
```

#### Audio Format Compatibility
```javascript
// Progressive fallback for audio recording
let mediaRecorder;
try {
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/wav' });
} catch (e) {
  try {
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  } catch (e2) {
    mediaRecorder = new MediaRecorder(stream); // Browser default
  }
}
```

#### Network Error Recovery
```javascript
// Automatic retry with exponential backoff
const sendWithRetry = async (data, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(endpoint, { method: 'POST', body: data });
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
};
```

## Browser Compatibility

### Supported Browsers
- ✅ **Chrome 80+**: Full WebM and MediaRecorder support
- ✅ **Firefox 75+**: Full WebM and MediaRecorder support  
- ✅ **Safari 14+**: Limited WebM support, falls back to browser default
- ✅ **Edge 80+**: Full WebM and MediaRecorder support

### Required Browser Features
- **MediaRecorder API**: For audio recording
- **getUserMedia API**: For microphone access
- **Fetch API**: For server communication
- **Web Audio API**: For audio playback
- **ES6+ Support**: Modern JavaScript features

## Development Features

### Hot Reload Support
```bash
# Development server with hot reload
npm run dev

# The VAD system works seamlessly with Next.js hot reload
# Audio sessions are automatically cleaned up on component unmount
```

### Debug Logging
Enable detailed client-side logging by checking browser console:

```javascript
// Client logs show detailed VAD processing
🎵 [RealtimeVAD] MediaRecorder data available: 14786 bytes
📦 [RealtimeVAD] Audio chunks accumulated: 1
📤 [RealtimeVAD] Sending audio chunk to server: 19714 chars base64
✅ [RealtimeVAD] Audio sent to Realtime VAD successfully: 14786 bytes
🔊 [RealtimeVAD] Playing response audio: 45231 bytes
```

## Deployment Considerations

### Environment Variables
```bash
# .env.local for client configuration
NEXT_PUBLIC_API_URL=https://your-server-domain.com
```

### Build Optimization
```bash
# Production build with optimizations
npm run build
npm start

# The VAD system is optimized for production:
# - Minified JavaScript bundles
# - Optimized audio processing
# - Efficient polling intervals
```

### HTTPS Requirements
- **Production**: HTTPS required for microphone access
- **Development**: localhost works with HTTP
- **Mobile**: HTTPS mandatory on all mobile browsers

---

## Troubleshooting

### Common Issues

#### "Microphone not working"
1. Check browser permissions (click lock icon in address bar)
2. Ensure no other applications are using microphone
3. Try refreshing the page and allowing permissions again

#### "No response from AI"  
1. Check server is running on http://localhost:3001
2. Verify OpenAI API key is configured in server
3. Check browser network tab for failed requests

#### "Audio quality issues"
1. Use a quiet environment for better VAD detection
2. Speak clearly at moderate volume
3. Ensure stable internet connection for real-time processing

### Performance Tips
- **Close other audio applications** for better microphone access
- **Use wired headphones** to prevent audio feedback
- **Stable internet connection** for real-time VAD processing
- **Modern browser** for optimal MediaRecorder performance

The VAD Voice Agent client is now ready for seamless voice interactions! 🎤✨