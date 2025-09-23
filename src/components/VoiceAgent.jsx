'use client';

import { useState, useEffect, useRef } from 'react';
import { RealtimeAgent, RealtimeSession, tool } from '@openai/agents-realtime';
import ModelToggle from './ui/ModelToggle';
import ChainedVoiceAgent from './ChainedVoiceAgent';

const VoiceAgent = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Ready to connect with GPT Realtime');
  const [selectedModel, setSelectedModel] = useState('gpt-realtime');
  const sessionRef = useRef(null);
  const agentRef = useRef(null);

  // Initialize the agent
  useEffect(() => {
    console.log('🚀 INITIALIZING VOICE AGENT...');
    console.log('🔧 Creating client-side function tool to bridge to server...');

    // Define the knowledge search tool that calls our backend
    const knowledgeSearchTool = tool({
      name: 'knowledge_search',
      description: 'Search the company knowledge base for fencing information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for fencing-related information'
          }
        },
        required: ['query']
      }
    }, async ({ query }) => {
        try {
          console.log('🚨🚨🚨 CLIENT-SIDE FUNCTION CALLED! 🚨🚨🚨');
          console.log('📝 Query:', query);
          
          const response = await fetch('http://localhost:3001/api/voice-tools/search-knowledge', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          console.log('✅ Function result:', result);
          
          return result.result || 'I found some information but had trouble processing it.';
        } catch (error) {
          console.error('❌ Function call error:', error);
          return 'I encountered an issue accessing my knowledge base. Please contact our office directly.';
        }
      });
  
    console.log('🛠️ Creating RealtimeAgent with client-side tools...');
    agentRef.current = new RealtimeAgent({
      name: 'SherpaPrompt Fencing Assistant',
      instructions: `You are a professional voice assistant for SherpaPrompt Fencing Company.
      
      CONVERSATION FLOW - Follow this exact order:
      1. FIRST: Greet the caller warmly and ask for their name
      2. SECOND: Once you have their name, ask for their email address  
      3. THIRD: After collecting both name and email, ask about the nature of their fencing inquiry
      4. FOURTH: IMMEDIATELY call the knowledge_search function to get accurate information
      
      CRITICAL FUNCTION CALLING RULES:
      - You MUST use the knowledge_search function for ALL fencing-related questions after collecting name and email
      - NEVER guess or make up information about services, pricing, or company details
      - ALWAYS call knowledge_search before providing any specific company information
      - Examples of when to call knowledge_search:
        * "What areas do you serve?" → call knowledge_search with "service areas"
        * "What types of fencing do you offer?" → call knowledge_search with "fencing types"
        * "How much does a fence cost?" → call knowledge_search with "pricing"
        * "What materials do you use?" → call knowledge_search with "materials"
        * "Do you do emergency repairs?" → call knowledge_search with "emergency repairs"
        * ANY question about the company → call knowledge_search with relevant terms
      
      FUNCTION CALLING IS MANDATORY for any company information requests.
      
      Keep responses conversational but informative. Always use the knowledge_search function when needed.`,
      
      // Use client-side tools that call our backend
      tools: [knowledgeSearchTool]
    });
    
    console.log('✅ RealtimeAgent created successfully!');
    console.log('🔧 Agent configured with', agentRef.current.tools?.length || 0, 'tools');
    console.log('📝 Tool names:', agentRef.current.tools?.map(t => t.name || t.function?.name) || []);
  }, []);


  const connectToSession = async () => {
    try {
      console.log('🔗 CONNECTING TO VOICE SESSION...');
      setStatus('Connecting...');
      
      // Reset any previous status messages
      if (status.includes('Please disconnect')) {
        setStatus('Connecting...');
      }
      
      // Get ephemeral token from our backend with selected model
      console.log('🔑 Requesting ephemeral token from:', `${process.env.NEXT_PUBLIC_API_URL}/api/openai/ephemeral-token`);
      console.log('🤖 Using model:', selectedModel);
      const tokenResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/openai/ephemeral-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: selectedModel }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to get ephemeral token (${tokenResponse.status})`);
      }

      const { apiKey, model } = await tokenResponse.json();

      // Create session with the agent using the selected model
      console.log('🤖 Creating RealtimeSession with agent...');
      console.log('🔧 Agent tools configured:', agentRef.current?.tools?.length || 0);
      console.log('🎯 Session model:', model || selectedModel);
      sessionRef.current = new RealtimeSession(agentRef.current, {
        model: selectedModel,
      });

      // Connect to the session
      console.log('🔌 Connecting to realtime session...');
      await sessionRef.current.connect({ apiKey });

      console.log('✅ VOICE SESSION CONNECTED SUCCESSFULLY!');
      console.log(`🎤 Listening for speech with ${selectedModel}... Try saying "What are your service areas?"`);
      console.log('📊 Model confirmed:', model || selectedModel);
      
      // Add comprehensive debugging for function calls
      console.log('🔍 Adding event listeners for function call debugging...');
      
      sessionRef.current.on?.('message', (event) => {
        console.log('💬 Message event:', event);
      });
      
      sessionRef.current.on?.('function_call', (event) => {
        console.log('🚀 Function call event:', event);
      });

      sessionRef.current.on?.('function_call_output', (event) => {
        console.log('📤 Function call output:', event);
      });

      sessionRef.current.on?.('tool_call', (event) => {
        console.log('🔧 Tool call event:', event);
      });

      sessionRef.current.on?.('response.output_item.added', (event) => {
        console.log('📝 Response output item added:', event);
        if (event.item?.type === 'function_call') {
          console.log('🎯 Function call detected in output:', event.item);
        }
      });

      sessionRef.current.on?.('response.function_call_arguments.delta', (event) => {
        console.log('📊 Function call arguments delta:', event);
      });

      // Check if session has access to tools
      console.log('🛠️ Session tools available:', sessionRef.current.tools);
      console.log('🛠️ Session configuration:', sessionRef.current.session);
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

  const handleModelChange = (model) => {
    if (isConnected) {
      // If connected, we need to disconnect first before changing models
      setStatus('Please disconnect before changing models');
      setTimeout(() => {
        if (!isConnected) {
          setStatus('Disconnected');
        }
      }, 3000);
      return;
    }
    setSelectedModel(model);
    
    if (model === 'chained') {
      setStatus('Ready to start chained conversation');
    } else {
      setStatus(`Ready to connect with ${model === 'gpt-realtime' ? 'GPT Realtime' : 'GPT-4o Mini'}`);
    }
    console.log('🔄 Model changed to:', model);
  };

  const handleChainedStatusChange = (chainedStatus) => {
    setStatus(chainedStatus);
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

        {/* Model Toggle */}
        <div className="mb-8">
          <ModelToggle 
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            disabled={isConnected}
          />
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

        {/* Main Interface - Conditional based on selected model */}
        {selectedModel === 'chained' ? (
          <ChainedVoiceAgent onStatusChange={handleChainedStatusChange} />
        ) : (
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
        )}

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
