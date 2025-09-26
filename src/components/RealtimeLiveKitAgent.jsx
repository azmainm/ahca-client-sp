// components/RealtimeLiveKitAgent.jsx
/**
 * Updated Realtime LiveKit Agent Component
 * Works with OpenAI Realtime API Python agent
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

const RealtimeLiveKitAgent = ({ onStatusChange }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('Ready to connect to Realtime Agent');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [agentPresent, setAgentPresent] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState(null);

  const roomRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    onStatusChange?.(currentStatus);
  }, [currentStatus, onStatusChange]);

  useEffect(() => {
    console.log('🚀 Realtime LiveKit Agent client component initialized');
  }, []);

  const updateStatus = (status) => {
    setCurrentStatus(status);
    console.log('🎙️ Realtime Agent Status:', status);
  };

  const connectToRealtimeAgent = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      updateStatus('Creating realtime agent session...');

      console.log('🚀 Starting Realtime LiveKit Agent connection...');

      // Step 1: Create realtime agent session
      const sessionId = `realtime-session-${Date.now()}`;
      const sessionResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/realtime-agent/create-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json();
        throw new Error(errorData.message || `Failed to create realtime agent session: ${sessionResponse.status}`);
      }

      const sessionData = await sessionResponse.json();
      sessionRef.current = sessionData.session;
      console.log('✅ Realtime agent session created:', sessionData);

      // Extract connection details
      const { userToken, roomName, userIdentity, serverUrl } = sessionData.session;

      setSessionInfo({
        sessionId,
        roomName,
        userIdentity,
        serverUrl
      });

      // Step 2: Connect to LiveKit room
      updateStatus('Connecting to LiveKit room...');
      const room = new Room({
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        publishDefaults: {
          audioPreset: {
            maxBitrate: 64_000, // High quality for realtime agent
          },
        },
      });

      roomRef.current = room;

      // Set up room event listeners
      room.on(RoomEvent.Connected, () => {
        console.log('✅ Connected to LiveKit room');
        setIsConnected(true);
        setIsConnecting(false);
        updateStatus('Connected! Waiting for realtime AI agent...');
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('👤 Participant connected:', participant.identity);
        updateParticipantsList(room);
        
        // Check for realtime agent (Python agent will have specific identity pattern)
        if (participant.identity.includes('agent') || participant.identity.includes('realtime')) {
          setAgentPresent(true);
          updateStatus('🤖 Realtime AI agent ready! Start speaking...');
          enableMicrophone();
        }
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('👋 Participant disconnected:', participant.identity);
        updateParticipantsList(room);
        
        if (participant.identity.includes('agent') || participant.identity.includes('realtime')) {
          setAgentPresent(false);
          updateStatus('Realtime AI agent left the conversation');
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('🎵 Track subscribed:', track.kind, 'from', participant.identity);
        
        if (track.kind === Track.Kind.Audio && 
            (participant.identity.includes('agent') || participant.identity.includes('realtime'))) {
          // Attach agent audio to audio element for playback
          const audioElement = document.getElementById('realtime-agent-audio');
          if (audioElement && track instanceof MediaStreamTrack) {
            const stream = new MediaStream([track]);
            audioElement.srcObject = stream;
            audioElement.play().catch(console.error);
          }
        }
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log('🔴 Disconnected from room:', reason);
        setIsConnected(false);
        setIsConnecting(false);
        setAgentPresent(false);
        updateStatus('Disconnected from room');
        cleanup();
      });

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log('🔄 Connection state changed:', state);
      });

      // Connect to the room
      await room.connect(serverUrl, userToken);
      console.log('🎉 LiveKit room connection completed');

      updateStatus('Connected! Python realtime agent will join automatically...');

    } catch (error) {
      console.error('❌ Error connecting to Realtime LiveKit Agent:', error);
      setIsConnecting(false);
      setError(error.message);
      updateStatus(`Connection failed: ${error.message}`);
      cleanup();
    }
  };

  const enableMicrophone = async () => {
    try {
      if (roomRef.current) {
        await roomRef.current.localParticipant.enableCameraAndMicrophone(false, true);
        console.log('🎤 Microphone enabled');
      }
    } catch (error) {
      console.error('❌ Error enabling microphone:', error);
    }
  };

  const updateParticipantsList = (room) => {
    const participantList = Array.from(room.participants.values()).map(p => ({
      identity: p.identity,
      name: p.name || p.identity,
      isRealtimeAgent: p.identity.includes('agent') || p.identity.includes('realtime'),
      hasAudio: p.audioTracks.size > 0,
      hasVideo: p.videoTracks.size > 0
    }));
    setParticipants(participantList);
  };

  const disconnect = async () => {
    try {
      updateStatus('Disconnecting...');
      
      // End realtime agent session
      if (sessionRef.current?.roomName) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/realtime-agent/end-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomName: sessionRef.current.roomName,
            sessionId: sessionRef.current.sessionId
          }),
        });
      }
      
      cleanup();
      updateStatus('Disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting:', error);
      cleanup();
      updateStatus('Disconnected');
    }
  };

  const cleanup = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    
    sessionRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
    setAgentPresent(false);
    setSessionInfo(null);
    setParticipants([]);
    setError(null);
  };

  const handleToggleConnection = () => {
    if (isConnected) {
      disconnect();
    } else {
      connectToRealtimeAgent();
    }
  };

  // Show error state
  if (error && !isConnecting) {
    return (
      <div className="flex flex-col items-center space-y-6">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-sm mb-4">
            ❌ Connection Error: {error}
          </div>
          <button
            onClick={connectToRealtimeAgent}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Hidden audio element for realtime agent audio playback */}
      <audio id="realtime-agent-audio" autoPlay playsInline className="hidden" />

      {/* Main Connection Button */}
      <div className="relative">
        {/* Outer glow ring */}
        <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
          agentPresent
            ? 'animate-pulse bg-green-500/20 scale-110' 
            : isConnected
              ? 'animate-pulse bg-orange-500/20 scale-110'
              : isConnecting
                ? 'animate-pulse bg-yellow-500/20 scale-110'
                : 'bg-orange-500/20 scale-100'
        }`}></div>
        
        {/* Middle ring */}
        <div className={`absolute inset-2 rounded-full border-2 transition-all duration-300 ${
          agentPresent
            ? 'border-green-500/50 animate-spin-slow' 
            : isConnected
              ? 'border-orange-500/50 animate-spin-slow'
              : isConnecting
                ? 'border-yellow-500/50 animate-spin-slow'
                : 'border-orange-500/50'
        }`}></div>
        
        {/* Main button */}
        <button
          onClick={handleToggleConnection}
          disabled={isConnecting}
          className={`relative w-32 h-32 rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-orange-500/50 disabled:cursor-not-allowed disabled:transform-none ${
            isConnected
              ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 shadow-lg shadow-red-500/25'
              : 'bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 shadow-lg shadow-orange-500/25'
          }`}
        >
          {/* Button Icon */}
          <div className="flex items-center justify-center text-white">
            {isConnecting ? (
              <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : isConnected ? (
              // Disconnect icon
              <div className="w-8 h-8 bg-white rounded-sm"></div>
            ) : (
              // Realtime Agent icon
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v4a4 4 0 008 0V6a4 4 0 00-4-4zM8 6a2 2 0 114 0v4a2 2 0 11-4 0V6z" clipRule="evenodd" />
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M10 13a3 3 0 01-3-3V8a3 3 0 016 0v2a3 3 0 01-3 3zm1.5 2.5a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1a.5.5 0 01.5-.5zm-3 0a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1a.5.5 0 01.5-.5z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </button>
      </div>
      
      {/* Button Label */}
      <p className="text-white/80 text-lg font-medium text-center">
        {isConnected ? 'Tap to Disconnect' : 'Tap to Connect to Realtime Agent'}
      </p>

      {/* Connection Status */}
      {(isConnected || isConnecting) && (
        <div className="text-center">
          <div className={`inline-flex items-center px-3 py-1.5 backdrop-blur-sm rounded-full border transition-all duration-300 ${
            agentPresent
              ? 'bg-green-500/20 border-green-500/30'
              : isConnected
                ? 'bg-orange-500/20 border-orange-500/30'
                : 'bg-yellow-500/20 border-yellow-500/30'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              agentPresent
                ? 'bg-green-400 animate-pulse'
                : isConnected
                  ? 'bg-orange-400 animate-pulse'
                  : 'bg-yellow-400 animate-pulse'
            }`}></div>
            <span className="text-white/90 text-xs font-medium">
              {agentPresent ? 'Realtime AI Agent Ready' : isConnected ? 'Connected to Room' : 'Connecting...'}
            </span>
          </div>
        </div>
      )}

      {/* Session Info */}
      {sessionInfo && (
        <div className="text-center">
          <div className="inline-flex items-center px-3 py-1.5 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
            <div className="w-2 h-2 bg-orange-400 rounded-full mr-2"></div>
            <span className="text-white/80 text-xs font-medium">
              Room: {sessionInfo.roomName.substring(0, 20)}...
            </span>
          </div>
        </div>
      )}

      {/* Participants */}
      {participants.length > 0 && (
        <div className="text-center">
          <div className="inline-flex items-center px-3 py-1.5 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
            <div className="w-2 h-2 bg-blue-400 rounded-full mr-2"></div>
            <span className="text-white/80 text-xs font-medium">
              {participants.length} participant{participants.length !== 1 ? 's' : ''} in room
            </span>
          </div>
        </div>
      )}

      {/* Instructions */}
      {agentPresent && (
        <div className="text-center max-w-sm">
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
            <h3 className="text-white/90 text-sm font-semibold mb-2">🤖 Realtime AI Agent</h3>
            <div className="text-white/60 text-xs space-y-1">
              <p>• Server-side realtime processing</p>
              <p>• Direct speech-to-speech conversation</p>
              <p>• Automatic knowledge base search</p>
              <p>• Natural conversation flow</p>
              <p>• OpenAI Realtime API powered</p>
            </div>
          </div>
        </div>
      )}

      {/* Agent Features */}
      {!isConnected && !isConnecting && (
        <div className="text-center max-w-sm">
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
            <h3 className="text-white/90 text-sm font-semibold mb-2">🚀 Server-Side Agent Features</h3>
            <div className="text-white/60 text-xs space-y-1">
              <p>• Real-time speech processing</p>
              <p>• Intelligent RAG integration</p>
              <p>• No client-side dependencies</p>
              <p>• Optimized for voice quality</p>
              <p>• Enterprise-grade reliability</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RealtimeLiveKitAgent;
