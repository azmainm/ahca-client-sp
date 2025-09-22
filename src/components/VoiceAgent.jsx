'use client';

import { useState, useEffect, useRef } from 'react';
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime';

const VoiceAgent = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Not connected');
  const sessionRef = useRef(null);
  const agentRef = useRef(null);

  // Initialize the agent
  useEffect(() => {
    agentRef.current = new RealtimeAgent({
      name: 'AHCA Assistant',
      instructions: `You are a helpful voice assistant for Sherpaprompt After Hours Call Agent. 
      Your role is to:
      1. Greet callers warmly and professionally
      2. Ask for their name, email, and the nature of their inquiry
      3. Provide assistance with general fencing (home service/construction) questions
      4. Help schedule appointments when requested
      5. Collect emergency information if the situation is urgent
      6. Always maintain a caring and professional tone
      
      Keep responses concise and clear. Ask follow-up questions to better understand the caller's needs.`,
    });
  }, []);

  const connectToSession = async () => {
    try {
      setStatus('Connecting...');
      
      // Get ephemeral token from our backend
      const tokenResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/openai/ephemeral-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get ephemeral token');
      }

      const { apiKey } = await tokenResponse.json();

      // Create session with the agent
      sessionRef.current = new RealtimeSession(agentRef.current, {
        model: 'gpt-realtime',
      });

      // Connect to the session
      await sessionRef.current.connect({ apiKey });

      setIsConnected(true);
      setStatus('You are connected! Start talking.');
      console.log('You are connected!');

    } catch (error) {
      console.error('Connection error:', error);
      setStatus(`Connection failed: ${error.message}`);
    }
  };

  const disconnect = async () => {
    try {
      setStatus('Disconnecting...');
      if (sessionRef.current) {
        await sessionRef.current.close();
        sessionRef.current = null;
      }
      setIsConnected(false);
      setStatus('Disconnected');
    } catch (error) {
      console.error('Disconnect error:', error);
      // Force disconnect even if there's an error
      sessionRef.current = null;
      setIsConnected(false);
      setStatus('Disconnected');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto">
        
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-white mb-2">
            After Hours Call Agent
          </h1>
          <p className="text-white/60 text-sm">
            AI-powered Voice Assistant
          </p>
        </div>
        
        {/* Status Indicator */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
            isConnected 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : status.includes('Connecting') || status.includes('Disconnecting')
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isConnected 
                ? 'bg-emerald-400 animate-pulse' 
                : status.includes('Connecting') || status.includes('Disconnecting')
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-400'
            }`}></div>
            {status}
          </div>
        </div>

        {/* Main Control Button */}
        <div className="flex flex-col items-center">
          <div className="relative">
            {/* Outer glow ring */}
            <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
              isConnected 
                ? 'animate-pulse bg-emerald-500/20 scale-110' 
                : 'bg-blue-500/20 scale-100'
            }`}></div>
            
            {/* Middle ring */}
            <div className={`absolute inset-2 rounded-full border-2 transition-all duration-300 ${
              isConnected 
                ? 'border-emerald-500/50 animate-spin-slow' 
                : 'border-blue-500/50'
            }`}></div>
            
            {/* Main button */}
            <button
              onClick={isConnected ? disconnect : connectToSession}
              disabled={status.includes('Connecting') || status.includes('Disconnecting')}
              className={`relative w-32 h-32 rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:transform-none ${
                isConnected
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/25'
                  : 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-500/25'
              }`}
            >
              {/* Button Icon */}
              <div className="flex items-center justify-center text-white">
                {status.includes('Connecting') || status.includes('Disconnecting') ? (
                  <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : isConnected ? (
                  // Disconnect icon (stop/square)
                  <div className="w-8 h-8 bg-white rounded-sm"></div>
                ) : (
                  // Connect icon (power/play)
                  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          </div>
          
          {/* Button Label */}
          <p className="mt-6 text-white/80 text-lg font-medium">
            {isConnected ? 'Tap to Disconnect' : 'Tap to Connect'}
          </p>
        </div>

        {/* Voice Active Indicator */}
        {isConnected && (
          <div className="mt-12 text-center">
            <div className="inline-flex items-center space-x-2 px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
              <div className="flex space-x-1">
                <div className="w-1 h-4 bg-emerald-400 rounded-full animate-pulse"></div>
                <div className="w-1 h-6 bg-emerald-400 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div>
                <div className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                <div className="w-1 h-5 bg-emerald-400 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
              </div>
              <span className="text-white/90 text-sm font-medium">Listening...</span>
            </div>
          </div>
        )}

        {/* Features List */}
        <div className="mt-16 text-center">
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
            <h3 className="text-white/90 text-sm font-semibold mb-3">AI Assistant Capabilities</h3>
            <div className="grid grid-cols-2 gap-3 text-white/60 text-xs">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                <span>General inquiries</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                <span>Appointments</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                <span>Emergency help</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                <span>Information</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceAgent;
