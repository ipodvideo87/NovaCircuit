import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ProjectGraph, Point } from '../types';
import { BoardLayer, syncBoardFromGraph } from '../lib/board';
import { ConstraintVisualizer, ClearanceRegion, AcidTrapViolation, AnnularRingViolation, BoardEdgeProximity } from '../lib/drc/constraintVisualizer';
import { ThermalOverlayAnalyzer, ThermalSimulationResult } from '../lib/drc/thermalOverlay';
import { SignalIntegrityOverlayAnalyzer, SignalIntegrityData, SkewHighlight, ImpedanceMismatch, EMIRiskPoint } from '../lib/drc/signalIntegrityOverlay';
import { OverlayRenderer, OverlayConfig } from '../lib/rendering/overlayRenderer';
import { Shield, Flame, Activity, HelpCircle, Sparkles, Cpu, AlertTriangle, X, Check, Eye, EyeOff } from 'lucide-react';

interface ConstraintOverlayCanvasProps {
  graph: ProjectGraph;
  activeLayer: BoardLayer;
  pan: Point;
  zoom: number;
  onApplyAiAction?: (actionType: string, payload: any) => void;
  // Multiplayer locks & presences for synchronization
  presences?: any[];
  activeLocks?: Record<string, string>;
}

export const ConstraintOverlayCanvas: React.FC<ConstraintOverlayCanvasProps> = ({
  graph,
  activeLayer,
  pan,
  zoom,
  onApplyAiAction,
  presences = [],
  activeLocks = {}
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<OverlayRenderer | null>(null);

  // Layout sizing dimensions
  const [dims, setDims] = useState({ width: 800, height: 600 });

  // Render Display Configuration Altium-style HUD Options
  const [config, setConfig] = useState<OverlayConfig>({
    showClearance: true,
    showKeepouts: true,
    showThermal: false,
    showSignalIntegrity: true,
    showEmiRisks: false,
    showWatermark: true,
  });

  const [panelOpen, setPanelOpen] = useState(true);

  // 1. ANCHOR CRITICAL INSTANTIATIONS
  const visualizer = useMemo(() => new ConstraintVisualizer(), []);
  const thermalAnalyzer = useMemo(() => new ThermalOverlayAnalyzer(), []);
  const siAnalyzer = useMemo(() => new SignalIntegrityOverlayAnalyzer(), []);

  // 2. COMPUTE ALL STATIC & DEBRIS CONSTRAINTS DYNAMICALLY
  const board = useMemo(() => syncBoardFromGraph(graph), [graph]);

  const drcData = useMemo(() => {
    return visualizer.scanIncremental(board);
  }, [board, visualizer]);

  const thermalData = useMemo(() => {
    return thermalAnalyzer.analyzeBoard(board);
  }, [board, thermalAnalyzer]);

  const siData = useMemo(() => {
    return siAnalyzer.analyzeSignalIntegrity(board);
  }, [board, siAnalyzer]);

  // 3. AI PROJECTION PREVIEWS AND SUGGESTIONS PREPARATION
  // Generates real-time AI optimization pathways based on computed clearance issues or skew.
  const aiSuggestions = useMemo(() => {
    const suggestions: { path: Point[]; netName: string; deltaC: number; id: string; type: string; desc: string }[] = [];
    
    // Suggest physical re-route for differential pair skew
    siData.skews.forEach((sk, idx) => {
      // Create an alternative meandering routing loop coordinates to match lengths
      const startPt = { x: sk.x - 6, y: sk.y - 2 };
      const suggestionPath = [
        { x: startPt.x, y: startPt.y },
        { x: startPt.x + 2, y: startPt.y - 3 },
        { x: startPt.x + 4, y: startPt.y },
        { x: startPt.x + 6, y: startPt.y + 4 },
        { x: startPt.x + 8, y: startPt.y + 1 },
        { x: sk.x + 6, y: sk.y + 2 }
      ];

      suggestions.push({
        id: `sug-skew-${idx}`,
        type: 'skew-trombone',
        netName: sk.netName,
        path: suggestionPath,
        deltaC: Math.max(0, sk.skewMm - 0.05), // Predict recovery improvement deltas
        desc: `AI Lengthening trombone matching loop recommendations.`
      });
    });

    // Suggest copper widening for critical power current-density hot zones
    thermalData.currentDensities.filter(cd => cd.estimatedTempRise > 12.0).forEach((cd, idx) => {
      suggestions.push({
        id: `sug-thermal-${idx}`,
        type: 'widen-copper',
        netName: board.nets.find(n => n.id === cd.netId)?.name || 'Power-Net',
        path: [{ x: cd.startX, y: cd.startY }, { x: cd.endX, y: cd.endY }],
        deltaC: cd.estimatedTempRise - 1.5, // Temp drop delta
        desc: `AI copper expansion target segment trace from ${ (board.traces.find(t=>t.id === cd.traceId)?.width || 0.25).toFixed(2) }mm to 0.60mm.`
      });
    });

    return suggestions;
  }, [siData.skews, thermalData.currentDensities, board]);

  // Selected AI Preview highlighted suggestions
  const [activeAiPreviewId, setActiveAiPreviewId] = useState<string | null>(null);

  const selectedAiSuggestionPath = useMemo(() => {
    if (!activeAiPreviewId) return undefined;
    const match = aiSuggestions.find(s => s.id === activeAiPreviewId);
    return match ? [{ path: match.path, netName: match.netName, deltaC: match.deltaC }] : undefined;
  }, [activeAiPreviewId, aiSuggestions]);

  // 4. MOUSE HOVER INSPECTION HIT-TESTING STATE
  const [hoveredViolation, setHoveredViolation] = useState<{
    x: number;
    y: number;
    title: string;
    desc: string;
    elements: string[];
    actionable?: { label: string; actionType: string; payload: any };
  } | null>(null);

  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });

  // Handle ResizeObserver setup
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDims({ width: width || 800, height: height || 600 });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initialize Canvas Renderer Drawer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      rendererRef.current = new OverlayRenderer(canvas);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Synchronize Render passes with requestAnimationFrame cycle clock
  useEffect(() => {
    let active = true;
    let lastTime = performance.now();

    const loop = () => {
      if (!active) return;
      const now = performance.now();
      const dt = now - lastTime;
      lastTime = now;

      const renderer = rendererRef.current;
      const canvas = canvasRef.current;

      if (renderer && canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = dims.width * dpr;
        canvas.height = dims.height * dpr;

        // Apply Tick
        renderer.tick(dt);

        // Render pass overlay compositing
        renderer.renderOverlays(
          dims.width,
          dims.height,
          pan,
          zoom,
          config,
          drcData,
          thermalData,
          siData,
          selectedAiSuggestionPath
        );
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
    return () => {
      active = false;
    };
  }, [dims, pan, zoom, config, drcData, thermalData, siData, selectedAiSuggestionPath]);

  // Handle interaction collision inspection checks
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setMousePos({ x: mx, y: my });

    // Track hit position back to board Coordinates space
    const processScale = 20;
    const rawBx = (mx - pan.x) / zoom;
    const rawBy = (my - pan.y) / zoom;
    const bx = (rawBx / processScale) - 50;
    const by = (rawBy / processScale) - 50;

    // Threshold range check
    const hitboxR = 2.0; // 2mm overlap threshold

    // Hit-check Clearance errors
    const matchDrc = drcData.clearanceRegions.find(cr => Math.hypot(cr.x - bx, cr.y - by) < hitboxR + cr.radius);
    if (matchDrc) {
      setHoveredViolation({
        x: mx,
        y: my,
        title: 'DRC Clearance Breach',
        desc: matchDrc.message,
        elements: matchDrc.elements
      });
      return;
    }

    // Hit-check acid traps
    const matchTrap = drcData.acidTraps.find(at => Math.hypot(at.x - bx, at.y - by) < hitboxR);
    if (matchTrap) {
      setHoveredViolation({
        x: mx,
        y: my,
        title: 'DFM Acid Trap Junction',
        desc: matchTrap.message,
        elements: matchTrap.traceIds,
        actionable: {
          label: 'AI Auto-Smooth Angle Junction',
          actionType: 'smooth-angle',
          payload: { traceIds: matchTrap.traceIds, x: matchTrap.x, y: matchTrap.y }
        }
      });
      return;
    }

    // Hit check skews
    const matchSkew = siData.skews.find(sk => Math.hypot(sk.x - bx, sk.y - by) < hitboxR + 2);
    if (matchSkew) {
      const matchSug = aiSuggestions.find(sg => sg.type === 'skew-trombone');
      setHoveredViolation({
        x: mx,
        y: my,
        title: 'Signal Integrity: Length Phase Skew',
        desc: `Pair ${matchSkew.netName} accumulated skew of ${matchSkew.skewMm.toFixed(2)}mm, exceeding design limits.`,
        elements: matchSkew.associatedTraceIds,
        actionable: matchSug ? {
          label: 'Apply AI Lengthening Meander',
          actionType: 'trombone-tune',
          payload: { suggestionId: matchSug.id, netName: matchSkew.netName, path: matchSug.path }
        } : undefined
      });
      return;
    }

    // Hit check impedance mismatches
    const matchIm = siData.impedanceMismatches.find(im => Math.hypot(im.x - bx, im.y - by) < hitboxR);
    if (matchIm) {
      const matchSug = aiSuggestions.find(sg => sg.type === 'widen-copper');
      setHoveredViolation({
        x: mx,
        y: my,
        title: 'Signal Integrity: Impedance Discontinuity',
        desc: matchIm.message,
        elements: [matchIm.traceId],
        actionable: matchSug ? {
          label: 'Apply AI Expansion Neckdown Widen',
          actionType: 'widen-copper',
          payload: { suggestionId: matchSug.id, traceId: matchIm.traceId, newWidth: 0.6 }
        } : undefined
      });
      return;
    }

    // Hit check EMI risks
    const matchEmi = siData.emiRisks.find(er => Math.hypot(er.x - bx, er.y - by) < hitboxR);
    if (matchEmi) {
      setHoveredViolation({
        x: mx,
        y: my,
        title: 'EMC Emission Risk: Discontinuity',
        desc: matchEmi.message,
        elements: [matchEmi.traceId]
      });
      return;
    }

    // Reset loop
    setHoveredViolation(null);
  };

  const executeAiAction = (actionType: string, payload: any) => {
    if (onApplyAiAction) {
      onApplyAiAction(actionType, payload);
    }
    setHoveredViolation(null);
    setActiveAiPreviewId(null);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full select-none overflow-hidden bg-transparent pointer-events-auto z-10"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredViolation(null)}
    >
      {/* Underlying Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        className="pointer-events-none absolute inset-0 z-0 bg-transparent"
      />

      {/* Floating Altium CAD Constraint Controller Dashboard */}
      {panelOpen ? (
        <div className="absolute top-4 left-4 w-72 bg-neutral-950/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl z-50 p-4 font-mono select-none pointer-events-auto transition-all duration-300">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3.5">
            <div className="flex items-center gap-2">
              <Shield className="text-rose-500 animate-pulse" size={15} />
              <span className="text-[10px] font-black text-white/95 tracking-widest uppercase">CAD Constraint HUD</span>
            </div>
            <button 
              onClick={() => setPanelOpen(false)}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer active:scale-95 transition-all"
            >
              <X size={12} />
            </button>
          </div>

          <div className="space-y-3.5">
            {/* Real-time board state summary and dynamic diagnostics */}
            <div className="grid grid-cols-2 gap-2 bg-white/5 rounded-lg p-2 text-[9px] border border-white/5 leading-snug">
              <div className="flex flex-col">
                <span className="text-gray-400">DRC BREACHES</span>
                <span className={`font-bold mt-0.5 ${drcData.violations.length > 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
                  {drcData.clearanceRegions.length} ACTIVE
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-400">SI WARNINGS</span>
                <span className={`font-bold mt-0.5 ${siData.skews.length + siData.impedanceMismatches.length > 0 ? 'text-amber-500' : 'text-emerald-400'}`}>
                  {siData.skews.length + siData.impedanceMismatches.length} DETECTED
                </span>
              </div>
            </div>

            {/* Layout Toggles */}
            <div className="space-y-2 text-[9px]">
              <div className="text-gray-400 text-[8px] tracking-wider font-extrabold pb-0.5 border-b border-white/5">FILTER TOGGLES</div>
              
              <button
                onClick={() => setConfig(prev => ({ ...prev, showClearance: !prev.showClearance }))}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border cursor-pointer select-none active:scale-98 transition-all ${
                  config.showClearance 
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
                    : 'bg-transparent border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <Shield size={11} />
                  <span>CLEARANCE MASK (DRC)</span>
                </div>
                {config.showClearance ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>

              <button
                onClick={() => setConfig(prev => ({ ...prev, showThermal: !prev.showThermal }))}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border cursor-pointer select-none active:scale-98 transition-all ${
                  config.showThermal
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                    : 'bg-transparent border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <Flame size={11} />
                  <span>THERMAL ENVELOPE MOD</span>
                </div>
                {config.showThermal ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>

              <button
                onClick={() => setConfig(prev => ({ ...prev, showSignalIntegrity: !prev.showSignalIntegrity }))}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border cursor-pointer select-none active:scale-98 transition-all ${
                  config.showSignalIntegrity 
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' 
                    : 'bg-transparent border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <Activity size={11} />
                  <span>SIGNAL INTEGRITY MATCH</span>
                </div>
                {config.showSignalIntegrity ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>

              <button
                onClick={() => setConfig(prev => ({ ...prev, showEmiRisks: !prev.showEmiRisks }))}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border cursor-pointer select-none active:scale-98 transition-all ${
                  config.showEmiRisks 
                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300' 
                    : 'bg-transparent border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={11} />
                  <span>EMI EMISSIONS RADAR</span>
                </div>
                {config.showEmiRisks ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>
            </div>

            {/* AI Assistant suggestions integrated workspace */}
            {aiSuggestions.length > 0 && (
              <div className="space-y-2 text-[9px] border-t border-white/10 pt-3">
                <div className="flex items-center gap-1 text-emerald-400 font-extrabold tracking-wider text-[8px] uppercase">
                  <Sparkles size={11} />
                  <span>AI Coprocessor Advice</span>
                </div>
                
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {aiSuggestions.map((sug) => (
                    <div 
                      key={sug.id}
                      onMouseEnter={() => setActiveAiPreviewId(sug.id)}
                      onMouseLeave={() => setActiveAiPreviewId(null)}
                      className={`p-2 rounded-lg border leading-tight transition-all cursor-pointer ${
                        activeAiPreviewId === sug.id
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold mb-1">
                        <span>{sug.netName} optimization</span>
                        <span className="text-[7.5px] bg-emerald-500/25 text-emerald-300 px-1 py-0.5 rounded uppercase font-black">
                          PREVIEW OIL
                        </span>
                      </div>
                      <p className="text-[8px] text-gray-300 mb-2">{sug.desc}</p>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 font-bold">Predicted delta: <span className="text-emerald-400">-{sug.deltaC.toFixed(2)}C</span></span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            executeAiAction(sug.type, sug);
                          }}
                          className="bg-emerald-500/20 hover:bg-emerald-500 font-black text-emerald-400 hover:text-white border border-emerald-500/40 hover:border-transparent px-1.5 py-0.5 rounded text-[7.5px] tracking-wide active:scale-95 transition-all cursor-pointer"
                        >
                          APPLY
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button 
          onClick={() => setPanelOpen(true)}
          className="absolute top-4 left-4 bg-neutral-950/95 border border-white/10 p-2.5 rounded-xl hover:bg-neutral-900 cursor-pointer text-rose-500 active:scale-95 transition-all shadow-xl font-mono text-[9px] flex items-center gap-1.5 z-50 pointer-events-auto select-none"
        >
          <Shield size={13} className="animate-pulse" />
          <span className="font-extrabold tracking-widest text-white/90">OPEN CONSTRAINT HUD</span>
        </button>
      )}

      {/* Synchronized Network Presence Indicator */}
      {presences.length > 0 && (
        <div className="absolute top-4 right-4 bg-black/90 backdrop-blur border border-white/10 px-3 py-1.5 rounded-lg font-mono text-[8px] text-[#8e8e93] shadow-xl select-none z-50 pointer-events-none flex flex-col gap-1">
          <div className="font-extrabold text-[7.5px] text-[#f87171] tracking-widest uppercase">CO-SIMULATOR PRESENCES</div>
          {presences.map((p, idx) => (
            <div key={idx} className="flex items-center gap-1 text-white/90">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{p.name || 'Remote Co-Designer'} {activeLocks[p.userId] ? `(inspecting ${activeLocks[p.userId]})` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Hover Inspect Context Tooltip */}
      {hoveredViolation && (
        <div 
          className="absolute bg-neutral-950 border border-white/15 p-3 rounded-lg shadow-2xl z-50 font-mono text-[8.5px] w-56 leading-snug select-none pointer-events-auto transition-all"
          style={{ 
            left: Math.min(dims.width - 240, hoveredViolation.x + 15), 
            top: Math.min(dims.height - 180, hoveredViolation.y + 15) 
          }}
        >
          <div className="flex items-center gap-1 text-rose-400 font-black tracking-widest uppercase mb-1 border-b border-white/10 pb-1">
            <AlertTriangle size={11} />
            <span>{hoveredViolation.title}</span>
          </div>
          <p className="text-gray-200 mb-2 leading-relaxed">{hoveredViolation.desc}</p>

          {/* If there's an active automated action suggestion */}
          {hoveredViolation.actionable && (
            <button
              onClick={() => executeAiAction(hoveredViolation.actionable!.actionType, hoveredViolation.actionable!.payload)}
              className="w-full mt-1 border border-emerald-500/50 hover:border-transparent bg-emerald-500/10 hover:bg-emerald-500 hover:text-white px-2 py-1 rounded-md font-bold text-center text-emerald-400 active:scale-95 cursor-pointer flex items-center justify-center gap-1 transition-all"
            >
              <Sparkles size={11} className="text-emerald-300 animate-pulse" />
              <span>{hoveredViolation.actionable.label}</span>
            </button>
          )}

          {/* Elements list feedback helper */}
          {hoveredViolation.elements.length > 0 && (
            <div className="text-[7.5px] text-gray-500 mt-2 font-bold uppercase tracking-wider">
              Target Nodes: {hoveredViolation.elements.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
