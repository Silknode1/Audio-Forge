import React, { useState, useEffect } from 'react';
import { Upload, Settings, Zap, FileAudio, Terminal, Activity, ShieldCheck, FolderOpen, Copy, Mic, Speaker, Radio, Music, Home, BarChart3, ScanLine, AlertTriangle, CheckCircle2, Info, Sparkles, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI } from "@google/genai";
import { CyberButton, GlitchText, ArtifactOverlay, RangeSlider } from './components/CyberComponents';
import { AudioConfig, DEFAULT_CONFIG, RANGES, AppMode, PRESETS, AudioAnalysis } from './types';
import { generateFFmpegCommand, getFrequencyImpact, getClarityImpact, getDeesserImpact, getNoiseImpact, getCompressionImpact, getLoudnessImpact } from './utils';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('upload');
  const [baseDir, setBaseDir] = useState<string>('~/Desktop/');
  const [inputPath, setInputPath] = useState<string>('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [config, setConfig] = useState<AudioConfig>(DEFAULT_CONFIG);
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [terminalLog, setTerminalLog] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPath, setExportPath] = useState('~/Desktop/');
  
  // New State for Studio Mode
  const [studioScriptMode, setStudioScriptMode] = useState<'test-45s' | 'test-10s' | 'full'>('test-45s');
  const [fileVersion, setFileVersion] = useState<number>(1);

  const addLog = (msg: string) => {
    setTerminalLog(prev => [...prev.slice(-6), `> ${msg}`]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSourceFile(file);
      const fileName = file.name;
      let cleanBase = baseDir.trim();
      const hasBackslash = cleanBase.includes('\\');
      const separator = hasBackslash ? '\\' : '/';
      
      if (cleanBase.endsWith('/') || cleanBase.endsWith('\\')) {
          cleanBase = cleanBase.slice(0, -1);
      }
      
      const fullPath = `${cleanBase}${separator}${fileName}`;
      setInputPath(fullPath);
      setExportPath(`${cleanBase}${separator}`);
      
      // Reset analysis when new file is loaded
      setAnalysis(null);
      setAiInsight(null);

      addLog(`File detected: ${fileName}`);
      addLog(`Path auto-constructed: ${fullPath}`);
    }
  };

  const runClientAnalysis = async () => {
    if (!sourceFile) {
      addLog("ERROR: NO SOURCE FILE LOADED IN BROWSER MEMORY");
      return;
    }
    
    setIsAnalyzing(true);
    addLog("INITIALIZING AUDIO CONTEXT SCAN...");
    
    try {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtor();
      
      // 1. Resume context if suspended (Browser Autoplay Policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // 2. Determine Read Strategy
      // Try reading a larger chunk (50MB) to catch headers in larger files
      // If file is < 50MB, read the whole thing to ensure validity.
      // NOTE: If M4B moov atom is at the end, partial scan might still fail.
      const CHUNK_SIZE = 50 * 1024 * 1024; 
      const fileSize = sourceFile.size;
      const bufferToDecode = await (fileSize < CHUNK_SIZE ? sourceFile.arrayBuffer() : sourceFile.slice(0, CHUNK_SIZE).arrayBuffer());
      
      addLog(`DECODING ${Math.round(bufferToDecode.byteLength/1024/1024)}MB DATA...`);
      
      // 3. Decode
      const audioBuffer = await ctx.decodeAudioData(bufferToDecode);
      
      // 4. Analyze
      const rawData = audioBuffer.getChannelData(0);
      let sumSquares = 0;
      let peak = 0;
      const windowSize = 4096;
      const rmsWindows: number[] = [];
      
      for (let i = 0; i < rawData.length; i += windowSize) {
          let windowSum = 0;
          let count = 0;
          for (let j = 0; j < windowSize && i + j < rawData.length; j++) {
            const val = rawData[i + j];
            const abs = Math.abs(val);
            if (abs > peak) peak = abs;
            windowSum += val * val;
            sumSquares += val * val;
            count++;
          }
          if (count > 0) rmsWindows.push(Math.sqrt(windowSum / count));
      }
      
      const rms = Math.sqrt(sumSquares / rawData.length);
      const dbRMS = 20 * Math.log10(rms || 0.00000001); 
      const dbPeak = 20 * Math.log10(peak || 0.00000001);
      
      rmsWindows.sort((a, b) => a - b);
      const noiseRms = rmsWindows[Math.floor(rmsWindows.length * 0.1)] || 0.0000001;
      const dbNoise = 20 * Math.log10(noiseRms);

      setAnalysis({
        estLufs: parseFloat(dbRMS.toFixed(1)),
        peak: parseFloat(dbPeak.toFixed(1)),
        noiseFloor: parseFloat(dbNoise.toFixed(1)),
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        isEst: fileSize > CHUNK_SIZE
      });
      
      addLog("ANALYSIS SUCCESSFUL");

    } catch (e: any) {
      console.error(e);
      addLog(`SCAN ERROR: ${e.message || "Invalid Format/Codec"}`);
      addLog("TIP: If scanning M4B, 'moov' atom might be missing from start.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runAiAnalysis = async () => {
    if (!sourceFile) return;
    setIsAiAnalyzing(true);
    addLog("ESTABLISHING NEURAL LINK WITH GEMINI...");

    try {
      // 1. Prepare Audio Sample (First 5MB)
      const MAX_SIZE = 5 * 1024 * 1024;
      const blob = sourceFile.slice(0, MAX_SIZE);
      const arrayBuffer = await blob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // 2. Initialize Gemini
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // 3. Generate Content
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: sourceFile.type || 'audio/mp4',
                  data: base64Audio
                }
              },
              {
                text: "You are an expert audio engineer specializing in audiobooks. Listen to this sample and analyze the audio quality. Focus on: 1. Noise Floor (hiss, hum). 2. Sibilance (harsh 's' sounds). 3. Dynamic Range. 4. Overall EQ Balance. Provide a concise, technical report with bullet points and specific recommendations for FFmpeg filters (e.g., 'Increase highpass to 100Hz', 'Apply light compression'). Keep it under 150 words."
              }
            ]
          }
        ]
      });

      setAiInsight(response.text);
      addLog("NEURAL ANALYSIS COMPLETE.");

    } catch (e: any) {
      console.error(e);
      addLog(`AI ERROR: ${e.message}`);
      setAiInsight("Neural link failed. Unable to process audio sample.");
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const updateConfig = (key: keyof AudioConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find(p => p.id === presetId);
    if (preset) {
      setConfig(prev => ({ ...prev, ...preset.config }));
      addLog(`PRESET APPLIED: ${preset.name.toUpperCase()}`);
    }
  };

  const simulateProcessing = (type: '45s' | '10s' | 'full', cb: () => void) => {
    setIsProcessing(true);
    addLog(`INITIATING ${type.toUpperCase()} PROTOCOL...`);
    const duration = type === '10s' ? 1000 : 2500;
    setTimeout(() => {
      setIsProcessing(false);
      addLog('COMPLETED. SCRIPT GENERATED.');
      cb();
    }, duration);
  };

  const getBaseName = (path: string) => {
    const fileNameWithExt = path.split(/[/\\]/).pop() || "audiobook";
    return fileNameWithExt.replace(/\.[^/.]+$/, "");
  };

  const getDynamicOutputPath = (modeType: 'test-45s' | 'full' | 'test-10s') => {
    let cleanExportPath = exportPath;
    if (!cleanExportPath.endsWith('/') && !cleanExportPath.endsWith('\\')) {
         const hasBackslash = cleanExportPath.includes('\\');
         cleanExportPath += hasBackslash ? '\\' : '/';
    }
    const baseName = getBaseName(inputPath);
    
    let suffix = '';
    if (modeType === 'test-45s') suffix = `_v${fileVersion}-preview-45s.m4b`;
    else if (modeType === 'test-10s') suffix = `_v${fileVersion}-preview-10s.m4b`;
    else suffix = `_v${fileVersion}-processed.m4b`;
    
    return `${cleanExportPath}${baseName}${suffix}`;
  };

  useEffect(() => {
    if (mode === 'studio') {
      const outPath = getDynamicOutputPath(studioScriptMode);
      const cmd = generateFFmpegCommand(config, inputPath, studioScriptMode, outPath);
      setGeneratedScript(cmd);
    }
  }, [config, inputPath, exportPath, mode, studioScriptMode, fileVersion]);

  const generateAndShow = (type: 'test-45s' | 'test-10s' | 'full') => {
    const outPath = getDynamicOutputPath(type);
    const cmd = generateFFmpegCommand(config, inputPath, type, outPath);
    setGeneratedScript(cmd);
    if(type === 'full') setShowExportModal(true);
  };

  const handleCopyScript = (text: string) => {
    navigator.clipboard.writeText(text);
    addLog(`CMD COPIED (v${fileVersion})`);
    setFileVersion(v => v + 1);
  };

  // --- COMPONENT HELPERS ---
  const getDiagnosticIssues = () => {
    const issues: { type: 'warn' | 'info' | 'good', msg: string }[] = [];
    if (!analysis) return issues;

    // Noise Floor Check
    if (analysis.noiseFloor > -45) {
      issues.push({ type: 'warn', msg: `High noise floor (${analysis.noiseFloor}dB). Consider increasing Noise Reduction > 0.3.` });
    } else if (analysis.noiseFloor > -60) {
      issues.push({ type: 'info', msg: `Moderate room noise (${analysis.noiseFloor}dB). Light Noise Reduction recommended.` });
    } else {
      issues.push({ type: 'good', msg: `Clean noise floor (${analysis.noiseFloor}dB).` });
    }

    // Headroom / Peak Check
    if (analysis.peak > -0.5) {
      issues.push({ type: 'warn', msg: `Input is clipping (${analysis.peak}dB). Limiter will engage heavily.` });
    } else if (analysis.peak < -12) {
      issues.push({ type: 'info', msg: `Low input level (${analysis.peak}dB). Compression will add significant gain.` });
    }

    // Sample Rate Check
    if (analysis.sampleRate !== 44100) {
      issues.push({ type: 'info', msg: `Source is ${analysis.sampleRate/1000}kHz. Output will be 44.1kHz.` });
    }

    return issues;
  };

  // --- RENDERERS ---

  const renderUpload = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center h-[60vh]"
    >
      <div className="relative group w-full max-w-xl">
        <div className="absolute -inset-1 bg-gradient-to-r from-[#00ff41] to-cyan-400 opacity-20 group-hover:opacity-40 blur transition duration-500" />
        <div className="relative bg-black border border-gray-800 p-8 md:p-12 text-center rounded-sm">
          <Upload className="w-16 h-16 mx-auto mb-6 text-[#00ff41] animate-pulse" />
          <h2 className="text-3xl font-bold mb-2 tracking-widest uppercase">
            <GlitchText text="Source Designation" />
          </h2>
          <p className="text-gray-500 font-mono mb-8 text-sm">Configure environment variables</p>
          
          <div className="space-y-4 mb-8">
            <div className="relative text-left">
              <label className="text-[10px] font-mono text-cyan-500 mb-1 flex items-center gap-1">
                <FolderOpen size={10} /> DEFAULT SOURCE DIRECTORY
              </label>
              <input 
                type="text" 
                value={baseDir}
                onChange={(e) => { setBaseDir(e.target.value); setExportPath(e.target.value); }}
                className="w-full bg-gray-900/30 border border-gray-800 p-2 text-xs font-mono text-cyan-400 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="relative group/input text-left">
               <label className="text-[10px] font-mono text-[#00ff41] mb-1 block">FULL INPUT FILE PATH</label>
              <input 
                type="text" 
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder={`${baseDir}audiobook.m4b`}
                className="w-full bg-gray-900/50 border border-gray-700 p-4 text-[#00ff41] font-mono focus:border-[#00ff41] focus:outline-none placeholder-gray-700 text-center relative z-20"
              />
              <div className="mt-3 text-[10px] text-gray-600 font-mono uppercase border border-dashed border-gray-800 p-2 hover:border-gray-600 transition-colors relative cursor-pointer text-center">
                 Drag file here
                 <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30" accept="audio/*" onChange={handleFileUpload} />
              </div>
            </div>
          </div>

          <CyberButton disabled={!inputPath} onClick={() => { addLog(`Target acquired: ${inputPath}`); setMode('dashboard'); }}>
            Initialize Stream
          </CyberButton>
        </div>
      </div>
    </motion.div>
  );

  const renderDashboard = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900/50 border border-gray-800 p-6 hover:border-[#00ff41] transition-colors group">
          <Zap className="w-8 h-8 text-yellow-400 mb-4" />
          <h3 className="text-xl font-bold mb-2">Quick Test (45s)</h3>
          <p className="text-xs text-gray-500 font-mono mb-6">Generate a 45-second diagnostic clip using standard industry protocols.</p>
          <CyberButton className="w-full" onClick={() => simulateProcessing('45s', () => generateAndShow('test-45s'))}>Generate Clip</CyberButton>
        </div>

        <div className="bg-gray-900/50 border border-gray-800 p-6 hover:border-cyan-400 transition-colors relative overflow-hidden">
          <Settings className="w-8 h-8 text-cyan-400 mb-4" />
          <h3 className="text-xl font-bold mb-2">Voice Enhancement Studio</h3>
          <p className="text-xs text-gray-500 font-mono mb-6">Mastering grade filters: Frequency shaping, dynamics, and loudness normalization.</p>
          <CyberButton variant="secondary" className="w-full" onClick={() => setMode('studio')}>Enter Studio</CyberButton>
        </div>

        <div className="bg-gray-900/50 border border-gray-800 p-6 hover:border-rose-500 transition-colors">
          <FileAudio className="w-8 h-8 text-rose-500 mb-4" />
          <h3 className="text-xl font-bold mb-2">Full Processing</h3>
          <p className="text-xs text-gray-500 font-mono mb-6">Two-pass analysis and processing chain. Export executable bash script.</p>
          <CyberButton variant="danger" className="w-full" onClick={() => setShowExportModal(true)}>Export Script</CyberButton>
        </div>
      </div>

      {generatedScript && !showExportModal && (
        <div className="mt-8 bg-black border border-gray-700 p-4 relative">
          <div className="flex justify-between items-center mb-2 border-b border-gray-800 pb-2">
             <span className="text-xs text-green-500 font-mono uppercase flex items-center gap-2">
               <Terminal size={14} /> Generated Command
             </span>
             <button onClick={() => handleCopyScript(generatedScript)} className="text-xs text-gray-400 hover:text-white font-mono hover:underline">[COPY]</button>
          </div>
          <code className="text-xs font-mono text-gray-300 break-all">{generatedScript}</code>
        </div>
      )}
    </motion.div>
  );

  const renderStudio = () => {
    const isTestMode = studioScriptMode !== 'full';
    
    const styles = {
        'test-10s': { border: 'border-cyan-500/50', text: 'text-cyan-400', bg: 'bg-cyan-500/5', btn: 'bg-cyan-500 text-black', copyBtn: 'bg-cyan-500/20 text-cyan-400 border-cyan-500' },
        'test-45s': { border: 'border-yellow-500/50', text: 'text-yellow-400', bg: 'bg-yellow-500/5', btn: 'bg-yellow-500 text-black', copyBtn: 'bg-yellow-500/20 text-yellow-400 border-yellow-500' },
        'full': { border: 'border-rose-500/50', text: 'text-rose-500', bg: 'bg-rose-500/5', btn: 'bg-rose-500 text-white', copyBtn: 'bg-rose-500/20 text-rose-500 border-rose-500' }
    }[studioScriptMode];

    const issues = getDiagnosticIssues();

    return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Settings className="text-cyan-400" /> 
          <GlitchText text="VOICE ENHANCEMENT STUDIO" />
        </h2>
        <div className="flex gap-4">
           <button onClick={() => setMode('dashboard')} className="text-xs font-mono text-gray-400 hover:text-white hover:underline">[ RETURN TO DASHBOARD ]</button>
        </div>
      </div>

      {/* ANALYSIS HUD */}
      <div className="mb-6 bg-black/60 border border-gray-800 p-4 rounded grid grid-cols-1 md:grid-cols-5 gap-4 items-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-1 opacity-20"><BarChart3 size={120} /></div>
        <div className="md:col-span-1 flex flex-col gap-2">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Source Metrics</h3>
            <p className="text-[10px] text-gray-600 font-mono truncate">
              {sourceFile ? sourceFile.name : "No local file linked"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
             {!analysis && (
               <button 
                 onClick={runClientAnalysis} 
                 disabled={isAnalyzing || !sourceFile}
                 className="text-[10px] bg-gray-800 hover:bg-gray-700 text-[#00ff41] px-3 py-1 rounded border border-gray-700 uppercase flex items-center gap-2 disabled:opacity-50"
               >
                  {isAnalyzing ? <span className="animate-spin">⟳</span> : <ScanLine size={12}/>}
                  {isAnalyzing ? "Scanning..." : "Quick Scan"}
               </button>
             )}
             <button 
               onClick={runAiAnalysis} 
               disabled={isAiAnalyzing || !sourceFile}
               className="text-[10px] bg-gray-800 hover:bg-gray-700 text-purple-400 px-3 py-1 rounded border border-gray-700 uppercase flex items-center gap-2 disabled:opacity-50"
             >
                {isAiAnalyzing ? <span className="animate-pulse">●</span> : <Brain size={12}/>}
                {isAiAnalyzing ? "Thinking..." : "AI Analysis"}
             </button>
          </div>
        </div>
        
        {/* Metric Cards */}
        {analysis ? (
          <>
            <div className="bg-gray-900/50 border border-gray-700 p-2 rounded">
               <div className="text-[10px] text-gray-500 uppercase">Loudness (RMS)</div>
               <div className={`text-xl font-mono ${analysis.estLufs > -14 ? 'text-red-500' : 'text-cyan-400'}`}>
                 {analysis.estLufs} <span className="text-xs text-gray-600">dB</span>
               </div>
            </div>
            <div className="bg-gray-900/50 border border-gray-700 p-2 rounded">
               <div className="text-[10px] text-gray-500 uppercase">True Peak</div>
               <div className={`text-xl font-mono ${analysis.peak > -1.0 ? 'text-red-500' : 'text-yellow-400'}`}>
                 {analysis.peak} <span className="text-xs text-gray-600">dB</span>
               </div>
            </div>
            <div className="bg-gray-900/50 border border-gray-700 p-2 rounded">
               <div className="text-[10px] text-gray-500 uppercase">Noise Floor</div>
               <div className={`text-xl font-mono ${analysis.noiseFloor > -45 ? 'text-rose-500' : 'text-green-400'}`}>
                 {analysis.noiseFloor} <span className="text-xs text-gray-600">dB</span>
               </div>
            </div>
            <div className="bg-gray-900/50 border border-gray-700 p-2 rounded">
               <div className="text-[10px] text-gray-500 uppercase">Sample Rate</div>
               <div className="text-xl font-mono text-gray-300">
                 {analysis.sampleRate / 1000} <span className="text-xs text-gray-600">kHz</span>
               </div>
            </div>
          </>
        ) : (
          <div className="md:col-span-4 flex items-center justify-center border border-dashed border-gray-800 rounded p-4 text-gray-600 font-mono text-xs">
             [ METRICS UNAVAILABLE - RUN SCAN TO ANALYZE SOURCE ]
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-32">
        {/* LEFT COLUMN: CONTROLS (3 Spans) */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* SECTION 1: FREQUENCY */}
          <div className="bg-gray-900/20 p-6 border border-gray-800 rounded">
            <h3 className="text-sm font-bold text-cyan-500 mb-6 uppercase tracking-widest flex items-center gap-2">
              <Activity size={16}/> Frequency Shaping
            </h3>
            
            <div className="space-y-8">
              <div>
                 <RangeSlider label="Rumble Cutoff (Hz)" {...RANGES.highpassFreq} value={config.highpassFreq} onChange={(v) => updateConfig('highpassFreq', v)} />
                 <p className="text-[10px] text-cyan-400/70 font-mono mt-1 border-l-2 border-cyan-500/30 pl-2">
                   {getFrequencyImpact(config.highpassFreq)}
                 </p>
              </div>

              <div>
                 <RangeSlider label="Clarity Ceiling (Hz)" {...RANGES.lowpassFreq} value={config.lowpassFreq} onChange={(v) => updateConfig('lowpassFreq', v)} />
                 <p className="text-[10px] text-cyan-400/70 font-mono mt-1 border-l-2 border-cyan-500/30 pl-2">
                   {getClarityImpact(config.lowpassFreq)}
                 </p>
              </div>

              <div className="pt-4 border-t border-gray-800">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <RangeSlider label="Sibilance Freq (Hz)" {...RANGES.deesserFreq} value={config.deesserFreq} onChange={(v) => updateConfig('deesserFreq', v)} />
                  </div>
                  <div className="flex-1">
                    <RangeSlider label="De-esser Strength" {...RANGES.deesserAmount} value={config.deesserAmount} onChange={(v) => updateConfig('deesserAmount', v)} />
                  </div>
                </div>
                <p className="text-[10px] text-cyan-400/70 font-mono mt-1 border-l-2 border-cyan-500/30 pl-2">
                   {getDeesserImpact(config.deesserAmount)}
                 </p>
              </div>
            </div>
          </div>

          {/* SECTION 2: DYNAMICS & LOUDNESS */}
          <div className="bg-gray-900/20 p-6 border border-gray-800 rounded">
            <h3 className="text-sm font-bold text-green-500 mb-6 uppercase tracking-widest flex items-center gap-2">
              <Speaker size={16}/> Dynamics & Loudness
            </h3>
            
            <div className="space-y-8">
               <div>
                  <RangeSlider label="Noise Reduction" {...RANGES.noiseReduction} value={config.noiseReduction} onChange={(v) => updateConfig('noiseReduction', v)} />
                  <p className="text-[10px] text-green-400/70 font-mono mt-1 border-l-2 border-green-500/30 pl-2">
                     {getNoiseImpact(config.noiseReduction)}
                  </p>
               </div>

               <div>
                  <RangeSlider label="Compression Style" {...RANGES.compressionAmount} value={config.compressionAmount} onChange={(v) => updateConfig('compressionAmount', v)} />
                  <p className="text-[10px] text-green-400/70 font-mono mt-1 border-l-2 border-green-500/30 pl-2">
                     {getCompressionImpact(config.compressionAmount)}
                  </p>
               </div>

               <div className="pt-4 border-t border-gray-800">
                  <RangeSlider label="LUFS Target" {...RANGES.loudnormTarget} value={config.loudnormTarget} onChange={(v) => updateConfig('loudnormTarget', v)} />
                  <p className="text-[10px] text-rose-400/70 font-mono mt-1 border-l-2 border-rose-500/30 pl-2">
                     {getLoudnessImpact(config.loudnormTarget)}
                  </p>
               </div>

               <div>
                 <RangeSlider label="True Peak Limit (dB)" {...RANGES.loudnormTp} value={config.loudnormTp} onChange={(v) => updateConfig('loudnormTp', v)} />
               </div>

               <div className="pt-4 border-t border-gray-800">
                 <RangeSlider label="Intermediate FLAC Compression" {...RANGES.flacCompressionLevel} value={config.flacCompressionLevel} onChange={(v) => updateConfig('flacCompressionLevel', v)} />
                 <p className="text-[10px] text-gray-500 font-mono mt-1 pl-2">
                   Higher = Smaller Temp File (Slower) | Lower = Faster (Larger File)
                 </p>
               </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PRESETS & DIAGNOSTICS (1 Span) */}
        <div className="space-y-6">
          {/* System Diagnostics Panel */}
          <div className="bg-black border border-cyan-500/30 p-4 rounded relative overflow-hidden">
            <h4 className="text-xs font-bold text-cyan-400 mb-4 uppercase tracking-widest border-b border-cyan-900 pb-2 flex items-center gap-2">
               <ShieldCheck size={14} /> System Diagnostics
            </h4>
            
            {aiInsight ? (
              <div className="mb-6 bg-purple-900/10 border border-purple-500/30 p-3 rounded">
                <h5 className="text-[10px] font-bold text-purple-400 mb-2 uppercase flex items-center gap-2">
                  <Sparkles size={10} /> Neural Insight
                </h5>
                <p className="text-[10px] text-gray-300 font-mono whitespace-pre-line leading-relaxed">
                  {aiInsight}
                </p>
              </div>
            ) : analysis ? (
              <div className="space-y-3 mb-6">
                {issues.length > 0 ? issues.map((issue, idx) => (
                  <div key={idx} className={`text-[10px] font-mono border-l-2 pl-2 py-1 flex items-start gap-2 ${
                    issue.type === 'warn' ? 'border-yellow-500 text-yellow-200 bg-yellow-900/10' :
                    issue.type === 'good' ? 'border-green-500 text-green-200 bg-green-900/10' :
                    'border-cyan-500 text-cyan-200 bg-cyan-900/10'
                  }`}>
                     {issue.type === 'warn' ? <AlertTriangle size={12} className="shrink-0 mt-0.5" /> : 
                      issue.type === 'good' ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" /> : 
                      <Info size={12} className="shrink-0 mt-0.5" />}
                     {issue.msg}
                  </div>
                )) : (
                  <div className="text-[10px] text-green-500 font-mono flex items-center gap-2">
                    <CheckCircle2 size={12} /> No Anomalies Detected.
                  </div>
                )}
              </div>
            ) : (
               <div className="text-[10px] text-gray-500 font-mono mb-6 italic">
                  Run Quick Scan or AI Analysis to populate.
               </div>
            )}

            <h5 className="text-[10px] font-bold text-gray-400 mb-2 uppercase">Target Protocol</h5>
            <div className="font-mono text-[10px] space-y-2 text-gray-500">
              <div className="flex justify-between"><span>Output LUFS:</span> <span className="text-white">{config.loudnormTarget}</span></div>
              <div className="flex justify-between"><span>True Peak:</span> <span className="text-white">{config.loudnormTp} dB</span></div>
              <div className="flex justify-between"><span>LRA Target:</span> <span className="text-white">{config.loudnormLra} LU</span></div>
              <div className="flex justify-between"><span>Format:</span> <span className="text-white">Mono / {config.bitrate}k</span></div>
              
              <div className="mt-4 pt-4 border-t border-dashed border-gray-800">
                <p className="text-yellow-500 mb-1">⚠️ SCRIPT LOGIC:</p>
                <p>Pass 1: Measures Input</p>
                <p>Pass 2: Normalizes to Target</p>
              </div>
            </div>
          </div>

          {/* Presets */}
          <div className="bg-gray-900/20 border border-gray-800 p-4 rounded">
            <h4 className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-widest">Presets</h4>
            <div className="space-y-2">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  className="w-full text-left p-2 hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-all group"
                >
                  <div className="text-xs font-bold text-gray-300 group-hover:text-[#00ff41] flex items-center gap-2">
                     {preset.id === 'acx' && <Mic size={12}/>}
                     {preset.id === 'warm' && <Radio size={12}/>}
                     {preset.id === 'clear' && <Zap size={12}/>}
                     {preset.id === 'home' && <Home size={12}/>}
                     {preset.id === 'radio' && <Music size={12}/>}
                     {preset.name}
                  </div>
                  <div className="text-[10px] text-gray-600 truncate">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
      
      {/* Bottom Bar */}
      {generatedScript && (
        <div className={`fixed bottom-0 left-0 w-full ${styles.bg} backdrop-blur-md border-t ${styles.border} p-4 z-40 transition-colors duration-300`}>
           <div className="max-w-7xl mx-auto flex flex-col gap-2">
              <div className="flex justify-between items-end mb-2">
                  <div className="flex flex-col gap-1">
                      <span className={`text-[10px] font-mono uppercase tracking-widest ${styles.text} flex items-center gap-2`}>
                        {isTestMode ? <Zap size={12}/> : <FileAudio size={12}/>} 
                        Script Mode: {studioScriptMode === 'full' ? "FULL EXPORT (2-PASS)" : `TEST (${studioScriptMode === 'test-10s' ? '10s' : '45s'})`}
                      </span>
                      <div className="flex items-center gap-2 bg-black/50 p-1 rounded border border-gray-800 w-fit">
                          <button onClick={() => setStudioScriptMode('test-10s')} className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${studioScriptMode === 'test-10s' ? 'bg-cyan-500 text-black' : 'text-gray-500 hover:text-gray-300'}`}>TEST (10s)</button>
                          <button onClick={() => setStudioScriptMode('test-45s')} className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${studioScriptMode === 'test-45s' ? 'bg-yellow-500 text-black' : 'text-gray-500 hover:text-gray-300'}`}>TEST (45s)</button>
                          <button onClick={() => setStudioScriptMode('full')} className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${studioScriptMode === 'full' ? 'bg-rose-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}>FULL EXPORT</button>
                      </div>
                  </div>
                  <button onClick={() => handleCopyScript(generatedScript)} className={`flex items-center gap-2 text-xs font-bold ${styles.copyBtn} px-4 py-2 border uppercase hover:bg-opacity-30 transition-all`}>
                      <Copy size={14} /> Copy Script (v{fileVersion})
                  </button>
              </div>
              <div className="bg-black/80 p-3 rounded border border-gray-800 h-24 overflow-y-auto custom-scrollbar">
                <code className="block text-[10px] text-gray-400 font-mono whitespace-pre-wrap">{generatedScript}</code>
              </div>
           </div>
        </div>
      )}
    </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans overflow-x-hidden selection:bg-[#00ff41] selection:text-black">
      <ArtifactOverlay />
      <header className="fixed top-0 w-full z-40 bg-[#050505]/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-[#00ff41] animate-pulse" />
            <h1 className="text-xl font-bold tracking-widest uppercase">Audio<span className="text-[#00ff41]">Cyber</span> Forge</h1>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
            <span>SYS.VER 3.0.0</span>
            <span className={isProcessing ? "text-yellow-400 animate-pulse" : "text-green-500"}>{isProcessing ? "PROCESSING..." : "ONLINE"}</span>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-20 max-w-7xl mx-auto px-6 relative z-10">
        <AnimatePresence mode="wait">
          {mode === 'upload' && renderUpload()}
          {mode === 'dashboard' && renderDashboard()}
          {mode === 'studio' && renderStudio()}
        </AnimatePresence>
      </main>

      {mode !== 'studio' && (
        <div className="fixed bottom-0 w-full bg-black border-t border-gray-800 h-32 p-4 font-mono text-xs z-30 opacity-90 hidden md:block">
          <div className="max-w-7xl mx-auto h-full flex flex-col justify-end">
            {terminalLog.map((log, i) => (
              <div key={i} className="text-green-900/80 mb-1">{log}</div>
            ))}
            <div className="text-[#00ff41] animate-pulse">_</div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a0a0a] border border-[#00ff41] p-8 max-w-2xl w-full mx-4 shadow-[0_0_30px_rgba(0,255,65,0.1)] relative">
            <button onClick={() => setShowExportModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">X</button>
            <h3 className="text-2xl font-bold mb-6 text-[#00ff41] flex items-center gap-2"><ShieldCheck /> EXPORT PROTOCOL</h3>
            <div className="mb-6 space-y-4">
              <div>
                <label className="block text-xs font-mono text-gray-500 mb-2">OUTPUT DESTINATION PATH</label>
                <input type="text" value={exportPath} onChange={(e) => setExportPath(e.target.value)} className="w-full bg-black border border-gray-700 p-2 text-sm font-mono focus:border-[#00ff41] outline-none text-white" />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-500 mb-2">GENERATED SCRIPT (v{fileVersion})</label>
                <textarea readOnly value={generateFFmpegCommand(config, inputPath, 'full', getDynamicOutputPath('full'))} className="w-full bg-black border border-gray-700 p-4 text-xs font-mono text-green-400 h-32 focus:border-[#00ff41] outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-4">
              <CyberButton className="flex-1" onClick={() => { const cmd = generateFFmpegCommand(config, inputPath, 'full', getDynamicOutputPath('full')); handleCopyScript(cmd); setShowExportModal(false); }}>Copy to Clipboard</CyberButton>
              <button 
                 onClick={() => {
                    const cmd = generateFFmpegCommand(config, inputPath, 'full', getDynamicOutputPath('full'));
                    const blob = new Blob([cmd], { type: 'text/x-shellscript' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `audiobook_master_v${fileVersion}.sh`;
                    a.click();
                    addLog('SCRIPT DOWNLOADED');
                    setShowExportModal(false);
                    setFileVersion(v => v + 1);
                 }}
                 className="flex-1 border border-gray-700 text-gray-300 hover:bg-gray-800 py-3 uppercase text-sm tracking-widest font-bold"
              >
                Download .sh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;