'use client';

import { useState, useRef, useEffect } from 'react';
import { Copy, Edit, Save, X, Mic, Square, Loader2, RotateCcw, Upload, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PrototypeEstimator = () => {
  const [status, setStatus] = useState('Ready to record');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [estimate, setEstimate] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedEstimate, setEditedEstimate] = useState('');
  const [lastServerEstimate, setLastServerEstimate] = useState('');
  
  // Catalog file management state
  const [customCatalog, setCustomCatalog] = useState(null);
  const [catalogFileName, setCatalogFileName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  // Load custom catalog from localStorage on component mount
  useEffect(() => {
    const savedCatalog = localStorage.getItem('customCatalog');
    const savedFileName = localStorage.getItem('catalogFileName');
    
    if (savedCatalog && savedFileName) {
      try {
        const parsedCatalog = JSON.parse(savedCatalog);
        setCustomCatalog(parsedCatalog);
        setCatalogFileName(savedFileName);
        setStatus(`Using custom catalog: ${savedFileName}`);
      } catch (error) {
        console.error('Error parsing saved catalog:', error);
        localStorage.removeItem('customCatalog');
        localStorage.removeItem('catalogFileName');
      }
    }
  }, []);

  // File handling functions
  const handleFileSelect = (file) => {
    if (!file) return;
    
    const allowedTypes = ['application/json', 'text/plain'];
    const allowedExtensions = ['.json', '.txt'];
    
    const hasValidType = allowedTypes.includes(file.type);
    const hasValidExtension = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!hasValidType && !hasValidExtension) {
      setStatus('Error: Please upload a JSON or TXT file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        let parsedCatalog;
        
        if (file.name.toLowerCase().endsWith('.json')) {
          parsedCatalog = JSON.parse(content);
        } else {
          // For TXT files, try to parse as JSON
          parsedCatalog = JSON.parse(content);
        }
        
        // Validate catalog structure (basic check)
        if (!parsedCatalog || typeof parsedCatalog !== 'object') {
          throw new Error('Invalid catalog format');
        }
        
        // Save to localStorage and state
        localStorage.setItem('customCatalog', JSON.stringify(parsedCatalog));
        localStorage.setItem('catalogFileName', file.name);
        
        setCustomCatalog(parsedCatalog);
        setCatalogFileName(file.name);
        setStatus(`Custom catalog loaded: ${file.name}`);
        
      } catch (error) {
        console.error('Error parsing catalog file:', error);
        setStatus('Error: Invalid JSON format in uploaded file');
      }
    };
    
    reader.readAsText(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const clearCustomCatalog = () => {
    localStorage.removeItem('customCatalog');
    localStorage.removeItem('catalogFileName');
    setCustomCatalog(null);
    setCatalogFileName('');
    setStatus('Custom catalog cleared - using default catalog');
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const startRecording = async () => {
    try {
      console.log('🎤 Starting audio recording...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = async () => {
        console.log('🔴 [RECORD] Recording stopped, processing audio...');
        console.log('🔴 [RECORD] Audio chunks collected:', audioChunksRef.current.length);
        
        // Create blob with proper audio format
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm; codecs=opus' });
        console.log('🔴 [RECORD] Audio blob created:', {
          size: audioBlob.size + ' bytes',
          type: audioBlob.type
        });
        
        await uploadAudio(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setStatus('Recording... Click stop when finished');
      console.log('✅ Recording started successfully');
      
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      setStatus('Error accessing microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
      setStatus('Processing your request...');
    }
  };

  const uploadAudio = async (audioBlob) => {
    try {
      // Try to determine the correct API URL
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      console.log('🔧 [UPLOAD] Environment NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL);
      console.log('🔧 [UPLOAD] Using API URL:', apiUrl);
      const endpoint = `${apiUrl}/api/estimate`;
      
      console.log('🎤 [UPLOAD] Starting audio upload...');
      console.log('📤 [UPLOAD] Audio file size:', audioBlob.size, 'bytes');
      console.log('🌐 [UPLOAD] Target endpoint:', endpoint);
      
      const formData = new FormData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `recording-${timestamp}.webm`;
      formData.append('audio', audioBlob, filename);
      
      // Include custom catalog if available
      if (customCatalog) {
        formData.append('customCatalog', JSON.stringify(customCatalog));
        console.log('📦 [UPLOAD] Including custom catalog:', catalogFileName);
      }
      
      console.log('📦 [UPLOAD] FormData created with filename:', filename);

      console.log('📡 [UPLOAD] Sending request to server...');
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      console.log('📥 [UPLOAD] Response status:', response.status);
      console.log('📥 [UPLOAD] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [UPLOAD] Server error:', response.status, errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ [UPLOAD] Success! Received data:', data);
      console.log('🎯 [UPLOAD] Estimate object:', data.estimate);
      console.log('⏱️ [UPLOAD] Processing time:', data.meta?.processing_time_ms, 'ms');
      
      // Format the estimate nicely
      const formattedEstimate = JSON.stringify(data.estimate, null, 2);
      
      // Append to existing estimate if there's content, otherwise set as new
      const newEstimate = estimate.trim() 
        ? estimate + '\n\n' + '--- New Estimate ---' + '\n\n' + formattedEstimate
        : formattedEstimate;
      
      console.log('📝 [UPLOAD] Setting estimate in UI...');
      setEstimate(newEstimate);
      setLastServerEstimate(newEstimate);
      setStatus(`Estimate generated (${data.meta.processing_time_ms}ms)`);
      
    } catch (error) {
      console.error('❌ [UPLOAD] Error details:', {
        message: error.message,
        stack: error.stack,
        apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      });
      setStatus(`Error: ${error.message}`);
      setEstimate('Failed to generate estimate. Please try again.');
    } finally {
      setIsProcessing(false);
      console.log('🏁 [UPLOAD] Upload process completed');
    }
  };

  const handleEdit = () => {
    setEditedEstimate(estimate);
    setIsEditing(true);
  };

  const handleSave = () => {
    setEstimate(editedEstimate);
    setLastServerEstimate(editedEstimate);
    setIsEditing(false);
    setStatus('Estimate saved');
  };

  const handleCancel = () => {
    setEditedEstimate('');
    setIsEditing(false);
    setStatus('Edit cancelled');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editedEstimate : estimate);
      setStatus('Copied to clipboard');
      setTimeout(() => setStatus('Ready to record'), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      setStatus('Copy failed');
    }
  };

  const handleReset = () => {
    setEstimate('');
    setLastServerEstimate('');
    setEditedEstimate('');
    setIsEditing(false);
    setStatus('Estimates cleared');
    setTimeout(() => setStatus('Ready to record'), 2000);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">
        
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Voice-to-Estimate Automation
          </h1>
          <p className="text-white/60 text-sm">
            AI-powered Voice Estimation Tool
          </p>
        </div>

        {/* Custom Catalog Upload Section */}
        <div className="mb-8">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white/90 text-lg font-semibold">Catalog Configuration</h3>
              {customCatalog && (
                <Button
                  onClick={clearCustomCatalog}
                  size="sm"
                  variant="outline"
                  className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Custom
                </Button>
              )}
            </div>
            
            {/* Current Catalog Status */}
            <div className="mb-4">
              <div className={`inline-flex items-center px-3 py-2 rounded-lg text-sm ${
                customCatalog 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}>
                <FileText className="w-4 h-4 mr-2" />
                {customCatalog ? `Using: ${catalogFileName}` : 'Using: Default catalog.json'}
              </div>
            </div>

            {/* File Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 cursor-pointer ${
                isDragOver
                  ? 'border-blue-400 bg-blue-500/10'
                  : 'border-white/30 hover:border-white/50 hover:bg-white/5'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={openFileDialog}
            >
              <Upload className="w-8 h-8 text-white/60 mx-auto mb-3" />
              <p className="text-white/80 text-sm mb-2">
                Drop your catalog file here, or click to browse
              </p>
              <p className="text-white/50 text-xs">
                Supports JSON and TXT files (JSON format expected)
              </p>
              
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.txt"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
            
            <p className="text-white/40 text-xs mt-3">
              Upload a custom catalog file to override default pricing. Files are stored locally for this session.
            </p>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
            isRecording 
              ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
              : isProcessing
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : estimate
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isRecording 
                ? 'bg-red-400 animate-pulse' 
                : isProcessing
                  ? 'bg-amber-400 animate-pulse'
                  : estimate
                    ? 'bg-emerald-400'
                    : 'bg-slate-400'
            }`}></div>
            {status}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* Left Side - Recording Controls */}
          <div className="w-full lg:w-1/3 flex flex-col items-center">
            
            {/* Microphone Button */}
            <div className="relative mb-6">
              {/* Outer glow ring */}
              <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
                isRecording 
                  ? 'animate-pulse bg-red-500/20 scale-110' 
                  : isProcessing
                    ? 'animate-pulse bg-amber-500/20 scale-110'
                    : 'bg-blue-500/20 scale-100'
              }`}></div>
              
              {/* Middle ring */}
              <div className={`absolute inset-2 rounded-full border-2 transition-all duration-300 ${
                isRecording 
                  ? 'border-red-500/50 animate-spin-slow' 
                  : isProcessing
                    ? 'border-amber-500/50 animate-spin-slow'
                    : 'border-blue-500/50'
              }`}></div>
              
              {/* Main button */}
              <button
                onClick={toggleRecording}
                disabled={isProcessing}
                className={`relative w-32 h-32 rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:transform-none ${
                  isRecording
                    ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 shadow-lg shadow-red-500/25'
                    : isProcessing
                      ? 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/25'
                      : 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 shadow-lg shadow-blue-500/25'
                }`}
              >
                {/* Button Icon */}
                <div className="flex items-center justify-center text-white">
                  {isProcessing ? (
                    <Loader2 className="w-10 h-10 animate-spin" />
                  ) : isRecording ? (
                    <Square className="w-8 h-8" fill="currentColor" />
                  ) : (
                    <Mic className="w-10 h-10" />
                  )}
                </div>
              </button>
            </div>
            
            {/* Button Label */}
            <p className="text-white/80 text-lg font-medium mb-8">
              {isProcessing ? 'Processing...' : isRecording ? 'Tap to Stop' : 'Tap to Record'}
            </p>

            {/* Voice Active Indicator */}
            {isRecording && (
              <div className="inline-flex items-center space-x-2 px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
                <div className="flex space-x-1">
                  <div className="w-1 h-4 bg-red-400 rounded-full animate-pulse"></div>
                  <div className="w-1 h-6 bg-red-400 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-1 h-3 bg-red-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-1 h-5 bg-red-400 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                </div>
                <span className="text-white/90 text-sm font-medium">Listening...</span>
              </div>
            )}

            {/* Instructions */}
            <div className="mt-8 text-center">
              <div className="inline-block bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                <h3 className="text-white/90 text-sm font-semibold mb-3">How to Use</h3>
                <div className="text-white/60 text-xs space-y-2">
                  <div>1. Click the microphone to start recording</div>
                  <div>2. Describe your fencing project</div>
                  <div>3. Optionally specify labor hours for tasks</div>
                  <div>4. Click stop to generate estimate</div>
                  <div>5. Edit, save, or copy the result</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Estimate Display */}
          <div className="w-full lg:w-2/3">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              
              {/* Text Area Header with Buttons */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white/90 text-lg font-semibold">Generated Estimate</h3>
                
                {estimate && (
                  <div className="flex space-x-2">
                    {isEditing ? (
                      <>
                        <Button
                          onClick={handleSave}
                          size="sm"
                          className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                        <Button
                          onClick={handleCancel}
                          size="sm"
                          variant="outline"
                          className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                        >
                          <X className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={handleEdit}
                          size="sm"
                          variant="outline"
                          className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          onClick={handleCopy}
                          size="sm"
                          variant="outline"
                          className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy
                        </Button>
                        <Button
                          onClick={handleReset}
                          size="sm"
                          variant="outline"
                          className="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30"
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Reset
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Text Area */}
              <div className="relative">
                {isEditing ? (
                  <textarea
                    value={editedEstimate}
                    onChange={(e) => setEditedEstimate(e.target.value)}
                    className="w-full h-96 p-4 bg-slate-900/50 border border-white/20 rounded-lg text-white/90 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                    placeholder="Edit your estimate here..."
                  />
                ) : (
                  <div className="w-full h-96 p-4 bg-slate-900/50 border border-white/20 rounded-lg text-white/90 font-mono text-sm overflow-auto">
                    {estimate ? (
                      <pre className="whitespace-pre-wrap">{estimate}</pre>
                    ) : (
                      <div className="flex items-center justify-center h-full text-white/50">
                        Record audio to generate an estimate
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sample Instructions */}
        <div className="mt-12 text-center">
          <div className="inline-block bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 max-w-3xl">
            <h3 className="text-white/90 text-sm font-semibold mb-3">Sample Requests to Try</h3>
            <div className="text-white/60 text-xs space-y-2">
              <div><strong>Single Items (AI estimates labor):</strong></div>
              <div>&ldquo;I need a 100 foot cedar privacy fence with one gate&rdquo;</div>
              <div>&ldquo;Install 50 linear feet of fencing with posts and concrete&rdquo;</div>
              
              <div className="pt-2"><strong>With Specific Labor Hours:</strong></div>
              <div>&ldquo;Install 50 feet of fencing, post digging will take 8 hours&rdquo;</div>
              <div>&ldquo;Cedar fence installation, 6 hours for panel work and 4 hours for concrete&rdquo;</div>
              
              <div className="pt-2"><strong>Multiple Items Together:</strong></div>
              <div>&ldquo;I need 80 feet of cedar privacy fence, 6 cedar posts, 10 concrete bags, gate hardware, and staining for the whole project&rdquo;</div>
              <div>&ldquo;I need 150 feet of 12/2 Romex, 8 standard outlets, 4 single-pole switches, 6 LED recessed lights, 6 hours of rough-in wiring, and a permit fee for the project.&rdquo;</div>
              
              <div className="pt-2"><strong>Multiple Recordings:</strong></div>
              <div>Record each part separately and they&rsquo;ll be added below each other</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrototypeEstimator;
