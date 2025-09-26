'use client';

import { useState, useEffect, useRef } from 'react';
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime';
import ModelToggle from './ui/ModelToggle';
import ChainedVoiceAgent from './ChainedVoiceAgent';
import RealtimeLiveKitAgent from './RealtimeLiveKitAgent';

const VoiceAgent = () => {
  const agentInstructions = `You are a professional voice assistant for SherpaPrompt Fencing Company.
      
      PRINCIPLES (follow strictly):
      - For ANY company or fencing information, you MUST call the knowledge_search function BEFORE answering.
      - Do NOT delay tool use waiting for contact details; collect name/email, but still call the tool immediately when info is requested.
      - NEVER guess or invent services, pricing, coverage areas, or materials.
      
      FLEXIBLE CONVERSATION FLOW:
      1) Greet the caller warmly and attempt to collect their name and email.
      2) If at ANY point the caller asks about company information, IMMEDIATELY call knowledge_search with a concise query, then continue the conversation.
      
      FUNCTION CALLING RULES:
      - Always prefer knowledge_search for factual company details.
      - Examples:
        * "What areas do you serve?" → call knowledge_search with "service areas"
        * "What types of fencing do you offer?" → call knowledge_search with "fencing types"
        * "How much does a fence cost?" → call knowledge_search with "pricing"
        * "What materials do you use?" → call knowledge_search with "materials"
        * "Do you do emergency repairs?" → call knowledge_search with "emergency repairs"
        * ANY company-specific question → call knowledge_search with relevant terms

      EXAMPLE FUNCTION CALLING (do not speak the JSON; produce a function call):
      - User: "What areas do you serve?"
        Assistant: <function_call name="knowledge_search" arguments={"query":"service areas"}>
      - User: "Do you do emergency repairs?"
        Assistant: <function_call name="knowledge_search" arguments={"query":"emergency repairs"}>
      
      Keep responses conversational but informative. Always use knowledge_search when needed.`;

  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Ready to connect with GPT Realtime');
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini-realtime-preview');
  const sessionRef = useRef(null);
  const agentRef = useRef(null);
  const knowledgeToolSchemaRef = useRef(null);
  const activeFunctionCallRef = useRef({ callId: null, name: null, argsText: '' });

  // Initialize the agent
  useEffect(() => {
    console.log('🚀 INITIALIZING VOICE AGENT...');
    console.log('🔧 Defining tool schema for knowledge_search...');
    knowledgeToolSchemaRef.current = {
      type: 'function',
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
    };
  
    console.log('🛠️ Creating RealtimeAgent with client-side tools...');
    agentRef.current = new RealtimeAgent({
      name: 'SherpaPrompt Fencing Assistant',
      instructions: agentInstructions,
      // No client-side auto tools; we handle function calls manually
    });
    
    console.log('✅ RealtimeAgent created successfully!');
    console.log('🔧 Agent configured (manual function-call handling mode)');
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
      console.log('🔧 Tool schema available:', !!knowledgeToolSchemaRef.current);
      console.log('🎯 Session model:', model || selectedModel);
      sessionRef.current = new RealtimeSession(agentRef.current, {
        model: model || selectedModel,
        // Realtime session must receive tool SCHEMAS, not callbacks
        tools: knowledgeToolSchemaRef.current ? [knowledgeToolSchemaRef.current] : [],
        instructions: agentInstructions,
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
          // Track active function call details for manual handling
          activeFunctionCallRef.current = {
            callId: event.item?.call_id || event.item?.id || null,
            name: event.item?.name || event.item?.function?.name || null,
            argsText: ''
          };
        }
      });

      sessionRef.current.on?.('response.function_call_arguments.delta', (event) => {
        console.log('📊 Function call arguments delta:', event);
        if (typeof event.delta === 'string' && activeFunctionCallRef.current.callId) {
          activeFunctionCallRef.current.argsText += event.delta;
        }
      });

      // Handle end of function call arguments: execute and return output manually
      sessionRef.current.on?.('response.function_call_arguments.done', async (event) => {
        try {
          console.log('✅ Function call arguments done:', event);
          const { callId, name, argsText } = activeFunctionCallRef.current;
          if (!callId || !name) {
            console.warn('⚠️ No active function call to complete.');
            return;
          }
          let parsedArgs = {};
          try {
            parsedArgs = argsText ? JSON.parse(argsText) : {};
          } catch (e) {
            console.warn('⚠️ Failed to parse function arguments as JSON. Raw:', argsText);
          }

          if (name === 'knowledge_search') {
            console.log('🔧 Executing knowledge_search with args:', parsedArgs);
            // Execute the same backend call used by the tool implementation
            let outputText = 'No result.';
            try {
              const resp = await fetch('http://localhost:3001/api/voice-tools/search-knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: parsedArgs?.query || '' })
              });
              if (resp.ok) {
                const json = await resp.json();
                outputText = json?.result || outputText;
              } else {
                outputText = `Tool error: ${resp.status}`;
              }
            } catch (err) {
              console.error('❌ knowledge_search backend error:', err);
              outputText = 'Tool call failed due to a network error.';
            }

            // Send function output back to the model
            const outputEvent = {
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: callId,
                output: JSON.stringify({ result: outputText })
              }
            };
            console.log('📤 Sending function_call_output:', outputEvent);
            await sessionRef.current.send?.(outputEvent);

            // Request model to continue with the result
            await sessionRef.current.send?.({ type: 'response.create' });
          }
        } finally {
          activeFunctionCallRef.current = { callId: null, name: null, argsText: '' };
        }
      });

      // Note: sessionRef.current does not expose tools/config directly in this SDK
      // We rely on manual function-call handling above.
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
    } else if (model === 'livekit-agent') {
      setStatus('Ready to connect to Realtime Agent');
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
        ) : selectedModel === 'livekit-agent' ? (
          <RealtimeLiveKitAgent onStatusChange={handleChainedStatusChange} />
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
        {isConnected && selectedModel !== 'chained' && selectedModel !== 'livekit-agent' && (
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
