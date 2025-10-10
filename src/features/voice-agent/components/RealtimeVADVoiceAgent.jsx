'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * RealtimeVADVoiceAgent - Uses OpenAI's Realtime API for server-side VAD
 * Integrates with existing STT-TTS pipeline
 * Streams audio to server which connects to OpenAI Realtime API for VAD processing
 */
const RealtimeVADVoiceAgent = ({ onStatusChange }) => {
  // Core state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('Ready to start conversation');
  const [sessionId, setSessionId] = useState(null);
  const [userInfo, setUserInfo] = useState({ name: null, email: null, collected: false });
  const [conversationCount, setConversationCount] = useState(0);
  const [calendarLink, setCalendarLink] = useState(null);
  const [appointmentDetails, setAppointmentDetails] = useState(null);

  // Realtime VAD specific states
  const [vadSessionActive, setVadSessionActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [vadStatus, setVadStatus] = useState({ exists: false });
  // Always use server_vad - simpler and more reliable

  // Refs for audio handling
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const vadIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const responseIntervalRef = useRef(null);

  // Realtime VAD configuration
  const VAD_CONFIG = {
    chunkIntervalMs: 1000,        // Send 1-second chunks to server
    statusCheckIntervalMs: 1000,  // Check status every second
    responseCheckIntervalMs: 500, // Check for response audio every 500ms
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  };

  useEffect(() => {
    onStatusChange?.(currentStatus);
  }, [currentStatus, onStatusChange]);

  const updateStatus = (status) => {
    setCurrentStatus(status);
    console.log('📊 [RealtimeVAD] Status:', status);
  };

  /**
   * Start conversation with OpenAI Realtime API VAD
   */
  const startConversation = async () => {
    try {
      console.log('🎙️ [RealtimeVAD] Starting Realtime API VAD conversation...');
      updateStatus('Starting conversation...');

      // Get microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      // Create session ID
      const newSessionId = `realtime-vad-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      setUserInfo({ name: null, email: null, collected: false });
      setConversationCount(0);
      setCalendarLink(null);
      setAppointmentDetails(null);

      console.log('✅ [RealtimeVAD] Session started:', newSessionId);

      // Play initial greeting using existing TTS
      const initialGreeting = "Hi there! Welcome to SherpaPrompt Fencing Company. I'm here to help with your fencing needs. Could you tell me your name and email address to get started?";

      updateStatus('Playing greeting...');
      await playTextAsAudio(initialGreeting, newSessionId);

      // Start Realtime VAD session
      await startRealtimeVAD(newSessionId);

    } catch (error) {
      console.error('❌ [RealtimeVAD] Error starting conversation:', error);
      updateStatus('Error: ' + error.message);
    }
  };

  /**
   * Start OpenAI Realtime API VAD session
   */
  const startRealtimeVAD = async (sessionId) => {
    try {
      console.log('🎯 [RealtimeVAD] Starting Realtime API VAD session...');
      updateStatus('Initializing Realtime VAD...');

      // Start VAD session on server (always server_vad)
      const vadStartResponse = await fetch(`${VAD_CONFIG.apiUrl}/api/chained-voice/realtime-vad/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!vadStartResponse.ok) {
        throw new Error(`Failed to start Realtime VAD session: ${vadStartResponse.status}`);
      }

      const vadStartData = await vadStartResponse.json();
      console.log('✅ [RealtimeVAD] Realtime API VAD session started:', vadStartData);

      setVadSessionActive(true);
      setIsListening(true);
      updateStatus('Listening... (server VAD)');

        // Start continuous audio streaming
        startAudioStreaming(sessionId);

      // Start status monitoring
      startStatusMonitoring(sessionId);

      // Start response monitoring
      startResponseMonitoring(sessionId);

    } catch (error) {
      console.error('❌ [RealtimeVAD] Failed to start Realtime VAD:', error);
      updateStatus('Realtime VAD initialization failed: ' + error.message);
      
      // TODO: Could implement fallback to manual mode or browser VAD here
      // For now, just show the error
    }
  };

  /**
   * Start continuous audio streaming to server
   */
  const startAudioStreaming = (currentSessionId) => {
    if (!streamRef.current) {
      console.error('❌ [RealtimeVAD] No audio stream available');
      return;
    }
    
    if (!currentSessionId) {
      console.error('❌ [RealtimeVAD] No session ID provided for audio streaming');
      return;
    }

    try {
      console.log('🔴 [RealtimeVAD] Starting continuous audio streaming...');

      // Try to use a format closer to PCM16 if possible
      let mediaRecorder;
      try {
        // Try PCM first (if supported)
        mediaRecorder = new MediaRecorder(streamRef.current, {
          mimeType: 'audio/wav'
        });
      } catch (e) {
        try {
          // Fallback to WebM
          mediaRecorder = new MediaRecorder(streamRef.current, {
            mimeType: 'audio/webm;codecs=opus'
          });
        } catch (e2) {
          // Final fallback - let browser choose
          mediaRecorder = new MediaRecorder(streamRef.current);
        }
      }

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
            console.log('🎵 [RealtimeVAD] MediaRecorder data available:', event.data.size, 'bytes');
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data);
              console.log('📦 [RealtimeVAD] Audio chunks accumulated:', audioChunksRef.current.length);
            }
          };

      mediaRecorder.onstop = async () => {
        console.log('⏹️ [RealtimeVAD] MediaRecorder stopped, sending accumulated audio...');
        
        // Send the complete WebM file when recording stops
        if (audioChunksRef.current.length > 0 && currentSessionId) {
          await sendAudioChunkToServer(currentSessionId);
        }
      };

      // Start recording continuously (no timeslice to avoid fragmentation)
      console.log('🎤 [RealtimeVAD] MediaRecorder mimeType:', mediaRecorder.mimeType);
      mediaRecorder.start(); // Start continuous recording

          // Send accumulated audio chunks to server at regular intervals
          vadIntervalRef.current = setInterval(async () => {
            console.log('⏰ [RealtimeVAD] Interval check - chunks:', audioChunksRef.current.length, 'vadActive:', vadSessionActive, 'sessionId:', currentSessionId);
            
            // Stop and restart recording to get a complete WebM file
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
              
              // Wait a bit for the stop event to process, then restart
              setTimeout(() => {
                if (mediaRecorderRef.current && streamRef.current) {
                  mediaRecorderRef.current.start();
                }
              }, 100);
            }
          }, VAD_CONFIG.chunkIntervalMs);

    } catch (error) {
      console.error('❌ [RealtimeVAD] Audio streaming error:', error);
      updateStatus('Audio streaming failed: ' + error.message);
    }
  };

  /**
   * Send audio chunk to server for Realtime VAD processing
   */
  const sendAudioChunkToServer = async (currentSessionId) => {
    console.log('🔍 [RealtimeVAD] sendAudioChunkToServer called - chunks:', audioChunksRef.current.length, 'sessionId:', currentSessionId);
    if (audioChunksRef.current.length === 0) {
      console.log('⚠️ [RealtimeVAD] No audio chunks to send');
      return;
    }
    if (!currentSessionId) {
      console.log('⚠️ [RealtimeVAD] No sessionId available for sending audio');
      return;
    }

    try {
      // Combine audio chunks
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      audioChunksRef.current = []; // Clear chunks

      if (audioBlob.size === 0) return;

      // Convert to base64
      const audioBase64 = await blobToBase64(audioBlob);

      console.log('📤 [RealtimeVAD] Sending audio chunk to server:', audioBase64.length, 'chars base64');

      // Send to server for Realtime VAD processing
      const vadResponse = await fetch(`${VAD_CONFIG.apiUrl}/api/chained-voice/realtime-vad/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          audio: audioBase64,
          commit: false // Don't commit yet, let VAD decide
        }),
      });

      if (!vadResponse.ok) {
        console.warn('⚠️ [RealtimeVAD] VAD processing failed:', vadResponse.status);
        return;
      }

      const vadResult = await vadResponse.json();
      console.log('✅ [RealtimeVAD] Audio sent to Realtime VAD successfully:', vadResult.audioSize, 'bytes');

    } catch (error) {
      console.error('❌ [RealtimeVAD] Error sending audio chunk:', error);
    }
  };

  /**
   * Start monitoring VAD session status
   */
  const startStatusMonitoring = (sessionId) => {
    statusIntervalRef.current = setInterval(async () => {
      try {
        const statusResponse = await fetch(`${VAD_CONFIG.apiUrl}/api/chained-voice/realtime-vad/status/${sessionId}`);
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          setVadStatus(statusData);
          
          // Update speaking state based on VAD status
          if (statusData.hasSpeech !== isSpeaking) {
            setIsSpeaking(statusData.hasSpeech);
            console.log('🎤 [RealtimeVAD] Speaking state changed:', statusData.hasSpeech);
          }
        }
      } catch (error) {
        console.warn('⚠️ [RealtimeVAD] Status check failed:', error);
      }
    }, VAD_CONFIG.statusCheckIntervalMs);
  };

  /**
   * Start monitoring for response audio from server
   */
  const startResponseMonitoring = (sessionId) => {
    responseIntervalRef.current = setInterval(async () => {
      try {
        const responseResponse = await fetch(`${VAD_CONFIG.apiUrl}/api/chained-voice/realtime-vad/response/${sessionId}`);
        
        if (responseResponse.ok) {
          const responseData = await responseResponse.json();
          
          if (responseData.hasResponse && responseData.responseAudio) {
            console.log('🔊 [RealtimeVAD] Received response audio from server');
            
            // Update conversation state
            if (responseData.userInfo) {
              setUserInfo(responseData.userInfo);
            }
            
            if (responseData.calendarLink) {
              setCalendarLink(responseData.calendarLink);
              setAppointmentDetails(responseData.appointmentDetails);
            }
            
            if (responseData.conversationCount) {
              setConversationCount(responseData.conversationCount);
            }
            
            // Play filler phrase first if available
            if (responseData.fillerPhrase) {
              console.log('🔊 [RealtimeVAD] Playing filler phrase:', responseData.fillerPhrase);
              setIsProcessing(true);
              updateStatus('Processing...');
              await playTextAsAudio(responseData.fillerPhrase, sessionId);
            }
            
            // Play the response audio
            setIsProcessing(true);
            updateStatus('AI responding...');
            
            await playAudio(responseData.responseAudio);
            
            setIsProcessing(false);
            updateStatus('Listening... (server VAD)');
          }
        }
      } catch (error) {
        console.warn('⚠️ [RealtimeVAD] Response check failed:', error);
      }
    }, VAD_CONFIG.responseCheckIntervalMs);
  };

  /**
   * Stop conversation and cleanup
   */
  const stopConversation = async () => {
    console.log('⏹️ [RealtimeVAD] Stopping conversation...');

    // Stop Realtime VAD session on server
    if (sessionId && vadSessionActive) {
      try {
        await fetch(`${VAD_CONFIG.apiUrl}/api/chained-voice/realtime-vad/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
      } catch (error) {
        console.error('❌ [RealtimeVAD] Failed to stop Realtime VAD session:', error);
      }
    }

    // Stop audio streaming
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }

    if (responseIntervalRef.current) {
      clearInterval(responseIntervalRef.current);
      responseIntervalRef.current = null;
    }

    // Stop recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clean up session on server (existing endpoint)
    if (sessionId) {
      try {
        await fetch(`${VAD_CONFIG.apiUrl}/api/chained-voice/session/${sessionId}`, {
          method: 'DELETE'
        });
        console.log('✅ [RealtimeVAD] Session cleanup requested for:', sessionId);
      } catch (error) {
        console.error('❌ [RealtimeVAD] Failed to cleanup session:', error);
      }
    }

    // Reset state
    setIsProcessing(false);
    setSessionId(null);
    setUserInfo({ name: null, email: null, collected: false });
    setConversationCount(0);
    setCalendarLink(null);
    setAppointmentDetails(null);
    setVadSessionActive(false);
    setIsListening(false);
    setIsSpeaking(false);
    setVadStatus({ exists: false });
    updateStatus('Conversation ended');
  };

  /**
   * Play text as audio using existing TTS endpoint
   */
  const playTextAsAudio = async (text, currentSessionId = null) => {
    try {
      const synthesisResponse = await fetch(`${VAD_CONFIG.apiUrl}/api/chained-voice/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          sessionId: currentSessionId || sessionId
        }),
      });

      if (!synthesisResponse.ok) {
        throw new Error('Speech synthesis failed');
      }

      const synthesisData = await synthesisResponse.json();
      await playAudio(synthesisData.audio);
    } catch (error) {
      console.error('❌ [RealtimeVAD] Text-to-speech error:', error);
    }
  };

  // Server VAD only - no mode switching needed

  /**
   * Utility functions (unchanged from original)
   */
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const playAudio = (audioBase64) => {
    return new Promise((resolve, reject) => {
      try {
        const audioBlob = new Blob([Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = (error) => {
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        audio.play();
      } catch (error) {
        reject(error);
      }
    });
  };

  const handleToggleConversation = () => {
    if (sessionId) {
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
          disabled={isProcessing}
          className={`relative w-20 h-20 rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-purple-500/50 disabled:cursor-not-allowed disabled:transform-none ${
            sessionId
              ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 shadow-lg shadow-red-500/25'
              : 'bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 shadow-lg shadow-purple-500/25'
          }`}
        >
          <div className="flex items-center justify-center text-white">
            {sessionId ? (
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
        {sessionId ? 'End Conversation' : 'Start Conversation'}
      </p>

      {/* Server VAD Only - No mode selection needed */}

      {/* Realtime VAD Status Display */}
      {sessionId && (
        <div className="flex flex-col items-center space-y-4">
          {/* Status Indicator */}
          <div className="relative">
            <div className={`w-24 h-24 rounded-full transition-all duration-500 flex items-center justify-center border-4 ${
              isProcessing
                ? 'bg-yellow-500/20 border-yellow-500/50 shadow-lg shadow-yellow-500/20'
                : isSpeaking
                  ? 'bg-green-500/20 border-green-500/70 shadow-lg shadow-green-500/30 animate-pulse'
                  : isListening
                    ? 'bg-blue-500/20 border-blue-500/50 shadow-lg shadow-blue-500/20'
                    : 'bg-gray-500/20 border-gray-500/50 shadow-lg shadow-gray-500/20'
            }`}>
              <div className="flex items-center justify-center text-white">
                {isProcessing ? (
                  <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                ) : isSpeaking ? (
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-6 bg-green-400 rounded-full animate-pulse"></div>
                    <div className="w-1.5 h-4 bg-green-400 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-1.5 h-8 bg-green-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-1.5 h-3 bg-green-400 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                  </div>
                ) : isListening ? (
                  <svg className="w-8 h-8 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a3 3 0 013 3v6a3 3 0 11-6 0V5a3 3 0 013-3z"/>
                    <path d="M19 10v1a7 7 0 11-14 0v-1a1 1 0 112 0v1a5 5 0 1010 0v-1a1 1 0 112 0z"/>
                    <path d="M12 18.93a7.001 7.001 0 006-6.93 1 1 0 10-2 0 5 5 0 11-10 0 1 1 0 10-2 0 7.001 7.001 0 006 6.93V20h-3a1 1 0 100 2h8a1 1 0 100-2h-3v-1.07z"/>
                  </svg>
                ) : (
                  <div className="w-6 h-6 bg-gray-400 rounded-sm"></div>
                )}
              </div>
            </div>

            {/* Listening indicator ring */}
            {isListening && !isProcessing && (
              <div className="absolute inset-0 rounded-full border-2 border-blue-400/30 animate-ping"></div>
            )}
          </div>

          {/* Status Text */}
          <div className="text-center">
            <p className="text-white/90 text-base font-medium">
              {isProcessing ? '🔄 Processing Speech' :
               isSpeaking ? '🎤 Speech Detected' :
               isListening ? '👂 OpenAI Realtime VAD' :
               '⏸️ Not Active'}
            </p>
            <p className="text-white/60 text-sm mt-1">
              {isProcessing ? 'AI is processing your request...' :
               isSpeaking ? 'OpenAI detecting your speech...' :
               isListening ? 'Server VAD analyzing audio...' :
               'Realtime VAD inactive'}
            </p>
          </div>

          {/* Realtime VAD Debug Panel */}
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 px-4 py-2 text-xs text-white/70">
            <p>Realtime VAD: {vadSessionActive ? '✅' : '❌'}</p>
            <p>Connected: {vadStatus.isConnected ? '✅' : '❌'}</p>
            <p>Mode: Server VAD</p>
            <p>Speaking: {isSpeaking ? '🟢' : '⚪'}</p>
            <p>Silence: 2.5s threshold</p>
            {vadStatus.speechDuration > 0 && (
              <p>Duration: {Math.round(vadStatus.speechDuration / 1000)}s</p>
            )}
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

      {/* Conversation Counter */}
      {conversationCount > 0 && (
        <div className="text-center">
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 px-3 py-1">
            <div className="text-white/80 text-xs">
              Exchanges: {conversationCount}
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

export default RealtimeVADVoiceAgent;
