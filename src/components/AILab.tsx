import React, { useState, useEffect, useMemo } from 'react';
import { 
  Brain, 
  Upload, 
  Play, 
  Pause, 
  RotateCcw, 
  Settings2, 
  BarChart3, 
  Activity, 
  Database, 
  Cpu, 
  Layers, 
  Plus, 
  X,
  ChevronRight,
  Zap,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { cn } from '@/src/lib/utils';

interface TrainingLog {
  epoch: number;
  loss: number;
  accuracy: number;
}

const ARCHITECTURES = [
  { id: 'dnn', name: 'Deep Neural Network', desc: 'Complex layer stack for high-precision auto-routing.', icon: <Layers size={18}/> },
  { id: 'rf', name: 'Random Forest', desc: 'Decision tree ensemble for component classification.', icon: <Cpu size={18}/> },
  { id: 'cnn', name: 'Convolutional Net', desc: 'Pattern recognition for visual PCB inspection.', icon: <Database size={18}/> },
];

export default function AILab() {
  const [isTraining, setIsTraining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<TrainingLog[]>([]);
  const [selectedArch, setSelectedArch] = useState(ARCHITECTURES[0]);
  const [epochs, setEpochs] = useState(50);
  const [learningRate, setLearningRate] = useState(0.001);
  const [isDatasetUploaded, setIsDatasetUploaded] = useState(false);

  // Simulate training
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTraining && progress < 100) {
      interval = setInterval(() => {
        setProgress(prev => {
          const next = prev + 1;
          if (next >= 100) {
            setIsTraining(false);
            return 100;
          }
          
          // Generate realistic loss/accuracy logs
          const epoch = Math.floor((next / 100) * epochs);
          setLogs(prevLogs => {
            const lastLoss = prevLogs.length > 0 ? prevLogs[prevLogs.length - 1].loss : 1.0;
            const lastAcc = prevLogs.length > 0 ? prevLogs[prevLogs.length - 1].accuracy : 0.2;
            
            return [...prevLogs, {
              epoch,
              loss: Math.max(0.05, lastLoss - Math.random() * 0.05),
              accuracy: Math.min(0.99, lastAcc + Math.random() * 0.03)
            }].slice(-50); // Keep last 50 points
          });
          
          return next;
        });
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isTraining, progress, epochs]);

  const handleStartTraining = () => {
    if (!isDatasetUploaded) return;
    setLogs([]);
    setProgress(0);
    setIsTraining(true);
  };

  const handleReset = () => {
    setIsTraining(false);
    setProgress(0);
    setLogs([]);
  };

  return (
    <div className="flex h-full bg-[#050505] text-gray-200 overflow-hidden font-sans">
      {/* Sidebar - Configuration */}
      <aside className="w-80 border-r border-white/10 flex flex-col bg-[#0d0d0d]">
        <div className="p-6 border-b border-white/5 bg-white/2">
           <h2 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400 mb-1 flex items-center gap-2">
             <Brain size={14} />
             AI Laboratory
           </h2>
           <p className="text-[10px] text-gray-500 font-medium">Train models for PCB design automation.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
           {/* Dataset Section */}
           <section>
              <label className="text-[10px] uppercase font-bold text-gray-600 tracking-widest block mb-3">Training Dataset</label>
              {isDatasetUploaded ? (
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                        <Database size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white leading-none">pcb_layout_v4.tar.gz</p>
                        <p className="text-[10px] text-gray-500 mt-1">1,240 samples • 42MB</p>
                      </div>
                   </div>
                   <button onClick={() => setIsDatasetUploaded(false)} className="text-gray-600 hover:text-white transition-colors">
                     <X size={14} />
                   </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsDatasetUploaded(true)}
                  className="w-full h-32 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-indigo-500/30 hover:bg-white/2 transition-all group cursor-pointer"
                >
                  <Upload size={24} className="text-gray-700 group-hover:text-indigo-400 transition-colors" />
                  <span className="text-[11px] text-gray-600 group-hover:text-gray-300">Drop dataset or click to upload</span>
                </button>
              )}
           </section>

           {/* Architecture Selection */}
           <section>
              <label className="text-[10px] uppercase font-bold text-gray-600 tracking-widest block mb-3">Model Architecture</label>
              <div className="space-y-2">
                {ARCHITECTURES.map(arch => (
                  <button 
                    key={arch.id}
                    onClick={() => setSelectedArch(arch)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition-all cursor-pointer group",
                      selectedArch.id === arch.id 
                        ? "bg-indigo-600/10 border-indigo-500/50 shadow-lg shadow-indigo-900/10" 
                        : "bg-white/2 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3 mb-1">
                       <div className={cn(
                         "p-1.5 rounded-lg transition-colors",
                         selectedArch.id === arch.id ? "bg-indigo-500 text-white" : "bg-white/5 text-gray-500 group-hover:text-gray-300"
                       )}>
                         {arch.icon}
                       </div>
                       <span className={cn("text-xs font-bold", selectedArch.id === arch.id ? "text-white" : "text-gray-400")}>{arch.name}</span>
                    </div>
                    <p className="text-[10px] text-gray-600 leading-relaxed ml-9">{arch.desc}</p>
                  </button>
                ))}
              </div>
           </section>

           {/* Hyperparameters */}
           <section>
              <div className="flex items-center justify-between mb-4">
                <label className="text-[10px] uppercase font-bold text-gray-600 tracking-widest leading-none">Hyperparameters</label>
                <Settings2 size={12} className="text-gray-600" />
              </div>
              <div className="space-y-4">
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold">
                       <span className="text-gray-500 uppercase tracking-tighter">Epochs</span>
                       <span className="text-indigo-400">{epochs}</span>
                    </div>
                    <input 
                      type="range" min="10" max="200" step="10" 
                      value={epochs} onChange={(e) => setEpochs(Number(e.target.value))}
                      className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-indigo-500"
                    />
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold">
                       <span className="text-gray-500 uppercase tracking-tighter">Learning Rate</span>
                       <span className="text-indigo-400">{learningRate.toFixed(4)}</span>
                    </div>
                    <input 
                      type="range" min="-4" max="-1" step="0.1" 
                      value={Math.log10(learningRate)} onChange={(e) => setLearningRate(Math.pow(10, Number(e.target.value)))}
                      className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-indigo-500"
                    />
                 </div>
              </div>
           </section>
        </div>

        <div className="p-6 border-t border-white/10 bg-[#0d0d0d]">
           <button 
             disabled={!isDatasetUploaded || isTraining}
             onClick={handleStartTraining}
             className={cn(
               "w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-2xl",
               !isDatasetUploaded || isTraining 
                 ? "bg-white/5 text-gray-700 border border-white/5 cursor-not-allowed" 
                 : "bg-white text-black hover:bg-gray-200 cursor-pointer shadow-white/5"
             )}
           >
             {isTraining ? <Activity size={18} className="animate-pulse" /> : <Play size={18} fill="currentColor" />}
             {isTraining ? 'Training in Progress...' : 'Initialize Training'}
           </button>
        </div>
      </aside>

      {/* Main Panel - Execution & Visuals */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
         {/* Status Header */}
         <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#050505]/50 backdrop-blur z-10">
            <div className="flex items-center gap-6">
               <div className="flex flex-col">
                  <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mb-1">Current State</span>
                  <div className="flex items-center gap-2">
                     <div className={cn("w-2 h-2 rounded-full", isTraining ? "bg-indigo-500 animate-pulse shadow-[0_0_8px_#6366f1]" : "bg-gray-800")} />
                     <span className="text-sm font-bold text-white">{isTraining ? 'Processing Epochs' : progress === 100 ? 'Analysis Complete' : 'Idle'}</span>
                  </div>
               </div>
               
               <div className="w-[1px] h-8 bg-white/5" />

               <div className="flex flex-col">
                  <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mb-1">Global Progress</span>
                  <div className="flex items-center gap-3">
                     <div className="w-48 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-indigo-500" 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                        />
                     </div>
                     <span className="text-xs font-mono text-indigo-400 font-bold">{progress}%</span>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-2">
               <button 
                 onClick={() => setIsTraining(!isTraining)}
                 className="p-2 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-all hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                 disabled={progress === 0 && !isTraining}
               >
                 {isTraining ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
               </button>
               <button 
                 onClick={handleReset}
                 className="p-2 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-all hover:bg-white/5"
               >
                 <RotateCcw size={18} />
               </button>
            </div>
         </header>

         {/* Grid Content */}
         <div className="flex-1 overflow-y-auto p-8 space-y-8">
            {/* Top Metrics Row */}
            <div className="grid grid-cols-4 gap-6">
               {[
                 { label: 'Current Loss', value: logs.length > 0 ? logs[logs.length-1].loss.toFixed(4) : '-', icon: <Activity size={12}/>, color: 'text-indigo-400' },
                 { label: 'Validation Accuracy', value: logs.length > 0 ? (logs[logs.length-1].accuracy * 100).toFixed(1) + '%' : '-', icon: <CheckCircle2 size={12}/>, color: 'text-green-400' },
                 { label: 'Runtime', value: isTraining ? '00:12:42' : '-', icon: <Zap size={12}/>, color: 'text-amber-400' },
                 { label: 'Gradients', value: 'OK', icon: <AlertCircle size={12}/>, color: 'text-blue-400' }
               ].map((metric, i) => (
                 <div key={i} className="p-5 bg-[#0d0d0d] border border-white/5 rounded-2xl flex flex-col justify-between h-32 hover:border-white/10 transition-all shadow-xl shadow-black/20 group">
                    <div className="flex items-center justify-between">
                       <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{metric.label}</span>
                       <div className={cn("p-1.5 rounded-lg bg-white/2 group-hover:bg-white/5 transition-colors", metric.color)}>
                         {metric.icon}
                       </div>
                    </div>
                    <span className={cn("text-3xl font-black tracking-tight", metric.color)}>{metric.value}</span>
                 </div>
               ))}
            </div>

            {/* Main Graphs */}
            <div className="grid grid-cols-2 gap-8 h-[400px]">
               <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-6 flex flex-col shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[80px] -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-all" />
                  <div className="flex items-center justify-between mb-8 z-10">
                     <div>
                       <h3 className="text-sm font-bold text-white flex items-center gap-2">
                         Loss Curve
                       </h3>
                       <p className="text-[10px] text-gray-500">Cross-entropy objective optimization.</p>
                     </div>
                     <BarChart3 size={16} className="text-gray-700" />
                  </div>
                  <div className="flex-1 w-full -ml-8">
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={logs}>
                           <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                           <XAxis 
                            dataKey="epoch" 
                            name="Epoch" 
                            stroke="#444" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                           />
                           <YAxis 
                            stroke="#444" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                            domain={[0, 1.2]} 
                           />
                           <Tooltip 
                             contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: '8px', fontSize: '10px' }}
                           />
                           <Line 
                            type="monotone" 
                            dataKey="loss" 
                            stroke="#6366f1" 
                            strokeWidth={3} 
                            dot={false} 
                            isAnimationActive={false}
                           />
                        </LineChart>
                     </ResponsiveContainer>
                  </div>
               </div>

               <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-6 flex flex-col shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 blur-[80px] -mr-16 -mt-16 group-hover:bg-green-500/10 transition-all" />
                  <div className="flex items-center justify-between mb-8 z-10">
                     <div>
                       <h3 className="text-sm font-bold text-white flex items-center gap-2">
                         Validation Accuracy
                       </h3>
                       <p className="text-[10px] text-gray-500">Percentage of correctly placed components.</p>
                     </div>
                     <Activity size={16} className="text-gray-700" />
                  </div>
                  <div className="flex-1 w-full -ml-8">
                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={logs}>
                           <defs>
                              <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                 <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                              </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                           <XAxis 
                            dataKey="epoch" 
                            stroke="#444" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                           />
                           <YAxis 
                            stroke="#444" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                            domain={[0, 1]} 
                           />
                           <Tooltip 
                             contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: '8px', fontSize: '10px' }}
                           />
                           <Area 
                            type="monotone" 
                            dataKey="accuracy" 
                            stroke="#22c55e" 
                            fillOpacity={1} 
                            fill="url(#colorAcc)" 
                            strokeWidth={3}
                            isAnimationActive={false}
                           />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
               </div>
            </div>

            {/* Live Terminal / Logs Area */}
            <div className="grid grid-cols-3 gap-8">
               <div className="col-span-2 bg-black border border-white/5 rounded-2xl flex flex-col font-mono shadow-2xl">
                  <div className="h-10 border-b border-white/5 flex items-center justify-between px-4 bg-white/2">
                     <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Training Console</span>
                     </div>
                     <span className="text-[10px] text-gray-700 tracking-tighter cursor-pointer hover:text-gray-400 transition-colors">EXPORT_LOGS.EXE</span>
                  </div>
                  <div className="p-4 h-64 overflow-y-auto text-[11px] space-y-1.5 scrollbar-hide">
                     <p className="text-gray-700 italic">[{new Date().toISOString().split('T')[1].split('.')[0]}] SYSTEM: Initializing model "{selectedArch.name}"...</p>
                     <p className="text-gray-700 italic">[{new Date().toISOString().split('T')[1].split('.')[0]}] SYSTEM: GPU_VRAM detected: 24GB. Precision level: FLOAT32.</p>
                     <p className="text-gray-700 italic">[{new Date().toISOString().split('T')[1].split('.')[0]}] SYSTEM: Loading weights from checkpoint: None.</p>
                     {logs.map((log, i) => (
                       <p key={i} className={cn(
                         "transition-opacity duration-300",
                         i === logs.length - 1 ? "text-white font-bold opacity-100" : "text-gray-600 opacity-80"
                       )}>
                         <span className="text-indigo-500">❯</span> epoch {log.epoch.toString().padStart(3, '0')} | loss: {log.loss.toFixed(6)} | acc: {log.accuracy.toFixed(4)} | lr: {learningRate.toExponential(2)}
                       </p>
                     ))}
                     {isTraining && <p className="text-indigo-400 animate-pulse">_</p>}
                  </div>
               </div>

               <div className="space-y-6">
                  <div className="p-6 bg-indigo-600 border border-indigo-400 rounded-2xl text-white shadow-2xl shadow-indigo-900/20 relative overflow-hidden group">
                     <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:rotate-12 transition-transform duration-700">
                        <Brain size={120} />
                     </div>
                     <h4 className="text-sm font-black uppercase mb-2 tracking-widest">Copilot Sync</h4>
                     <p className="text-xs leading-relaxed mb-6 opacity-90">
                        Automatically export trained weights to the collaborative editor Copilot for real-time design suggestions.
                     </p>
                     <button onClick={() => alert("SUCCESS: Copilot Auto-Sync Enabled")} className="w-full py-2 bg-white text-indigo-700 rounded-lg text-[11px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all cursor-pointer">
                        Enable Auto-Sync
                     </button>
                  </div>

                  <div className="p-6 bg-[#0d0d0d] border border-white/5 rounded-2xl flex flex-col hover:border-indigo-500/20 transition-all cursor-default">
                     <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-4">Architecture Map</h4>
                     <div className="flex-1 flex flex-col items-center justify-center gap-4 py-4">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white"><Layers size={16}/></div>
                        <div className="w-[1px] h-4 bg-white/10" />
                        <div className="flex gap-4">
                           <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
                           <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
                           <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
                        </div>
                        <div className="w-[1px] h-4 bg-white/10" />
                        <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center text-white"><Activity size={16}/></div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </main>
    </div>
  );
}
