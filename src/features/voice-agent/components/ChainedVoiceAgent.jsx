/**
 * ChainedVoiceAgent Component - OpenAI Documentation Implementation
 * Follows the exact chained architecture from OpenAI documentation:
 * Audio → STT → Text Processing → TTS → Audio
 * With automatic turn detection using proper VAD
 */
'use client';

import { useState, useRef, useEffect } from 'react';

const ChainedVoiceAgent = ({ onStatusChange }) => {
  // Core state - simplified following OpenAI patterns
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('Ready to start conversation');
  const [sessionId, setSessionId] = useState(null);
  const [userInfo, setUserInfo] = useState({ name: null, email: null, collected: false });
  const [conversationCount, setConversationCount] = useState(0);
  const [calendarLink, setCalendarLink] = useState(null);
  const [appointmentDetails, setAppointmentDetails] = useState(null);

  // Refs for media handling
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    onStatusChange?.(currentStatus);
  }, [currentStatus, onStatusChange]);

  const updateStatus = (status) => {
    setCurrentStatus(status);
    console.log('📊 Status:', status);
  };

  const startConversation = async () => {
    try {
      console.log('🎙️ Starting chained voice conversation...');
      updateStatus('Starting conversation...');

      // Get microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      streamRef.current = stream;

      // Create session ID
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      setUserInfo({ name: null, email: null, collected: false });
      setConversationCount(0);
      setCalendarLink(null);
      setAppointmentDetails(null);
      
      console.log('✅ Session started:', newSessionId);

      // Play initial greeting
      const initialGreeting = "Hi! Welcome to SherpaPrompt Fencing Company. I'm here to help with your fencing needs. Please tell me your name and email address.";
      
      updateStatus('Playing greeting...');
      await playTextAsAudio(initialGreeting, newSessionId);

      updateStatus('Ready - Click to speak');
      
    } catch (error) {
      console.error('❌ Error starting conversation:', error);
      updateStatus('Error: ' + error.message);
    }
  };

  const stopConversation = () => {
    console.log('⏹️ Stopping conversation...');
    
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Reset state
    setIsRecording(false);
    setIsProcessing(false);
    setSessionId(null);
    setUserInfo({ name: null, email: null, collected: false });
    setConversationCount(0);
    updateStatus('Conversation ended');
  };

  const startRecording = async () => {
    if (!streamRef.current || !sessionId) {
      updateStatus('No active session. Please start conversation first.');
      return;
    }

    try {
      console.log('🎙️ Starting recording...');
      
      // Reset audio chunks
      audioChunksRef.current = [];

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      // Handle data collection
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('📊 Audio chunk collected:', event.data.size, 'bytes');
        }
      };

      // Handle recording completion
      mediaRecorder.onstop = async () => {
        console.log('🔴 Recording stopped, processing...');
        setIsRecording(false);
        
        if (audioChunksRef.current.length > 0) {
          await processAudioChain();
        } else {
          updateStatus('No audio detected. Try again.');
        }
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      updateStatus('Recording... Speak now');
      
      console.log('✅ Recording started');

    } catch (error) {
      console.error('❌ Recording error:', error);
      updateStatus('Recording failed: ' + error.message);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log('⏹️ Stopping recording...');
      mediaRecorderRef.current.stop();
    }
  };

  const processAudioChain = async () => {
    try {
      setIsProcessing(true);
      updateStatus('Processing...');

      // Step 1: Convert audio to format for API
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      console.log('📦 Audio blob size:', audioBlob.size, 'bytes');
      
      if (audioBlob.size === 0) {
        updateStatus('No audio detected');
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
      
      console.log('📝 Transcribed:', userText);

      if (!userText || userText.trim().length === 0) {
        updateStatus('No speech detected');
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
      
      console.log('🤖 AI response:', responseText);

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
      updateStatus('Ready - Click to speak');

    } catch (error) {
      console.error('❌ Processing error:', error);
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
      console.error('❌ Text-to-speech error:', error);
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

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Main conversation button - smaller */}
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
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </button>
      </div>
      
      <p className="text-white/80 text-sm font-medium text-center">
        {sessionId ? 'End Conversation' : 'Start Conversation'}
      </p>

      {/* Recording button - only show when conversation is active - larger */}
      {sessionId && (
        <div className="relative">
          <button
            onClick={handleToggleRecording}
            disabled={isProcessing}
            className={`relative w-32 h-32 rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:transform-none ${
              isRecording
                ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 shadow-lg shadow-red-500/25'
                : 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-500/25'
            }`}
          >
            <div className="flex items-center justify-center text-white">
              {isProcessing ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : isRecording ? (
                <div className="w-8 h-8 bg-white rounded-sm"></div>
              ) : (
                <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 715 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </button>
          
          <p className="text-white/80 text-lg font-medium text-center mt-2">
            {isRecording ? 'Recording...' : 'Push to Talk'}
          </p>
        </div>
      )}

      {/* Status */}
      <div className="text-center">
        <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 bg-purple-500/20 text-purple-400 border border-purple-500/30">
          <div className="w-2 h-2 rounded-full mr-2 bg-purple-400"></div>
          {currentStatus}
        </div>
      </div>

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