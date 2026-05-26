import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useProjectStore } from '../lib/core/store';
import { ReplayInspector, GraphDiffReport } from '../lib/observability/replayInspector';
import { runtimeEventBus, ObservableEventType } from '../lib/observability/runtimeEvents';
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Layers, 
  Share2, 
  History, 
  FileDiff, 
  Eye, 
  Cpu,
  Clock,
  ExternalLink,
  GitCommit
} from 'lucide-react';

export const ReplayTimeline: React.FC = () => {
  const { 
    graph, 
    undoHistory, 
    redoHistory, 
    setGraph 
  } = useProjectStore();

  // Create absolute timeline of all checkpoints
  // checkpoints = [...undoHistory, currentGraph, ...redoHistory.reverse()] OR simply keep track of historical states
  const historyStates = useMemo(() => {
    return [...undoHistory, graph];
  }, [undoHistory, graph]);

  const [activeIndex, setActiveIndex] = useState(historyStates.length - 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms per step

  // Sync active index with graph list appending
  useEffect(() => {
    setActiveIndex(historyStates.length - 1);
  }, [historyStates.length]);

  // Stepping automation playback
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (activeIndex < historyStates.length - 1) {
        handleStepToIndex(activeIndex + 1);
      } else {
        setIsPlaying(false); // Stop when reaching end of timeline
      }
    }, playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, activeIndex, historyStates.length, playbackSpeed]);

  const handleStepToIndex = (index: number) => {
    if (index < 0 || index >= historyStates.length) return;
    setActiveIndex(index);
    
    // Inject stepped state into workspace rendering
    const targetState = historyStates[index];
    setGraph(targetState);

    // Document timeline navigation state
    ReplayInspector.logTransactionTimelineStep(index, historyStates);
  };

  const handleResetToHead = () => {
    handleStepToIndex(historyStates.length - 1);
    setIsPlaying(false);
  };

  // Generate a live differential evaluation for the selected timeline marker
  const diffReport = useMemo<GraphDiffReport | null>(() => {
    if (activeIndex === 0 || historyStates.length <= 1) {
      return null;
    }
    const before = historyStates[activeIndex - 1];
    const after = historyStates[activeIndex];
    return ReplayInspector.diffGraphs(before, after);
  }, [activeIndex, historyStates]);

  const hasDiffs = useMemo(() => {
    if (!diffReport) return false;
    return (
      diffReport.addedComponents.length > 0 ||
      diffReport.removedComponents.length > 0 ||
      diffReport.movedComponents.length > 0 ||
      diffReport.addedNets.length > 0 ||
      diffReport.connectionChanges.length > 0
    );
  }, [diffReport]);

  return (
    <div id="replay-timeline-card" className="w-full bg-neutral-950 border border-white/10 rounded-xl p-4 flex flex-col gap-4 font-sans text-xs text-gray-300">
      
      {/* HUD Header Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <History size={14} className="text-violet-400" />
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest leading-none">DETERMINISTIC REPLAY & TIME-TRAVEL</h3>
            <p className="text-[10px] text-gray-500 font-sans mt-1">Audit state transitions, undo/redo states, and step trace histories.</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-black/40 p-0.5 rounded-lg border border-white/5">
          <button 
            onClick={() => handleStepToIndex(0)}
            disabled={activeIndex === 0}
            className="p-1 px-1.5 bg-neutral-900 border border-white/5 text-[9px] font-bold rounded-md hover:bg-neutral-800 disabled:opacity-30 disabled:pointer-events-none transition uppercase shrink-0"
            title="Reset to Initial state commit"
          >
            Genesis
          </button>

          <button 
            onClick={handleResetToHead}
            disabled={activeIndex === historyStates.length - 1}
            className="p-1 px-1.5 bg-neutral-900 border border-white/5 text-[9px] font-bold rounded-md hover:bg-neutral-800 disabled:opacity-30 disabled:pointer-events-none transition uppercase shrink-0 flex items-center gap-1"
            title="Jump to Head (latest active branch)"
          >
            <RotateCcw size={10} /> Live Head
          </button>
        </div>
      </div>

      {/* Sequencer Scrub Controls */}
      <div className="bg-neutral-900/40 border border-white/5 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleStepToIndex(activeIndex - 1)}
              disabled={activeIndex <= 0 || isPlaying}
              className="p-2 bg-neutral-900 border border-white/5 rounded-lg hover:bg-neutral-800 disabled:opacity-30 transition text-gray-400 hover:text-white"
              title="Prev Transaction state"
            >
              <ChevronLeft size={14} />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded-lg border transition ${
                isPlaying 
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}
              title={isPlaying ? "Pause Timeline Automation" : "Play Timeline Automation"}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>

            <button
              onClick={() => handleStepToIndex(activeIndex + 1)}
              disabled={activeIndex >= historyStates.length - 1 || isPlaying}
              className="p-2 bg-neutral-900 border border-white/5 rounded-lg hover:bg-neutral-800 disabled:opacity-30 transition text-gray-400 hover:text-white"
              title="Next Transaction state"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono text-[9px] text-gray-400">
              <Clock size={11} className="text-gray-500" />
              <span>Speed:</span>
              <select 
                value={playbackSpeed}
                onChange={e => setPlaybackSpeed(Number(e.target.value))}
                className="bg-neutral-800 text-gray-200 border border-white/10 rounded px-1 py-0.5 focus:outline-none focus:border-violet-500 font-mono text-[9px]"
              >
                <option value={2000}>0.5x (2s)</option>
                <option value={1000}>1.0x (1s)</option>
                <option value={500}>2.0x (0.5s)</option>
                <option value={250}>4.0x (0.25s)</option>
              </select>
            </div>

            <div className="p-1 px-2.5 bg-black/40 rounded-lg border border-white/5 text-[9px] text-gray-400 font-mono">
              Index: <span className="text-white font-extrabold">{activeIndex + 1}</span> / <span className="text-gray-500">{historyStates.length}</span>
            </div>
          </div>
        </div>

        {/* Visual Timeline Bar */}
        <div className="relative pt-4 pb-2">
          {/* Track line */}
          <div className="absolute left-0 right-0 top-[22px] h-0.5 bg-neutral-800 rounded-full" />
          
          <div className="flex items-center justify-between relative z-10 gap-0.5 overflow-x-auto pb-1.5 max-w-full">
            {historyStates.map((state, i) => {
              const isActive = i === activeIndex;
              const isGenesis = i === 0;
              const isLatest = i === historyStates.length - 1;

              return (
                <button
                  key={i}
                  onClick={() => handleStepToIndex(i)}
                  className={`flex flex-col items-center group shrink-0 min-w-[20px] relative focus:outline-none`}
                  title={`Step ${i+1}`}
                >
                  <div className="text-[7.5px] text-neutral-600 font-mono scale-90 opacity-0 group-hover:opacity-100 transition duration-150 absolute -top-4 font-black">
                    #{i+1}
                  </div>

                  <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all flex items-center justify-center ${
                    isActive 
                      ? 'bg-violet-500 border-white scale-125 shadow-[0_0_8px_rgba(139,92,246,0.6)]' 
                      : isLatest
                        ? 'bg-emerald-500/20 border-emerald-500 hover:scale-110'
                        : isGenesis
                          ? 'bg-blue-500/20 border-blue-400 hover:scale-110'
                          : 'bg-neutral-900 border-neutral-700 hover:border-neutral-500 hover:scale-110'
                  }`}>
                    {isActive && <div className="w-1 h-1 rounded-full bg-white" />}
                  </div>

                  <div className={`text-[6.5px] font-black uppercase mt-1 tracking-tight font-sans ${
                    isActive ? 'text-violet-400' : 'text-neutral-600'
                  }`}>
                    {isGenesis ? 'Gen' : isLatest ? 'Live' : `${i + 1}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Cumulative Diff Evaluator Panel */}
      <div className="space-y-2 flex-1 flex flex-col min-h-0">
        <div className="text-[10px] tracking-widest uppercase font-black text-gray-400 flex items-center gap-1">
          <FileDiff size={12} className="text-cyan-400" /> Transaction Diff Report
        </div>

        <div className="bg-neutral-900 border border-white/5 rounded-xl p-3 flex-1 overflow-y-auto min-h-[140px] max-h-56">
          {activeIndex === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-6 italic font-sans text-[9px] gap-2">
              <GitCommit size={20} className="text-neutral-800" />
              Genesis checkout state. Committing the baseline layout matrix into memory. No prior diff state.
            </div>
          ) : hasDiffs && diffReport ? (
            <div className="space-y-2 text-[9.5px]">
              
              {/* Component inserts */}
              {diffReport.addedComponents.length > 0 && (
                <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/10 p-1.5 rounded-lg leading-relaxed">
                  <span className="text-[7.5px] font-mono text-emerald-400 font-extrabold px-1 bg-emerald-500/10 border border-emerald-500/20 rounded uppercase mt-0.5">Added</span>
                  <div className="text-gray-300">
                    Instantiated components: <span className="font-mono font-bold text-white">{diffReport.addedComponents.join(', ')}</span> onto schematic layers.
                  </div>
                </div>
              )}

              {/* Component deletions */}
              {diffReport.removedComponents.length > 0 && (
                <div className="flex items-start gap-2 bg-rose-500/5 border border-rose-500/10 p-1.5 rounded-lg leading-relaxed">
                  <span className="text-[7.5px] font-mono text-rose-400 font-extrabold px-1 bg-rose-500/10 border border-rose-500/20 rounded uppercase mt-0.5">Removed</span>
                  <div className="text-gray-300">
                    Deleted components: <span className="font-mono font-bold text-white">{diffReport.removedComponents.join(', ')}</span> from workspace graph.
                  </div>
                </div>
              )}

              {/* Component relocations */}
              {diffReport.movedComponents.length > 0 && (
                <div className="flex items-start gap-2 bg-cyan-500/5 border border-cyan-500/10 p-1.5 rounded-lg leading-relaxed">
                  <span className="text-[7.5px] font-mono text-cyan-400 font-extrabold px-1 bg-cyan-500/10 border border-cyan-500/20 rounded uppercase mt-0.5">Moved</span>
                  <div className="text-gray-300 space-y-1">
                    <span>Relocated components on board space:</span>
                    <div className="pl-1.5 space-y-0.5 border-l border-white/5 font-mono text-[8px] text-gray-400">
                      {diffReport.movedComponents.map((m, idx) => (
                        <div key={idx}>
                          <span className="text-white font-bold">{m.designator}</span>: ({m.from.x.toFixed(0)}, {m.from.y.toFixed(0)}) &rarr; ({m.to.x.toFixed(0)}, {m.to.y.toFixed(0)})
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Routing & link edits */}
              {diffReport.addedNets.length > 0 && (
                <div className="flex items-start gap-2 bg-purple-500/5 border border-purple-500/10 p-1.5 rounded-lg leading-relaxed">
                  <span className="text-[7.5px] font-mono text-purple-400 font-extrabold px-1 bg-purple-500/10 border border-purple-500/20 rounded uppercase mt-0.5">Net added</span>
                  <div className="text-gray-300">
                    Committed electrical nets: <span className="font-mono font-bold text-white">{diffReport.addedNets.join(', ')}</span>.
                  </div>
                </div>
              )}

              {diffReport.connectionChanges.length > 0 && (
                <div className="flex items-start gap-2 bg-indigo-500/5 border border-indigo-500/10 p-1.5 rounded-lg leading-relaxed">
                  <span className="text-[7.5px] font-mono text-indigo-400 font-extrabold px-1 bg-indigo-500/10 border border-indigo-500/20 rounded uppercase mt-0.5">Net changed</span>
                  <div className="text-gray-300">
                    {diffReport.connectionChanges.join('; ')}.
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-6 italic font-sans text-[9px] gap-1">
              <Eye size={16} className="text-neutral-800" />
              State index changed, but no physical layout delta coordinates found between checkpoints.
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
