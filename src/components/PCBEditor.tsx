import React, { useState, useEffect, useMemo } from 'react';
import { 
  Maximize2, 
  Layers, 
  MousePointer2, 
  Zap, 
  Settings, 
  Download,
  Eye,
  ShieldCheck,
  Activity,
  Box
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { ProjectGraph } from '../types';
import { syncBoardFromGraph } from '../lib/board';
import { runDRC, DRCViolation } from '../lib/drc';

const RatsnestLayer = React.memo<{ board: ReturnType<typeof syncBoardFromGraph>; processScale: number }>(function RatsnestLayer({ board, processScale }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50 z-10 overflow-visible">
       {board.ratnest.map((line) => (
          <path 
            key={line.id}
            d={`M ${line.startX * processScale + 50 * processScale} ${line.startY * processScale + 50 * processScale} L ${line.endX * processScale + 50 * processScale} ${line.endY * processScale + 50 * processScale}`} 
            stroke="#a855f7" strokeWidth="1" strokeDasharray="2 2"
          />
       ))}
    </svg>
  );
}, (prev, next) => {
  if (prev.processScale !== next.processScale) return false;
  if (prev.board.ratnest.length !== next.board.ratnest.length) return false;
  for (let i = 0; i < prev.board.ratnest.length; i++) {
    const p = prev.board.ratnest[i];
    const n = next.board.ratnest[i];
    if (p.id !== n.id || p.startX !== n.startX || p.startY !== n.startY || p.endX !== n.endX || p.endY !== n.endY) return false;
  }
  return true;
});

const PCBComponentNode = React.memo<{ comp: any; isSelected: boolean; processScale: number; onSelect?: (id: string) => void }>(function PCBComponentNode({ comp, isSelected, processScale, onSelect }) {
  return (
    <motion.div 
      className={cn("absolute group z-20 cursor-grab active:cursor-grabbing", isSelected && "z-30")}
      onClick={(e) => { e.stopPropagation(); onSelect?.(comp.id); }}
      style={{ 
         left: comp.x * processScale + (50 * processScale),
         top: comp.y * processScale + (50 * processScale),
         transform: `rotate(${comp.rotation}deg)` 
      }}
    >
       <div className={cn("relative border -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-colors", isSelected ? "border-indigo-500 shadow-[0_0_15px_#6366f1] bg-indigo-500/10" : "border-amber-500/30 bg-amber-500/5")} style={{ width: 10 * processScale, height: 10 * processScale }}>
          <span className={cn("text-[6px] font-mono whitespace-nowrap font-bold", isSelected ? "text-indigo-400" : "text-amber-500")}>{comp.designator}</span>
          {comp.pads.map((pad: any) => (
            <div key={pad.id} className={cn("absolute rounded-sm", pad.layer === 'F.Cu' ? 'bg-red-500/80 shadow-[0_0_4px_#ef4444]' : 'bg-blue-500/80', isSelected && 'ring-1 ring-white/50')}
              style={{
                left: (pad.x - comp.x) * processScale + (5 * processScale) - (pad.width * processScale / 2),
                top: (pad.y - comp.y) * processScale + (5 * processScale) - (pad.height * processScale / 2),
                width: pad.width * processScale,
                height: pad.height * processScale,
                borderRadius: pad.shape === 'circle' || pad.shape === 'oval' ? '9999px' : '2px'
              }}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[4px] font-mono text-white/50">{pad.id}</span>
            </div>
          ))}
       </div>
    </motion.div>
  );
}, (prev, next) => {
  return prev.isSelected === next.isSelected && 
         prev.processScale === next.processScale && 
         prev.comp.id === next.comp.id &&
         prev.comp.x === next.comp.x && 
         prev.comp.y === next.comp.y && 
         prev.comp.rotation === next.comp.rotation &&
         prev.comp.layer === next.comp.layer &&
         prev.comp.designator === next.comp.designator &&
         prev.comp.pads === next.comp.pads;
});

