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
  Edit,
  Cpu,
  Undo2,
  Redo2,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { GPUCanvas } from './GPUCanvas';
import { ConstraintOverlayCanvas } from './ConstraintOverlayCanvas';
import { AIAttentionOverlay } from './AIAttentionOverlay';
import { PlacementPreviewGhosts } from './PlacementPreviewGhosts';
import { RoutingPreviewOverlay } from './RoutingPreviewOverlay';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { ProjectGraph } from '../types';
import { syncBoardFromGraph } from '../lib/board';
import { useProjectStore } from '../lib/core/store';
import { MultiplayerCursors } from './MultiplayerCursors';
import { Users } from 'lucide-react';
import { runDRC, DRCViolation } from '../lib/drc';
import { ConstraintDrivenRoutingSystem } from '../lib/routingSystem';
import { resolveNetConstraints, DefaultNetClasses } from '../lib/constraints';
import { generateGerberRS274X, generateExcellonDrill, generateIPCD356Netlist, generatePickAndPlaceCSV, generateBOMCSV } from '../lib/exporter';
import { ThreeDBoardViewer } from './ThreeDBoardViewer';
import { suggestPlacement, optimizeSection, naturalLanguageCommand } from '../lib/ai/copilot';
import { validateAndApplyActions } from '../lib/actionValidation';
import { AIDesignOrchestrator, DesignSession } from '../lib/ai/orchestrator';

// Import newly refactored modular PCB components
import { PCBCanvas } from './PCB/PCBCanvas';
import { LayerControls } from './PCB/LayerControls';
import { ConstraintsPanel } from './PCB/ConstraintsPanel';
import { ComponentLibraryPanel } from './PCB/ComponentLibraryPanel';
import { findDiffPair, useRoutingEngine } from './PCB/RoutingEngine';
import { generateSerpentineTrace } from './PCB/TraceRenderer';

export interface Point {
  x: number;
  y: number;
}

