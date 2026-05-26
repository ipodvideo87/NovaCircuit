import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useProjectStore } from '../lib/core/store';
import { LiveExecutionRuntime, AIExecutionStage, AIExecutionState } from '../lib/ai/liveExecutionRuntime';
import { aiAttentionSystem } from '../lib/ai/attentionSystem';
import { aiPreviewRenderer } from '../lib/ai/previewRenderer';
import { globalTelemetry, ObservableEventType } from '../lib/observability/observabilityRuntime';
import { 
  Play, 
  Pause, 
  X, 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  Sparkles, 
  Clock, 
  CornerDownRight, 
  Layers, 
  Flame, 
  RotateCcw,
  Zap
} from 'lucide-react';

export const AILiveExecutionHUD: React.FC = () => {
  const { graph, setGraph } = useProjectStore();
  
  const [activeSession, setActiveSession] = useState<{
    goal: string;
    state: AIExecutionState;
    stages: AIExecutionStage[];
    progress: number;
  } | null>(null);

  // Maintain runtime instance memory
  const runtime = useMemo(() => {
    return new LiveExecutionRuntime(graph, (nextGraph) => {
      setGraph(nextGraph);
    });
  }, [graph, setGraph]);

  // Keep internal progress tracked
  useEffect(() => {
    runtime.setOnProgress((progress, state, stages) => {
      setActiveSession({
        goal: "Live Layout Refactoring Sequence",
        state,
        stages,
        progress
      });
    });
  }, [runtime]);

  const presetGoals = [
    {
      id: "place-caps",
      title: "Decoupling Cap Mounting pass",
      description: "Auto-insert & connect 0.1uF de-noise capacitors matching local MCU power clearances.",
      stages: [
        "Synthesize physical board coordinates near MCU",
        "Place component ghost preview vectors",
        "Physically mount Decoupling CAP-01",
        "Physically mount Decoupling CAP-02",
        "Solve high-fidelity routes securely to GND/VCC reference plane"
      ]
    },
    {
      id: "rf-shield",
      title: "RF Boundary Shield optimization",
      description: "Establish defensive Keepout ring and vias surrounding active RF chip.",
      stages: [
        "Trace RF clearance margins",
        "Draft RF keepout circle dimensions",
        "Deploy Shield via group structure",
        "Audit Spacing overlaps using cumulative DRC resolver"
      ]
    }
  ];

  const handleLaunchGoal = (goal: typeof presetGoals[0]) => {
    // Stage preparation
    runtime.prepareGoal(goal.title, goal.stages);

    // Progressive layouts engine trigger
    runtime.startStreamingExecution(async (stageIdx, currentVal) => {
      const cloned = JSON.parse(JSON.stringify(currentVal));

      if (goal.id === "place-caps") {
        if (stageIdx === 0) {
          // Highlight target MCU location
          aiAttentionSystem.registerFocus(160, 140, 45, "MCU target pinout vector bounds", 3500);
          await new Promise(r => setTimeout(r, 600));
        } 
        else if (stageIdx === 1) {
          // Render ghost layout preview
          aiPreviewRenderer.addComponentGhost({
            designator: "C120_Preview",
            name: "CAP-10uF",
            footprint: "0603",
            x: 135,
            y: 110,
            width: 14,
            height: 8,
            pins: [{ name: "1", x: 130, y: 110 }, { name: "2", x: 140, y: 110 }]
          });
          aiPreviewRenderer.addComponentGhost({
            designator: "C121_Preview",
            name: "CAP-0.1uF",
            footprint: "0402",
            x: 185,
            y: 110,
            width: 12,
            height: 6,
            pins: [{ name: "1", x: 180, y: 110 }, { name: "2", x: 190, y: 110 }]
          });
          aiAttentionSystem.registerFocus(160, 110, 60, "Dynamic Placement Preview", 2500);
          await new Promise(r => setTimeout(r, 800));
        } 
        else if (stageIdx === 2) {
          // Erase ghosts and place first component on physical board
          aiPreviewRenderer.clearPreviews();
          
          cloned.components.push({
            id: `comp-cap1-${Date.now()}`,
            designator: "C120",
            name: "CAP-10uF",
            footprint: "0603",
            position: { x: 135, y: 110 },
            rotation: 0,
            pins: [{ id: "p1", name: "1" }, { id: "p2", name: "2" }]
          });
          aiAttentionSystem.registerFocus(135, 110, 20, "C120 mounted", 2000, "rgba(52, 211, 153, 0.5)");
        } 
        else if (stageIdx === 3) {
          cloned.components.push({
            id: `comp-cap2-${Date.now()}`,
            designator: "C121",
            name: "CAP-0.1uF",
            footprint: "0402",
            position: { x: 185, y: 110 },
            rotation: 0,
            pins: [{ id: "p1", name: "1" }, { id: "p2", name: "2" }]
          });
          aiAttentionSystem.registerFocus(185, 110, 20, "C121 mounted", 2000, "rgba(52, 211, 153, 0.5)");
        } 
        else if (stageIdx === 4) {
          // Insert logical PCB traces to nets
          const vccNet = cloned.nets.find((n: any) => n.name === "VCC");
          if (vccNet) {
            vccNet.connections.push({ componentId: "C120", pinName: "1" });
            vccNet.connections.push({ componentId: "C121", pinName: "1" });
          }
          const gndNet = cloned.nets.find((n: any) => n.name === "GND");
          if (gndNet) {
            gndNet.connections.push({ componentId: "C120", pinName: "2" });
            gndNet.connections.push({ componentId: "C121", pinName: "2" });
          }
          aiAttentionSystem.registerFocus(160, 110, 80, "AutoRoute power grid mesh", 3000, "rgba(168, 85, 247, 0.5)");
        }
      } 
      else if (goal.id === "rf-shield") {
        if (stageIdx === 0) {
          aiAttentionSystem.registerFocus(240, 130, 60, "RF transceiver module Pin-out structure", 3500);
          await new Promise(r => setTimeout(r, 600));
        } 
        else if (stageIdx === 1) {
          // Insert a keepout zone physically
          aiAttentionSystem.registerFocus(240, 130, 80, "Calculating Boundary Dimensions", 2000);
          if (!cloned.keepouts) cloned.keepouts = [];
          cloned.keepouts.push({
            id: `ko-rf-${Date.now()}`,
            x: 200,
            y: 90,
            width: 80,
            height: 80,
            layers: ["F.Cu", "B.Cu"],
            restrictions: ["routing", "vias", "components"]
          });
        } 
        else if (stageIdx === 2) {
          // Deploy Vias or shielding anchors
          aiAttentionSystem.registerFocus(240, 130, 50, "Synthesizing Ring Elements", 2500, "rgba(59, 130, 246, 0.5)");
        }
        else if (stageIdx === 3) {
          aiAttentionSystem.registerFocus(240, 130, 90, "Finalizing DRC electrical verification pass", 2000, "rgba(52, 211, 153, 0.5)");
        }
      }

      return cloned;
    });
  };

  const statusIcons = {
    pending: <div className="w-2.5 h-2.5 rounded-full bg-neutral-800 border border-white/10" />,
    running: <Zap size={11} className="text-amber-400 animate-bounce" />,
    success: <CheckCircle size={11} className="text-emerald-400" />,
    error: <AlertTriangle size={11} className="text-rose-400 font-bold" />
  };

  return (
    <div id="ai-live-execution-hud" className="w-full bg-neutral-950 border border-white/10 rounded-xl p-4 flex flex-col gap-4 font-sans text-xs text-gray-300">
      
      {/* Header section with active sparkles icon */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-purple-400" />
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest leading-none">AI Progressive Layout Generator</h3>
            <p className="text-[10px] text-gray-500 font-sans mt-1">Interactively review and manage progressive machine-assisted board modifications.</p>
          </div>
        </div>
      </div>

      {/* Goal Launch Cards selector */}
      {!activeSession || activeSession.state === 'idle' || activeSession.state === 'completed' || activeSession.state === 'cancelled' ? (
        <div className="space-y-2">
          <div className="text-[8.5px] uppercase font-black text-gray-500 tracking-wider">Select Generative Core Job</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {presetGoals.map(goal => (
              <button
                key={goal.id}
                onClick={() => handleLaunchGoal(goal)}
                className="p-3 bg-neutral-900 border border-white/5 hover:border-white/15 rounded-xl text-left hover:bg-neutral-900/80 transition flex flex-col gap-1.5 focus:outline-none"
              >
                <div className="flex items-center gap-1.5 font-extrabold text-[10.5px] text-white">
                  <Activity size={12} className="text-purple-400" />
                  {goal.title}
                </div>
                <p className="text-[8.5px] leading-relaxed text-gray-400">{goal.description}</p>
                <div className="text-[8px] text-gray-500 mt-2 font-mono flex items-center gap-1.5 border-t border-white/5 pt-1.5">
                  <Layers size={10} /> Length: <span className="font-bold text-gray-400">{goal.stages.length} stages</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3 bg-neutral-900/40 border border-white/5 rounded-xl p-3">
          
          {/* Header row containing State indicator controls */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="font-extrabold text-[10.5px] text-white truncate uppercase tracking-tight">{activeSession.goal}</span>
            </div>

            <div className="flex items-center gap-1">
              {activeSession.state === 'executing' ? (
                <button
                  onClick={() => runtime.pauseExecution()}
                  className="p-1 px-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8.5px] font-black uppercase flex items-center gap-1 transition"
                  title="Pause progressive stream layout cycle"
                >
                  <Pause size={10} /> Pause
                </button>
              ) : activeSession.state === 'paused' ? (
                <button
                  onClick={() => runtime.resumeExecution(async (idx, val) => val)} // Resume placeholder callback
                  className="p-1 px-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8.5px] font-black uppercase flex items-center gap-1 transition"
                  title="Resume streaming timeline update"
                >
                  <Play size={10} /> Resume
                </button>
              ) : null}

              <button
                onClick={() => runtime.cancelRunningSession()}
                className="p-1 px-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[8.5px] font-black uppercase flex items-center gap-1 transition"
                title="Cancel session execution & Safe Rollback"
              >
                <X size={10} /> Cancel
              </button>
            </div>
          </div>

          {/* Ramping progress bars */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[9px] font-mono leading-none text-gray-400">
              <span>PROGRESS PERCENTAGE</span>
              <span className="text-white font-black">{activeSession.progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-300" 
                style={{ width: `${activeSession.progress}%` }}
              />
            </div>
          </div>

          <hr className="border-white/5" />

          {/* Stages Timeline stack */}
          <div className="space-y-1.5">
            <div className="text-[8px] text-gray-500 font-black tracking-widest uppercase mb-1">STAGED TIMELINE SEQUENCE</div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {activeSession.stages.map((st, i) => {
                let textClass = "text-gray-500";
                if (st.status === 'running') textClass = "text-amber-400 font-extrabold";
                if (st.status === 'success') textClass = "text-white";
                if (st.status === 'error') textClass = "text-rose-400 font-black";

                return (
                  <div 
                    key={st.id} 
                    className={`flex items-start gap-2.5 p-2 rounded-lg border transition duration-150 ${
                      st.status === 'running' 
                        ? 'bg-neutral-900 border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.08)]' 
                        : st.status === 'success'
                          ? 'bg-neutral-900/60 border-emerald-500/10'
                          : 'bg-transparent border-transparent'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {statusIcons[st.status]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[9.5px] leading-tight ${textClass}`}>{st.label}</div>
                      {st.status !== 'pending' && (
                        <div className="text-[7.5px] text-gray-500 leading-snug mt-0.5 font-sans break-words italic">
                          {st.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
