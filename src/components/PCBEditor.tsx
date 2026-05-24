import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Box,
  Info,
  Plus,
  Trash2,
  Edit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { ProjectGraph } from '../types';
import { syncBoardFromGraph } from '../lib/board';
import { runDRC, DRCViolation } from '../lib/drc';
import { resolveNetConstraints, DefaultNetClasses } from '../lib/constraints';
import { generateGerberRS274X, generateExcellonDrill, generateIPCD356Netlist, generatePickAndPlaceCSV, generateBOMCSV } from '../lib/exporter';
import { ThreeDBoardViewer } from './ThreeDBoardViewer';

const RatsnestLayer = React.memo<{ board: ReturnType<typeof syncBoardFromGraph>; processScale: number; isElementVisible?: (bx: number, by: number, radius?: number) => boolean }>(function RatsnestLayer({ board, processScale, isElementVisible }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50 z-10 overflow-visible">
       {board.ratnest.map((line) => {
          if (isElementVisible && !isElementVisible(line.startX, line.startY, 2) && !isElementVisible(line.endX, line.endY, 2)) {
             return null;
          }
          return (
            <path 
              key={line.id}
              d={`M ${line.startX * processScale + 50 * processScale} ${line.startY * processScale + 50 * processScale} L ${line.endX * processScale + 50 * processScale} ${line.endY * processScale + 50 * processScale}`} 
              stroke="#a855f7" strokeWidth="1" strokeDasharray="2 2"
            />
          );
       })}
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

const BoardOutlineOverlay = React.memo<{ outlinePoints: { x: number; y: number }[]; processScale: number }>(function BoardOutlineOverlay({ outlinePoints, processScale }) {
  const pointsStr = useMemo(() => {
    return outlinePoints.map(p => `${p.x * processScale + 50 * processScale},${p.y * processScale + 50 * processScale}`).join(' ');
  }, [outlinePoints, processScale]);

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
      <polygon 
        points={pointsStr} 
        fill="#181818" stroke="#3b0764" strokeWidth="2" 
      />
    </svg>
  );
}, (prev, next) => {
  if (prev.processScale !== next.processScale) return false;
  if (prev.outlinePoints.length !== next.outlinePoints.length) return false;
  for (let i = 0; i < prev.outlinePoints.length; i++) {
    const p = prev.outlinePoints[i];
    const n = next.outlinePoints[i];
    if (p.x !== n.x || p.y !== n.y) return false;
  }
  return true;
});

export interface Point {
  x: number;
  y: number;
}

export function generateSerpentineTrace(A: Point, B: Point, addedLen: number, spacing: number): Point[] {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L = Math.hypot(dx, dy);
  if (L < 1.0 || addedLen <= 0) {
    return [A, B];
  }
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;

  const startRatio = 0.2;
  const endRatio = 0.8;
  const startPt = { x: A.x + ux * L * startRatio, y: A.y + uy * L * startRatio };
  const endPt = { x: A.x + ux * L * endRatio, y: A.y + uy * L * endRatio };

  const L_m = L * (endRatio - startRatio);
  const cycles = 4;
  const stepX = L_m / cycles;
  
  // Total vertical segments = cycles * 4 vertical runs
  // Cap at 2.5mm to avoid clearance overlap errors
  const H = Math.min(2.5, addedLen / (cycles * 4)); 

  const points: Point[] = [A];
  points.push(startPt);

  for (let i = 0; i < cycles; i++) {
    const cycleStartDist = startRatio * L + i * stepX;
    
    // Step 1: Upwards perpendicular bend
    const p1 = cycleStartDist;
    const pt1 = { x: A.x + ux * p1 + px * H, y: A.y + uy * p1 + py * H };
    
    // Step 2: Forward parallel bend
    const p2 = cycleStartDist + stepX * 0.25;
    const pt2 = { x: A.x + ux * p2 + px * H, y: A.y + uy * p2 + py * H };
    
    // Step 3: Cross over to down vertical loop
    const pt3 = { x: A.x + ux * p2 - px * H, y: A.y + uy * p2 - py * H };
    
    // Step 4: Forward parallel bend
    const p4 = cycleStartDist + stepX * 0.75;
    const pt4 = { x: A.x + ux * p4 - px * H, y: A.y + uy * p4 - py * H };

    // Step 5: Return to main track axis
    const p5 = cycleStartDist + stepX;
    const pt5 = { x: A.x + ux * p5, y: A.y + uy * p5 };

    points.push(pt1, pt2, pt3, pt4, pt5);
  }

  points.push(endPt);
  points.push(B);
  return points;
}

export function findDiffPair(board: any, netId: string) {
  // First check in board's stored diffPairs
  if (board.diffPairs) {
    const found = board.diffPairs.find((dp: any) => dp.positiveNetId === netId || dp.negativeNetId === netId);
    if (found) return found;
  }
  
  // Try to lookup from the associated board nets
  const net = board.nets.find((n: any) => n.id === netId);
  if (!net) return null;
  
  let isPositive = false;
  let isNegative = false;
  let baseName = "";
  if (net.name.endsWith("+")) {
    isPositive = true;
    baseName = net.name.slice(0, -1);
  } else if (net.name.endsWith("_P")) {
    isPositive = true;
    baseName = net.name.slice(0, -2);
  } else if (net.name.endsWith("DP") && net.name !== "GND" && net.name !== "VCC") {
    isPositive = true;
    baseName = net.name.slice(0, -2);
  } else if (net.name.endsWith("-")) {
    isNegative = true;
    baseName = net.name.slice(0, -1);
  } else if (net.name.endsWith("_N")) {
    isNegative = true;
    baseName = net.name.slice(0, -2);
  } else if (net.name.endsWith("DN") && net.name !== "GND" && net.name !== "VCC") {
    isNegative = true;
    baseName = net.name.slice(0, -2);
  }

  if (baseName) {
    const positiveNames = [baseName + "+", baseName + "_P", baseName + "DP"];
    const negativeNames = [baseName + "-", baseName + "_N", baseName + "DN"];
    const posNet = board.nets.find((n: any) => positiveNames.includes(n.name));
    const negNet = board.nets.find((n: any) => negativeNames.includes(n.name));
    if (posNet && negNet) {
      return {
        id: `auto-dp-${baseName}`,
        name: baseName,
        positiveNetId: posNet.id,
        negativeNetId: negNet.id,
        spacing: 0.25, // mm spacing
        width: 0.15, // mm trace width
        skewTolerance: 0.5, // mm skew tolerance before DRC flag
        targetImpedance: 90, // target differential impedance
        maxUncoupledLength: 5.0
      };
    }
  }
  return null;
}

const PCBComponentNode = React.memo<{ comp: any; isSelected: boolean; processScale: number; showLabels: boolean; isFCuVisible: boolean; isBCuVisible: boolean; isReadOnly?: boolean; onSelect?: (id: string) => void; onPadClick?: (compId: string, padId: string, e: React.PointerEvent) => void; zoom?: number }>(function PCBComponentNode({ comp, isSelected, processScale, showLabels, isFCuVisible, isBCuVisible, isReadOnly = false, onSelect, onPadClick, zoom = 1 }) {
  return (
    <motion.div 
      className={cn(
        "absolute group z-20 transition-all duration-150", 
        isReadOnly ? "cursor-default" : "cursor-pointer hover:scale-[1.03] active:scale-[0.98]",
        isSelected && "z-30"
      )}
      onPointerDown={(e) => { 
        if (isReadOnly) return;
        e.stopPropagation(); 
        onSelect?.(comp.id); 
      }}
      style={{ 
         left: comp.x * processScale + (50 * processScale),
         top: comp.y * processScale + (50 * processScale),
         transform: `rotate(${comp.rotation}deg)` 
      }}
    >
       <div className={cn("relative border -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-colors", isSelected ? "border-indigo-500 shadow-[0_0_15px_#6366f1] bg-indigo-500/10" : "border-amber-500/30 bg-amber-500/5")} style={{ width: 10 * processScale, height: 10 * processScale }}>
          <span className={cn("text-[6px] font-mono whitespace-nowrap font-bold", isSelected ? "text-indigo-400" : "text-amber-500")}>{comp.designator}</span>
          {zoom >= 0.6 && comp.pads.map((pad: any) => {
            const padVisible = pad.layer === 'F.Cu' ? isFCuVisible : (pad.layer === 'B.Cu' ? isBCuVisible : true);
            if (!padVisible) return null;
            return (
              <div key={pad.id} className={cn("absolute rounded-sm", pad.layer === 'F.Cu' ? 'bg-red-500/90 border border-red-500/30 cursor-crosshair hover:bg-red-400' : 'bg-blue-500/90 border border-blue-500/30 cursor-crosshair hover:bg-blue-400', isSelected && 'ring-1 ring-white/50')}
                onPointerDown={(e) => {
                   if (isReadOnly) return;
                   e.stopPropagation();
                   onPadClick?.(comp.id, pad.id, e);
                }}
                style={{
                  left: (pad.x - comp.x) * processScale + (50 * processScale) - (pad.width * processScale / 2),
                  top: (pad.y - comp.y) * processScale + (50 * processScale) - (pad.height * processScale / 2),
                  width: pad.width * processScale,
                  height: pad.height * processScale,
                  borderRadius: pad.shape === 'circle' || pad.shape === 'oval' ? '9999px' : '2px'
                }}
              >
                {(showLabels || isSelected) && (
                  <span className="absolute inset-0 flex items-center justify-center text-[4px] font-mono text-white/50 pointer-events-none">{pad.id}</span>
                )}
              </div>
            );
          })}
       </div>
    </motion.div>
  );
}, (prev, next) => {
  if (prev.isSelected !== next.isSelected ||
      prev.processScale !== next.processScale ||
      prev.showLabels !== next.showLabels ||
      prev.isFCuVisible !== next.isFCuVisible ||
      prev.isBCuVisible !== next.isBCuVisible ||
      prev.isReadOnly !== next.isReadOnly ||
      prev.comp.id !== next.comp.id ||
      prev.comp.x !== next.comp.x ||
      prev.comp.y !== next.comp.y ||
      prev.comp.rotation !== next.comp.rotation ||
      prev.comp.layer !== next.comp.layer ||
      prev.comp.designator !== next.comp.designator) {
    return false;
  }
  const pPads = prev.comp.pads || [];
  const nPads = next.comp.pads || [];
  if (pPads.length !== nPads.length) return false;
  for (let i = 0; i < pPads.length; i++) {
    const pP = pPads[i];
    const nP = nPads[i];
    if (pP.id !== nP.id || 
        pP.x !== nP.x || 
        pP.y !== nP.y || 
        pP.width !== nP.width || 
        pP.height !== nP.height || 
        pP.layer !== nP.layer || 
        pP.shape !== nP.shape) {
      return false;
    }
  }
  return true;
});

const PCBEditor = React.memo(function PCBEditor({ graph, selectedIds = [], onSelect, onCommitTransaction, mode = 'live' }: { graph: ProjectGraph, selectedIds?: string[], onSelect?: (id: string) => void, onCommitTransaction?: (graph: ProjectGraph) => void, mode?: 'live' | 'replay' | 'inspect' }) {
  const isInteractive = mode === 'live';
  const isReadOnly = mode !== 'live';

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });

  const [showThreeD, setShowThreeD] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const triggerDownload = useCallback((filename: string, content: string, mimeType: string = "text/plain") => {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`SUCCESS: Downloaded ${filename}`);
    } catch (e: any) {
      showToast(`ERROR: Failed download. ${e.message}`);
    }
  }, [showToast]);

  const [isMobile, setIsMobile] = useState(false);
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<'select' | 'route'>('select');
  const [routingState, setRoutingState] = useState<{ 
    activeNetId: string; 
    points: {x:number; y:number}[]; 
    layer: string; 
    width: number; 
    vias?: {x: number; y: number; netId: string}[];
    isDiffPair?: boolean;
    diffPair?: any;
    role?: 'positive' | 'negative';
    otherPoints?: {x:number; y:number}[];
    otherVias?: {x: number; y: number; netId: string}[];
    sideSign?: number;
  } | null>(null);
  const [pointerPos, setPointerPos] = useState({x: 0, y: 0});
  const [pointerPosOther, setPointerPosOther] = useState({x: 0, y: 0});
  const boardRef = useRef<HTMLDivElement>(null);

  const [layers, setLayers] = useState([
    { id: 'F.Cu', name: 'Top Layer', color: 'bg-red-500', visible: true },
    { id: 'B.Cu', name: 'Bottom Layer', color: 'bg-blue-500', visible: true },
    { id: 'F.Silkscreen', name: 'Top Silk', color: 'bg-yellow-400', visible: true },
    { id: 'B.Silkscreen', name: 'Bottom Silk', color: 'bg-amber-600', visible: true },
    { id: 'Edge.Cuts', name: 'Edge Cuts', color: 'bg-purple-500', visible: true },
  ]);

  const isFCuVisible = useMemo(() => layers.find(l => l.id === 'F.Cu')?.visible ?? true, [layers]);
  const isBCuVisible = useMemo(() => layers.find(l => l.id === 'B.Cu')?.visible ?? true, [layers]);
  const isEdgeCutsVisible = useMemo(() => layers.find(l => l.id === 'Edge.Cuts')?.visible ?? true, [layers]);

  const toggleLayer = useCallback((id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [fixProgress, setFixProgress] = useState(0);

  const intervalRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);

  const processScale = 20; // 1mm = 20px

  // Synchronize Schematic Graph to PCB Board Deterministically
  const board = useMemo(() => syncBoardFromGraph(graph), [graph]);

  // Constraint Manager & Net-Class States
  const [rightSidebarTab, setRightSidebarTab] = useState<'board' | 'constraints'>('board');
  const [selectedNetClassId, setSelectedNetClassId] = useState<string>('nc-default');
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  
  // Matched Pair Setup States
  const [showAddDpModal, setShowAddDpModal] = useState(false);
  const [newDpName, setNewDpName] = useState("");
  const [newDpPosNet, setNewDpPosNet] = useState("");
  const [newDpNegNet, setNewDpNegNet] = useState("");

  const activeNetClasses = useMemo(() => {
    if (graph.netClasses && graph.netClasses.length > 0) {
      return graph.netClasses;
    }
    return DefaultNetClasses;
  }, [graph.netClasses]);

  const activeDiffPairs = useMemo(() => {
    return graph.diffPairs || [];
  }, [graph.diffPairs]);

  const handleUpdateNetClass = useCallback((ncId: string, updatedFields: Partial<any>) => {
    const list = graph.netClasses && graph.netClasses.length > 0 
      ? [...graph.netClasses] 
      : DefaultNetClasses.map(nc => ({ ...nc }));
      
    const idx = list.findIndex(nc => nc.id === ncId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updatedFields };
    } else {
      // If it resided in default list but not yet committed on graph
      const defaultMatch = DefaultNetClasses.find(nc => nc.id === ncId);
      if (defaultMatch) {
        list.push({ ...defaultMatch, ...updatedFields });
      } else {
        return;
      }
    }
    
    const newGraph = {
      ...graph,
      netClasses: list
    };
    onCommitTransaction?.(newGraph);
    showToast(`SUCCESS: Rules updated securely`);
  }, [graph, onCommitTransaction, showToast]);

  const handleAddNetClass = useCallback((name: string) => {
    const trimmed = name.trim().toUpperCase();
    if (!trimmed) return;
    const list = graph.netClasses && graph.netClasses.length > 0 
      ? [...graph.netClasses] 
      : DefaultNetClasses.map(nc => ({ ...nc }));

    if (list.some(nc => nc.name === trimmed)) {
      showToast("WARN: Net class already exists");
      return;
    }

    const newClass = {
      id: `nc-${trimmed.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: trimmed,
      minWidth: 0.2,
      minSpacing: 0.2,
      viaSize: { drillSize: 0.3, padSize: 0.6 },
      impedanceOhms: 50
    };

    list.push(newClass);
    const newGraph = {
      ...graph,
      netClasses: list
    };
    onCommitTransaction?.(newGraph);
    setSelectedNetClassId(newClass.id);
    setNewClassName("");
    setShowAddClassModal(false);
    showToast(`SUCCESS: Net Class [${trimmed}] created`);
  }, [graph, onCommitTransaction, showToast]);

  const handleDeleteNetClass = useCallback((id: string) => {
    if (id === 'nc-default') {
      showToast("WARN: DEFAULT class cannot be deleted");
      return;
    }
    const list = graph.netClasses ? graph.netClasses.filter(c => c.id !== id) : [];
    const newGraph = {
      ...graph,
      netClasses: list
    };
    onCommitTransaction?.(newGraph);
    setSelectedNetClassId('nc-default');
    showToast("SUCCESS: Net class removed");
  }, [graph, onCommitTransaction, showToast]);

  const handleAssignNetClass = useCallback((netId: string, className: string) => {
    const newNets = graph.nets.map(n => {
      if (n.id === netId) {
        return { ...n, netClass: className as any };
      }
      return n;
    });
    const newGraph = {
      ...graph,
      nets: newNets
    };
    onCommitTransaction?.(newGraph);
    showToast("SUCCESS: Association updated");
  }, [graph, onCommitTransaction, showToast]);

  const handleCreateDiffPair = useCallback(() => {
    const trimmed = newDpName.trim().toUpperCase();
    if (!trimmed || !newDpPosNet || !newDpNegNet) {
      showToast("WARN: Please supply name and both net assignments");
      return;
    }
    const list = graph.diffPairs ? [...graph.diffPairs] : [];
    if (list.some(dp => dp.name === trimmed)) {
      showToast("WARN: Differential pair name already exists");
      return;
    }

    const newPair = {
      id: `dp-${trimmed.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: trimmed,
      positiveNetId: newDpPosNet,
      negativeNetId: newDpNegNet,
      spacing: 0.25,
      width: 0.15,
      skewTolerance: 0.5,
      targetImpedance: 90,
      maxUncoupledLength: 5.0
    };

    list.push(newPair);
    const newGraph = {
      ...graph,
      diffPairs: list
    };
    onCommitTransaction?.(newGraph);
    setNewDpName("");
    setNewDpPosNet("");
    setNewDpNegNet("");
    setShowAddDpModal(false);
    showToast(`SUCCESS: Matched Pair Group [${trimmed}] Registered`);
  }, [graph, newDpName, newDpPosNet, newDpNegNet, onCommitTransaction, showToast]);

  const handleDeleteDiffPair = useCallback((dpId: string) => {
    const pairs = graph.diffPairs ? graph.diffPairs.filter(p => p.id !== dpId) : [];
    const newGraph = {
      ...graph,
      diffPairs: pairs
    };
    onCommitTransaction?.(newGraph);
    showToast("SUCCESS: Matched Pair configuration removed");
  }, [graph, onCommitTransaction, showToast]);

  const isElementVisible = useCallback((bx: number, by: number, radius = 5) => {
    if (!boardRef.current) return true;
    const parent = boardRef.current.parentElement;
    if (!parent) return true;
    const rect = parent.getBoundingClientRect();
    if (!rect) return true;
    const renderX = (bx + 50) * processScale * zoom + pan.x + (rect.width / 2 - (100 * processScale * zoom) / 2);
    const renderY = (by + 50) * processScale * zoom + pan.y + (rect.height / 2 - (100 * processScale * zoom) / 2);
    const margin = radius * processScale * zoom + 100;
    return (
      renderX >= -margin &&
      renderX <= rect.width + margin &&
      renderY >= -margin &&
      renderY <= rect.height + margin
    );
  }, [pan, zoom]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Middle click or space+click (assume middle for now)
    if (e.button === 1 || e.buttons === 4 || e.altKey || (!isInteractive && e.button === 0)) {
      isPanning.current = true;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const commitRoutingTrace = useCallback((finalPoint?: { x: number; y: number }) => {
    if (!routingState || !onCommitTransaction) return;
    
    const targetPoints = [...routingState.points];
    const otherTargetPoints = routingState.otherPoints ? [...routingState.otherPoints] : [];

    if (finalPoint) {
      targetPoints.push(finalPoint);
      if (routingState.isDiffPair) {
        // Line offset approximation for sibling end-pad connection
        const lastP = routingState.points[routingState.points.length - 1];
        const dx = finalPoint.x - lastP.x;
        const dy = finalPoint.y - lastP.y;
        const dist = Math.hypot(dx, dy);
        let siblingFinal = finalPoint;
        if (dist > 0.01) {
          const ux = dx / dist;
          const uy = dy / dist;
          const sideSign = routingState.sideSign || 1;
          siblingFinal = {
            x: finalPoint.x - uy * sideSign * routingState.diffPair.spacing,
            y: finalPoint.y + ux * sideSign * routingState.diffPair.spacing
          };
        }
        otherTargetPoints.push(siblingFinal);
      }
    } else {
      targetPoints.push(pointerPos);
      if (routingState.isDiffPair) {
        otherTargetPoints.push(pointerPosOther);
      }
    }
    
    if (targetPoints.length < 2) {
      setRoutingState(null);
      return;
    }
    
    const newTraceId = `trace_${Date.now()}`;
    const newSegments: any[] = [];
    
    // Plotted main track segments
    for (let i = 0; i < targetPoints.length - 1; i++) {
        newSegments.push({
            id: `${newTraceId}_${i}`,
            netId: routingState.activeNetId,
            layer: routingState.layer as any,
            width: routingState.width,
            startX: targetPoints[i].x,
            startY: targetPoints[i].y,
            endX: targetPoints[i+1].x,
            endY: targetPoints[i+1].y
        });
    }

    // Companion offset segments
    if (routingState.isDiffPair && otherTargetPoints.length >= 2) {
      const otherNetId = routingState.activeNetId === routingState.diffPair.positiveNetId 
        ? routingState.diffPair.negativeNetId 
        : routingState.diffPair.positiveNetId;
      const otherTraceId = `trace_neg_${Date.now()}`;
      
      for (let i = 0; i < otherTargetPoints.length - 1; i++) {
        newSegments.push({
          id: `${otherTraceId}_${i}`,
          netId: otherNetId,
          layer: routingState.layer as any,
          width: routingState.diffPair.width || routingState.width,
          startX: otherTargetPoints[i].x,
          startY: otherTargetPoints[i].y,
          endX: otherTargetPoints[i+1].x,
          endY: otherTargetPoints[i+1].y
        });
      }
    }

    // Process primary vias
    const newVias = [...(graph.vias || [])];
    if (routingState.vias && routingState.vias.length > 0) {
      routingState.vias.forEach((via: any, idx: number) => {
         newVias.push({
            id: `via_${Date.now()}_${idx}`,
            netId: routingState.activeNetId,
            x: via.x,
            y: via.y,
            drillSize: 0.3,
            padSize: 0.6
         });
      });
    }

    // Process symmetric partner vias
    if (routingState.isDiffPair && routingState.otherVias && routingState.otherVias.length > 0) {
      routingState.otherVias.forEach((via: any, idx: number) => {
         newVias.push({
            id: `via_neg_${Date.now()}_${idx}`,
            netId: via.netId,
            x: via.x,
            y: via.y,
            drillSize: 0.3,
            padSize: 0.6
         });
      });
    }

    const newGraph = {
        ...graph,
        traces: [...(graph.traces || []), ...newSegments],
        vias: newVias
    };
    onCommitTransaction(newGraph);
    showToast("SUCCESS: Committed stable geometry route.");
    setRoutingState(null);
  }, [routingState, pointerPos, pointerPosOther, graph, onCommitTransaction, showToast]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPanPos.current = { x: e.clientX, y: e.clientY };
    }

    if (activeTool === 'route' && boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const styleScale = rect.width / (100 * processScale);
      const rawX = (e.clientX - rect.left) / styleScale;
      const rawY = (e.clientY - rect.top) / styleScale;

      const bx = (rawX / processScale) - 50;
      const by = (rawY / processScale) - 50;

      let snapPad: any = null;
      let targetX = bx;
      let targetY = by;
      
      if (routingState) {
        let minDistance = 2.0;
        board.components.forEach(comp => {
          comp.pads.forEach(pad => {
            if (pad.netId === routingState.activeNetId) {
              const dist = Math.hypot(bx - pad.x, by - pad.y);
              if (dist < minDistance) {
                minDistance = dist;
                snapPad = pad;
              }
            }
          });
        });
      }
      
      if (snapPad) {
        targetX = snapPad.x;
        targetY = snapPad.y;
      }

      let cx = targetX;
      let cy = targetY;

      if (routingState && routingState.points.length > 0) {
        const lastP = routingState.points[routingState.points.length - 1];
        const dx = targetX - lastP.x;
        const dy = targetY - lastP.y;
        
        if (e.shiftKey) {
            // Free form
        } else {
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDx < absDy * 0.4) cx = lastP.x;
            else if (absDy < absDx * 0.4) cy = lastP.y;
            else {
              const maxSide = Math.max(absDx, absDy);
              cx = lastP.x + Math.sign(dx) * maxSide;
              cy = lastP.y + Math.sign(dy) * maxSide;
            }
        }
      }

      let cx_other = cx;
      let cy_other = cy;

      if (routingState && routingState.points.length > 0) {
        const lastP = routingState.points[routingState.points.length - 1];
        const dx = cx - lastP.x;
        const dy = cy - lastP.y;
        
        if (routingState.isDiffPair && routingState.otherPoints) {
          const lastP_other = routingState.otherPoints[routingState.otherPoints.length - 1];
          const dist = Math.hypot(dx, dy);
          
          if (dist > 0.01) {
            const ux = dx / dist;
            const uy = dy / dist;
            const px = -uy;
            const py = ux;
            
            let sideSign = 1;
            if (routingState.points.length === 1 && !routingState.sideSign) {
              const otherStart = routingState.otherPoints[0];
              const dot_perp = (otherStart.x - lastP.x) * px + (otherStart.y - lastP.y) * py;
              sideSign = dot_perp >= 0 ? 1 : -1;
              routingState.sideSign = sideSign;
            } else {
              sideSign = routingState.sideSign || 1;
            }
            
            cx_other = cx + px * sideSign * routingState.diffPair.spacing;
            cy_other = cy + py * sideSign * routingState.diffPair.spacing;
          } else {
            cx_other = lastP_other.x;
            cy_other = lastP_other.y;
          }
        }
      }

      setPointerPos({ x: cx, y: cy });
      setPointerPosOther({ x: cx_other, y: cy_other });
    }
  }, [activeTool, routingState, board, processScale]);

  const handleBoardClick = useCallback((e: React.MouseEvent) => {
    if (isReadOnly) return;
    if (activeTool === 'route' && routingState) {
        setRoutingState(prev => {
          if (!prev) return null;
          const nextPoints = [...prev.points, pointerPos];
          let nextOtherPoints = prev.otherPoints ? [...prev.otherPoints] : undefined;
          if (prev.isDiffPair && prev.otherPoints) {
            nextOtherPoints = [...prev.otherPoints, pointerPosOther];
          }
          return {
            ...prev,
            points: nextPoints,
            otherPoints: nextOtherPoints
          };
        });
    }
  }, [isReadOnly, activeTool, routingState, pointerPos, pointerPosOther]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRoutingState(null);
        setActiveTool('select');
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (routingState) {
          if (routingState.points.length > 1) {
             setRoutingState(prev => {
                if (!prev) return null;
                const nextPoints = [...prev.points];
                nextPoints.pop();
                let nextOtherPoints = prev.otherPoints ? [...prev.otherPoints] : undefined;
                if (nextOtherPoints && nextOtherPoints.length > 1) {
                  nextOtherPoints.pop();
                }
                return { 
                  ...prev, 
                  points: nextPoints,
                  otherPoints: nextOtherPoints
                };
             });
             showToast("INFO: Removed last routing segment.");
          } else {
             setRoutingState(null);
             showToast("INFO: Cancelled routing.");
          }
        }
      }
      
      if (e.key === 'Enter') {
        if (routingState) {
          commitRoutingTrace();
        }
      }

      if (e.key === 'v' || e.key === 'V') {
        if (activeTool === 'route' && routingState) {
          const currentLayer = routingState.layer;
          const nextLayer = currentLayer === 'F.Cu' ? 'B.Cu' : 'F.Cu';
          
          setRoutingState(prev => {
            if (!prev) return null;
            const currentPoints = [...prev.points, pointerPos];
            const currentVias = prev.vias ? [...prev.vias] : [];
            currentVias.push({ x: pointerPos.x, y: pointerPos.y, netId: prev.activeNetId });
            
            let nextOtherPoints = prev.otherPoints ? [...prev.otherPoints] : undefined;
            let nextOtherVias = prev.otherVias ? [...prev.otherVias] : undefined;
            
            if (prev.isDiffPair && prev.otherPoints) {
              nextOtherPoints = [...prev.otherPoints, pointerPosOther];
              nextOtherVias = prev.otherVias ? [...prev.otherVias] : [];
              const otherNetId = prev.activeNetId === prev.diffPair.positiveNetId 
                ? prev.diffPair.negativeNetId 
                : prev.diffPair.positiveNetId;
              nextOtherVias.push({ x: pointerPosOther.x, y: pointerPosOther.y, netId: otherNetId });
            }

            return {
              ...prev,
              layer: nextLayer,
              points: currentPoints,
              vias: currentVias,
              otherPoints: nextOtherPoints,
              otherVias: nextOtherVias
            };
          });
          
          showToast(`SUCCESS: Placed Symmetric Vias & Switched to ${nextLayer === 'F.Cu' ? 'Top Layer' : 'Bottom Layer'}`);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, routingState, pointerPos, pointerPosOther, commitRoutingTrace, showToast]);

  const handlePadClick = useCallback((compId: string, padId: string, e: React.PointerEvent) => {
     if (isReadOnly) return;
     if (activeTool === 'route') {
       const pad = board.components.find(c => c.id === compId)?.pads.find(p => p.id === padId);
       if (pad) {
         if (!routingState) {
            if (pad.netId) {
                const dp = findDiffPair(board, pad.netId);
                if (dp) {
                  const clickedComp = board.components.find((c: any) => c.id === compId);
                  const otherNetId = pad.netId === dp.positiveNetId ? dp.negativeNetId : dp.positiveNetId;
                  const otherPad = clickedComp?.pads.find((p: any) => p.netId === otherNetId);
                  
                  if (otherPad) {
                    setRoutingState({
                      activeNetId: pad.netId,
                      layer: pad.layer.includes('F.Cu') ? 'F.Cu' : 'B.Cu',
                      width: dp.width || 0.15,
                      points: [{ x: pad.x, y: pad.y }],
                      isDiffPair: true,
                      diffPair: dp,
                      role: pad.netId === dp.positiveNetId ? 'positive' : 'negative',
                      otherPoints: [{ x: otherPad.x, y: otherPad.y }],
                      otherVias: []
                    });
                    showToast(`INFO: Initiated Paired Routing on Differential Group [${dp.name}]`);
                    return;
                  }
                }

                const rules = resolveNetConstraints(board, pad.netId);
                setRoutingState({
                  activeNetId: pad.netId,
                  layer: pad.layer.includes('F.Cu') ? 'F.Cu' : 'B.Cu',
                  width: rules.preferredWidth || rules.minWidth || 0.25,
                  points: [{ x: pad.x, y: pad.y }]
                });
            } else {
                showToast("WARN: Cannot route unconnected pad.");
            }
         } else {
            if (pad.netId === routingState.activeNetId) {
                commitRoutingTrace({ x: pad.x, y: pad.y });
            } else {
                showToast("WARN: Short circuit detected! Cannot connect pad to wrong net.");
            }
         }
       }
     }
  }, [isReadOnly, activeTool, routingState, board, commitRoutingTrace, showToast]);

  const triggerSerpentineTuning = useCallback(() => {
    if (isReadOnly) return;
    
    const diffPairsList: any[] = [];
    
    if (board.diffPairs && board.diffPairs.length > 0) {
      board.diffPairs.forEach((dp: any) => diffPairsList.push({ ...dp }));
    }
    
    board.nets.forEach((net1: any) => {
      let isPositive = false;
      let baseName = "";
      if (net1.name.endsWith("+")) {
        isPositive = true;
        baseName = net1.name.slice(0, -1);
      } else if (net1.name.endsWith("_P")) {
        isPositive = true;
        baseName = net1.name.slice(0, -2);
      } else if (net1.name.endsWith("DP") && net1.name !== "GND" && net1.name !== "VCC") {
        isPositive = true;
        baseName = net1.name.slice(0, -2);
      }
      if (isPositive) {
        const matchingNegs = [baseName + "-", baseName + "_N", baseName + "DN"];
        const net2 = board.nets.find((n: any) => matchingNegs.includes(n.name));
        if (net2) {
          const registered = diffPairsList.some((dp: any) => 
            (dp.positiveNetId === net1.id && dp.negativeNetId === net2.id) || 
            (dp.positiveNetId === net2.id && dp.negativeNetId === net1.id)
          );
          if (!registered) {
            diffPairsList.push({
              id: `auto-dp-${baseName}`,
              name: baseName,
              positiveNetId: net1.id,
              negativeNetId: net2.id,
              spacing: 0.25,
              width: 0.15,
              skewTolerance: 0.5,
              targetImpedance: 90,
              maxUncoupledLength: 5.0
            });
          }
        }
      }
    });

    if (diffPairsList.length === 0) {
      showToast("WARN: No differential pairs (e.g. companion nets USB_D+, USB_D-) found to equalize skew!");
      return;
    }

    let tunedCount = 0;

    diffPairsList.forEach((dp: any) => {
      const posTraces = board.traces.filter((t: any) => t.netId === dp.positiveNetId);
      const negTraces = board.traces.filter((t: any) => t.netId === dp.negativeNetId);

      const posLen = posTraces.reduce((sum: number, t: any) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
      const negLen = negTraces.reduce((sum: number, t: any) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
      
      const skew = Math.abs(posLen - negLen);
      if (skew < 0.1) {
        showToast(`INFO: Pair [${dp.name}] is already matched (skew < 0.1mm)`);
        return;
      }

      const shorterNetId = posLen < negLen ? dp.positiveNetId : dp.negativeNetId;
      const shorterTraces = posLen < negLen ? posTraces : negTraces;

      let longestSegment: any = null;
      let maxSegLen = 0;
      shorterTraces.forEach((t: any) => {
        const length = Math.hypot(t.startX - t.endX, t.startY - t.endY);
        if (length > maxSegLen) {
          maxSegLen = length;
          longestSegment = t;
        }
      });

      if (longestSegment && maxSegLen > 2.0) {
        const serpPoints = generateSerpentineTrace(
          { x: longestSegment.startX, y: longestSegment.startY },
          { x: longestSegment.endX, y: longestSegment.endY },
          skew,
          dp.spacing
        );

        const newSegments: any[] = [];
        const serpId = `serp_${Date.now()}`;
        
        for (let i = 0; i < serpPoints.length - 1; i++) {
          newSegments.push({
            id: `${serpId}_${i}`,
            netId: shorterNetId,
            layer: longestSegment.layer,
            width: longestSegment.width,
            startX: serpPoints[i].x,
            startY: serpPoints[i].y,
            endX: serpPoints[i+1].x,
            endY: serpPoints[i+1].y
          });
        }

        const remainingTraces = graph.traces ? graph.traces.filter((t: any) => t.id !== longestSegment.id) : [];
        const updatedGraph = {
          ...graph,
          traces: [...remainingTraces, ...newSegments]
        };

        onCommitTransaction?.(updatedGraph);
        tunedCount++;
        showToast(`SUCCESS: Tuned Pair [${dp.name}] skew by appending serpentine delay bends (+${skew.toFixed(2)}mm) to shorter trace segment.`);
      } else {
        showToast("WARN: Straight segment of at least 2mm is required on shorter trace to place serpentine loops.");
      }
    });
  }, [board, graph, isReadOnly, onCommitTransaction, showToast]);

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomSensitivity = 0.005;
      setZoom(z => Math.max(0.1, z - e.deltaY * zoomSensitivity));
    } else {
      e.preventDefault();
      setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const lastTouchDistRef = useRef<number | null>(null);
  const initialTouchZoomRef = useRef<number>(1);

  const drcViolations = useMemo(() => runDRC(board), [board]);

  const startAutoFix = () => {
    if (isReadOnly) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setIsFixing(true);
    setFixProgress(0);
    intervalRef.current = setInterval(() => {
      setFixProgress(p => {
        if (p >= 100) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          timeoutRef.current = setTimeout(() => {
            setIsFixing(false);
            timeoutRef.current = null;
          }, 1000);
          return 100;
        }
        return p + 2;
      });
    }, 50);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let rAFId: number | null = null;
    const checkMobile = () => {
      if (rAFId) cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        const isM = window.innerWidth < 768;
        setIsMobile(prev => prev !== isM ? isM : prev);
      });
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
      if (rAFId) cancelAnimationFrame(rAFId);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="flex h-full bg-[#050505] text-gray-200 overflow-hidden relative">
      {/* Left Toolbar - Hide on Mobile, use floating tools instead */}
      {!isMobile && (
        <aside className="w-12 border-r border-white/5 bg-[#0d0d0d] flex flex-col items-center py-4 gap-4 shrink-0">
          {[
            { icon: <MousePointer2 size={18} />, active: isInteractive },
            { icon: <Activity size={18} /> },
            { icon: <Zap size={18} /> },
            { icon: <Layers size={18} /> },
            { icon: <Box size={18} /> },
          ].map((tool, i) => (
            <button 
              key={i} 
              disabled={isReadOnly}
              onClick={() => {
                if (!tool.active && isInteractive) showToast("INFO: Advanced routing coming in v4.1.");
              }}
              className={cn(
                "p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-all cursor-pointer",
                tool.active ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-gray-600 hover:text-white",
                isReadOnly && "opacity-40 cursor-not-allowed"
              )}
            >
              {tool.icon}
            </button>
          ))}
        </aside>
      )}

      {/* Main Canvas Area */}
      <main 
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            lastTouchDistRef.current = dist;
            initialTouchZoomRef.current = zoom;
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
            const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            const ratio = dist / lastTouchDistRef.current;
            const nextZoom = Math.min(3, Math.max(0.15, initialTouchZoomRef.current * ratio));
            setZoom(nextZoom);
          }
        }}
        onTouchEnd={() => {
          lastTouchDistRef.current = null;
        }}
        className="flex-1 relative bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] bg-[size:40px_40px] flex items-center justify-center overflow-hidden"
      >
        {isReadOnly && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500/15 backdrop-blur border border-amber-500/30 text-amber-400 text-[10px] px-3 py-1.5 rounded-full flex items-center gap-2 shadow-2xl z-40">
            <Info size={14} className="animate-pulse text-amber-400" />
            <span className="font-extrabold uppercase tracking-widest">{mode === 'replay' ? 'Replay Mode' : 'Inspect Mode'} Active &mdash; Board is Read-Only</span>
          </div>
        )}

        {/* The PCB Board Simulation */}
        <motion.div 
          ref={boardRef}
          onClick={handleBoardClick}
          className={cn("relative bg-[#111] border-[4px] border-[#1a1a1a] shadow-[0_0_100px_rgba(0,0,0,0.5),inset_0_0_40px_rgba(0,0,0,0.8)]", activeTool === 'route' ? "cursor-crosshair" : "")}
          style={{ width: 100 * processScale, height: 100 * processScale }} // Assuming 100x100mm board max for preview
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: zoom, opacity: 1 }}
          transition={{ type: 'tween', duration: 0 }}
          drag={activeTool !== 'route'}
          dragConstraints={{ left: -500, right: 500, top: -500, bottom: 500 }}
          dragElastic={0.05}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setIsDragging(false)}
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
          {isEdgeCutsVisible && (
            <BoardOutlineOverlay outlinePoints={board.outline.points} processScale={processScale} />
          )}

          {/* Render Committed Traces */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
            {board.traces.map(t => {
               const visible = t.layer === 'F.Cu' ? isFCuVisible : isBCuVisible;
               if (!visible) return null;
               // Viewport culling
               if (!isElementVisible(t.startX, t.startY, 2) && !isElementVisible(t.endX, t.endY, 2)) {
                   return null;
               }
               
               // Detect high speed differential trace
               const isDpTrace = board.diffPairs?.some((dp: any) => dp.positiveNetId === t.netId || dp.negativeNetId === t.netId)
                                 || t.netId.includes("USB_D") || t.netId.includes("_P") || t.netId.includes("_N");
               return (
                 <g key={t.id}>
                   {isDpTrace && (
                     <line 
                       x1={t.startX * processScale + 50 * processScale}
                       y1={t.startY * processScale + 50 * processScale}
                       x2={t.endX * processScale + 50 * processScale}
                       y2={t.endY * processScale + 50 * processScale}
                       stroke="#10b981"
                       strokeWidth={t.width * processScale + 6}
                       opacity="0.12"
                       strokeLinecap="round"
                     />
                   )}
                   <line 
                     key={t.id}
                     x1={t.startX * processScale + 50 * processScale}
                     y1={t.startY * processScale + 50 * processScale}
                     x2={t.endX * processScale + 50 * processScale}
                     y2={t.endY * processScale + 50 * processScale}
                     stroke={t.layer === 'F.Cu' ? '#ef4444' : '#3b82f6'}
                     strokeWidth={t.width * processScale}
                     strokeLinecap="round"
                   />
                 </g>
               );
            })}
          </svg>

          {/* Render Vias */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible">
            {(board.vias || []).map((v: any) => {
               if (!isElementVisible(v.x, v.y, 1)) return null;
               return (
                 <g key={v.id}>
                   <circle 
                     cx={v.x * processScale + 50 * processScale}
                     cy={v.y * processScale + 50 * processScale}
                     r={(v.padSize || 0.6) * processScale / 2}
                     fill="#fbbf24"
                     stroke="#d97706"
                     strokeWidth="1"
                   />
                   <circle 
                     cx={v.x * processScale + 50 * processScale}
                     cy={v.y * processScale + 50 * processScale}
                     r={(v.drillSize || 0.3) * processScale / 2}
                     fill="#111"
                   />
                 </g>
               );
            })}
          </svg>

          {/* Render Active Routing Ghost */}
          {activeTool === 'route' && routingState && (
            <>
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-40 overflow-visible">
                 <polyline 
                   points={[...routingState.points, pointerPos].map(p => `${p.x * processScale + 50 * processScale},${p.y * processScale + 50 * processScale}`).join(' ')}
                   fill="none"
                   stroke={routingState.layer === 'F.Cu' ? '#ef4444' : '#3b82f6'}
                   strokeWidth={routingState.width * processScale}
                   strokeLinecap="round"
                   strokeLinejoin="round"
                   opacity="0.6"
                 />
              </svg>
              {routingState.isDiffPair && routingState.otherPoints && (
                <>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-41 overflow-visible">
                     <polyline 
                       points={[...routingState.otherPoints, pointerPosOther].map(p => `${p.x * processScale + 50 * processScale},${p.y * processScale + 50 * processScale}`).join(' ')}
                       fill="none"
                       stroke={routingState.layer === 'F.Cu' ? '#10b981' : '#a855f7'}
                       strokeWidth={(routingState.diffPair?.width || routingState.width) * processScale}
                       strokeLinecap="round"
                       strokeLinejoin="round"
                       opacity="0.65"
                       strokeDasharray="4 2"
                     />
                  </svg>
                  {routingState.otherVias && routingState.otherVias.map((v: any, idx: number) => (
                    <svg key={`via_oth_${idx}`} className="absolute inset-0 w-full h-full pointer-events-none z-42 overflow-visible">
                       <circle 
                         cx={v.x * processScale + 50 * processScale}
                         cy={v.y * processScale + 50 * processScale}
                         r={0.6 * processScale / 2}
                         fill="#fbbf24"
                         stroke="#10b981"
                         strokeWidth="1.5"
                         opacity="0.8"
                       />
                       <circle 
                         cx={v.x * processScale + 50 * processScale}
                         cy={v.y * processScale + 50 * processScale}
                         r={0.3 * processScale / 2}
                         fill="#111"
                         opacity="0.8"
                       />
                    </svg>
                  ))}
                </>
              )}
            </>
          )}

          {/* Render Active Routing Vias */}
          {activeTool === 'route' && routingState && routingState.vias && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-45 overflow-visible">
               {routingState.vias.map((v: any, idx: number) => {
                 if (!isElementVisible(v.x, v.y, 1)) return null;
                 return (
                   <g key={idx}>
                     <circle 
                       cx={v.x * processScale + 50 * processScale}
                       cy={v.y * processScale + 50 * processScale}
                       r={0.6 * processScale / 2}
                       fill="#fbbf24"
                       opacity="0.6"
                     />
                     <circle 
                       cx={v.x * processScale + 50 * processScale}
                       cy={v.y * processScale + 50 * processScale}
                       r={0.3 * processScale / 2}
                       fill="#111"
                       opacity="0.6"
                     />
                   </g>
                 );
               })}
            </svg>
          )}

          {/* Render Pad & Components with pointer-events transparency optimization during dragging */}
          <div className={cn("absolute inset-0", isDragging && "pointer-events-none")}>
            {board.components.map((comp: any) => {
              const isSelected = selectedIds.includes(comp.id);
              // Viewport culling check for components
              if (!isElementVisible(comp.x, comp.y, 8)) {
                  return null;
              }
              return (
                <PCBComponentNode 
                  key={comp.id} 
                  comp={comp} 
                  isSelected={isSelected} 
                  processScale={processScale} 
                  showLabels={zoom >= 1.5}
                  isFCuVisible={isFCuVisible}
                  isBCuVisible={isBCuVisible}
                  isReadOnly={isReadOnly}
                  onSelect={onSelect} 
                  onPadClick={handlePadClick}
                  zoom={zoom}
                />
              );
            })}
          </div>

          {/* Ratsnest Lines */}
          <RatsnestLayer board={board} processScale={processScale} isElementVisible={isElementVisible} />
        </motion.div>

        {/* PCB Toolbar */}
        {!isReadOnly && !isMobile && (
          <div className="absolute top-1/2 -translate-y-1/2 left-6 z-40 flex flex-col gap-2 bg-[#0d0d0d]/90 backdrop-blur border border-white/10 rounded-2xl p-2 shadow-2xl">
            <button 
              onClick={() => { setActiveTool('select'); setRoutingState(null); }}
              className={cn(
                "p-3 rounded-xl transition-all cursor-pointer relative group",
                activeTool === 'select' ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-white"
              )}
            >
              <MousePointer2 size={18} />
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-[#222] text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-xl">Select Mode</div>
            </button>
            <button 
              onClick={() => { setActiveTool('route'); setRoutingState(null); }}
              className={cn(
                "p-3 rounded-xl transition-all cursor-pointer relative group",
                activeTool === 'route' ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-white"
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5l4 4"/><path d="M21 5l-4 4"/><path d="M5 19l4-4"/><path d="M21 19l-4-4"/><circle cx="12" cy="12" r="3"/></svg>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-[#222] text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-xl">Interactive Routing</div>
            </button>
          </div>
        )}

        {/* Floating View Controls */}
        <div className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#0d0d0d]/90 backdrop-blur border border-white/10 p-1 rounded-full shadow-2xl z-40">
           <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="p-3 md:p-2 text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center cursor-pointer active:scale-95"><Maximize2 size={14} className="rotate-45" /></button>
           <div className="h-4 w-[1px] bg-white/10" />
           <span className="text-[10px] font-mono font-bold text-gray-300 w-10 text-center">{Math.round(zoom * 100)}%</span>
           <div className="h-4 w-[1px] bg-white/10" />
           <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-3 md:p-2 text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center cursor-pointer active:scale-95"><Maximize2 size={14} /></button>
        </div>

        {/* Mobile Mini-Layers Toggle */}
        {isMobile && (
          <div className="absolute top-4 left-4 z-40 flex flex-col gap-2">
            <button 
              onClick={() => setMobileLayersOpen(!mobileLayersOpen)}
              className={cn(
                "p-3 rounded-2xl text-white transition-all min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer",
                mobileLayersOpen ? "bg-indigo-600 border border-indigo-500 shadow-lg shadow-indigo-600/30" : "bg-[#0d0d0d]/90 backdrop-blur border border-white/10"
              )}
            >
              <Layers size={18} />
            </button>
            
            <AnimatePresence>
              {mobileLayersOpen && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="w-48 bg-[#0d0d0d]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5 mt-1"
                >
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500 border-b border-white/5 pb-1.5 mb-1">Active Layers</p>
                  {layers.map(layer => (
                    <div 
                      key={layer.id} 
                      onClick={() => toggleLayer(layer.id)}
                      className="flex items-center justify-between cursor-pointer py-2 min-h-[44px] select-none active:opacity-75"
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2.5 h-2.5 rounded-full", layer.color, !layer.visible && "opacity-20")} />
                        <span className={cn("text-[9px] font-bold uppercase tracking-tight transition-colors", layer.visible ? "text-gray-300" : "text-gray-600")}>
                          {layer.id}
                        </span>
                      </div>
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                        layer.visible ? "bg-indigo-600/20 border-indigo-500 text-indigo-400" : "border-white/15 text-transparent"
                      )}>
                        <svg className="w-2.5 h-2.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="4">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Mobile Mini-DRC Floating Badge */}
        {isMobile && (
          <div className="absolute top-4 right-4 z-40">
            <button 
              onClick={startAutoFix}
              disabled={isFixing || isReadOnly}
              className={cn(
                "p-3 rounded-2xl transition-all min-h-[44px] flex items-center gap-2 border shadow-lg cursor-pointer active:scale-95 text-[9px] font-black uppercase tracking-widest",
                isFixing 
                  ? "bg-indigo-600/20 border-indigo-500 text-indigo-400"
                  : drcViolations.length === 0 
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              )}
            >
              <ShieldCheck size={16} className={isFixing ? "animate-spin" : ""} />
              <span>
                {isFixing 
                  ? `Fixing: ${Math.round(fixProgress)}%` 
                  : isReadOnly 
                    ? "DRC Check (Read-Only)" 
                    : drcViolations.length === 0 
                      ? "DRC: Clean" 
                      : `DRC: ${drcViolations.length} Errors`
                }
              </span>
            </button>
          </div>
        )}

        {/* High-Speed Differential Paired Routing HUD */}
        <AnimatePresence>
          {((routingState && routingState.isDiffPair) || (board.diffPairs && board.diffPairs.length > 0)) && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              className="absolute bottom-6 right-6 md:right-16 z-45 w-80 bg-[#0d0d0d]/95 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl flex flex-col gap-3 font-mono text-[10px] select-none"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white">HIGH-SPEED ROUTING HUD</span>
                </div>
                <span className="text-[8px] text-zinc-500 font-extrabold uppercase tracking-tight">ACTIVE PAIR</span>
              </div>

              {(() => {
                let dpName = "DEFAULT_PAIR";
                let pLen = 0;
                let nLen = 0;
                let targetImp = 90;
                let skewTol = 0.5;

                if (routingState && routingState.isDiffPair) {
                  dpName = routingState.diffPair.name;
                  const pTraces = board.traces.filter((t: any) => t.netId === routingState.diffPair.positiveNetId);
                  const nTraces = board.traces.filter((t: any) => t.netId === routingState.diffPair.negativeNetId);
                  const pBase = pTraces.reduce((sum: number, t: any) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
                  const nBase = nTraces.reduce((sum: number, t: any) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);

                  // Ghost drawing trace length calculation
                  const ghostPLen = routingState.points.reduce((sum: number, pt: any, idx: number, arr: any[]) => {
                    if (idx === 0) return 0;
                    return sum + Math.hypot(pt.x - arr[idx-1].x, pt.y - arr[idx-1].y);
                  }, 0) + Math.hypot(pointerPos.x - (routingState.points[routingState.points.length-1]?.x || pointerPos.x), pointerPos.y - (routingState.points[routingState.points.length-1]?.y || pointerPos.y));

                  const ghostNLen = routingState.otherPoints?.reduce((sum: number, pt: any, idx: number, arr: any[]) => {
                    if (idx === 0) return 0;
                    return sum + Math.hypot(pt.x - arr[idx-1].x, pt.y - arr[idx-1].y);
                  }, 0) + Math.hypot(pointerPosOther.x - (routingState.otherPoints?.[routingState.otherPoints.length-1]?.x || pointerPosOther.x), pointerPosOther.y - (routingState.otherPoints?.[routingState.otherPoints.length-1]?.y || pointerPosOther.y)) || 0;

                  pLen = pBase + ghostPLen;
                  nLen = nBase + ghostNLen;
                  targetImp = routingState.diffPair.targetImpedance || 90;
                  skewTol = routingState.diffPair.skewTolerance || 0.5;
                } else {
                  const firstPair = board.diffPairs?.[0] || {
                    name: "USB_D",
                    positiveNetId: board.nets.find((n: any) => n.name.includes("+") || n.name.includes("_P"))?.id || "",
                    negativeNetId: board.nets.find((n: any) => n.name.includes("-") || n.name.includes("_N"))?.id || "",
                    spacing: 0.25,
                    width: 0.15,
                    skewTolerance: 0.5,
                    targetImpedance: 90
                  };
                  dpName = firstPair.name;
                  pLen = board.traces.filter((t: any) => t.netId === firstPair.positiveNetId).reduce((sum: number, t: any) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
                  nLen = board.traces.filter((t: any) => t.netId === firstPair.negativeNetId).reduce((sum: number, t: any) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
                  targetImp = firstPair.targetImpedance || 90;
                  skewTol = firstPair.skewTolerance || 0.5;
                }

                const skew = Math.abs(pLen - nLen);
                const isSymmetric = skew <= skewTol;

                return (
                  <>
                    <div className="flex flex-col gap-1.5 text-[10px]">
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>CHANNEL ID:</span>
                        <span className="text-white font-black text-xs">{dpName}</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-400 mt-1">
                        <span>ARM D+ (POS):</span>
                        <span className="text-red-400 font-bold font-mono">{pLen.toFixed(2)} mm</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>ARM D- (NEG):</span>
                        <span className="text-emerald-400 font-bold font-mono">{nLen.toFixed(2)} mm</span>
                      </div>
                      <div className="flex justify-between items-center font-bold mt-1.5 border-t border-white/5 pt-1.5">
                        <span className="text-zinc-400">LENGTH SKEW:</span>
                        <span className={cn(isSymmetric ? "text-emerald-400" : "text-rose-400", "font-black text-[11px]")}>
                          {skew.toFixed(2)} mm {isSymmetric ? "✔ (PASS)" : "✘ (TUNE)"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-400 text-[9px]">
                        <span>TOLERANCE LIMIT:</span>
                        <span className="text-zinc-300">± {skewTol} mm</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-400 text-[9px]">
                        <span>COUPLED IMPEDANCE:</span>
                        <span className="text-indigo-400 font-bold">{targetImp} Ω (FR4 Microstrip)</span>
                      </div>
                    </div>

                    {!isReadOnly && (
                      <button
                        onClick={triggerSerpentineTuning}
                        className="w-full mt-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-[9px] uppercase font-bold tracking-widest transition-colors cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-activity"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                        APPLY SERPENTINE DELAY TUNE
                      </button>
                    )}
                  </>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Local Toast Overlay */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#0d0d0d] border border-white/10 text-white text-xs px-4 py-2 rounded-lg shadow-2xl tracking-widest uppercase font-bold"
            >
              {toastMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Right Sidebar - Layers & Inspector */}
      {!isMobile && (
        <aside className="w-64 border-l border-white/5 bg-[#0d0d0d] flex flex-col shrink-0 overflow-hidden">
          {/* Tab switches */}
          <div className="flex border-b border-white/5 h-12 bg-[#0a0a0a] items-center shrink-0">
            <button
              onClick={() => setRightSidebarTab('board')}
              className={cn(
                "flex-1 h-full text-[9px] uppercase font-black tracking-widest transition-all",
                rightSidebarTab === 'board'
                  ? "text-white bg-[#0d0d0d] border-b-2 border-indigo-500"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              System
            </button>
            <button
              onClick={() => setRightSidebarTab('constraints')}
              className={cn(
                "flex-1 h-full text-[9px] uppercase font-black tracking-widest transition-all border-l border-white/5",
                rightSidebarTab === 'constraints'
                  ? "text-white bg-[#0d0d0d] border-b-2 border-indigo-500"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Constraints
            </button>
          </div>

          {rightSidebarTab === 'board' ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              {/* Layers Group */}
              <div className="p-4 space-y-4 shrink-0">
                <h4 className="text-[9px] uppercase tracking-[0.1em] font-extrabold text-gray-500">Board Layers</h4>
                <div className="space-y-3">
                  {layers.map(layer => (
                    <div key={layer.id} className="flex items-center justify-between group cursor-pointer" onClick={() => toggleLayer(layer.id)}>
                      <div className="flex items-center gap-3">
                          <div className={cn("w-3 h-3 rounded-full", layer.color, !layer.visible && "opacity-20")} />
                          <span className={cn("text-[11px] font-bold uppercase tracking-tight transition-colors", layer.visible ? "text-gray-300" : "text-gray-600")}>
                            {layer.name}
                          </span>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id); }}>
                          <Eye size={14} className={cn(layer.visible ? "text-gray-400" : "text-gray-700")} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* DRC Status */}
              <div className="px-4 py-3 border-y border-white/5 bg-[#0a0a0a] shrink-0">
                <h4 className="text-[9px] uppercase tracking-[0.1em] font-extrabold text-gray-400 mb-2">DRC Status</h4>
                {drcViolations.length === 0 ? (
                   <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold">
                     <ShieldCheck size={12} /> Design passes basic DRC.
                   </div>
                ) : (
                   <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                     {drcViolations.map(err => (
                       <div key={err.id} className="text-[9px] text-rose-400 bg-rose-500/5 p-2 border border-rose-500/10 rounded-xl flex flex-col gap-0.5">
                         <span className="font-extrabold uppercase text-[8px] text-rose-300 tracking-wider">● {err.type}</span>
                         <span className="leading-tight">{err.message}</span>
                       </div>
                     ))}
                   </div>
                )}
              </div>

              {/* System Action buttons at bottom */}
              <div className="mt-auto p-4 bg-[#0a0a0a] shrink-0 border-t border-white/5">
                <div className="p-4 bg-white/2 border border-white/5 rounded-2xl flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-gray-500">Unrouted Nets</span>
                      <span className="text-xs font-mono font-bold text-white">{board.ratnest.length} Airwires</span>
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    <button 
                      onClick={startAutoFix}
                      disabled={isFixing || isReadOnly}
                      className="w-full py-2 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                        <ShieldCheck size={14} className={isFixing ? "animate-spin" : ""} />
                        {isReadOnly ? `${mode === 'replay' ? 'Replay' : 'Inspect'} Mode (Read)` : isFixing ? `Scanning...` : "Run AI DRC Check"}
                    </button>

                    <button 
                      onClick={() => setShowThreeD(true)}
                      className="w-full py-2 bg-indigo-600/10 hover:bg-indigo-600/25 border border-indigo-500/20 text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <Maximize2 size={14} />
                        Interactive 3D View
                    </button>

                    <button 
                      onClick={() => setShowExportModal(true)}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/10"
                    >
                        <Settings size={14} />
                        Export Gerber/PnP
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4 font-mono text-[10px]">
              
              {/* Part A: SELECT OR EDIT NET CLASSES */}
              <div className="space-y-2 border-b border-white/5 pb-4 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase font-extrabold tracking-widest text-zinc-400">NET CLASS EDITOR</span>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setShowAddClassModal(true)}
                      title="Add net class"
                      className="p-1 px-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded cursor-pointer transition-all flex items-center justify-center"
                    >
                      <Plus size={10} />
                    </button>
                    {selectedNetClassId !== 'nc-default' && (
                      <button 
                        onClick={() => handleDeleteNetClass(selectedNetClassId)}
                        title="Delete selected class"
                        className="p-1 px-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded cursor-pointer transition-all flex items-center justify-center"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                </div>

                <select 
                  value={selectedNetClassId}
                  onChange={(e) => setSelectedNetClassId(e.target.value)}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl p-2 text-white font-mono text-[11px] outline-none cursor-pointer"
                >
                  {activeNetClasses.map(nc => (
                    <option key={nc.id} value={nc.id}>{nc.name}</option>
                  ))}
                </select>

                {/* FIELDS FOR THE SELECTED NET CLASS */}
                {(() => {
                  const activeClass = activeNetClasses.find(nc => nc.id === selectedNetClassId);
                  if (!activeClass) return null;

                  return (
                    <div className="space-y-3 mt-3 bg-[#111111]/40 border border-white/5 rounded-xl p-3">
                      
                      {/* Inheritance Dropdown */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] text-zinc-500 font-extrabold uppercase">INHERITS FROM</span>
                        <select 
                          value={(activeClass as any).parentId || "DEFAULT"}
                          onChange={(e) => handleUpdateNetClass(selectedNetClassId, { parentId: e.target.value === "DEFAULT" ? undefined : e.target.value })}
                          className="w-full bg-[#181818] border border-white/5 rounded px-1.5 py-1 text-zinc-300 text-[10px] outline-none cursor-pointer"
                        >
                          <option value="DEFAULT">DEFAULT Class (root)</option>
                          {activeNetClasses.filter(nc => nc.id !== selectedNetClassId && nc.name !== "DEFAULT").map(nc => (
                            <option key={nc.id} value={nc.id}>{nc.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Widths values */}
                      <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] text-zinc-500 font-extrabold">MIN WIDTH (mm)</span>
                          <input 
                            type="number"
                            step="0.05"
                            min="0.1"
                            value={activeClass.minWidth}
                            onChange={(e) => handleUpdateNetClass(selectedNetClassId, { minWidth: parseFloat(e.target.value) || 0.1 })}
                            className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] text-zinc-500 font-extrabold">PREF WIDTH (mm)</span>
                          <input 
                            type="number"
                            step="0.05"
                            min="0.10"
                            value={(activeClass as any).preferredWidth ?? activeClass.minWidth}
                            onChange={(e) => handleUpdateNetClass(selectedNetClassId, { preferredWidth: parseFloat(e.target.value) || activeClass.minWidth })}
                            className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center"
                          />
                        </div>
                      </div>

                      {/* Clearances spacing */}
                      <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] text-zinc-500 font-extrabold">CLEARANCE (mm)</span>
                          <input 
                            type="number"
                            step="0.05"
                            min="0.1"
                            value={activeClass.minSpacing}
                            onChange={(e) => handleUpdateNetClass(selectedNetClassId, { minSpacing: parseFloat(e.target.value) || 0.1 })}
                            className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] text-zinc-500 font-extrabold">IMPEDANCE (Ω)</span>
                          <input 
                            type="number"
                            step="5"
                            placeholder="None"
                            value={activeClass.impedanceOhms || ""}
                            onChange={(e) => handleUpdateNetClass(selectedNetClassId, { impedanceOhms: parseInt(e.target.value) || undefined })}
                            className="bg-[#181818] text-indigo-300 border border-white/10 rounded p-1 placeholder:text-zinc-700 outline-none text-center"
                          />
                        </div>
                      </div>

                      {/* Via Config */}
                      <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] text-zinc-500 font-extrabold">VIA DRILL (mm)</span>
                          <input 
                            type="number"
                            step="0.05"
                            min="0.1"
                            value={activeClass.viaSize?.drillSize ?? 0.3}
                            onChange={(e) => handleUpdateNetClass(selectedNetClassId, { 
                              viaSize: { 
                                drillSize: parseFloat(e.target.value) || 0.3,
                                padSize: activeClass.viaSize?.padSize || 0.6
                              } 
                            })}
                            className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] text-zinc-500 font-extrabold">VIA PAD (mm)</span>
                          <input 
                            type="number"
                            step="0.05"
                            min="0.2"
                            value={activeClass.viaSize?.padSize ?? 0.6}
                            onChange={(e) => handleUpdateNetClass(selectedNetClassId, { 
                              viaSize: { 
                                drillSize: activeClass.viaSize?.drillSize || 0.3, 
                                padSize: parseFloat(e.target.value) || 0.6 
                              } 
                            })}
                            className="bg-[#181818] text-white border border-white/10 rounded p-1 outline-none text-center"
                          />
                        </div>
                      </div>

                      {/* Matched Length Setup */}
                      <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] text-zinc-500 font-extrabold">LENGTH TARGET (mm)</span>
                          <input 
                            type="number"
                            placeholder="None"
                            value={(activeClass as any).lengthTarget || ""}
                            onChange={(e) => handleUpdateNetClass(selectedNetClassId, { lengthTarget: parseFloat(e.target.value) || undefined })}
                            className="bg-[#181818] text-emerald-300 border border-white/10 rounded p-1 placeholder:text-zinc-700 outline-none text-center"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] text-zinc-500 font-extrabold">TOLERANCE (mm)</span>
                          <input 
                            type="number"
                            step="0.1"
                            placeholder="±0.5"
                            value={(activeClass as any).lengthTolerance || ""}
                            onChange={(e) => handleUpdateNetClass(selectedNetClassId, { lengthTolerance: parseFloat(e.target.value) || undefined })}
                            className="bg-[#181818] text-zinc-300 border border-white/10 rounded p-1 placeholder:text-zinc-700 outline-none text-center"
                          />
                        </div>
                      </div>

                      {/* Layer Permissions Checkboxes */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] text-zinc-500 font-extrabold uppercase">ROUTING LAYERS APPROVED</span>
                        <div className="flex items-center gap-3 text-[9px] text-zinc-300 mt-1">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={!((activeClass as any).allowedLayers?.length) || (activeClass as any).allowedLayers.includes("F.Cu")}
                              onChange={(e) => {
                                const allowed: string[] = (activeClass as any).allowedLayers || ["F.Cu", "B.Cu"];
                                const next = e.target.checked 
                                  ? [...allowed, "F.Cu"] 
                                  : allowed.filter(l => l !== "F.Cu");
                                handleUpdateNetClass(selectedNetClassId, { allowedLayers: next.length ? next : ["F.Cu"] });
                              }}
                              className="accent-indigo-500"
                            />
                            <span>Top (F.Cu)</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={!((activeClass as any).allowedLayers?.length) || (activeClass as any).allowedLayers.includes("B.Cu")}
                              onChange={(e) => {
                                const allowed: string[] = (activeClass as any).allowedLayers || ["F.Cu", "B.Cu"];
                                const next = e.target.checked 
                                  ? [...allowed, "B.Cu"] 
                                  : allowed.filter(l => l !== "B.Cu");
                                handleUpdateNetClass(selectedNetClassId, { allowedLayers: next.length ? next : ["B.Cu"] });
                              }}
                              className="accent-indigo-500"
                            />
                            <span>Bottom (B.Cu)</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Part B: NETS ASSOCIATION SECTION */}
              <div className="space-y-2 border-b border-white/5 pb-4 max-h-48 flex flex-col min-h-0">
                <span className="text-[9px] uppercase font-extrabold tracking-widest text-zinc-400 shrink-0">ASSIGN NETS TO CLASSES</span>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                  {board.nets.map(net => {
                    const activeClass = activeNetClasses.find(nc => nc.name === (net as any).netClass) || activeNetClasses.find(nc => nc.name === 'DEFAULT') || { id: 'nc-default', name: 'DEFAULT' };
                    return (
                      <div key={net.id} className="flex items-center justify-between gap-2 p-1.5 bg-[#141414]/60 border border-white/5 rounded-lg text-[9px]">
                        <span className="font-bold text-white truncate max-w-[80px]" title={net.name}>{net.name}</span>
                        <select
                          value={activeClass.id}
                          onChange={(e) => {
                            const newClass = activeNetClasses.find(nc => nc.id === e.target.value);
                            if (newClass) handleAssignNetClass(net.id, newClass.name);
                          }}
                          className="bg-[#1c1c1c] border border-white/10 rounded px-1.5 py-0.5 text-zinc-300 max-w-[124px] outline-none cursor-pointer"
                        >
                          {activeNetClasses.map(nc => (
                            <option key={nc.id} value={nc.id}>{nc.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Part C: MATCHED DIFFERENTIAL PAIR GROUPS */}
              <div className="space-y-2 flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between shrink-0">
                  <span className="text-[9px] uppercase font-extrabold tracking-widest text-zinc-400">DIFFERENTIAL PAIRS</span>
                  <button 
                    onClick={() => setShowAddDpModal(true)}
                    className="p-1 px-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded cursor-pointer transition-all flex items-center justify-center"
                  >
                    <Plus size={10} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                  {activeDiffPairs.length === 0 ? (
                    <div className="text-[9px] text-zinc-600 italic py-2 leading-tight">No matched pair configuration found. Click (+) to group companion signals.</div>
                  ) : (
                    activeDiffPairs.map(dp => {
                      const posNetName = board.nets.find(n => n.id === dp.positiveNetId)?.name || 'None';
                      const negNetName = board.nets.find(n => n.id === dp.negativeNetId)?.name || 'None';
                      return (
                        <div key={dp.id} className="p-2 border border-white/5 bg-[#111] rounded-xl relative group">
                          <div className="flex justify-between items-center border-b border-white/5 pb-1 mb-1.5">
                            <span className="font-extrabold text-[#10b981] text-[10px] uppercase tracking-wider">{dp.name}</span>
                            <button
                              onClick={() => handleDeleteDiffPair(dp.id)}
                              className="text-zinc-650 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                          <div className="space-y-1 text-[8px] text-zinc-400">
                            <div className="flex justify-between">
                              <span>P+ SIGNAL:</span>
                              <span className="text-white font-bold">{posNetName}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>N- SIGNAL:</span>
                              <span className="text-white font-bold">{negNetName}</span>
                            </div>
                            <div className="flex justify-between border-t border-white/5 pt-1 mt-1 font-bold text-zinc-500">
                              <span>W / S Target:</span>
                              <span className="text-[#10b981]">{dp.width} / {dp.spacing} mm</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Skew Tolerance:</span>
                              <span className="text-amber-400">±{dp.skewTolerance} mm</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          )}
        </aside>
      )}
      {showThreeD && (
        <ThreeDBoardViewer board={board} onClose={() => setShowThreeD(false)} />
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#0c0c12] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col p-6 text-gray-200">
             <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                   <h3 className="text-sm font-black uppercase tracking-wider text-white">7-Target Production Export Deck</h3>
                   <p className="text-[10px] text-gray-500 font-mono">Download standard compliant manufacturing data packages</p>
                </div>
                <button 
                  onClick={() => setShowExportModal(false)}
                  className="text-xs bg-white/5 hover:bg-white/10 text-gray-300 font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                >
                  Close
                </button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-6">
                {/* Gerber Layer Files Group */}
                <div className="border border-white/5 bg-[#07070d]/50 rounded-xl p-4 space-y-3">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-[#a855f7]">1. Gerber Photoplot Files (RS-274X)</h4>
                   <p className="text-[9px] text-gray-500 leading-relaxed font-mono">Standard 2:4 decimal inch Gerber files for automated optical plotters.</p>
                   <div className="flex flex-col gap-1.5 pt-1">
                      <button 
                        onClick={() => triggerDownload("F.Cu.gbr", generateGerberRS274X(board, "F.Cu"))}
                        className="w-full py-1.5 hover:bg-white/5 text-[9px] font-mono hover:text-white border border-white/5 bg-transparent rounded text-left px-3 text-gray-400 capitalize transition-all"
                      >
                        ⚡ Plot Top Copper (F.Cu)
                      </button>
                      <button 
                        onClick={() => triggerDownload("B.Cu.gbr", generateGerberRS274X(board, "B.Cu"))}
                        className="w-full py-1.5 hover:bg-white/5 text-[9px] font-mono hover:text-white border border-white/5 bg-transparent rounded text-left px-3 text-gray-400 capitalize transition-all"
                      >
                        ⚡ Plot Bottom Copper (B.Cu)
                      </button>
                      <button 
                        onClick={() => triggerDownload("F.Silkscreen.gbr", generateGerberRS274X(board, "F.Silkscreen"))}
                        className="w-full py-1.5 hover:bg-white/5 text-[9px] font-mono hover:text-white border border-white/5 bg-transparent rounded text-left px-3 text-gray-400 capitalize transition-all"
                      >
                        ⚡ Plot Top Silkscreen (F.Silk)
                      </button>
                      <button 
                        onClick={() => triggerDownload("Edge.Cuts.gbr", generateGerberRS274X(board, "Edge.Cuts"))}
                        className="w-full py-1.5 hover:bg-white/5 text-[9px] font-mono hover:text-white border border-white/5 bg-transparent rounded text-left px-3 text-gray-400 capitalize transition-all"
                      >
                        ⚡ Plot Board Outline (Edge.Cuts)
                      </button>
                   </div>
                </div>

                {/* Drilling & Netlists Group */}
                <div className="border border-white/5 bg-[#07070d]/50 rounded-xl p-4 flex flex-col justify-between">
                   <div className="space-y-3">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-[#10b981]">2. Drills, Netlists & assembly</h4>
                      <p className="text-[9px] text-gray-500 leading-relaxed font-mono">Standard numerical drilling coordinates and electrical tracing descriptors.</p>
                      <div className="flex flex-col gap-1.5 pt-1">
                         <button 
                           onClick={() => triggerDownload("board.drl", generateExcellonDrill(board))}
                           className="w-full py-2 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 rounded text-[9px] font-mono text-left px-3 transition-all"
                         >
                           ⚙️ Excellon NC Drill File (.drl)
                         </button>
                         <button 
                           onClick={() => triggerDownload("netlist.ipc", generateIPCD356Netlist(board))}
                           className="w-full py-2 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 rounded text-[9px] font-mono text-left px-3 transition-all"
                         >
                           ⚙️ IPC-D-356 Netlist descriptor (.ipc)
                         </button>
                         <button 
                           onClick={() => triggerDownload("pick_and_place.csv", generatePickAndPlaceCSV(board))}
                           className="w-full py-2 bg-[#1e1b4b]/50 hover:bg-[#1e1b4b] border border-indigo-500/10 text-gray-300 rounded text-[9px] font-mono text-left px-3 transition-all"
                         >
                           ⚙️ Pick-and-Place Centroid CSV (.csv)
                         </button>
                      </div>
                   </div>

                   <button 
                     onClick={() => triggerDownload("bom.csv", generateBOMCSV(board))}
                     className="w-full mt-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-black uppercase tracking-wider transition-all"
                   >
                     📋 Download Consolidated BOM (.csv)
                   </button>
                </div>
             </div>

             <div className="border-t border-white/5 pt-4 text-center">
                <p className="text-[9px] text-gray-600 font-mono">All files are generated strictly on client side according to industry-standard specifications.</p>
             </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD NET CLASS */}
      {showAddClassModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-[#0b0b0f] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-gray-200 font-mono text-xs">
            <h3 className="text-sm font-black uppercase tracking-wider text-white border-b border-white/5 pb-3 mb-4">Add Custom Net Class</h3>
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-zinc-400 font-extrabold uppercase">class name (e.g. CLOCK, HIGH_POWER)</span>
                <input 
                  type="text"
                  placeholder="POWER_CLASS"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="bg-[#141419] text-white border border-white/10 rounded-xl p-2.5 outline-none font-bold placeholder:text-zinc-700"
                />
              </div>
              <div className="flex gap-2 pt-2 justify-end">
                <button 
                  onClick={() => { setShowAddClassModal(false); setNewClassName(""); }}
                  className="px-4 py-2 hover:bg-white/5 border border-white/5 text-zinc-400 rounded-xl uppercase font-extrabold text-[10px] tracking-widest cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleAddNetClass(newClassName)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-550 text-white rounded-xl uppercase font-extrabold text-[10px] tracking-widest cursor-pointer"
                >
                  Create Class
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTER DIFFERENTIAL PAIR */}
      {showAddDpModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-[#0b0b0f] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 text-gray-200 font-mono text-xs">
            <h3 className="text-sm font-black uppercase tracking-wider text-white border-b border-white/5 pb-3 mb-4">Register Differential Pair</h3>
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-zinc-400 font-extrabold uppercase">PAIR NAME (e.g. HS_USB, HDMI0_D0)</span>
                <input 
                  type="text"
                  placeholder="USB_D"
                  value={newDpName}
                  onChange={(e) => setNewDpName(e.target.value)}
                  className="bg-[#141419] text-white border border-white/10 rounded-xl p-2.5 outline-none font-bold placeholder:text-zinc-700"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-zinc-400 font-extrabold uppercase">POSITIVE ARM NET (+)</span>
                <select 
                  value={newDpPosNet}
                  onChange={(e) => setNewDpPosNet(e.target.value)}
                  className="bg-[#141419] border border-white/10 rounded-xl p-2.5 text-white font-mono text-xs outline-none cursor-pointer"
                >
                  <option value="">-- Select Net --</option>
                  {board.nets.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-zinc-400 font-extrabold uppercase">NEGATIVE ARM NET (-)</span>
                <select 
                  value={newDpNegNet}
                  onChange={(e) => setNewDpNegNet(e.target.value)}
                  className="bg-[#141419] border border-white/10 rounded-xl p-2.5 text-white font-mono text-xs outline-none cursor-pointer"
                >
                  <option value="">-- Select Net --</option>
                  {board.nets.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>

              <div className="flex gap-2 pt-2 justify-end">
                <button 
                  onClick={() => { setShowAddDpModal(false); setNewDpName(""); setNewDpPosNet(""); setNewDpNegNet(""); }}
                  className="px-4 py-2 hover:bg-white/5 border border-white/5 text-zinc-400 rounded-xl uppercase font-extrabold text-[10px] tracking-widest cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateDiffPair}
                  className="px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl uppercase font-extrabold text-[10px] tracking-widest cursor-pointer"
                >
                  Register pair
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default PCBEditor;