const PCBEditor = React.memo(function PCBEditor({ graph, selectedIds = [], onSelect }: { graph: ProjectGraph, selectedIds?: string[], onSelect?: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [layers, setLayers] = useState([
    { id: 'F.Cu', name: 'Top Layer', color: 'bg-red-500', visible: true },
    { id: 'B.Cu', name: 'Bottom Layer', color: 'bg-blue-500', visible: true },
    { id: 'F.Silkscreen', name: 'Top Silk', color: 'bg-yellow-400', visible: true },
    { id: 'B.Silkscreen', name: 'Bottom Silk', color: 'bg-amber-600', visible: true },
    { id: 'Edge.Cuts', name: 'Edge Cuts', color: 'bg-purple-500', visible: true },
  ]);

  const [routingProgress, setRoutingProgress] = useState(0);
  const [isFixing, setIsFixing] = useState(false);
  const [fixProgress, setFixProgress] = useState(0);

  // Synchronize Schematic Graph to PCB Board Deterministically
  const board = useMemo(() => syncBoardFromGraph(graph), [graph]);
  const processScale = 20; // 1mm = 20px

  const drcViolations = useMemo(() => runDRC(board), [board]);

  const startAutoFix = () => {
    setIsFixing(true);
    setFixProgress(0);
    const interval = setInterval(() => {
      setFixProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsFixing(false), 1000);
          return 100;
        }
        return p + 2;
      });
    }, 50);
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const routeInterval = setInterval(() => {
      setRoutingProgress(p => p < 100 ? p + 0.5 : 0);
    }, 100);

    return () => {
      window.removeEventListener('resize', checkMobile);
      clearInterval(routeInterval);
    };
  }, []);

  return (
    <div className="flex h-full bg-[#050505] text-gray-200 overflow-hidden relative">
      {/* Left Toolbar - Hide on Mobile, use floating tools instead */}
      {!isMobile && (
        <aside className="w-12 border-r border-white/5 bg-[#0d0d0d] flex flex-col items-center py-4 gap-4 shrink-0">
          {[
            { icon: <MousePointer2 size={18} />, active: true },
            { icon: <Activity size={18} /> },
            { icon: <Zap size={18} /> },
            { icon: <Layers size={18} /> },
            { icon: <Box size={18} /> },
          ].map((tool, i) => (
            <button key={i} className={cn(
              "p-2 rounded-lg transition-all",
              tool.active ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-gray-600 hover:text-white"
            )}>
              {tool.icon}
            </button>
          ))}
        </aside>
      )}

      {/* Main Canvas Area */}
      <main className="flex-1 relative bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] bg-[size:40px_40px] flex items-center justify-center overflow-hidden">
        {/* The PCB Board Simulation */}
        <motion.div 
          className="relative bg-[#111] border-[4px] border-[#1a1a1a] shadow-[0_0_100px_rgba(0,0,0,0.5),inset_0_0_40px_rgba(0,0,0,0.8)]"
          style={{ width: 100 * processScale, height: 100 * processScale }} // Assuming 100x100mm board max for preview
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: zoom, opacity: 1 }}
          drag
          dragConstraints={{ left: -500, right: 500, top: -500, bottom: 500 }}
          dragElastic={0.05}
        >
          {/* AI Scanning Overlay */}
          {isFixing && (
            <motion.div 
              className="absolute inset-0 z-50 pointer-events-none overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
               <motion.div 
                className="absolute inset-x-0 h-1 bg-indigo-500 shadow-[0_0_15px_#6366f1] z-50"
                style={{ top: `${fixProgress}%` }}
               />
               <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-[1px]" />
               <motion.div 
                className="absolute inset-0 flex items-center justify-center"
               >
                  <div className="bg-[#0d0d0d]/90 border border-indigo-500/30 px-3 py-1.5 rounded-full flex items-center gap-2">
                    <ShieldCheck size={14} className="text-indigo-400 animate-pulse" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">DRC Checking: {Math.floor(fixProgress)}%</span>
                  </div>
               </motion.div>
            </motion.div>
          )}

          {/* Board Outline overlay matching points */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
            <polygon 
              points={board.outline.points.map(p => `${p.x * processScale + 50 * processScale},${p.y * processScale + 50 * processScale}`).join(' ')} 
              fill="#181818" stroke="#3b0764" strokeWidth="2" 
            />
          </svg>

          {/* Render Pad & Components */}
          {board.components.map((comp: any) => {
            const isSelected = selectedIds.includes(comp.id);
            return (
              <PCBComponentNode 
                key={comp.id} 
                comp={comp} 
                isSelected={isSelected} 
                processScale={processScale} 
                onSelect={onSelect} 
              />
            );
          })}

          {/* Ratsnest Lines */}
          <RatsnestLayer board={board} processScale={processScale} />
        </motion.div>

        {/* Floating View Controls */}
        <div className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#0d0d0d]/90 backdrop-blur border border-white/10 p-1.5 rounded-full shadow-2xl z-40">
           <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="p-2 text-gray-400 hover:text-white transition-colors"><Maximize2 size={14} className="rotate-45" /></button>
           <div className="h-4 w-[1px] bg-white/10" />
           <span className="text-[10px] font-mono font-bold text-gray-300 w-10 text-center">{Math.round(zoom * 100)}%</span>
           <div className="h-4 w-[1px] bg-white/10" />
           <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-2 text-gray-400 hover:text-white transition-colors"><Maximize2 size={14} /></button>
        </div>

        {/* Mobile Mini-Layers Toggle */}
        {isMobile && (
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            <button className="p-3 bg-white/5 backdrop-blur border border-white/10 rounded-2xl text-white">
              <Layers size={18} />
            </button>
          </div>
        )}
      </main>

      {/* Right Sidebar - Layers & Inspector */}
      {!isMobile && (
        <aside className="w-64 border-l border-white/5 bg-[#0d0d0d] flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5 flex items-center justify-between h-12 bg-[#0a0a0a]">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Board State</h3>
              <Settings size={14} className="text-gray-600" />
          </div>
          
          <div className="p-4 space-y-4">
              {layers.map(layer => (
                <div key={layer.id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                      <div className={cn("w-3 h-3 rounded-full", layer.color, !layer.visible && "opacity-20")} />
                      <span className={cn("text-[11px] font-bold uppercase tracking-tight transition-colors", layer.visible ? "text-gray-300" : "text-gray-600")}>
                        {layer.name}
                      </span>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye size={14} className={cn(layer.visible ? "text-gray-400" : "text-gray-700")} />
                  </button>
                </div>
              ))}
          </div>

          <div className="px-4 py-2 border-y border-white/5 bg-[#0a0a0a]">
            <h4 className="text-[9px] uppercase tracking-[0.1em] font-bold text-gray-500 mb-2">DRC Status</h4>
            {drcViolations.length === 0 ? (
               <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold">
                 <ShieldCheck size={12} /> Design passes basic DRC.
               </div>
            ) : (
               <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                 {drcViolations.map(err => (
                   <div key={err.id} className="text-[9px] text-rose-400 bg-rose-500/10 p-1.5 rounded">{err.message}</div>
                 ))}
               </div>
            )}
          </div>

          <div className="mt-auto p-4 bg-[#0a0a0a]">
              <div className="p-4 bg-white/2 border border-white/5 rounded-2xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Unrouted Nets</span>
                    <span className="text-xs font-mono font-bold text-white">{board.ratnest.length} Airwires</span>
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <button 
                    onClick={startAutoFix}
                    disabled={isFixing}
                    className="w-full py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                      <ShieldCheck size={14} />
                      AI Check DRC
                  </button>
                </div>
              </div>
          </div>
        </aside>
      )}
    </div>
  );
});

export default PCBEditor;
