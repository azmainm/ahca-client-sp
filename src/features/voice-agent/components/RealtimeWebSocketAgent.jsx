'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * RealtimeWebSocketAgent - Direct OpenAI Realtime API integration via WebSocket
 * Replaces STT-TTS+VAD architecture with real-time bidirectional audio streaming
 */
const RealtimeWebSocketAgent = ({ onStatusChange }) => {
  // Core state
  const [isConnected, setIsConnected] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('Ready to start conversation');
  const [sessionId, setSessionId] = useState(null);
  const [userInfo, setUserInfo] = useState({ name: null, email: null, collected: false });
  const [conversationCount, setConversationCount] = useState(0);
  const [calendarLink, setCalendarLink] = useState(null);
  const [appointmentDetails, setAppointmentDetails] = useState(null);

  // Real-time states
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAIResponding, setIsAIResponding] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [aiTranscript, setAITranscript] = useState('');

  // Refs
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentAudioSourceRef = useRef(null);  // Track currently playing audio

  // Configuration
  const WS_URL = process.env.NEXT_PUBLIC_API_URL 
    ? `${process.env.NEXT_PUBLIC_API_URL.replace('http', 'ws')}/realtime-ws`
    : 'ws://localhost:3001/realtime-ws';

  useEffect(() => {
    onStatusChange?.(currentStatus);
  }, [currentStatus, onStatusChange]);

  const updateStatus = (status) => {
    setCurrentStatus(status);
    console.log('📊 [RealtimeWS] Status:', status);
  };

  /**
   * Start conversation
   */
  const startConversation = async () => {
    try {
      console.log('🎙️ [RealtimeWS] Starting conversation...');
      updateStatus('Initializing...');

      // Get microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;

      // Create AudioContext for audio processing
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      });

      // Connect to WebSocket server
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ [RealtimeWS] Connected to server');
        setIsConnected(true);
        updateStatus('Connected - waiting for AI...');
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          await handleServerMessage(message);
        } catch (error) {
          console.error('❌ [RealtimeWS] Error handling message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ [RealtimeWS] WebSocket error:', error);
        updateStatus('Connection error');
      };

      ws.onclose = () => {
        console.log('🔌 [RealtimeWS] Disconnected');
        setIsConnected(false);
        updateStatus('Disconnected');
      };

    } catch (error) {
      console.error('❌ [RealtimeWS] Error starting conversation:', error);
      updateStatus('Error: ' + error.message);
    }
  };

  /**
   * Handle messages from server
   */
  const handleServerMessage = async (message) => {
    console.log('📨 [RealtimeWS] Received:', message.type);

    switch (message.type) {
      case 'session_ready':
        console.log('✅ [RealtimeWS] Session ready:', message.sessionId);
        setSessionId(message.sessionId);
        updateStatus('Ready - start speaking');
        
        // Start streaming audio after session is ready
        startAudioStreaming();
        break;

      case 'speech_started':
        console.log('🎤 [RealtimeWS] User speaking');
        setIsSpeaking(true);
        setUserTranscript('');
        updateStatus('Listening...');
        
        // Cancel any ongoing AI response (interruption)
        // Server will send response.cancel to OpenAI
        if (isAIResponding) {
          console.log('🛑 [RealtimeWS] Interrupting AI response');
          stopAudioPlayback();
        }
        break;

      case 'speech_stopped':
        console.log('🔇 [RealtimeWS] User stopped speaking');
        setIsSpeaking(false);
        updateStatus('Processing...');
        break;

      case 'transcript':
        if (message.role === 'user') {
          console.log('📝 [User]:', message.text);
          setUserTranscript(message.text);
          setConversationCount(prev => prev + 1);
        } else if (message.role === 'assistant') {
          console.log('📝 [AI]:', message.text);
          setAITranscript(message.text);
        }
        break;

      case 'transcript_delta':
        // Real-time transcript streaming
        if (message.role === 'assistant') {
          setAITranscript(prev => prev + message.delta);
        }
        break;

      case 'audio':
        // Queue audio chunk for playback
        if (message.delta) {
          console.log('🔊 [RealtimeWS] Audio chunk received');
          setIsAIResponding(true);
          updateStatus('AI responding...');
          queueAudioChunk(message.delta);
        }
        break;

      case 'response_done':
        console.log('✅ [RealtimeWS] AI response complete');
        setIsAIResponding(false);
        updateStatus('Ready - start speaking');
        setAITranscript('');
        break;

      case 'user_info_updated':
        console.log('👤 [RealtimeWS] User info updated:', message.userInfo);
        setUserInfo(message.userInfo);
        break;

      case 'appointment_started':
        console.log('📅 [RealtimeWS] Appointment flow started');
        break;

      case 'appointment_created':
        console.log('✅ [RealtimeWS] Appointment created');
        setCalendarLink(message.calendarLink);
        setAppointmentDetails(message.appointmentDetails);
        break;

      case 'error':
        console.error('❌ [RealtimeWS] Error:', message.error);
        updateStatus('Error: ' + message.error);
        break;

      default:
        console.log('📋 [RealtimeWS] Unknown message type:', message.type);
    }
  };

  /**
   * Start streaming audio to server
   */
  const startAudioStreaming = () => {
    try {
      console.log('🔴 [RealtimeWS] Starting audio streaming');

      // Use AudioContext to capture raw audio
      const audioContext = audioContextRef.current;
      const source = audioContext.createMediaStreamSource(streamRef.current);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32 to Int16 (PCM16)
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Convert to base64
          const uint8Array = new Uint8Array(pcm16.buffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);
          
          // Send to server
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: base64
          }));
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      
      // Store processor reference for cleanup
      mediaRecorderRef.current = { processor, source };

      console.log('✅ [RealtimeWS] Audio streaming started');

    } catch (error) {
      console.error('❌ [RealtimeWS] Error starting audio stream:', error);
    }
  };


  /**
   * Queue audio chunk for playback
   */
  const queueAudioChunk = (base64Audio) => {
    audioQueueRef.current.push(base64Audio);
    
    // Start playback if not already playing
    if (!isPlayingRef.current) {
      playNextAudioChunk();
    }
  };

  /**
   * Play next audio chunk from queue
   */
  const playNextAudioChunk = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const base64Audio = audioQueueRef.current.shift();

    try {
      // Decode base64 to PCM16
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const int16Array = new Int16Array(bytes.buffer);
      
      // Convert PCM16 to Float32 for Web Audio API
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }
      
      // Create audio buffer
      const audioContext = audioContextRef.current;
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);
      
      // Play audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      // Store reference to current audio source
      currentAudioSourceRef.current = source;
      
      source.onended = () => {
        currentAudioSourceRef.current = null;
        // Play next chunk
        playNextAudioChunk();
      };
      
      source.start();
      
    } catch (error) {
      console.error('❌ [RealtimeWS] Error playing audio:', error);
      // Continue with next chunk
      playNextAudioChunk();
    }
  };

  /**
   * Stop audio playback (for interruptions)
   */
  const stopAudioPlayback = () => {
    console.log('🛑 [RealtimeWS] Stopping audio playback');
    
    // Stop currently playing audio immediately
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current = null;
      } catch (e) {
        // Already stopped
      }
    }
    
    // Clear audio queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsAIResponding(false);
    setAITranscript('');
  };

  /**
   * Stop conversation
   */
  const stopConversation = () => {
    console.log('⏹️ [RealtimeWS] Stopping conversation');

    // Stop audio processor
    if (mediaRecorderRef.current?.processor) {
      mediaRecorderRef.current.processor.disconnect();
      mediaRecorderRef.current.source.disconnect();
      mediaRecorderRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Reset state
    setIsConnected(false);
    setSessionId(null);
    setIsSpeaking(false);
    setIsAIResponding(false);
    setUserTranscript('');
    setAITranscript('');
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    
    updateStatus('Conversation ended');
  };

  const handleToggleConversation = () => {
    if (isConnected) {
      stopConversation();
    } else {
      startConversation();
    }
  };

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Main conversation button */}
      <div className="relative">
        <button
          onClick={handleToggleConversation}
          disabled={false}
          className={`relative w-20 h-20 rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-purple-500/50 ${
            isConnected
              ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 shadow-lg shadow-red-500/25'
              : 'bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 shadow-lg shadow-purple-500/25'
          }`}
        >
          <div className="flex items-center justify-center text-white">
            {isConnected ? (
              <div className="w-4 h-4 bg-white rounded-sm"></div>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2a3 3 0 013 3v6a3 3 0 11-6 0V5a3 3 0 013-3z"/>
                <path d="M19 10v1a7 7 0 11-14 0v-1a1 1 0 112 0v1a5 5 0 1010 0v-1a1 1 0 112 0z"/>
                <path d="M12 18.93a7.001 7.001 0 006-6.93 1 1 0 10-2 0 5 5 0 11-10 0 1 1 0 10-2 0 7.001 7.001 0 006 6.93V20h-3a1 1 0 100 2h8a1 1 0 100-2h-3v-1.07z"/>
              </svg>
            )}
          </div>
        </button>
      </div>

      <p className="text-white/80 text-sm font-medium text-center">
        {isConnected ? 'End Conversation' : 'Start Conversation'}
      </p>

      {/* Status Display */}
      {isConnected && (
        <div className="flex flex-col items-center space-y-4">
          {/* Status Indicator */}
          <div className="relative">
            <div className={`w-24 h-24 rounded-full transition-all duration-500 flex items-center justify-center border-4 ${
              isAIResponding
                ? 'bg-blue-500/20 border-blue-500/70 shadow-lg shadow-blue-500/30 animate-pulse'
                : isSpeaking
                  ? 'bg-green-500/20 border-green-500/70 shadow-lg shadow-green-500/30 animate-pulse'
                  : 'bg-purple-500/20 border-purple-500/50 shadow-lg shadow-purple-500/20'
            }`}>
              <div className="flex items-center justify-center text-white">
                {isAIResponding ? (
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-6 bg-blue-400 rounded-full animate-pulse"></div>
                    <div className="w-1.5 h-4 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-1.5 h-8 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-1.5 h-3 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                  </div>
                ) : isSpeaking ? (
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-6 bg-green-400 rounded-full animate-pulse"></div>
                    <div className="w-1.5 h-4 bg-green-400 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-1.5 h-8 bg-green-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-1.5 h-3 bg-green-400 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                  </div>
                ) : (
                  <svg className="w-8 h-8 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a3 3 0 013 3v6a3 3 0 11-6 0V5a3 3 0 013-3z"/>
                    <path d="M19 10v1a7 7 0 11-14 0v-1a1 1 0 112 0v1a5 5 0 1010 0v-1a1 1 0 112 0z"/>
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Status Text */}
          <div className="text-center">
            <p className="text-white/90 text-base font-medium">
              {isAIResponding ? '🤖 AI Speaking' :
               isSpeaking ? '🎤 You\'re Speaking' :
               '👂 Listening'}
            </p>
            <p className="text-white/60 text-sm mt-1">{currentStatus}</p>
          </div>

          {/* Transcript Display */}
          {(userTranscript || aiTranscript) && (
            <div className="w-full max-w-md bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
              {userTranscript && (
                <div className="mb-2">
                  <p className="text-green-400 text-xs font-semibold mb-1">You:</p>
                  <p className="text-white/80 text-sm">{userTranscript}</p>
                </div>
              )}
              {aiTranscript && (
                <div>
                  <p className="text-blue-400 text-xs font-semibold mb-1">AI:</p>
                  <p className="text-white/80 text-sm">{aiTranscript}</p>
                </div>
              )}
            </div>
          )}

          {/* Debug Info */}
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 px-4 py-2 text-xs text-white/70">
            <p>Session: {sessionId ? '✅' : '❌'}</p>
            <p>Connected: {isConnected ? '✅' : '❌'}</p>
            <p>Messages: {conversationCount}</p>
          </div>
        </div>
      )}

      {/* User Information */}
      {userInfo.name && (
        <div className="text-center">
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 px-4 py-2">
            <div className="text-white/90 text-sm font-semibold">User Info</div>
            <div className="text-white/70 text-xs mt-1">
              Name: {userInfo.name}
              {userInfo.email && <> • Email: {userInfo.email}</>}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Link */}
      {calendarLink && appointmentDetails && (
        <div className="text-center">
          <div className="inline-block bg-gradient-to-r from-emerald-500/20 to-blue-500/20 backdrop-blur-sm rounded-xl border border-emerald-500/30 p-4 max-w-sm">
            <div className="flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-emerald-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div className="text-emerald-400 text-sm font-semibold">Appointment Scheduled!</div>
            </div>

            <div className="text-white/90 text-xs mb-3 space-y-1">
              <div><strong>Service:</strong> {appointmentDetails.title}</div>
              <div><strong>Date:</strong> {appointmentDetails.date}</div>
              <div><strong>Time:</strong> {appointmentDetails.timeDisplay}</div>
            </div>

            <button
              onClick={() => window.open(calendarLink, '_blank')}
              className="w-full bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-400 hover:to-blue-400 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
            >
              📅 View in Calendar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RealtimeWebSocketAgent;

