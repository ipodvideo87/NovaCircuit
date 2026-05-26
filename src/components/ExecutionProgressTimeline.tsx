import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../lib/core/store';
import { executionTraceTracker, ExecutionTraceSession } from '../lib/observability/executionTrace';
import { runtimeEventBus, ObservableEventType } from '../lib/observability/runtimeEvents';
import { Clock, ShieldAlert, Sparkles, CheckSquare, Layers } from 'lucide-react';

export const ExecutionProgressTimeline: React.FC = () => {
  const [activeSession, setActiveSession] = useState<ExecutionTraceSession | null>(null);

  // Poll tracer status updates periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const sess = executionTraceTracker.getActiveSession();
      setActiveSession(sess ? { ...sess } : null);
    }, 400);

    return () => clearInterval(interval);
  }, []);

  if (!activeSession) {
    return (
      <div id="execution-progress-timeline-empty" className="bg-neutral-950/20 border border-white/5 rounded-xl p-6 text-center text-gray-500 font-sans text-xs">
        <Layers size={16} className="mx-auto mb-2 text-neutral-800" />
        No live engine layout session requested currently. Select a job in the Live Execution HUD to begin.
      </div>
    );
  }

  return (
    <div id="execution-progress-timeline" className="w-full bg-neutral-950 border border-white/10 rounded-xl p-4 font-sans text-xs text-gray-300">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2.5 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
          <h4 className="text-[10px] font-black text-white uppercase tracking-wider truncate">Execution Trace Timeline</h4>
        </div>
        <div className="text-[8px] font-mono text-gray-500 flex items-center gap-1">
          <Clock size={10} />
          {new Date(activeSession.timestamp).toLocaleTimeString()}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[8.5px] uppercase font-bold text-indigo-400 tracking-wide">
          Target Goal: <span className="text-white font-black">"{activeSession.goal}"</span>
        </div>

        <div className="space-y-2 mt-1">
          {activeSession.nodes.map((node, index) => {
            let statusBadge = "bg-neutral-950 text-neutral-500 border-neutral-800";
            let statusText = "Pending Parameters";

            if (node.status === 'running') {
              statusBadge = "bg-amber-500/10 text-amber-400 border-amber-500/20";
              statusText = "Compiling Changes";
            } else if (node.status === 'success') {
              statusBadge = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
              statusText = "Committed to Graph";
            } else if (node.status === 'error') {
              statusBadge = "bg-rose-500/10 text-rose-400 border-rose-500/20";
              statusText = "Safety Check Aborted";
            }

            return (
              <div 
                key={node.id}
                className="p-3 bg-neutral-900 border border-white/5 rounded-xl flex items-start gap-3 flex-wrap md:flex-nowrap"
              >
                <div className="text-[9.5px] font-mono text-gray-500 font-bold shrink-0 mt-0.5">
                  0{index + 1}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-[10px] text-white tracking-wide truncate">
                      {node.label}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[7.5px] font-mono border ${statusBadge}`}>
                      {statusText}
                    </span>
                  </div>

                  {node.reasoning && (
                    <p className="text-[8.5px] leading-relaxed text-gray-400 mt-1.5 italic font-sans">
                      {node.reasoning}
                    </p>
                  )}

                  {node.duration !== undefined && (
                    <div className="text-[7.5px] text-indigo-300 font-mono mt-1">
                      Duration: <span className="font-bold text-white">{Math.round(node.duration)}ms</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
export default ExecutionProgressTimeline;
