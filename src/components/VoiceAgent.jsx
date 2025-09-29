'use client';

import { useState } from 'react';
import ChainedVoiceAgent from './ChainedVoiceAgent';

const VoiceAgent = () => {
  const [currentStatus, setCurrentStatus] = useState('Ready to start conversation');

  const handleChainedStatusChange = (chainedStatus) => {
    setCurrentStatus(chainedStatus);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto">
        
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            After Hours Call Agent
          </h1>
          <p className="text-white/60 text-sm">
            AI-powered Voice Assistant
          </p>
        </div>
        

        {/* Main Interface - Chained Voice Agent */}
        <ChainedVoiceAgent onStatusChange={handleChainedStatusChange} />

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