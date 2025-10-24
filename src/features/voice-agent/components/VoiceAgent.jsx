'use client';

import { useState } from 'react';
import RealtimeWebSocketAgent from './RealtimeWebSocketAgent';

const VoiceAgent = () => {
  const [currentStatus, setCurrentStatus] = useState('Ready to start conversation');

  const handleChainedStatusChange = (chainedStatus) => {
    setCurrentStatus(chainedStatus);
  };

  const handleEstimatorClick = () => {
    window.open('/prototype-estimator', '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900 flex items-center justify-center p-4 relative">
      {/* Estimator Button - Top Right */}
      <button
        onClick={handleEstimatorClick}
        className="absolute top-4 right-4 flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-opacity-50"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span className="font-medium">Estimator</span>
      </button>

      <div className="w-full max-w-md mx-auto">
        
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            SherpaPrompt
          </h1>
          <p className="text-white/60 text-sm">
            Conversations into Outcomes
          </p>
        </div>
        

        {/* Main Interface - Realtime WebSocket Agent */}
        <RealtimeWebSocketAgent onStatusChange={handleChainedStatusChange} />

        {/* Features List */}
        <div className="mt-16 text-center">
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
            <h3 className="text-white/90 text-sm font-semibold mb-3">SherpaPrompt Services</h3>
            <div className="grid grid-cols-2 gap-3 text-white/60 text-xs">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                <span>Call Automation</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                <span>Transcript to Task</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                <span>Voice to Estimate</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                <span>App Platform</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceAgent;