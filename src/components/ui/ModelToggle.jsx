/**
 * ModelToggle Component
 * A toggle switch to select between different OpenAI models
 */
'use client';

import { useState } from 'react';

const ModelToggle = ({ selectedModel, onModelChange, disabled = false }) => {
  const models = [
    { 
      id: 'chained', 
      name: 'Chained Architecture',
      description: 'STT-TTS with function calling'
    }
  ];

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Toggle Label */}
      <div className="text-center mb-4">
        <h3 className="text-white/90 text-sm font-semibold mb-1">Voice Agent Mode</h3>
        <p className="text-white/60 text-xs">Chained STT-TTS Architecture</p>
      </div>

      {/* Toggle Switch Container */}
      <div className="relative bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 p-1">
        {/* Background Slider */}
        <div className="absolute top-1 bottom-1 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 left-1 right-1" />
        
        {/* Toggle Options */}
        <div className="relative grid grid-cols-1 gap-0">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => !disabled && onModelChange(model.id)}
              disabled={disabled}
              className="relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 disabled:cursor-not-allowed text-white z-10"
            >
              <div className="text-center">
                <div className="font-semibold">{model.name}</div>
                <div className="text-xs opacity-75 mt-0.5">{model.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Model Info */}
      <div className="mt-3 text-center">
        <div className="inline-flex items-center px-3 py-1.5 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
          <div className="w-2 h-2 rounded-full mr-2 bg-purple-400"></div>
          <span className="text-white/80 text-xs font-medium">
            {models.find(m => m.id === selectedModel)?.name || 'Unknown Model'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ModelToggle;
