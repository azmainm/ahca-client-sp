// components/LiveKitAgent.jsx
/**
 * LiveKitAgent Component
 * Implements LiveKit room connection with AI agent for real-time speech interactions
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

const LiveKitAgent = ({ onStatusChange }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('Ready to connect to LiveKit Agent');
  const [roomInfo, setRoomInfo] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [agentPresent, setAgentPresent] = useState(false);

  const roomRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    // Update parent component with status changes
    onStatusChange?.(currentStatus);
  }, [currentStatus, onStatusChange]);

  // Initialize component
  useEffect(() => {
    console.log('🚀 LiveKit Agent client component initialized');
  }, []);

  const updateStatus = (status) => {
    setCurrentStatus(status);
    console.log('🎙️ LiveKit Agent Status:', status);
  };

  const connectToAgent = async () => {
    try {
      setIsConnecting(true);
      updateStatus('Requesting access token...');

      console.log('🚀 Starting LiveKit Agent connection...');

      // Step 1: Create LiveKit Agent session (this handles everything)
      const sessionId = `session-${Date.now()}`;
      const agentResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/livekit/agent/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId
        }),
      });

      if (!agentResponse.ok) {
        throw new Error(`Failed to create agent session: ${agentResponse.status}`);
      }

      const agentSession = await agentResponse.json();
      sessionRef.current = agentSession.session;
      console.log('✅ Agent session created:', agentSession);

      // Extract connection details
      const { userToken: accessToken, roomName, userIdentity: identity, serverUrl } = agentSession.session;

      // Step 3: Connect to LiveKit room
      updateStatus('Connecting to room...');
      const room = new Room({
        // Configure room for optimal audio quality
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        publishDefaults: {
          audioPreset: {
            maxBitrate: 20_000,
          },
        },
      });

      roomRef.current = room;

      // Set up room event listeners
      room.on(RoomEvent.Connected, () => {
        console.log('✅ Connected to LiveKit room');
        setIsConnected(true);
        setIsConnecting(false);
        updateStatus('Connected! Waiting for AI agent...');
        setRoomInfo({
          name: roomName,
          identity,
          serverUrl
        });
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('👤 Participant connected:', participant.identity);
        updateParticipantsList(room);
        
        if (participant.identity.startsWith('agent-')) {
          setAgentPresent(true);
          updateStatus('Server-side AI agent joined! Start speaking...');
          
          // Automatically enable microphone when agent joins
          enableMicrophone();
        }
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('👋 Participant disconnected:', participant.identity);
        updateParticipantsList(room);
        
        if (participant.identity.startsWith('agent-')) {
          setAgentPresent(false);
          updateStatus('Server-side AI agent left the conversation');
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('🎵 Track subscribed:', track.kind, 'from', participant.identity);
        
        if (track.kind === Track.Kind.Audio && participant.identity.startsWith('agent-')) {
          // Attach agent audio to audio element for playback
          const audioElement = document.getElementById('agent-audio');
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

      // Connect to the room
      await room.connect(serverUrl, accessToken);
      console.log('🎉 LiveKit room connection completed');

      // The server-side agent will join automatically
      updateStatus('Connected! Server-side agent will join shortly...');

    } catch (error) {
      console.error('❌ Error connecting to LiveKit Agent:', error);
      setIsConnecting(false);
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
      isAgent: p.identity.startsWith('agent-'),
      hasAudio: p.audioTracks.size > 0,
      hasVideo: p.videoTracks.size > 0
    }));
    setParticipants(participantList);
  };

  const disconnect = async () => {
    try {
      updateStatus('Disconnecting...');
      
      // End agent session
      if (sessionRef.current?.roomName) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/livekit/agent/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomName: sessionRef.current.roomName
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
    setRoomInfo(null);
    setParticipants([]);
  };

  const handleToggleConnection = () => {
    if (isConnected) {
      disconnect();
    } else {
      connectToAgent();
    }
  };

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Hidden audio element for agent audio playback */}
      <audio id="agent-audio" autoPlay playsInline className="hidden" />

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
              // LiveKit/Agent icon
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 2v6h12V6H4zm2 1a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" />
                <path d="M9 15v1h2v-1h3a1 1 0 110 2H6a1 1 0 110-2h3z" />
              </svg>
            )}
          </div>
        </button>
      </div>
      
      {/* Button Label */}
      <p className="text-white/80 text-lg font-medium text-center">
        {isConnected ? 'Tap to Disconnect' : 'Tap to Connect to AI Agent'}
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
              {agentPresent ? 'Server-side AI Agent Ready' : isConnected ? 'Connected to Room' : 'Connecting...'}
            </span>
          </div>
        </div>
      )}

      {/* Room Info */}
      {roomInfo && (
        <div className="text-center">
          <div className="inline-flex items-center px-3 py-1.5 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
            <div className="w-2 h-2 bg-orange-400 rounded-full mr-2"></div>
            <span className="text-white/80 text-xs font-medium">
              Room: {roomInfo.name.substring(0, 20)}...
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
            <h3 className="text-white/90 text-sm font-semibold mb-2">🎤 Voice Instructions</h3>
            <div className="text-white/60 text-xs space-y-1">
              <p>• Start speaking naturally</p>
              <p>• Ask about fencing services</p>
              <p>• Agent will respond with voice</p>
              <p>• Real-time conversation enabled</p>
              <p>• Server-side AI processing</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveKitAgent;
