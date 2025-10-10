/**
 * ChainedVoiceAgent Component - OpenAI Documentation Implementation
 * Follows the exact chained architecture from OpenAI documentation:
 * Audio → STT → Text Processing → TTS → Audio
 * With automatic Voice Activity Detection (VAD) for hands-free operation
 */
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const ChainedVoiceAgent = ({ onStatusChange }) => {
  // Core state - simplified following OpenAI patterns
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('Ready to start conversation');
  const [sessionId, setSessionId] = useState(null);
  const [userInfo, setUserInfo] = useState({ name: null, email: null, collected: false });
  const [conversationCount, setConversationCount] = useState(0);
  const [calendarLink, setCalendarLink] = useState(null);
  const [appointmentDetails, setAppointmentDetails] = useState(null);

  // VAD-specific state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [vadInstance, setVadInstance] = useState(null);
  const [vadReady, setVadReady] = useState(false);

  // Refs for media handling and VAD
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const vadRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const speechStartTimeRef = useRef(null);
  const audioContextRef = useRef(null);

  // VAD Configuration - Optimized for natural conversation with 2-3 second pause tolerance
  const VAD_CONFIG = {
    // Speech detection sensitivity - more conservative for reliability
    positiveSpeechThreshold: 0.8,    // Higher = less sensitive to noise
    negativeSpeechThreshold: 0.6,    // Higher = more conservative
    
    // Timing settings for natural conversation
    preSpeechPadFrames: 5,           // Fewer frames for faster response
    redemptionFrames: 5,             // Fewer frames for quicker detection
    frameSamples: 1536,              // Standard frame size
    
    // Pause tolerance settings - KEY FOR NATURAL CONVERSATION
    silenceThreshold: 2500,          // 2.5 seconds of silence before stopping
    minSpeechDuration: 500,          // Minimum 500ms of speech to be considered valid
    maxRecordingTime: 45000,         // Maximum 45 seconds per recording
  };

  useEffect(() => {
    onStatusChange?.(currentStatus);
  }, [currentStatus, onStatusChange]);

  const updateStatus = useCallback((status) => {
    setCurrentStatus(status);
    console.log('📊 [VAD] Status:', status);
  }, []);

  // Initialize VAD with proper error handling and worklet fix
  const initializeVAD = useCallback(async () => {
    try {
      console.log('🎯 [VAD] Initializing Voice Activity Detection...');
      updateStatus('Loading VAD model...');

      // Check if we have a stream
      if (!streamRef.current) {
        throw new Error('No audio stream available');
      }

      // Dynamic import to avoid SSR issues
      const { MicVAD } = await import('@ricky0123/vad-web');
      
      console.log('📦 [VAD] VAD library loaded, creating instance...');

      // Create VAD instance with worklet-safe configuration
      const vad = await MicVAD.new({
        // Don't specify custom URLs - let the library handle defaults
        // This avoids worklet loading issues
        
        // Conservative sensitivity settings
        positiveSpeechThreshold: VAD_CONFIG.positiveSpeechThreshold,
        negativeSpeechThreshold: VAD_CONFIG.negativeSpeechThreshold,
        
        // Minimal frame settings
        preSpeechPadFrames: VAD_CONFIG.preSpeechPadFrames,
        redemptionFrames: VAD_CONFIG.redemptionFrames,
        
        // Audio stream
        stream: streamRef.current,
        
        // Event handlers
        onSpeechStart: handleSpeechStart,
        onSpeechEnd: handleSpeechEnd,
        onVADMisfire: handleVADMisfire,
      });

      vadRef.current = vad;
      setVadInstance(vad);
      setVadReady(true);
      
      console.log('✅ [VAD] Voice Activity Detection initialized successfully');
      console.log('🔧 [VAD] Config:', {
        positiveSpeechThreshold: VAD_CONFIG.positiveSpeechThreshold,
        negativeSpeechThreshold: VAD_CONFIG.negativeSpeechThreshold,
        silenceThreshold: VAD_CONFIG.silenceThreshold,
        minSpeechDuration: VAD_CONFIG.minSpeechDuration
      });
      
      return vad;
    } catch (error) {
      console.error('❌ [VAD] Failed to initialize VAD:', error);
      console.log('🔄 [VAD] Falling back to manual mode...');
      
      // Fallback: Set up basic recording without VAD
      setVadReady(false);
      setIsListening(true);
      updateStatus('Listening... (manual mode - use Force Start)');
      
      return null;
    }
  }, [updateStatus]);

  // Handle speech start detection
  const handleSpeechStart = useCallback(() => {
    const now = Date.now();
    speechStartTimeRef.current = now;
    
    console.log('🎤 [VAD] Speech START detected at', new Date(now).toLocaleTimeString());
    
    // Clear any existing silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      console.log('⏰ [VAD] Cleared existing silence timer');
    }
    
    setIsSpeaking(true);
    
    // Start recording if not already recording
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      console.log('🔴 [VAD] Starting recording due to speech detection');
      startRecordingInternal();
    }
    
    updateStatus('Listening... (speaking detected)');
  }, [updateStatus]);

  // Handle speech end detection with smart pause tolerance
  const handleSpeechEnd = useCallback((audio) => {
    const now = Date.now();
    const speechDuration = speechStartTimeRef.current ? now - speechStartTimeRef.current : 0;
    
    console.log('🎤 [VAD] Speech END detected at', new Date(now).toLocaleTimeString());
    console.log('⏱️ [VAD] Speech duration:', speechDuration, 'ms');
    
    setIsSpeaking(false);
    
    // Check if speech was long enough to be considered valid
    if (speechDuration < VAD_CONFIG.minSpeechDuration) {
      console.log('⚠️ [VAD] Speech too short, ignoring (', speechDuration, 'ms < ', VAD_CONFIG.minSpeechDuration, 'ms)');
      updateStatus('Listening... (speech too short)');
      return;
    }
    
    // Start silence timer with configurable threshold
    console.log('⏰ [VAD] Starting silence timer (', VAD_CONFIG.silenceThreshold, 'ms)');
    updateStatus(`Listening... (waiting for ${VAD_CONFIG.silenceThreshold/1000}s silence)`);
    
    silenceTimerRef.current = setTimeout(() => {
      console.log('🔕 [VAD] Silence threshold reached, stopping recording');
      stopRecordingAndProcess();
    }, VAD_CONFIG.silenceThreshold);
    
  }, [updateStatus]);

  // Handle VAD misfires (false positives)
  const handleVADMisfire = useCallback(() => {
    console.log('🚫 [VAD] Misfire detected (false positive)');
    // Don't change state for misfires, just log them
  }, []);

  // Start recording internally (called by VAD or manual trigger)
  const startRecordingInternal = useCallback(async () => {
    // Check if we have both stream and session
    if (!streamRef.current) {
      console.log('⚠️ [VAD] Cannot start recording: no audio stream');
      updateStatus('Error: No audio stream available');
      return;
    }
    
    if (!sessionId) {
      console.log('⚠️ [VAD] Cannot start recording: no session');
      updateStatus('Error: No session active');
      return;
    }

    try {
      console.log('🎙️ [VAD] Starting internal recording...');
      console.log('🔍 [VAD] Stream state:', streamRef.current.active ? 'active' : 'inactive');
      console.log('🔍 [VAD] Session ID:', sessionId);
      
      // Reset audio chunks
      audioChunksRef.current = [];

      // Create MediaRecorder if not exists or if it's in wrong state
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        console.log('🎙️ [VAD] Creating new MediaRecorder...');
        
        const mediaRecorder = new MediaRecorder(streamRef.current, {
          mimeType: 'audio/webm;codecs=opus'
        });
        
        mediaRecorderRef.current = mediaRecorder;

        // Handle data collection
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            console.log('📊 [VAD] Audio chunk collected:', event.data.size, 'bytes');
          }
        };

        // Handle recording completion
        mediaRecorder.onstop = async () => {
          console.log('🔴 [VAD] Recording stopped internally, processing...');
          
          if (audioChunksRef.current.length > 0) {
            await processAudioChain();
          } else {
            console.log('⚠️ [VAD] No audio chunks collected');
            updateStatus('Listening... (ready)');
          }
        };
      }

      // Start recording if not already recording
      if (mediaRecorderRef.current.state !== 'recording') {
        mediaRecorderRef.current.start(100); // Collect data every 100ms
        console.log('✅ [VAD] Internal recording started');
        updateStatus('Recording... (speak now)');
      } else {
        console.log('⚠️ [VAD] Recording already in progress');
      }
      
    } catch (error) {
      console.error('❌ [VAD] Internal recording error:', error);
      updateStatus('Recording failed: ' + error.message);
    }
  }, [sessionId, updateStatus]);

  // Stop recording and process
  const stopRecordingAndProcess = useCallback(() => {
    console.log('⏹️ [VAD] Stopping recording and processing...');
    
    // Clear silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    // Stop recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      console.log('✅ [VAD] Recording stopped');
    } else {
      console.log('⚠️ [VAD] No active recording to stop');
    }
    
    setIsSpeaking(false);
  }, []);

  const startConversation = async () => {
    try {
      console.log('🎙️ [VAD] Starting VAD-enabled conversation...');
      updateStatus('Starting conversation...');

      // Get microphone permission with optimal settings for VAD
      console.log('🎤 [VAD] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      streamRef.current = stream;
      console.log('✅ [VAD] Microphone access granted');

      // Create session ID
      const newSessionId = `vad-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      setUserInfo({ name: null, email: null, collected: false });
      setConversationCount(0);
      setCalendarLink(null);
      setAppointmentDetails(null);
      
      console.log('✅ [VAD] Session started:', newSessionId);

      // Play initial greeting
      const initialGreeting = "Hi there! Welcome to SherpaPrompt Fencing Company. I'm here to help with your fencing needs. Just start speaking naturally - I'll listen automatically. Could you tell me your name and email address to get started?";
      
      updateStatus('Playing greeting...');
      await playTextAsAudio(initialGreeting, newSessionId);

      // Try to initialize VAD after we have the stream and session
      console.log('🎯 [VAD] Attempting to initialize VAD...');
      const vadSuccess = await initializeVAD();
      
      if (vadSuccess) {
        // Start listening mode with VAD
        setIsListening(true);
        updateStatus('Listening... (speak naturally)');
        console.log('✅ [VAD] Automatic mode activated');
      } else {
        // Fallback mode - manual controls
        setIsListening(true);
        updateStatus('Listening... (manual mode - use Force Start)');
        console.log('🔧 [VAD] Manual mode activated');
      }
      
    } catch (error) {
      console.error('❌ [VAD] Error starting conversation:', error);
      updateStatus('Error: ' + error.message);
    }
  };

  const stopConversation = async () => {
    console.log('⏹️ [VAD] Stopping VAD conversation...');
    
    // Stop VAD
    if (vadRef.current) {
      try {
        vadRef.current.destroy();
        console.log('✅ [VAD] VAD instance destroyed');
      } catch (error) {
        console.error('❌ [VAD] Error destroying VAD:', error);
      }
    }
    
    // Clear timers
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clean up session on server
    if (sessionId) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chained-voice/session/${sessionId}`, {
          method: 'DELETE'
        });
        console.log('✅ [VAD] Session cleanup requested for:', sessionId);
      } catch (error) {
        console.error('❌ [VAD] Failed to cleanup session:', error);
      }
    }

    // Reset state
    setIsListening(false);
    setIsProcessing(false);
    setIsSpeaking(false);
    setSessionId(null);
    setUserInfo({ name: null, email: null, collected: false });
    setConversationCount(0);
    setVadInstance(null);
    setVadReady(false);
    vadRef.current = null;
    mediaRecorderRef.current = null;
    updateStatus('Conversation ended');
  };

  const processAudioChain = async () => {
    try {
      setIsProcessing(true);
      updateStatus('Processing speech...');

      // Step 1: Convert audio to format for API
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      console.log('📦 [VAD] Audio blob size:', audioBlob.size, 'bytes');
      
      if (audioBlob.size === 0) {
        updateStatus('Listening... (no audio detected)');
        setIsProcessing(false);
        return;
      }

      const audioBase64 = await blobToBase64(audioBlob);

      // Step 2: Transcribe with Whisper
      updateStatus('Transcribing...');
      const transcriptionResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chained-voice/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          audio: audioBase64,
          sessionId: sessionId 
        }),
      });

      if (!transcriptionResponse.ok) {
        throw new Error(`Transcription failed: ${transcriptionResponse.status}`);
      }

      const transcriptionData = await transcriptionResponse.json();
      const userText = transcriptionData.text;
      
      console.log('📝 [VAD] Transcribed:', userText);

      if (!userText || userText.trim().length === 0) {
        updateStatus('Listening... (no speech detected)');
        setIsProcessing(false);
        return;
      }

      // Step 3: Process with LLM and function calling
      updateStatus('Processing with AI...');
      const processResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chained-voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: userText,
          sessionId: sessionId 
        }),
      });

      if (!processResponse.ok) {
        throw new Error(`Processing failed: ${processResponse.status}`);
      }

      const processData = await processResponse.json();
      const responseText = processData.response;
      
      console.log('🤖 [VAD] AI response:', responseText);

      // Update user info if collected
      if (processData.userInfo) {
        setUserInfo(processData.userInfo);
      }

      // Update calendar link if appointment was created
      if (processData.calendarLink) {
        setCalendarLink(processData.calendarLink);
        setAppointmentDetails(processData.appointmentDetails);
      }

      setConversationCount(prev => prev + 1);

      // Play filler phrase first if available
      if (processData.fillerPhrase) {
        console.log('🔊 [VAD] Playing filler phrase:', processData.fillerPhrase);
        updateStatus('Processing...');
        await playTextAsAudio(processData.fillerPhrase, sessionId);
      }

      // Step 4: Convert to speech with TTS
      updateStatus('Converting to speech...');
      const synthesisResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chained-voice/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: responseText,
          sessionId: sessionId 
        }),
      });

      if (!synthesisResponse.ok) {
        throw new Error(`Speech synthesis failed: ${synthesisResponse.status}`);
      }

      const synthesisData = await synthesisResponse.json();
      
      // Step 5: Play audio response
      updateStatus('AI responding...');
      await playAudio(synthesisData.audio);

      // Ready for next interaction
      updateStatus(vadReady ? 'Listening... (speak naturally)' : 'Listening... (manual mode - use Force Start)');

    } catch (error) {
      console.error('❌ [VAD] Processing error:', error);
      updateStatus(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const playTextAsAudio = async (text, currentSessionId = null) => {
    try {
      const synthesisResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chained-voice/synthesize`, {
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
      console.error('❌ [VAD] Text-to-speech error:', error);
    }
  };

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

  // Manual override for testing/fallback
  const handleManualToggle = () => {
    if (isSpeaking) {
      console.log('🔴 [VAD] Manual stop triggered');
      stopRecordingAndProcess();
    } else if (isListening && !isProcessing) {
      console.log('🎤 [VAD] Manual speech trigger');
      handleSpeechStart();
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

      {/* VAD Status Display - only show when conversation is active */}
      {sessionId && (
        <div className="flex flex-col items-center space-y-4">
          {/* Status Indicator - Non-clickable visual feedback */}
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
                    <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1ZM19 11V12C19 15.31 16.31 18 13 18H11C7.69 18 5 15.31 5 12V11H3V12C3 16.08 6.92 20 11 20V23H13V20C17.08 20 21 16.08 21 12V11H19Z"/>
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
               isListening ? (vadReady ? '👂 Listening for Speech' : '🔧 Manual Mode Active') : 
               '⏸️ Not Active'}
            </p>
            <p className="text-white/60 text-sm mt-1">
              {isProcessing ? 'Converting speech to text...' : 
               isSpeaking ? 'Recording your voice...' : 
               isListening ? (vadReady ? 'Speak naturally, I\'ll detect when you\'re done' : 'Use Force Start button to begin recording') : 
               'Voice detection inactive'}
            </p>
          </div>

          {/* Manual override controls for testing - always show in manual mode */}
          {isListening && !isProcessing && (
            <div className="flex space-x-2">
              <button
                onClick={handleManualToggle}
                className={`px-3 py-1 text-xs rounded border transition-all duration-200 ${
                  vadReady 
                    ? 'bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 border-white/10'
                    : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 border-blue-500/30'
                }`}
              >
                {isSpeaking ? '⏹️ Force Stop' : '▶️ Force Start'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status */}
      <div className="text-center">
        <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 border ${
          isProcessing 
            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
            : isSpeaking 
              ? 'bg-green-500/20 text-green-400 border-green-500/30'
              : isListening
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
        }`}>
          <div className={`w-2 h-2 rounded-full mr-2 ${
            isProcessing ? 'bg-yellow-400' :
            isSpeaking ? 'bg-green-400 animate-pulse' :
            isListening ? 'bg-blue-400' :
            'bg-purple-400'
          }`}></div>
          {currentStatus}
        </div>
      </div>

      {/* VAD Debug Info */}
      {sessionId && (
        <div className="text-center">
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 px-3 py-2">
            <div className="text-white/90 text-xs font-semibold mb-1">VAD Status</div>
            <div className="text-white/70 text-xs space-y-1">
              <div>VAD Ready: {vadReady ? '✅' : '❌'}</div>
              <div>Listening: {isListening ? '🎧' : '🔇'}</div>
              <div>Speaking: {isSpeaking ? '🗣️' : '🤐'}</div>
              <div>Mode: {vadReady ? 'Automatic' : 'Manual'}</div>
              <div>Stream: {streamRef.current?.active ? '✅' : '❌'}</div>
              <div>Session: {sessionId ? '✅' : '❌'}</div>
              <div>Silence Threshold: {VAD_CONFIG.silenceThreshold}ms</div>
            </div>
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

export default ChainedVoiceAgent;