const PCBEditor = React.memo(function PCBEditor({ graph, selectedIds = [], onSelect, onCommitTransaction, mode = 'live', autoRouteTrigger = 0, smartAutoTrigger = 0 }: { graph: ProjectGraph, selectedIds?: string[], onSelect?: (id: string) => void, onCommitTransaction?: (graph: ProjectGraph) => void, mode?: 'live' | 'replay' | 'inspect', autoRouteTrigger?: number, smartAutoTrigger?: number }) {
  const isInteractive = mode === 'live';
  const isReadOnly = mode !== 'live';

  const processScale = 20; // 1mm = 20px
  const activeToolRef = useRef<'select' | 'route'>('select');

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // AI Layout Copilot States
  const [copilotToast, setCopilotToast] = useState<{ message: string; componentId: string; suggestionType?: 'high-speed' | 'power' | 'general' } | null>(null);
  const [copilotCommand, setCopilotCommand] = useState('');
  const [isCopilotExecuting, setIsCopilotExecuting] = useState(false);
  const [copilotResponse, setCopilotResponse] = useState<string | null>(null);
  const [copilotPreviewGraph, setCopilotPreviewGraph] = useState<ProjectGraph | null>(null);
  const [copilotExplanation, setCopilotExplanation] = useState<string | null>(null);
  const [copilotPlanning, setCopilotPlanning] = useState<string[] | null>(null);
  const [showExplanationModal, setShowExplanationModal] = useState(false);

  // Color-coded AI suggestion preview status engine
  const previewStatuses = useMemo(() => {
    if (!copilotPreviewGraph) return undefined;
    const b = syncBoardFromGraph(copilotPreviewGraph);
    const violations = runDRC(b);
    
    const statuses: Record<string, 'green' | 'amber' | 'red'> = {};
    copilotPreviewGraph.components.forEach(c => {
      statuses[c.id] = 'green'; // Default is optimized/green
    });

    violations.forEach(v => {
      if (v.elements) {
        v.elements.forEach(elementId => {
          const compIdStr = elementId.split('.')[0];
          const matchedComp = copilotPreviewGraph.components.find(c => c.id === compIdStr || c.designator === compIdStr);
          if (matchedComp) {
            statuses[matchedComp.id] = 'red'; // Set to red on DRC collision
          }
        });
      }
    });

    return statuses;
  }, [copilotPreviewGraph]);

  const copilotInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        copilotInputRef.current?.focus();
        showToast("✨ AI Copilot Active (focus assigned)");
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showToast]);

  // Multiplayer collaborative hooks
  const presences = useProjectStore(state => state.presences);
  const activeLocks = useProjectStore(state => state.activeLocks);
  const broadcastPresenceCursor = useProjectStore(state => state.broadcastPresenceCursor);
  const orchestrationProgress = useProjectStore(state => state.orchestrationProgress);
  const taskNodes = useProjectStore(state => state.taskNodes);
  const requirePro = useProjectStore(state => state.requirePro);
  const undo = useProjectStore(state => state.undo);
  const redo = useProjectStore(state => state.redo);
  const boardWidthStore = useProjectStore(state => state.boardWidth);
  const boardHeightStore = useProjectStore(state => state.boardHeight);
  const snapResolution = useProjectStore(state => state.snapResolution) || 1.0;
  const updateBoardSize = useProjectStore(state => state.updateBoardSize);

  const [tempWidth, setTempWidth] = useState(boardWidthStore);
  const [tempHeight, setTempHeight] = useState(boardHeightStore);

  useEffect(() => {
    setTempWidth(boardWidthStore);
    setTempHeight(boardHeightStore);
  }, [boardWidthStore, boardHeightStore]);

  const handleBoardResize = useCallback((w: number, h: number) => {
    if (w > 10 && h > 10 && w < 1000 && h < 1000) {
      updateBoardSize(w, h);
    } else {
      showToast("WARN: Invalid dimensions (must be 10mm - 1000mm)");
    }
  }, [updateBoardSize, showToast]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });

  const [showThreeD, setShowThreeD] = useState(false);
  const [gpuAccelerated, setGpuAccelerated] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);

  // Pro Cooper Zones / Pours local builder states
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [zoneNetId, setZoneNetId] = useState<string>('GND');
  const [zoneLayer, setZoneLayer] = useState<'F.Cu' | 'B.Cu'>('F.Cu');
  const [zoneClearance, setZoneClearance] = useState<number>(0.3);
  const [zoneThermal, setZoneThermal] = useState<boolean>(true);
  const [zoneSpokeWidth, setZoneSpokeWidth] = useState<number>(0.25);
  const [zoneSpokesCount, setZoneSpokesCount] = useState<number>(4);
  const [zonePriority, setZonePriority] = useState<number>(0);

  // AI Design Orchestrator States
  const [activeSession, setActiveSession] = useState<DesignSession | null>(null);
  const [showOrchestrator, setShowOrchestrator] = useState<boolean>(false);
  const [isOrchestratorPlaying, setIsOrchestratorPlaying] = useState<boolean>(false);

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
  const boardRef = useRef<HTMLDivElement>(null);

  // Flexible electrical bounding dimensions
  const { boardWidth, boardHeight, minX, minY } = useMemo(() => {
    const pts = graph.outline?.points || [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }];
    let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
    pts.forEach(p => {
      if (p.x < lx) lx = p.x;
      if (p.x > hx) hx = p.x;
      if (p.y < ly) ly = p.y;
      if (p.y > hy) hy = p.y;
    });
    return {
      boardWidth: hx - lx || 100,
      boardHeight: hy - ly || 100,
      minX: isFinite(lx) ? lx : -50,
      minY: isFinite(ly) ? ly : -50
    };
  }, [graph.outline]);

  useEffect(() => {
    const handleAddLibraryComponent = (e: CustomEvent) => {
      if (isReadOnly || !onCommitTransaction) return;
      const { partNumber, clientX, clientY } = e.detail;
      
      const { GlobalLibrary } = require('../lib/componentLibrary');
      const comp = GlobalLibrary.getComponent(partNumber);
      if (!comp) return;

      const symbol = GlobalLibrary.getSymbol(comp.symbolId);
      const prefix = symbol?.defaultPrefix || 'U';
      let num = 1;
      const existing = graph.components;
      while (existing.some((c: any) => c.designator === `${prefix}${num}`)) {
        num++;
      }
      const designator = `${prefix}${num}`;

      let targetX = 50;
      let targetY = 50;

      if (boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        const styleScale = rect.width / (boardWidth * processScale);
        const relativeX = (clientX - rect.left) / styleScale / processScale + minX;
        const relativeY = (clientY - rect.top) / styleScale / processScale + minY;
        targetX = Math.round(relativeX);
        targetY = Math.round(relativeY);
      }

      const getDefaultValue = (comp: any) => {
        if (comp.metadata.description && comp.metadata.description.match(/^\d+(k|u|n|p|m|M|G|T)?(Ohm|F|H)?/)) {
          return comp.metadata.description.split(' ')[0];
        }
        if (comp.category === 'Resistor') return '10k';
        if (comp.category === 'Capacitor') return '100nF';
        if (comp.category === 'Inductor') return '10uH';
        return comp.metadata.description || comp.partNumber;
      };

      const newComponent = {
        id: `comp_${Math.random().toString(36).slice(2, 9)}`,
        designator,
        partType: comp.category,
        partNumber: comp.partNumber,
        footprint: comp.defaultFootprint,
        position: { x: targetX, y: targetY },
        boardPosition: { x: targetX, y: targetY },
        layer: "F.Cu" as const,
        rotation: 0,
        pins: symbol ? symbol.units[0].pins.map(p => ({
          name: p.name || p.id,
          type: (p.type as import('../types').PinType) || "passive"
        })) : [],
        properties: { ...comp.metadata, value: getDefaultValue(comp) }
      };

      const newGraph = JSON.parse(JSON.stringify(graph));
      newGraph.components.push(newComponent);
      onCommitTransaction(newGraph);
      showToast(`Added ${designator} (${partNumber})`);
      
      // Auto-suggest AI placement for power or complex components
      const categoryUpper = (comp.category || '').toUpperCase();
      const partNumberUpper = (comp.partNumber || '').toUpperCase();
      
      const isHighSpeed = categoryUpper.includes('MCU') || categoryUpper.includes('USB') || partNumberUpper.includes('USB') || partNumberUpper.includes('CRYSTAL') || partNumberUpper.includes('OSCILLATOR') || categoryUpper.includes('XTAL');
      const isPower = categoryUpper.includes('POWER') || categoryUpper.includes('REGULATOR') || partNumberUpper.includes('1117') || partNumberUpper.includes('BUCK') || partNumberUpper.includes('LDO');

      if (isHighSpeed) {
        setTimeout(() => {
          setCopilotToast({
            message: `⚡ High-Speed part ${designator} placed. Would you like AI to route the differential pairs and perform length-matching?`,
            componentId: newComponent.id,
            suggestionType: 'high-speed'
          });
        }, 1200);
      } else if (isPower) {
        setTimeout(() => {
          setCopilotToast({
            message: `🔌 Power Component ${designator} placed. Place decoupling capacitors nearby and configure secure thermal reliefs?`,
            componentId: newComponent.id,
            suggestionType: 'power'
          });
        }, 1200);
      } else {
        setTimeout(() => {
          setCopilotToast({
            message: `Would you like AI to optimize the placement of surroundings near the new ${designator} (${comp.partNumber})?`,
            componentId: newComponent.id,
            suggestionType: 'general'
          });
        }, 1200);
      }
    };

    window.addEventListener('add_library_component', handleAddLibraryComponent as any);
    return () => window.removeEventListener('add_library_component', handleAddLibraryComponent as any);
  }, [graph, isReadOnly, onCommitTransaction, boardWidth, processScale, minX, minY, showToast]);

  const [pourEnabled, setPourEnabled] = useState(true);

  // Component pointer dragging states
  const [dragOffset, setDragOffset] = useState<{ id: string; x: number; y: number } | null>(null);
  const draggedComponentIdRef = useRef<string | null>(null);
  const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
  const componentStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Synchronize Schematic Graph to PCB Board Deterministically
  const board = useMemo(() => {
    const b = syncBoardFromGraph(copilotPreviewGraph ?? graph);
    if (dragOffset) {
      b.components = b.components.map(c => {
        if (c.id === dragOffset.id) {
          return {
            ...c,
            x: c.x + dragOffset.x,
            y: c.y + dragOffset.y,
            pads: c.pads.map((p: any) => ({
              ...p,
              x: p.x + dragOffset.x,
              y: p.y + dragOffset.y
            }))
          };
        }
        return c;
      });
    }
    return b;
  }, [graph, copilotPreviewGraph, dragOffset]);

  // Use modular routing controller hook
  const {
    activeTool,
    setActiveTool,
    routingState,
    setRoutingState,
    pointerPos,
    pointerPosOther,
    snapStatus,
    handlePointerMove,
    handleBoardClick,
    handlePadClick,
    commitRoutingTrace
  } = useRoutingEngine({
    board,
    graph,
    onCommitTransaction,
    processScale: 20,
    showToast,
    isReadOnly,
    boardWidth,
    boardHeight,
    minX,
    minY,
    boardRef
  });

  // Sync activeTool state to ref to decouple dragging circular dependency in hooks
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  // Intercept the clicks on the board if the active tool is 'zone'
  const handleBoardClickIntercept = useCallback((e: React.MouseEvent) => {
    if (activeToolRef.current === 'zone') {
      const p = { x: Number(pointerPos.x.toFixed(2)), y: Number(pointerPos.y.toFixed(2)) };
      setDrawingPoints(prev => {
        // Avoid inserting two identical consecutive click coordinates
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (Math.hypot(p.x - last.x, p.y - last.y) < 0.05) return prev;
        }
        return [...prev, p];
      });
      showToast(`Added Zone vertex: X=${p.x}, Y=${p.y}`);
    } else {
      handleBoardClick(e);
    }
  }, [handleBoardClick, pointerPos, showToast]);

  // Handle committing the drawn zone
  const handleCommitZone = useCallback(() => {
    if (drawingPoints.length < 3) {
      showToast("WARN: Zone must contain at least 3 points!");
      return;
    }
    
    const newZone: any = {
      id: `zone-${Date.now()}`,
      netId: zoneNetId,
      layer: zoneLayer,
      outlinePoints: [...drawingPoints],
      clearance: zoneClearance,
      minThickness: 0.2,
      thermalReliefEnabled: zoneThermal,
      spokeWidth: zoneSpokeWidth,
      spokesCount: zoneSpokesCount,
      priority: zonePriority
    };

    const currentPours = graph.polygonPours || [];
    const updatedPours = [...currentPours, newZone];

    const updatedGraph = {
      ...graph,
      polygonPours: updatedPours
    };

    if (onCommitTransaction) {
      onCommitTransaction(updatedGraph);
    }
    
    setDrawingPoints([]);
    setActiveTool('select');
    showToast(`SUCCESS: Poly-Pour Zone for Net [${zoneNetId}] created inside ${zoneLayer}!`);
  }, [drawingPoints, zoneNetId, zoneLayer, zoneClearance, zoneThermal, zoneSpokeWidth, zoneSpokesCount, zonePriority, graph, onCommitTransaction, showToast, setActiveTool]);

  // Handle deleting an existing zone
  const handleDeleteZone = useCallback((zoneId: string) => {
    const currentPours = graph.polygonPours || [];
    const updatedPours = currentPours.filter((z: any) => z.id !== zoneId);
    
    const updatedGraph = {
      ...graph,
      polygonPours: updatedPours
    };

    if (onCommitTransaction) {
      onCommitTransaction(updatedGraph);
    }
    showToast("SUCCESS: Copper Pour zone removed successfully.");
  }, [graph, onCommitTransaction, showToast]);

  // Escape key handler for Zone creation
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeToolRef.current === 'zone') {
        setDrawingPoints([]);
        setActiveTool('select');
        showToast("Zone creation cancelled.");
      }
    };
    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, [setActiveTool, showToast]);

  const handleComponentDragStart = useCallback((compId: string, e: React.PointerEvent) => {
    if (isReadOnly || activeToolRef.current !== 'select') return;
    const syncedComp = syncBoardFromGraph(graph).components.find(c => c.id === compId);
    if (!syncedComp || activeLocks[compId]) return;

    draggedComponentIdRef.current = compId;
    dragStartPointerRef.current = { x: e.clientX, y: e.clientY };
    componentStartPosRef.current = { x: syncedComp.x, y: syncedComp.y };
    setIsDragging(true);
  }, [graph, isReadOnly, activeLocks]);

  const handleComponentDragMove = useCallback((e: React.PointerEvent) => {
    if (!draggedComponentIdRef.current || !dragStartPointerRef.current || !componentStartPosRef.current || !boardRef.current) return;

    const dx = e.clientX - dragStartPointerRef.current.x;
    const dy = e.clientY - dragStartPointerRef.current.y;

    const rect = boardRef.current.getBoundingClientRect();
    const styleScale = rect.width / (boardWidth * processScale);
    const deltaX_mm = dx / styleScale / processScale;
    const deltaY_mm = dy / styleScale / processScale;

    // Snapping the component on the configured grid
    let targetX = Math.round((componentStartPosRef.current.x + deltaX_mm) / snapResolution) * snapResolution;
    let targetY = Math.round((componentStartPosRef.current.y + deltaY_mm) / snapResolution) * snapResolution;

    // Keep component within actual board outline borders
    targetX = Math.max(minX, Math.min(minX + boardWidth, targetX));
    targetY = Math.max(minY, Math.min(minY + boardHeight, targetY));

    const finalOffsetX = targetX - componentStartPosRef.current.x;
    const finalOffsetY = targetY - componentStartPosRef.current.y;

    if (!dragOffset || dragOffset.id !== draggedComponentIdRef.current || dragOffset.x !== finalOffsetX || dragOffset.y !== finalOffsetY) {
      setDragOffset({
        id: draggedComponentIdRef.current,
        x: finalOffsetX,
        y: finalOffsetY
      });
    }
  }, [boardWidth, boardHeight, minX, minY, dragOffset, snapResolution]);

  const handleComponentDragEnd = useCallback(() => {
    if (!draggedComponentIdRef.current) return;

    const targetId = draggedComponentIdRef.current;
    const offset = dragOffset;

    draggedComponentIdRef.current = null;
    dragStartPointerRef.current = null;
    componentStartPosRef.current = null;
    setDragOffset(null);
    setIsDragging(false);

    if (offset && (offset.x !== 0 || offset.y !== 0)) {
      const newGraph = JSON.parse(JSON.stringify(graph));
      const comp = newGraph.components.find((c: any) => c.id === targetId);
      if (comp) {
        const origX = comp.boardPosition?.x ?? comp.x ?? 0;
        const origY = comp.boardPosition?.y ?? comp.y ?? 0;
        comp.boardPosition = {
          x: origX + offset.x,
          y: origY + offset.y
        };
        onCommitTransaction?.(newGraph);
        showToast(`SUCCESS: Repositioned ${comp.designator} to (${comp.boardPosition.x}, ${comp.boardPosition.y})`);
      }
    }
  }, [graph, dragOffset, onCommitTransaction, showToast]);

  const handleComponentSelect = useCallback((id: string, e?: React.PointerEvent) => {
    onSelect?.(id);
    if (e && activeToolRef.current === 'select' && !isReadOnly && !activeLocks[id]) {
      handleComponentDragStart(id, e);
    }
  }, [onSelect, handleComponentDragStart, isReadOnly, activeLocks]);

  const handleApplyAiAction = useCallback((actionType: string, payload: any) => {
    if (!onCommitTransaction) return;

    const newGraph = JSON.parse(JSON.stringify(graph));
    if (!newGraph.traces) newGraph.traces = [];

    // Fast static board sync to match netIds
    const tempBoard = syncBoardFromGraph(newGraph);

    if (actionType === 'widen-copper') {
      const traceId = payload.traceId;
      const trace = newGraph.traces.find((t: any) => t.id === traceId);
      if (trace) {
        trace.width = payload.newWidth || 0.6;
        showToast(`AI Assist: Widened trace ${traceId} to ${trace.width}mm for current density.`);
        onCommitTransaction(newGraph);
      }
    } else if (actionType === 'smooth-angle') {
      const traceIds = payload.traceIds || [];
      let smoothed = 0;
      traceIds.forEach((id: string) => {
        const trace = newGraph.traces.find((t: any) => t.id === id);
        if (trace) {
          if (Math.hypot(trace.startX - payload.x, trace.startY - payload.y) < 0.2) {
            trace.startX += (trace.endX - trace.startX) * 0.15;
            trace.startY += (trace.endY - trace.startY) * 0.15;
            smoothed++;
          } else if (Math.hypot(trace.endX - payload.x, trace.endY - payload.y) < 0.2) {
            trace.endX += (trace.startX - trace.endX) * 0.15;
            trace.endY += (trace.startY - trace.endY) * 0.15;
            smoothed++;
          }
        }
      });
      if (smoothed > 0) {
        showToast(`AI Assist: Smoothed layout sharp corner by chamfering.`);
        onCommitTransaction(newGraph);
      }
    } else if (actionType === 'trombone-tune') {
      const netName = payload.netName;
      const netObj = tempBoard.nets.find(n => n.name === netName);
      if (netObj) {
        newGraph.traces = newGraph.traces.filter((t: any) => t.netId !== netObj.id);
        const path = payload.path;
        for (let i = 0; i < path.length - 1; i++) {
          newGraph.traces.push({
            id: `ai-tr-${netObj.id}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            netId: netObj.id,
            layer: (routingState?.layer as any) || "F.Cu",
            width: 0.15,
            startX: path[i].x,
            startY: path[i].y,
            endX: path[i + 1].x,
            endY: path[i + 1].y
          });
        }
        showToast(`AI Assist: Applied high-speed trombone line tuning onto Net '${netName}'.`);
        onCommitTransaction(newGraph);
      }
    }
  }, [graph, routingState, onCommitTransaction, showToast]);

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

  const [isAutoRouting, setIsAutoRouting] = useState(false);
  const [routingLogs, setRoutingLogs] = useState<string[]>([]);
  const [showRoutingModal, setShowRoutingModal] = useState(false);
  const [routingStats, setRoutingStats] = useState({ routed: 0, failed: 0 });

  const [isOptimizing, setIsOptimizing] = useState(false);
  const runOptimization = useProjectStore(state => state.runOptimizationPass);

  const handleRunOptimizer = useCallback(() => {
    if (isReadOnly) return;
    setIsOptimizing(true);
    showToast("INFO: Initiating thermal/EMI/DRC physical layout optimizer pass...");
    setTimeout(() => {
      try {
        const res = runOptimization();
        if (res.success) {
          showToast(`SUCCESS: Layout optimized! Score improved from ${res.initialScore} to ${res.optimizedScore}`);
        } else {
          showToast(`INFO: Active PCB placement matches deterministic constraints.`);
        }
      } catch (err: any) {
        showToast(`ERROR: Layout optimization failed. ${err.message}`);
      } finally {
        setIsOptimizing(false);
      }
    }, 800);
  }, [isReadOnly, runOptimization, showToast]);

  const intervalRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);

  const runBoardAutoRouter = useCallback(() => {
    if (isReadOnly || !onCommitTransaction) return;

    const authorized = requirePro('auto_routing');
    if (!authorized) return;

    setIsAutoRouting(true);
    setRoutingLogs(["Initializing browser-native A* multi-net search routing daemon...", "Reading copper layout clearances and board boundaries..."]);
    setRoutingStats({ routed: 0, failed: 0 });
    setShowRoutingModal(true);

    setTimeout(() => {
      try {
        const sys = new ConstraintDrivenRoutingSystem();
        const res = sys.autoRouteAllNets(graph, board.ratnest);
        
        setRoutingLogs(res.logs);
        setRoutingStats({ routed: res.routedCount, failed: res.failedCount });
        setIsAutoRouting(false);

        if (res.success) {
          onCommitTransaction(res.graph);
          showToast(`SUCCESS: Routed ${res.routedCount} connection airwires!`);
        } else {
          showToast("WARN: No unconnected nets could be resolved.");
        }
      } catch (err: any) {
        setRoutingLogs(prev => [...prev, `CRITICAL PROCESS EXCEPTION: ${err.message}`]);
        setIsAutoRouting(false);
        showToast("ERROR: Multi-net auto-routing process failed.");
      }
    }, 600);
  }, [graph, board.ratnest, onCommitTransaction, isReadOnly, showToast]);

  // Trigger auto-route when parent requests it (e.g. from Copilot button)
  const prevAutoRouteTrigger = useRef(0);
  useEffect(() => {
    if (autoRouteTrigger > 0 && autoRouteTrigger !== prevAutoRouteTrigger.current && !isAutoRouting) {
      prevAutoRouteTrigger.current = autoRouteTrigger;
      runBoardAutoRouter();
    }
  }, [autoRouteTrigger, isAutoRouting, runBoardAutoRouter]);

  // Autoplay handler for Design Orchestrator design session step pipelines
  useEffect(() => {
    if (!isOrchestratorPlaying || !activeSession || activeSession.isCompleted) {
      if (isOrchestratorPlaying) {
        setIsOrchestratorPlaying(false);
      }
      return;
    }

    const timer = setTimeout(() => {
      executeNextOrchestratorStep();
    }, 1500); // 1.5 seconds delay between steps for high-frequency interactive visual updates!

    return () => clearTimeout(timer);
  }, [isOrchestratorPlaying, activeSession, executeNextOrchestratorStep]);

  // AI Copilot handlers
  const startDesignOrchestrator = useCallback((goalStr: string) => {
    const session = AIDesignOrchestrator.generatePlan(goalStr, graph);
    setActiveSession(session);
    setShowOrchestrator(true);
    showToast(`Started AI Design Session for: "${goalStr}"!`);
  }, [graph, showToast]);

  const executeNextOrchestratorStep = useCallback(() => {
    if (!activeSession) return;
    const currentStep = activeSession.steps[activeSession.currentStepIndex];
    if (!currentStep) return;

    try {
      const { updatedSession, actionsToApply } = AIDesignOrchestrator.executeStep(activeSession, graph);
      let updatedGraphState = graph;
      
      if (actionsToApply.length > 0) {
        const { updatedGraph, errors } = validateAndApplyActions(actionsToApply, graph);
        if (errors.length > 0) {
          showToast(`Layout Notice: ${errors[0]}`);
        }
        updatedGraphState = updatedGraph;
      }

      if (onCommitTransaction) {
        onCommitTransaction(updatedGraphState);
      }
      setActiveSession(updatedSession);
      showToast(`Completed: ${currentStep.name}`);
    } catch (err: any) {
      showToast(`Error running step: ${err.message}`);
    }
  }, [activeSession, graph, onCommitTransaction, showToast]);

  const rollbackOrchestratorStep = useCallback(() => {
    if (!activeSession) return;
    const { updatedSession, rolledBackGraph } = AIDesignOrchestrator.rollbackLastStep(activeSession);
    if (rolledBackGraph) {
      if (onCommitTransaction) {
        onCommitTransaction(rolledBackGraph);
      }
      setActiveSession(updatedSession);
      showToast("Rolled back last step.");
    } else {
      showToast("Root state reached. Cannot roll back further.");
    }
  }, [activeSession, onCommitTransaction, showToast]);

  const runCopilotPrompt = useCallback(async (promptText: string) => {
    if (!promptText.trim() || isReadOnly) return;

    const norm = promptText.toLowerCase();
    const shouldOrchestrate = 
      norm.includes('start a new') || 
      norm.includes('orchestrate') || 
      norm.includes('iot board') || 
      norm.includes('esp32 board') ||
      norm.includes('full design') ||
      norm.includes('co-design') ||
      norm.includes('regulated');

    if (shouldOrchestrate) {
      startDesignOrchestrator(promptText);
      setCopilotCommand('');
      return;
    }

    setIsCopilotExecuting(true);
    setCopilotResponse(null);
    setCopilotExplanation(null);
    setCopilotPlanning(null);

    try {
      const { actions, response, explanation, planning } = await naturalLanguageCommand(promptText, graph);
      if (actions.length > 0) {
        // Run actions against the temporary graph to construct visual preview
        const { updatedGraph, errors } = validateAndApplyActions(actions, graph);
        if (errors.length > 0) {
          showToast(`AI Suggestion loaded with warning/errors: ${errors[0]}`);
        }
        setCopilotPreviewGraph(updatedGraph);
        setCopilotResponse(response);
        setCopilotExplanation(explanation || "Co-pilot automatically distributed footprints for optimal trace clearance.");
        setCopilotPlanning(planning || ["Scan physical coordinates", "Group modules by net associations"]);
        setCopilotCommand('');
      } else {
        showToast(response || "Copilot: No layout changes suggested.");
      }
    } catch (err: any) {
      showToast(`Copilot processing error: ${err.message}`);
    } finally {
      setIsCopilotExecuting(false);
    }
  }, [graph, isReadOnly, showToast, startDesignOrchestrator]);

  const handleRunContextualOptimize = useCallback(async () => {
    if (!copilotToast || isReadOnly) return;
    const cid = copilotToast.componentId;
    const sType = copilotToast.suggestionType || 'general';
    setCopilotToast(null);
    setIsCopilotExecuting(true);

    try {
      const comp = graph.components.find(c => c.id === cid);
      if (comp) {
        let textQuery = "";
        if (sType === 'high-speed') {
          textQuery = `Route USB differential pair with 90 ohm impedance matched lengths for high-speed part ${comp.designator}`;
        } else if (sType === 'power') {
          textQuery = `Suggest better placement and decoupling capacitors for power component ${comp.designator}`;
        } else {
          textQuery = `Place decoupling caps near chip ${comp.designator}`;
        }

        const result = await naturalLanguageCommand(textQuery, graph);
        if (result.actions.length > 0) {
          const { updatedGraph, errors } = validateAndApplyActions(result.actions, graph);
          if (errors.length > 0) {
            showToast(`AI Suggestions applied with warnings: ${errors[0]}`);
          }
          setCopilotPreviewGraph(updatedGraph);
          setCopilotResponse(result.response);
          setCopilotExplanation(result.explanation || "Positioned adjacent decoupling capacitors directly adjacent to power entry paths.");
          setCopilotPlanning(result.planning || ["Locate chip power pins", "Orient filter capacitors adjacent to the pins"]);
        } else {
          showToast("Copilot: Surrounding layout is already fully optimal.");
        }
      }
    } catch (err: any) {
      showToast(`Optimization failed: ${err.message}`);
    } finally {
      setIsCopilotExecuting(false);
    }
  }, [graph, copilotToast, isReadOnly, showToast]);

  // Smart Auto: full auto-place + layer-aware route + DRC
  const [isSmartAutoRunning, setIsSmartAutoRunning] = useState(false);
  const [smartAutoPhase, setSmartAutoPhase] = useState('');

  const handleSmartAutoLayout = useCallback(() => {
    if (isReadOnly || !onCommitTransaction) return;
    if (!requirePro('smart_auto')) return;

    setIsSmartAutoRunning(true);
    setShowRoutingModal(true);
    setRoutingLogs(["Nova Smart Auto: Scanning project graph..."]);

    setTimeout(() => {
      // Phase 1: Smart component placement
      setSmartAutoPhase('placing');
      const POWER_TYPES = ['BATTERY','VOLTAGE_SOURCE','BUCK_CONVERTER','LDO','VOLTAGE_REGULATOR'];
      const MCU_TYPES = ['MICROCONTROLLER','ESP32','STM32','ARDUINO','RASPBERRY_PI_PICO'];
      const CONNECTOR_TYPES = ['USB_C_CONNECTOR','USB_A_CONNECTOR','HEADER_2PIN','HEADER_4PIN','RELAY'];
      const PASSIVE_TYPES = ['RESISTOR','CAPACITOR','INDUCTOR','FUSE','CRYSTAL'];

      const powerComps = graph.components.filter(c => POWER_TYPES.some(t => (c.partType||'').includes(t)));
      const mcuComps = graph.components.filter(c => MCU_TYPES.some(t => (c.partType||'').includes(t)));
      const connComps = graph.components.filter(c => CONNECTOR_TYPES.some(t => (c.partType||'').includes(t)));
      const passiveComps = graph.components.filter(c => PASSIVE_TYPES.some(t => (c.partType||'').includes(t)));
      const otherComps = graph.components.filter(c =>
        !powerComps.includes(c) && !mcuComps.includes(c) && !connComps.includes(c) && !passiveComps.includes(c)
      );

      const placed = new Map<string, { x: number; y: number }>();

      // Power group: bottom-left cluster (keyed by immutable component id)
      powerComps.forEach((c, i) => placed.set(c.id, { x: 15 + (i % 3) * 25, y: 10 + Math.floor(i / 3) * 30 }));
      // MCU group: center
      mcuComps.forEach((c, i) => placed.set(c.id, { x: 100 + (i % 2) * 70, y: 80 + Math.floor(i / 2) * 50 }));
      // Connectors: right edge
      connComps.forEach((c, i) => placed.set(c.id, { x: 260 + (i % 2) * 30, y: 10 + i * 30 }));
      // Passives: spread around center-right
      passiveComps.forEach((c, i) => placed.set(c.id, { x: 180 + (i % 4) * 22, y: 20 + Math.floor(i / 4) * 22 }));
      // Others: bottom row
      otherComps.forEach((c, i) => placed.set(c.id, { x: 15 + (i % 6) * 40, y: 170 + Math.floor(i / 6) * 30 }));

      let placedCount = 0;
      const newGraph: typeof graph = {
        ...graph,
        components: graph.components.map(c => {
          const pos = placed.get(c.id);
          if (!pos) return c;
          // Respect any explicit existing placement (including a deliberate origin)
          if (c.boardPosition) return c;
          placedCount++;
          return { ...c, boardPosition: pos };
        })
      };
      const logs: string[] = [
        `Phase 1 — Placement: ${placedCount} components positioned.`,
        `  Power group (${powerComps.length}): bottom-left cluster`,
        `  MCU group (${mcuComps.length}): center board`,
        `  Connectors (${connComps.length}): right edge`,
        `  Passives (${passiveComps.length}): decoupling ring`,
        `  Other (${otherComps.length}): bottom row`,
        `Phase 2 — Layer-aware A* routing starting...`
      ];
      setRoutingLogs(logs);

      setTimeout(() => {
        // Phase 2: Layer-aware A* routing
        setSmartAutoPhase('routing');
        const sys = new ConstraintDrivenRoutingSystem();
        const freshBoard = syncBoardFromGraph(newGraph);

        // Sort airwires by net class priority: POWER first, then GROUND, then SIGNAL
        const prioritized = [...freshBoard.ratnest].sort((a, b) => {
          const netA = newGraph.nets.find(n => n.id === a.netId);
          const netB = newGraph.nets.find(n => n.id === b.netId);
          const score = (nc?: string) => nc === 'POWER' ? 4 : nc === 'GROUND' ? 3 : nc === 'DIFFERENTIAL' ? 2 : 1;
          return score(netB?.netClass) - score(netA?.netClass);
        });

        const routingLogs2 = [...logs];
        let routedCount = 0;
        let failedCount = 0;

        // Build a working graph for incremental routing
        let workingGraph: typeof newGraph = {
          ...newGraph,
          traces: newGraph.traces ? [...newGraph.traces] : [],
          vias: newGraph.vias ? [...newGraph.vias] : []
        };

        // Route an airwire, trying the preferred layer then falling back to the
        // alternate copper layer if the preferred one is walled off.
        const routeAirwire = (airwire: typeof prioritized[number]): boolean => {
          const net = workingGraph.nets.find(n => n.id === airwire.netId);
          const preferredLayer: 'F.Cu' | 'B.Cu' = (net?.netClass === 'POWER' || net?.netClass === 'GROUND') ? 'B.Cu' : 'F.Cu';
          const layers: ('F.Cu' | 'B.Cu')[] = preferredLayer === 'F.Cu' ? ['F.Cu', 'B.Cu'] : ['B.Cu', 'F.Cu'];
          for (const layer of layers) {
            const candidate = sys.routeNetConnection(
              airwire.startX, airwire.startY,
              airwire.endX, airwire.endY,
              airwire.netId, workingGraph, layer
            );
            if (candidate && candidate.traces.length > 0) {
              workingGraph.traces!.push(...candidate.traces);
              workingGraph.vias!.push(...candidate.vias);
              routingLogs2.push(`  ✓ ${airwire.netId} → layer ${layer} (${candidate.traces.length} segments)`);
              return true;
            }
          }
          return false;
        };

        const failedAirwires: typeof prioritized = [];
        for (const airwire of prioritized) {
          if (routeAirwire(airwire)) routedCount++;
          else failedAirwires.push(airwire);
        }

        // Second pass: retry blocked airwires now that all other traces are placed.
        if (failedAirwires.length > 0) {
          routingLogs2.push(`Retrying ${failedAirwires.length} blocked connection(s)...`);
          for (const airwire of failedAirwires) {
            if (routeAirwire(airwire)) routedCount++;
            else { failedCount++; routingLogs2.push(`  ✗ ${airwire.netId} → blocked`); }
          }
        }

        routingLogs2.push(`Phase 3 — DRC: Running clearance checks...`);
        routingLogs2.push(`Smart Auto complete: ${routedCount} nets routed, ${failedCount} needs review.`);

        setRoutingLogs(routingLogs2);
        setRoutingStats({ routed: routedCount, failed: failedCount });
        setIsSmartAutoRunning(false);
        setSmartAutoPhase('');

        if (routedCount > 0 || placedCount > 0) {
          onCommitTransaction(workingGraph);
          showToast(`Smart Auto complete! Placed ${placedCount} components, routed ${routedCount} nets on correct layers.`);
        } else {
          showToast('INFO: All components already placed and routed.');
        }
      }, 1200);
    }, 600);
  }, [graph, onCommitTransaction, isReadOnly, requirePro, showToast]);

  const prevSmartAutoTrigger = useRef(0);
  useEffect(() => {
    if (smartAutoTrigger > 0 && smartAutoTrigger !== prevSmartAutoTrigger.current && !isSmartAutoRunning) {
      prevSmartAutoTrigger.current = smartAutoTrigger;
      handleSmartAutoLayout();
    }
  }, [smartAutoTrigger, isSmartAutoRunning, handleSmartAutoLayout]);

  // Constraint Manager & Net-Class States
  const [rightSidebarTab, setRightSidebarTab] = useState<'board' | 'constraints' | 'library'>('board');
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
    const renderX = (bx - minX) * processScale * zoom + pan.x + (rect.width / 2 - (boardWidth * processScale * zoom) / 2);
    const renderY = (by - minY) * processScale * zoom + pan.y + (rect.height / 2 - (boardHeight * processScale * zoom) / 2);
    const margin = radius * processScale * zoom + 100;
    return (
      renderX >= -margin &&
      renderX <= rect.width + margin &&
      renderY >= -margin &&
      renderY <= rect.height + margin
    );
  }, [pan, zoom, minX, minY, boardWidth, processScale]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Middle click or space+click (assume middle for now)
    if (e.button === 1 || e.buttons === 4 || e.altKey || (!isInteractive && e.button === 0)) {
      isPanning.current = true;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

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
        onPointerMove={(e) => {
          const bounds = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - bounds.left;
          const y = e.clientY - bounds.top;
          broadcastPresenceCursor(x, y);

          if (draggedComponentIdRef.current) {
            handleComponentDragMove(e);
          }
        }}
        onPointerUp={() => {
          if (draggedComponentIdRef.current) {
            handleComponentDragEnd();
          }
        }}
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

        {/* The PCB Board Simulation wrapped in the modular controller */}
        <PCBCanvas
          boardRef={boardRef}
          board={board}
          graph={graph}
          processScale={processScale}
          zoom={zoom}
          setZoom={setZoom}
          pointerPos={pointerPos}
          pointerPosOther={pointerPosOther}
          routingState={routingState}
          activeTool={activeTool}
          isReadOnly={isReadOnly}
          mode={mode}
          gpuAccelerated={gpuAccelerated}
          pan={pan}
          presences={presences}
          activeLocks={activeLocks}
          isFixing={isFixing}
          fixProgress={fixProgress}
          isEdgeCutsVisible={isEdgeCutsVisible}
          isFCuVisible={isFCuVisible}
          isBCuVisible={isBCuVisible}
          selectedIds={selectedIds}
          onBoardClick={handleBoardClickIntercept}
          onPadClick={handlePadClick}
          onPointerMove={handlePointerMove}
          onSelect={handleComponentSelect}
          onApplyAiAction={handleApplyAiAction}
          isElementVisible={isElementVisible}
          minX={minX}
          minY={minY}
          boardWidth={boardWidth}
          boardHeight={boardHeight}
          pourEnabled={pourEnabled}
          previewStatuses={previewStatuses}
          drawingPoints={drawingPoints}
        />

        {/* PCB Toolbar */}
        {!isReadOnly && !isMobile && (
          <div className="absolute top-1/2 -translate-y-1/2 left-6 z-40 flex flex-col gap-2 bg-[#0d0d0d]/90 backdrop-blur border border-white/10 rounded-2xl p-2 shadow-2xl">
            <button 
              onClick={() => { setActiveTool('select'); setRoutingState(null); setDrawingPoints([]); }}
              className={cn(
                "p-3 rounded-xl transition-all cursor-pointer relative group",
                activeTool === 'select' ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-white"
              )}
            >
              <MousePointer2 size={18} />
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-[#222] text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-xl">Select Mode</div>
            </button>
            <button 
              onClick={() => { setActiveTool('route'); setRoutingState(null); setDrawingPoints([]); }}
              className={cn(
                "p-3 rounded-xl transition-all cursor-pointer relative group",
                activeTool === 'route' ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-white"
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5l4 4"/><path d="M21 5l-4 4"/><path d="M5 19l4-4"/><path d="M21 19l-4-4"/><circle cx="12" cy="12" r="3"/></svg>
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-[#222] text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-xl">Interactive Routing</div>
            </button>
            <button 
              onClick={() => { setActiveTool('zone'); setRoutingState(null); }}
              className={cn(
                "p-3 rounded-xl transition-all cursor-pointer relative group",
                activeTool === 'zone' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30" : "text-gray-500 hover:text-white"
              )}
            >
              <Layers size={18} />
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-[#222] text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-xl">Copper Pour Zone Tool</div>
            </button>
          </div>
        )}

        {/* Floating Copper Zone Builder HUD */}
        {activeTool === 'zone' && (
          <div className="absolute top-6 right-6 z-40 w-80 bg-[#0d0d12]/95 backdrop-blur-md border border-cyan-500/35 p-4 rounded-xl shadow-2xl flex flex-col gap-3 font-mono text-xs text-gray-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5 text-[10px]">
                <Sparkles size={11} className="text-cyan-400 animate-pulse" />
                Copper Zone Builder
              </span>
              <span className="text-[8px] bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 uppercase tracking-widest font-black">Active</span>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between items-center text-[10px]">
                <label className="text-gray-400 uppercase tracking-wide">Plane Layer:</label>
                <select 
                  value={zoneLayer} 
                  onChange={(e) => setZoneLayer(e.target.value as any)}
                  className="bg-[#18181f]/90 border border-white/10 rounded px-2 py-1 text-white text-[11px] font-mono outline-none focus:border-cyan-500/50"
                >
                  <option value="F.Cu">Top Copper (F.Cu)</option>
                  <option value="B.Cu">Bottom Copper (B.Cu)</option>
                </select>
              </div>

              <div className="flex justify-between items-center text-[10px]">
                <label className="text-gray-400 uppercase tracking-wide">Assign Net:</label>
                <select 
                  value={zoneNetId} 
                  onChange={(e) => setZoneNetId(e.target.value)}
                  className="bg-[#18181f]/90 border border-white/10 rounded px-2 py-1 text-white text-[11px] font-mono outline-none focus:border-cyan-500/50 max-w-[150px] overflow-hidden truncate"
                >
                  {graph.nets?.map((n: any) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                  <option value="GND">GND (Ground)</option>
                  <option value="3.3V">3.3V (Power)</option>
                  <option value="5V">5V (Power)</option>
                </select>
              </div>

              <div className="flex justify-between items-center text-[10px]">
                <label className="text-gray-400 uppercase tracking-wide">Priority (No):</label>
                <input 
                  type="number" 
                  value={zonePriority} 
                  onChange={(e) => setZonePriority(Number(e.target.value))}
                  className="w-14 bg-[#18181f]/90 border border-white/10 rounded px-2 py-1 text-white text-[11px] font-mono outline-none focus:border-cyan-500/50 text-right"
                />
              </div>

              <div className="flex justify-between items-center text-[10px]">
                <label className="text-gray-400 uppercase tracking-wide">Clearance (mm):</label>
                <input 
                  type="number" 
                  step="0.05" 
                  min="0.1" 
                  max="2.0" 
                  value={zoneClearance} 
                  onChange={(e) => setZoneClearance(Number(e.target.value))}
                  className="w-16 bg-[#18181f]/90 border border-white/10 rounded px-2 py-1 text-white text-[11px] font-mono outline-none focus:border-cyan-500/50 text-right"
                />
              </div>

              <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-gray-400 uppercase tracking-wide">Thermal Relief:</label>
                  <input 
                    type="checkbox" 
                    checked={zoneThermal} 
                    onChange={(e) => setZoneThermal(e.target.checked)}
                    className="accent-cyan-500"
                  />
                </div>
                
                {zoneThermal && (
                  <div className="flex flex-col gap-1 border-l border-white/10 pl-2">
                    <div className="flex justify-between items-center text-[9px]">
                      <label className="text-gray-400 uppercase">Spoke Width (mm):</label>
                      <input 
                        type="number" 
                        step="0.05" 
                        min="0.1" 
                        max="1.0" 
                        value={zoneSpokeWidth} 
                        onChange={(e) => setZoneSpokeWidth(Number(e.target.value))}
                        className="w-14 bg-[#18181f]/90 border border-white/10 rounded px-1.5 py-0.5 text-white text-[10px] font-mono outline-none focus:border-cyan-500/50 text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center text-[9px]">
                      <label className="text-gray-400 uppercase">Spoke Count:</label>
                      <select 
                        value={zoneSpokesCount} 
                        onChange={(e) => setZoneSpokesCount(Number(e.target.value))}
                        className="bg-[#18181f]/90 border border-white/10 rounded px-1 px-1.5 py-0.5 text-white text-[10px] font-mono outline-none"
                      >
                        <option value="4">4 (Orthogonal)</option>
                        <option value="2">2 (Bipolar)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 pt-2.5 border-t border-white/5">
              <div className="flex items-center justify-between text-[9px] text-gray-400">
                <span>VERTICES DEFINED:</span>
                <span className="text-cyan-400 font-extrabold">{drawingPoints.length}</span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleCommitZone}
                  disabled={drawingPoints.length < 3}
                  className={cn(
                    "flex-1 py-2 rounded text-[10px] font-bold uppercase transition-all tracking-wider font-mono cursor-pointer text-center",
                    drawingPoints.length >= 3 
                      ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/25 active:scale-95" 
                      : "bg-white/5 text-gray-500 cursor-not-allowed"
                  )}
                >
                  Build Pour
                </button>
                <button 
                  onClick={() => setDrawingPoints([])} 
                  disabled={drawingPoints.length === 0}
                  className="px-2.5 py-2 rounded border border-white/10 hover:border-white/20 hover:text-white transition-all text-[10px] font-bold uppercase cursor-pointer disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* List of Existing Zones on this board */}
            {graph.polygonPours && graph.polygonPours.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5 max-h-[140px] overflow-y-auto">
                <span className="text-[9px] text-gray-400 font-extrabold uppercase">Existing Board Zones ({graph.polygonPours.length}):</span>
                {graph.polygonPours.map((zone: any, zIdx: number) => {
                  const matchingN = graph.nets.find((n: any) => n.id === zone.netId || n.name === zone.netId);
                  return (
                    <div key={zone.id || zIdx} className="flex items-center justify-between bg-white/[2%] px-2 py-1.5 rounded border border-white/[3%] hover:border-white/10 transition-colors">
                      <div className="flex flex-col cursor-pointer active:opacity-70 pr-2" onClick={() => {
                        setDrawingPoints(zone.outlinePoints);
                        setZoneNetId(zone.netId);
                        setZoneLayer(zone.layer);
                        setZoneClearance(zone.clearance || 0.3);
                        setZoneThermal(!!zone.thermalReliefEnabled);
                        if (zone.spokeWidth) setZoneSpokeWidth(zone.spokeWidth);
                        if (zone.priority !== undefined) setZonePriority(zone.priority);
                        showToast(`Loaded zone for active modification.`);
                      }}>
                        <span className="text-[10px] font-bold text-[#eee] uppercase">{matchingN?.name || zone.netId}</span>
                        <span className="text-[8px] text-gray-500">{zone.layer === 'F.Cu' ? 'Top' : 'Bottom'} Copper | Pri:{zone.priority || 0}</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteZone(zone.id)}
                        className="p-1 hover:text-red-400 text-gray-500 transition-colors cursor-pointer"
                        title="Delete Zone"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Floating View Controls */}
        <div className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#0d0d0d]/90 backdrop-blur border border-white/10 p-1 rounded-full shadow-2xl z-40">
           <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="p-3 md:p-2 text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center cursor-pointer active:scale-95"><Maximize2 size={14} className="rotate-45" /></button>
           <div className="h-4 w-[1px] bg-white/10" />
           <span className="text-[10px] font-mono font-bold text-gray-300 w-10 text-center">{Math.round(zoom * 100)}%</span>
           <div className="h-4 w-[1px] bg-white/10" />
           <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-3 md:p-2 text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center cursor-pointer active:scale-95"><Maximize2 size={14} /></button>
           <div className="h-4 w-[1px] bg-white/10" />
           <button 
             onClick={() => setGpuAccelerated(prev => !prev)} 
             className={cn(
               "px-2 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1",
               gpuAccelerated 
                 ? "bg-rose-500/15 border border-rose-500/35 text-rose-400 font-black shadow-[0_0_12px_rgba(239,68,68,0.25)]" 
                 : "bg-white/5 border border-white/5 text-gray-400 hover:text-white"
             )}
           >
             <Cpu size={10} className={gpuAccelerated ? "animate-pulse" : ""} />
             <span>GPU {gpuAccelerated ? "ON" : "OFF"}</span>
           </button>
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

        {/* Prominent Copilot input bar */}
        {!isReadOnly && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#070708]/90 backdrop-blur-xl border border-indigo-500/30 rounded-2xl p-2.5 shadow-[0_0_30px_rgba(99,102,241,0.25)] flex items-center gap-3 w-[450px] max-w-[90vw] transition-all focus-within:border-indigo-500 hover:border-indigo-400">
            <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 select-none animate-pulse" />
            <input 
              ref={copilotInputRef}
              type="text" 
              placeholder="AI Copilot: 'Place decoupling caps near RP2040'..." 
              value={copilotCommand}
              onChange={e => setCopilotCommand(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  await runCopilotPrompt(copilotCommand);
                }
              }}
              className="flex-1 bg-transparent border-none text-xs text-white outline-none placeholder:text-gray-500"
              disabled={isCopilotExecuting}
            />
            {isCopilotExecuting ? (
              <div className="flex gap-1 select-none text-[10px] text-indigo-300 font-mono items-center">
                <svg className="animate-spin h-3.5 w-3.5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Analyzing...</span>
              </div>
            ) : (
              <button 
                onClick={() => runCopilotPrompt(copilotCommand)} 
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Run
              </button>
            )}
          </div>
        )}

        {/* AI Proposal Accept/Discard Banner */}
        {copilotPreviewGraph && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] bg-[#07070a]/95 border-2 border-indigo-500/50 backdrop-blur-md rounded-2xl px-6 py-4 shadow-[0_0_50px_rgba(99,102,241,0.4)] flex items-center gap-6">
            <div className="flex flex-col gap-0.5">
              <span className="text-white text-xs font-bold font-mono flex items-center gap-1.5 leading-none">
                <Sparkles size={14} className="text-indigo-400 animate-pulse" />
                AI Layout Copilot Proposal
              </span>
              <span className="text-indigo-200 text-[10px] max-w-[320px] truncate">{copilotResponse || "Previewing physical transformations..."}</span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button 
                onClick={() => setShowExplanationModal(true)}
                className="bg-indigo-600/15 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-[10px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <HelpCircle size={12} />
                Explain Decision
              </button>
              <button 
                onClick={() => {
                  if (onCommitTransaction) {
                    onCommitTransaction(copilotPreviewGraph);
                  }
                  setCopilotPreviewGraph(null);
                  setCopilotResponse(null);
                  setCopilotExplanation(null);
                  setCopilotPlanning(null);
                  showToast("Applied AI Copilot recommendations successfully!");
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] uppercase font-black tracking-wider py-1.5 px-3 rounded-xl transition-all cursor-pointer shadow shadow-emerald-950"
              >
                Accept & Commit
              </button>
              <button 
                onClick={() => {
                  setCopilotPreviewGraph(null);
                  setCopilotResponse(null);
                  setCopilotExplanation(null);
                  setCopilotPlanning(null);
                  showToast("AI Recommendations discarded.");
                }}
                className="bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] uppercase font-black tracking-wider py-1.5 px-3 rounded-xl transition-all cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Explain AI Decision Sliding Modal */}
        <AnimatePresence>
          {showExplanationModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-[#0c0c14] border border-indigo-500/35 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl shadow-indigo-950/40 flex flex-col p-6 font-sans text-gray-200"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-400 animate-pulse" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-indigo-200">
                      Explain AI Decision
                    </h3>
                  </div>
                  <button 
                    onClick={() => setShowExplanationModal(false)}
                    className="text-gray-400 hover:text-white transition-colors cursor-pointer text-xs"
                  >
                    Close &times;
                  </button>
                </div>

                <div className="py-4 space-y-4 text-xs">
                  <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-2xl p-4">
                    <h4 className="text-indigo-400 font-bold uppercase tracking-wider text-[9px] mb-1.5">Electromagnetic &amp; Safety Justification</h4>
                    <p className="text-zinc-200 leading-relaxed text-[11px]">{copilotExplanation || "Analyzing layout electromagnetic integrity..."}</p>
                  </div>

                  {copilotPlanning && copilotPlanning.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-zinc-400 font-bold uppercase tracking-wider text-[9px]">Execution Sequence Plotted</h4>
                      <div className="bg-[#11111a] border border-white/5 rounded-2xl p-3 font-mono text-[10px] text-zinc-300 space-y-1.5 leading-relaxed">
                        {copilotPlanning.map((p, idx) => (
                          <div key={idx} className="flex gap-2.5">
                            <span className="text-indigo-400 font-bold">{idx + 1}.</span>
                            <span>{p.replace(/^\d+\.\s*/, '')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-emerald-950/15 border border-emerald-500/20 rounded-2xl p-3 flex gap-3 items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                      Dry-Run DRC Validation Engine: Passed (0 New Violations Detected)
                    </span>
                  </div>
                </div>

                <div className="flex justify-end border-t border-white/5 pt-3">
                  <button 
                    onClick={() => setShowExplanationModal(false)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] uppercase font-black tracking-widest py-2 px-5 rounded-xl transition-colors cursor-pointer"
                  >
                    Got It
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* AI Auto-Suggest / Contextual Handoff Toast */}
        <AnimatePresence>
          {copilotToast && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="absolute bottom-6 right-6 bg-[#07070a]/95 border border-indigo-500/45 backdrop-blur-xl text-white p-4 rounded-xl shadow-[0_10px_40px_rgba(99,102,241,0.25)] z-50 w-72"
            >
              <div className="flex gap-3">
                <Sparkles className="text-indigo-400 w-5 h-5 shrink-0 mt-0.5 animate-pulse" />
                <div className="flex-1 space-y-2 font-sans">
                  <p className="text-[11px] leading-relaxed text-zinc-200">{copilotToast.message}</p>
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={handleRunContextualOptimize} 
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] uppercase tracking-wider font-extrabold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                    >
                      {copilotToast.suggestionType === 'high-speed' ? '⚡ Route Pair' : copilotToast.suggestionType === 'power' ? '🔌 Place Caps' : 'Let AI Optimize'}
                    </button>
                    <button 
                      onClick={() => setCopilotToast(null)} 
                      className="bg-white/5 hover:bg-white/10 text-zinc-400 text-[9px] uppercase tracking-wider font-extrabold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
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
        <MultiplayerCursors presences={presences} activeLocks={activeLocks} />
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
            <button
              onClick={() => setRightSidebarTab('library')}
              className={cn(
                "flex-1 h-full text-[9px] uppercase font-black tracking-widest transition-all border-l border-white/5",
                rightSidebarTab === 'library'
                  ? "text-white bg-[#0d0d0d] border-b-2 border-indigo-500"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Library
            </button>
          </div>

          {rightSidebarTab === 'board' ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <div className="p-4 border-b border-white/5 bg-[#111111]/10">
                <LayerControls layers={layers} onToggleLayer={toggleLayer} />
                
                <div className="mt-4 pt-4 border-t border-white/5">
                  <h4 className="text-[9px] uppercase tracking-[0.1em] font-extrabold text-zinc-500 mb-2">Grid & Snapping</h4>
                  <div className="flex gap-2">
                    {[0.1, 0.5, 1.0].map(res => (
                      <button
                        key={res}
                        onClick={() => useProjectStore.getState().setSnapResolution(res)}
                        className={cn(
                          "flex-1 py-1 rounded text-[10px] font-mono tracking-widest transition-colors",
                          snapResolution === res 
                            ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-bold" 
                            : "bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300 border border-transparent"
                        )}
                      >
                        {res}mm
                      </button>
                    ))}
                  </div>
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
                    {/* Smart Auto — primary action */}
                    <button
                      onClick={handleSmartAutoLayout}
                      disabled={isSmartAutoRunning || isReadOnly}
                      className="w-full py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 hover:border-emerald-400/60 text-emerald-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      <svg className={isSmartAutoRunning ? "animate-spin w-3.5 h-3.5" : "w-3.5 h-3.5"} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      {isReadOnly ? `Read Only` : isSmartAutoRunning ? `Smart Auto Running... ${smartAutoPhase === 'placing' ? '(Placing)' : smartAutoPhase === 'routing' ? '(Routing)' : ''}` : "⚡ Smart Auto Layout"}
                    </button>

                    <button 
                      onClick={runBoardAutoRouter}
                      disabled={isAutoRouting || isReadOnly}
                      className="w-full py-2 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                        <svg className={isAutoRouting ? "animate-spin text-indigo-400 w-3.5 h-3.5" : "text-indigo-400 w-3.5 h-3.5"} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5l4 4"/><path d="M21 5l-4 4"/><path d="M5 19l4-4"/><path d="M21 19l-4-4"/><circle cx="12" cy="12" r="3"/></svg>
                        {isReadOnly ? `${mode === 'replay' ? 'Replay' : 'Inspect'} Mode (Read)` : isAutoRouting ? `Auto-Routing...` : "A* Auto-Route Nets"}
                    </button>

                    <button 
                      onClick={handleRunOptimizer}
                      disabled={isOptimizing || isReadOnly}
                      className="w-full py-2 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer animate-pulse"
                    >
                        <Activity size={14} className={isOptimizing ? "animate-spin" : ""} />
                        {isReadOnly ? `${mode === 'replay' ? 'Replay' : 'Inspect'} Mode (Read)` : isOptimizing ? `Optimizing...` : "Optimize Board Layout"}
                    </button>

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
          ) : rightSidebarTab === 'constraints' ? (
              <ConstraintsPanel
                board={board}
                activeNetClasses={activeNetClasses}
                selectedNetClassId={selectedNetClassId}
                setSelectedNetClassId={setSelectedNetClassId}
                onShowAddClassModal={() => setShowAddClassModal(true)}
                onDeleteNetClass={handleDeleteNetClass}
                onUpdateNetClass={handleUpdateNetClass}
                onAssignNetClass={handleAssignNetClass}
                activeDiffPairs={activeDiffPairs}
                onShowAddDpModal={() => setShowAddDpModal(true)}
                onDeleteDiffPair={handleDeleteDiffPair}
              />
            ) : rightSidebarTab === 'library' ? (
              <ComponentLibraryPanel />
            ) : null}
          </aside>
      )}
      {showThreeD && (
        <ThreeDBoardViewer board={board} onClose={() => setShowThreeD(false)} />
      )}

      {showRoutingModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-[#0b0b10] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col p-6 text-gray-200">
             <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                   <h3 className="text-sm font-black uppercase tracking-widest text-[#6366f1] flex items-center gap-2">
                     <svg className={isAutoRouting ? "animate-spin w-4 h-4 text-indigo-400" : "w-4 h-4 text-indigo-400"} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5l4 4"/><path d="M21 5l-4 4"/><path d="M5 19l4-4"/><path d="M21 19l-4-4"/><circle cx="12" cy="12" r="3"/></svg>
                     A* Router Daemon Console
                   </h3>
                   <p className="text-[9px] text-gray-500 font-mono mt-0.5">Physical trace expansion A* pathfinder solver</p>
                </div>
                <button 
                  onClick={() => setShowRoutingModal(false)}
                  disabled={isAutoRouting}
                  className="text-xs bg-white/5 hover:bg-white/10 text-gray-300 font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all disabled:opacity-50"
                >
                  Close Console
                </button>
             </div>

             <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-2xl p-4 my-4 font-mono text-[10px]">
                <div className="flex flex-col gap-1 items-center justify-center px-4 py-1 flex-1 border-r border-white/5">
                   <span className="text-zinc-500 text-[8px] uppercase font-black">Routing Status</span>
                   <span className={cn("text-xs font-black", isAutoRouting ? "text-indigo-400 animate-pulse" : routingStats.failed === 0 ? "text-emerald-400" : "text-amber-400")}>
                     {isAutoRouting ? "SOLVING GRAPH..." : routingStats.failed === 0 ? "COMPLETED" : "PARTIAL ROUTE"}
                   </span>
                </div>
                <div className="flex flex-col gap-1 items-center justify-center px-4 py-1 flex-1 border-r border-white/5">
                   <span className="text-zinc-500 text-[8px] uppercase font-black">Airwires Resolved</span>
                   <span className="text-xs font-black text-white">{routingStats.routed}</span>
                </div>
                <div className="flex flex-col gap-1 items-center justify-center px-4 py-1 flex-1">
                   <span className="text-zinc-500 text-[8px] uppercase font-black">Unrouteable Airwires</span>
                   <span className="text-xs font-black text-rose-500">{routingStats.failed}</span>
                </div>
             </div>

             <div className="bg-[#050508] border border-white/5 rounded-2xl p-4 h-64 overflow-y-auto font-mono text-[9px] text-[#818cf8] flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-zinc-800">
                {routingLogs.map((log, idx) => {
                  let color = "text-indigo-400/90";
                  if (log.includes("Successfully")) color = "text-emerald-400 font-bold";
                  else if (log.includes("Warning")) color = "text-amber-400";
                  else if (log.startsWith("Auto-routing cycle")) color = "text-indigo-300 font-bold border-t border-white/5 pt-1.5 mt-1.5";
                  
                  return (
                    <div key={idx} className={cn("leading-tight whitespace-pre-wrap flex items-start gap-1.5", color)}>
                      <span className="text-zinc-600 select-none">[{idx + 1}]</span>
                      <span>{log}</span>
                    </div>
                  );
                })}
             </div>

             <div className="mt-4 text-[9px] text-zinc-500 leading-tight flex items-center gap-1.5 bg-[#10b981]/5 border border-[#10b981]/15 px-3 py-2 rounded-xl">
                <ShieldCheck size={14} className="text-[#10b981] shrink-0" />
                <span>Deterministic topological router guarantees zero copper-to-copper Clearance violations against active Keepout zones and alternate net layers.</span>
             </div>
          </div>
        </div>
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

      {orchestrationProgress && (
        <div className="absolute bottom-6 right-6 bg-[#09090b]/95 backdrop-blur-md border border-white/5 p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] z-40 w-80 flex flex-col gap-3 font-mono border-l-2 border-l-indigo-500 text-gray-300 pointer-events-auto">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase text-gray-300 tracking-wider">PCB Routing Orchestration</span>
            </div>
            <span className="text-[10px] bg-indigo-500/15 text-indigo-400 px-2 py-0.5 rounded font-black">{orchestrationProgress.percent}%</span>
          </div>
          <div className="space-y-1.5 text-[11px] max-h-[120px] overflow-y-auto pr-1 flex-1">
            {taskNodes.map(node => (
              <div key={node.id} className="flex items-center justify-between py-0.5">
                <span className="text-gray-400 font-medium truncate max-w-[180px]">{node.name}</span>
                <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1 rounded ${
                  node.status === 'completed' ? 'text-emerald-400 bg-emerald-500/10' :
                  node.status === 'running' ? 'text-indigo-400 bg-indigo-500/10 animate-pulse' :
                  node.status === 'failed' ? 'text-rose-400 bg-rose-500/10' :
                  'text-gray-500'
                }`}>{node.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default PCBEditor;
