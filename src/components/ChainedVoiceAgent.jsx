/**
 * ChainedVoiceAgent Component
 * Implements OpenAI's recommended chained architecture:
 * Audio → Transcription → Text Processing (with functions) → Speech Synthesis → Audio
 */
'use client';

import { useState, useRef, useEffect } from 'react';

const ChainedVoiceAgent = ({ onStatusChange }) => {
  const [isActive, setIsActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentStatus, setCurrentStatus] = useState('Ready to start continuous conversation');
  const [isListening, setIsListening] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const vadRef = useRef(null);

  useEffect(() => {
    // Update parent component with status changes
    onStatusChange?.(currentStatus);
  }, [currentStatus, onStatusChange]);

  const updateStatus = (status) => {
    setCurrentStatus(status);
    console.log('📊 Chained Voice Status:', status);
  };

  const startConversation = async () => {
    try {
      console.log('🎙️ Starting continuous conversation...');
      updateStatus('Starting microphone...');

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      streamRef.current = stream;
      setIsActive(true);
      updateStatus('Listening... Start speaking anytime');
      
      // Start continuous listening
      startContinuousListening();

    } catch (error) {
      console.error('❌ Error starting conversation:', error);
      updateStatus('Error accessing microphone');
    }
  };

  const stopConversation = () => {
    console.log('⏹️ Stopping conversation...');
    setIsActive(false);
    setIsListening(false);
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    updateStatus('Conversation stopped');
  };

  const startContinuousListening = () => {
    if (!streamRef.current || !isActive) return;

    audioChunksRef.current = [];

    // Create MediaRecorder for this segment
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      console.log('📊 Audio data available:', event.data.size, 'bytes');
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (audioChunksRef.current.length > 0 && isActive) {
        console.log('🔴 Speech segment ended, processing...');
        await processRecording();
      }
    };

    // Start recording with data collection every 100ms
    mediaRecorder.start(100);
    setIsListening(true);
    updateStatus('Listening... Speak naturally');
    
    console.log('🎙️ MediaRecorder started, state:', mediaRecorder.state);

    // Simple VAD: Stop recording after 4 seconds of "speech time"
    // In production, you'd use proper VAD like Silero
    silenceTimeoutRef.current = setTimeout(() => {
      if (mediaRecorder.state === 'recording') {
        console.log('⏰ Recording timeout reached, stopping...');
        mediaRecorder.stop();
        setIsListening(false);
      }
    }, 4000); // 4 seconds max per speech segment
  };

  const processRecording = async () => {
    try {
      console.log('🔄 Processing recording through chained architecture...');

      // Step 1: Convert audio to base64
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      console.log('📦 Audio blob size:', audioBlob.size, 'bytes');
      
      if (audioBlob.size === 0) {
        console.log('⚠️ No audio data recorded');
        updateStatus('No audio detected. Try speaking louder.');
        setIsProcessing(false);
        if (isActive) {
          setTimeout(() => startContinuousListening(), 1000);
        }
        return;
      }
      
      const audioBase64 = await blobToBase64(audioBlob);
      console.log('📦 Audio base64 length:', audioBase64.length);

      // Step 2: Transcribe audio
      updateStatus('Transcribing speech...');
      const transcriptionResponse = await fetch('http://localhost:3001/api/chained-voice/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audio: audioBase64 }),
      });

      if (!transcriptionResponse.ok) {
        throw new Error('Transcription failed');
      }

      const transcriptionData = await transcriptionResponse.json();
      const userText = transcriptionData.text;
      
      console.log('📝 Transcribed text:', userText);

      if (!userText || userText.trim().length === 0) {
        updateStatus('No speech detected. Try again.');
        setIsProcessing(false);
        return;
      }

      // Step 3: Process text with GPT-4.1 and function calling
      updateStatus('Thinking and searching knowledge base...');
      const processResponse = await fetch('http://localhost:3001/api/chained-voice/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: userText,
          conversationHistory: conversationHistory 
        }),
      });

      if (!processResponse.ok) {
        throw new Error('Text processing failed');
      }

      const processData = await processResponse.json();
      const responseText = processData.response;
      
      console.log('🤖 AI response:', responseText);
      console.log('🔧 Had function calls:', processData.hadFunctionCalls);

      // Update conversation history
      setConversationHistory(processData.conversationHistory || []);

      // Step 4: Convert response to speech
      updateStatus('Converting to speech...');
      const synthesisResponse = await fetch('http://localhost:3001/api/chained-voice/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: responseText }),
      });

      if (!synthesisResponse.ok) {
        throw new Error('Speech synthesis failed');
      }

      const synthesisData = await synthesisResponse.json();
      
      // Step 5: Play the audio response
      updateStatus('Playing response...');
      await playAudio(synthesisData.audio);

      setIsProcessing(false);

      // Step 6: Resume listening if conversation is still active
      if (isActive) {
        updateStatus('Listening... Continue speaking');
        // Small delay before restarting listening
        setTimeout(() => {
          if (isActive) {
            startContinuousListening();
          }
        }, 500);
      } else {
        updateStatus('Ready for next message');
      }

    } catch (error) {
      console.error('❌ Error in chained processing:', error);
      updateStatus(`Error: ${error.message}`);
      setIsProcessing(false);
      
      // Resume listening even after errors if conversation is active
      if (isActive) {
        setTimeout(() => {
          if (isActive) {
            startContinuousListening();
          }
        }, 1000);
      }
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
    if (isActive) {
      stopConversation();
    } else {
      startConversation();
    }
  };

  const resetConversation = () => {
    setConversationHistory([]);
    updateStatus('Conversation reset. Ready to start fresh.');
  };

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Main Recording Button */}
      <div className="relative">
        {/* Outer glow ring */}
        <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
          isListening 
            ? 'animate-pulse bg-green-500/20 scale-110' 
            : isProcessing
              ? 'animate-pulse bg-yellow-500/20 scale-110'
              : isActive
                ? 'animate-pulse bg-purple-500/20 scale-110'
                : 'bg-purple-500/20 scale-100'
        }`}></div>
        
        {/* Middle ring */}
        <div className={`absolute inset-2 rounded-full border-2 transition-all duration-300 ${
          isListening 
            ? 'border-green-500/50 animate-spin-slow' 
            : isProcessing
              ? 'border-yellow-500/50 animate-spin-slow'
              : isActive
                ? 'border-purple-500/50 animate-spin-slow'
                : 'border-purple-500/50'
        }`}></div>
        
        {/* Main button */}
        <button
          onClick={handleToggleConversation}
          disabled={isProcessing}
          className={`relative w-32 h-32 rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-purple-500/50 disabled:cursor-not-allowed disabled:transform-none ${
            isActive
              ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 shadow-lg shadow-red-500/25'
              : 'bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 shadow-lg shadow-purple-500/25'
          }`}
        >
          {/* Button Icon */}
          <div className="flex items-center justify-center text-white">
            {isProcessing ? (
              <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : isActive ? (
              // Stop icon
              <div className="w-8 h-8 bg-white rounded-sm"></div>
            ) : (
              // Start conversation icon
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </button>
      </div>
      
      {/* Button Label */}
      <p className="text-white/80 text-lg font-medium text-center">
        {isActive ? 'Tap to End Conversation' : 'Tap to Start Conversation'}
      </p>

      {/* Active Status Indicator */}
      {isActive && (
        <div className="text-center">
          <div className={`inline-flex items-center px-3 py-1.5 backdrop-blur-sm rounded-full border transition-all duration-300 ${
            isListening 
              ? 'bg-green-500/20 border-green-500/30'
              : isProcessing
                ? 'bg-yellow-500/20 border-yellow-500/30'
                : 'bg-purple-500/20 border-purple-500/30'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isListening 
                ? 'bg-green-400 animate-pulse'
                : isProcessing
                  ? 'bg-yellow-400 animate-pulse'
                  : 'bg-purple-400'
            }`}></div>
            <span className="text-white/90 text-xs font-medium">
              {isListening ? 'Listening...' : isProcessing ? 'Processing...' : 'Ready'}
            </span>
          </div>
        </div>
      )}

      {/* Reset Button */}
      {conversationHistory.length > 0 && (
        <button
          onClick={resetConversation}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg border border-white/20 text-white/80 text-sm transition-all duration-200"
        >
          Reset Conversation
        </button>
      )}

      {/* Conversation History Info */}
      {conversationHistory.length > 0 && (
        <div className="text-center">
          <div className="inline-flex items-center px-3 py-1.5 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
            <div className="w-2 h-2 bg-purple-400 rounded-full mr-2"></div>
            <span className="text-white/80 text-xs font-medium">
              {conversationHistory.length} messages in conversation
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChainedVoiceAgent;
