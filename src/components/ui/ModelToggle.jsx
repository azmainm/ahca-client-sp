/**
 * ModelToggle Component
 * A toggle switch to select between different OpenAI models
 */
'use client';

import { useState } from 'react';

const ModelToggle = ({ selectedModel, onModelChange, disabled = false }) => {
  const models = [
    { 
      id: 'gpt-realtime', 
      name: 'GPT Realtime',
      description: 'Standard realtime model'
    },
    { 
      id: 'gpt-4o-mini-realtime-preview', 
      name: 'GPT-4o Mini',
      description: 'Mini realtime preview'
    },
    { 
      id: 'chained', 
      name: 'Chained Architecture',
      description: 'Reliable function calling'
    },
    { 
      id: 'livekit-agent', 
      name: 'LiveKit Agent',
      description: 'Server-side realtime agent'
    }
  ];

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Toggle Label */}
      <div className="text-center mb-4">
        <h3 className="text-white/90 text-sm font-semibold mb-1">AI Model</h3>
        <p className="text-white/60 text-xs">Choose your preferred model</p>
      </div>

      {/* Toggle Switch Container */}
      <div className="relative bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-1">
        {/* Background Slider */}
        <div 
          className={`absolute top-1 bottom-1 rounded-xl bg-gradient-to-r transition-all duration-300 ease-out ${
            selectedModel === 'gpt-realtime' 
              ? 'from-blue-500 to-blue-600 left-1 right-3/4' 
              : selectedModel === 'gpt-4o-mini-realtime-preview'
                ? 'from-emerald-500 to-emerald-600 left-1/4 right-1/2'
                : selectedModel === 'chained'
                  ? 'from-purple-500 to-purple-600 left-1/2 right-1/4'
                  : 'from-orange-500 to-orange-600 left-3/4 right-1'
          }`}
        />
        
        {/* Toggle Options */}
        <div className="relative grid grid-cols-4 gap-0">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => !disabled && onModelChange(model.id)}
              disabled={disabled}
              className={`relative px-2 py-3 rounded-xl text-xs font-medium transition-all duration-300 disabled:cursor-not-allowed ${
                selectedModel === model.id
                  ? 'text-white z-10'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              <div className="text-center">
                <div className="font-semibold text-xs">{model.name}</div>
                <div className="text-[10px] opacity-75 mt-0.5">{model.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Model Info */}
      <div className="mt-3 text-center">
        <div className="inline-flex items-center px-3 py-1.5 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
          <div className={`w-2 h-2 rounded-full mr-2 ${
            selectedModel === 'gpt-realtime' 
              ? 'bg-blue-400' 
              : selectedModel === 'gpt-4o-mini-realtime-preview'
                ? 'bg-emerald-400'
                : selectedModel === 'chained'
                  ? 'bg-purple-400'
                  : 'bg-orange-400'
          }`}></div>
          <span className="text-white/80 text-xs font-medium">
            {models.find(m => m.id === selectedModel)?.name || 'Unknown Model'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ModelToggle;
