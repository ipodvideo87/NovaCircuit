import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  Panel, 
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  BezierEdge,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const CustomEdge = React.memo((props: any) => {
  // @ts-ignore
  if (!window.__EDGE_RENDER_COUNT) window.__EDGE_RENDER_COUNT = 0;
  // @ts-ignore
  window.__EDGE_RENDER_COUNT++;
  
  return <BezierEdge {...props} />;
});
CustomEdge.displayName = 'CustomEdge';

const edgeTypes = {
  default: CustomEdge,
};
import { 
  Share2, 
  Settings, 
  Search, 
  Plus, 
  Zap, 
  Play, 
  MousePointer2, 
  Maximize2, 
  Layers, 
  Box, 
  Undo2, 
  Redo2,
  ChevronDown,
  Info,
  MessageSquare,
  Sparkles,
  CircuitBoard,
  Cpu,
  Activity,
  MoreHorizontal,
  ShieldCheck,
  FileText,
  List,
  X
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import FluxCopilot from './Copilot';
import PCBEditor from './PCBEditor';
import { motion, AnimatePresence } from 'motion/react';
import { ProjectGraph, AIAction, PCBComponent, PinDef } from '../types';

import { validateAndApplyActions } from '../lib/actionValidation';
import { useTransactionManager, deepCloneGraph } from '../lib/transaction';
import { runERC, ERCIssue } from '../lib/erc';
import { resolveNetDrivers, NetDriverReport } from '../lib/netDriver';
import { GlobalLibrary } from '../lib/componentLibrary';
import { SymbolDefinition, SymbolGraphic, SymbolPin } from '../lib/symbols';

interface AIExecutionTrace {
  inputActions: AIAction[];
  validatedActions: AIAction[];
  actionValidationMap?: boolean[];
  errors: string[];
  ercIssues?: ERCIssue[];
  netDriverReports?: NetDriverReport[];
  beforeGraph: ProjectGraph;
  afterGraph: ProjectGraph;
  status: 'committed' | 'rejected';
  timestamp: number;
  explanation?: string;
}

export function mapGraphToFlow(graph: ProjectGraph, prevNodes?: any[], prevEdges?: any[]) {
  const prevNodeMap = new Map(prevNodes?.map(n => [n.id, n]) || []);
  const prevEdgeMap = new Map(prevEdges?.map(e => [e.id, e]) || []);

  const newNodes = graph.components.map(comp => {
    const id = comp.id || comp.designator;
    const type = 'component';
    
    let libComp = undefined;
    let symbol = undefined;
    if (comp.partNumber) {
      libComp = GlobalLibrary.getComponent(comp.partNumber);
      if (libComp) {
        symbol = GlobalLibrary.getSymbol(libComp.symbolId);
      }
    }

    // We recreate data specifically to check changes, but it's cheap to allocate data object
    const newData = {
      label: comp.designator,
      type: comp.partType || 'component',
      icon: (comp.partType && (comp.partType.includes('MCU') || comp.partType.includes('ESP32') || comp.partType.includes('IC'))) ? <Cpu size={14} /> : <CircuitBoard size={14} />,
      pins: comp.pins && comp.pins.length > 0 ? comp.pins : [{name: '1', type: 'passive'}, {name: '2', type: 'passive'}],
      footprint: comp.footprint,
      properties: comp.properties,
      partNumber: comp.partNumber,
      libComp,
      symbol
    };

    const prev = prevNodeMap.get(id);
    let propsChanged = false;
    if (prev && prev.data.properties && newData.properties) {
      const pKeys = Object.keys(prev.data.properties);
      const nKeys = Object.keys(newData.properties);
      if (pKeys.length !== nKeys.length) propsChanged = true;
      else {
        for (const k of pKeys) {
          if (prev.data.properties[k] !== newData.properties[k]) {
            propsChanged = true;
            break;
          }
        }
      }
    } else if (prev?.data.properties !== newData.properties) {
      propsChanged = true;
    }

    if (prev && prev.position.x === comp.position.x && prev.position.y === comp.position.y && 
        prev.data.label === newData.label && prev.data.type === newData.type && 
        prev.data.footprint === newData.footprint && prev.data.partNumber === newData.partNumber && !propsChanged) {
      return prev;
    }

    return {
      id,
      type,
      position: comp.position,
      data: newData
    };
  });

  const newEdges: any[] = [];
  graph.nets.forEach(net => {
    for(let i=0; i<net.connections.length - 1; i++) {
      const from = net.connections[i];
      const to = net.connections[i+1];
      const id = `e-${from.componentId}-${from.pinName}-${to.componentId}-${to.pinName}`;
      
      const prev = prevEdgeMap.get(id);
      if (prev && prev.source === from.componentId && prev.sourceHandle === from.pinName && 
          prev.target === to.componentId && prev.targetHandle === to.pinName) {
        newEdges.push(prev);
        continue;
      }

      newEdges.push({
         id,
         source: from.componentId,
         target: to.componentId,
         sourceHandle: from.pinName,
         targetHandle: to.pinName,
         animated: true,
         style: { stroke: '#6366f1' }
      });
    }
  });

  return { nodes: newNodes, edges: newEdges };
}

export function computeDiffOverlay(beforeGraph: ProjectGraph, afterGraph: ProjectGraph, prevNodes?: any[], prevEdges?: any[]) {
  const prevNodeMap = new Map((prevNodes || []).map(n => [n.id, n]));
  const prevEdgeMap = new Map((prevEdges || []).map(e => [e.id, e]));

  const afterNodesMap = new Map(afterGraph.components.map(c => [c.id || c.designator, c]));
  const beforeNodesMap = new Map(beforeGraph.components.map(c => [c.id || c.designator, c]));

  const newNodes: any[] = [];
  const newEdges: any[] = [];

  const allNodeIds = new Set([...beforeNodesMap.keys(), ...afterNodesMap.keys()]);

  allNodeIds.forEach(id => {
    const b = beforeNodesMap.get(id);
    const a = afterNodesMap.get(id);
    const comp = a || b;

    let diffStatus = null;
    if (a && !b) diffStatus = 'added';
    else if (!a && b) diffStatus = 'removed';
    else if (a && b) {
      // Fast deep comparison check without JSON.stringify
      let modified = false;
      if (a.position.x !== b.position.x || a.position.y !== b.position.y) modified = true;
      else if (a.partType !== b.partType || a.partNumber !== b.partNumber || a.footprint !== b.footprint) modified = true;
      else if (a.designator !== b.designator) modified = true;
      else {
        const pKeys = Object.keys(a.properties || {});
        const nKeys = Object.keys(b.properties || {});
        if (pKeys.length !== nKeys.length) modified = true;
        else {
          for (const k of pKeys) {
            if (a.properties[k] !== b.properties[k]) {
              modified = true;
              break;
            }
          }
        }
      }
      if (modified) diffStatus = 'modified';
    }

    if (comp) {
      let libComp = undefined;
      let symbol = undefined;
      
      if (comp.partNumber) {
        libComp = GlobalLibrary.getComponent(comp.partNumber);
        if (libComp) {
          symbol = GlobalLibrary.getSymbol(libComp.symbolId);
        }
      }

      const id = comp.id || comp.designator;
      const prev = prevNodeMap.get(id);
      
      const newData = {
        label: comp.designator,
        type: comp.partType || 'component',
        icon: (comp.partType && (comp.partType.includes('MCU') || comp.partType.includes('ESP32') || comp.partType.includes('IC'))) ? <Cpu size={14} /> : <CircuitBoard size={14} />,
        pins: comp.pins && comp.pins.length > 0 ? comp.pins : [{name: '1', type: 'passive'}, {name: '2', type: 'passive'}],
        footprint: comp.footprint,
        properties: comp.properties,
        partNumber: comp.partNumber,
        libComp,
        symbol,
        diffStatus
      };

      let propsChanged = false;
      if (prev && prev.data.diffStatus !== diffStatus) {
         propsChanged = true;
      } else if (prev && prev.data.properties && newData.properties) {
        const pKeys = Object.keys(prev.data.properties);
        const nKeys = Object.keys(newData.properties);
        if (pKeys.length !== nKeys.length) propsChanged = true;
        else {
          for (const k of pKeys) {
            if (prev.data.properties[k] !== newData.properties[k]) {
              propsChanged = true;
              break;
            }
          }
        }
      } else if (prev?.data.properties !== newData.properties) {
        propsChanged = true;
      }

      if (prev && prev.position.x === comp.position.x && prev.position.y === comp.position.y && 
          prev.data.label === newData.label && prev.data.type === newData.type && 
          prev.data.footprint === newData.footprint && prev.data.partNumber === newData.partNumber && !propsChanged) {
        newNodes.push(prev);
      } else {
        newNodes.push({
          id,
          type: 'component',
          position: comp.position,
          data: newData
        });
      }
    }
  });

  function getNetEdges(g: ProjectGraph) {
    const edges = new Map();
    g.nets.forEach(net => {
      for(let i=0; i<net.connections.length - 1; i++) {
        const from = net.connections[i];
        const to = net.connections[i+1];
        const sId = `${from.componentId}-${from.pinName}`;
        const tId = `${to.componentId}-${to.pinName}`;
        const [src, tgt] = sId < tId ? [{id: sId, ref: from}, {id: tId, ref: to}] : [{id: tId, ref: to}, {id: sId, ref: from}];
        const id = `e-${src.id}-${tgt.id}`;
         edges.set(id, { originalFrom: src.ref, originalTo: tgt.ref, parsedSrcId: src.id, parsedTgtId: tgt.id });
      }
    });
    return edges;
  }

  const afterEdgesMap = getNetEdges(afterGraph);
  const beforeEdgesMap = getNetEdges(beforeGraph);
  const allEdgeIds = new Set([...beforeEdgesMap.keys(), ...afterEdgesMap.keys()]);

  allEdgeIds.forEach(id => {
    const b = beforeEdgesMap.get(id);
    const a = afterEdgesMap.get(id);
    const edgeData = a || b;

    let diffStatus = null;
    if (a && !b) diffStatus = 'added';
    else if (!a && b) diffStatus = 'removed';

    let strokeColor = '#6366f1';
    let strokeDasharray = undefined;
    let opacity = 1;
    let strokeWidth = 1;

    if (diffStatus === 'added') {
      strokeColor = '#10b981';
      strokeWidth = 2;
    } else if (diffStatus === 'removed') {
      strokeColor = '#f43f5e';
      strokeDasharray = '5 5';
      opacity = 0.5;
    }

    const prevEdge = prevEdgeMap.get(id);
    if (prevEdge && 
        prevEdge.source === edgeData.originalFrom.componentId && 
        prevEdge.target === edgeData.originalTo.componentId &&
        prevEdge.sourceHandle === edgeData.originalFrom.pinName &&
        prevEdge.targetHandle === edgeData.originalTo.pinName &&
        prevEdge.style?.stroke === strokeColor &&
        prevEdge.style?.opacity === opacity &&
        prevEdge.style?.strokeWidth === strokeWidth &&
        prevEdge.style?.strokeDasharray === strokeDasharray) {
      newEdges.push(prevEdge);
    } else {
      newEdges.push({
         id,
         source: edgeData.originalFrom.componentId,
         target: edgeData.originalTo.componentId,
         sourceHandle: edgeData.originalFrom.pinName,
         targetHandle: edgeData.originalTo.pinName,
         animated: true,
         style: { stroke: strokeColor, opacity, strokeWidth, strokeDasharray }
      });
    }
  });

  return { nodes: newNodes, edges: newEdges };
}

// --- Custom Nodes ---
const ComponentNode = React.memo(({ data, selected }: { data: any, selected: boolean }) => {
  // @ts-ignore
  if (!window.__NODE_RENDER_COUNT) window.__NODE_RENDER_COUNT = 0;
  // @ts-ignore
  window.__NODE_RENDER_COUNT++;

  const renderSymbol = () => {
    if (!data.symbol || !data.symbol.units || data.symbol.units.length === 0) return null;
    const unit = data.symbol.units[0];
    
    // Convert logic coordinates to React flow handles & SVG coordinates
    // Assuming symbol centers around (0,0) with width & height defining viewBox
    const viewBox = `${-unit.width/2} ${-unit.height/2} ${unit.width} ${unit.height}`;

    return (
      <div className="relative flex items-center justify-center p-4">
        <svg width={unit.width} height={unit.height} viewBox={viewBox} className="overflow-visible stroke-gray-300">
          {unit.graphics.map((g: any, i: number) => {
            if (g.type === 'rect') return <rect key={i} x={g.x} y={g.y} width={g.width} height={g.height} className={g.className || "stroke-current fill-[#1a1a1a] stroke-[1.5px]"} />
            if (g.type === 'line') return <line key={i} x1={g.x} y1={g.y} x2={g.x + (g.width||0)} y2={g.y + (g.height||0)} className={g.className || "stroke-current stroke-[1.5px]"} />
            if (g.type === 'circle') return <circle key={i} cx={g.x} cy={g.y} r={g.radius || 10} className={g.className || "stroke-current fill-[#1a1a1a] stroke-[1.5px]"} />
            return null;
          })}
          {unit.pins.map((p: any) => {
            // Draw pin line
            const lineX2 = p.direction === 'Left' ? p.x - p.length : p.direction === 'Right' ? p.x + p.length : p.x;
            const lineY2 = p.direction === 'Up' ? p.y - p.length : p.direction === 'Down' ? p.y + p.length : p.y;
            return (
              <g key={`pin-${p.id}`}>
                <line x1={p.x} y1={p.y} x2={lineX2} y2={lineY2} className="stroke-indigo-400 stroke-[1.5px]" />
                <text x={p.direction === 'Left' ? p.x - p.length/2 : p.direction === 'Right' ? p.x + p.length/2 : p.x} 
                      y={p.direction === 'Up' ? p.y - p.length/2 : p.direction === 'Down' ? p.y + p.length/2 : p.y - 4} 
                      className="fill-indigo-300 text-[6px] font-mono" textAnchor="middle">
                  {p.name}
                </text>
              </g>
            )
          })}
        </svg>
        
        {/* Render actual handles for React Flow */}
        {unit.pins.map((p: any) => {
           let pos = Position.Left;
           if (p.direction === 'Left') pos = Position.Left;
           if (p.direction === 'Right') pos = Position.Right;
           if (p.direction === 'Up') pos = Position.Top;
           if (p.direction === 'Down') pos = Position.Bottom;

           // Map SVG space to HTML space. viewBox is centered on 0,0
           const leftPct = ((p.x + unit.width/2) / unit.width) * 100;
           const topPct = ((p.y + unit.height/2) / unit.height) * 100;

           return (
             <Handle
               key={p.id}
               type="source"
               position={pos}
               id={p.id}
               style={{ left: `${leftPct}%`, top: `${topPct}%`, minWidth: '4px', minHeight: '4px', width: '4px', height: '4px', background: '#818cf8', border: 'none' }}
             />
           )
        })}
      </div>
    );
  };

  return (
  <div className={cn(
    "px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded shadow-2xl transition-all relative flex flex-col items-center justify-center min-w-[80px]",
    selected && "ring-2 ring-indigo-500 border-transparent",
    data.diffStatus === 'added' ? "!border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-emerald-500/10" : "",
    data.diffStatus === 'removed' ? "!border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] bg-rose-500/10 opacity-60 grayscale hover:grayscale-0 z-0" : "",
    data.diffStatus === 'modified' ? "!border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] bg-amber-500/10 z-10" : "",
  )}>
    {data.diffStatus && (
       <div className={cn(
         "absolute -top-2 -right-2 text-[8px] font-black uppercase px-1.5 py-0.5 rounded shadow-lg tracking-widest z-20",
         data.diffStatus === 'added' ? "bg-emerald-500 text-emerald-950" :
         data.diffStatus === 'removed' ? "bg-rose-500 text-rose-950" :
         "bg-amber-500 text-amber-950"
       )}>
         {data.diffStatus}
       </div>
    )}
    <div className="flex items-center gap-2 mb-1 pb-1 w-full justify-center">
      <span className="font-mono text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">
        {data.label}
      </span>
    </div>
    
    {data.symbol ? renderSymbol() : (
       <div className="w-full space-y-1 mt-2">
         {data.pins?.map((pin: any, i: number) => (
           <div key={i} className="flex justify-between items-center px-1 border-b border-white/2 pb-0.5 last:border-none relative">
              <Handle type="source" position={Position.Left} id={pin.name} style={{ left: '-10px', top: '50%', background: '#818cf8', opacity: 0 }} />
              <div className="w-1 h-1 rounded-full bg-white/20 -ml-2" />
              <span className="text-[8px] text-gray-500 font-mono tracking-tighter">{pin.name}</span>
           </div>
         ))}
       </div>
    )}
    
    <div className="text-[8px] text-gray-600 mt-1 uppercase font-black tracking-widest">{data.partNumber || data.type}</div>
  </div>
  );
});
ComponentNode.displayName = 'ComponentNode';

const nodeTypes = {
  component: ComponentNode,
};

const initialNodes = [
  { 
    id: '1', 
    type: 'component',
    position: { x: 400, y: 150 }, 
    data: { 
      label: 'ESP32-S3-WROOM', 
      type: 'mcu',
      icon: <Cpu size={14} />,
      pins: [
        {name: '3V3', type: 'power_in'}, {name: 'EN', type: 'input'}, {name: 'IO1', type: 'bidirectional'}, 
        {name: 'IO2', type: 'bidirectional'}, {name: 'GND', type: 'ground'}, {name: 'RX', type: 'input'}, 
        {name: 'TX', type: 'output'}, {name: 'IO5', type: 'bidirectional'}
      ]
    } 
  },
  { 
    id: '2', 
    type: 'component',
    position: { x: 100, y: 200 }, 
    data: { 
      label: 'USB-C', 
      icon: <Zap size={14} />,
      pins: [{name: 'VBUS', type: 'power_out'}, {name: 'D+', type: 'bidirectional'}, {name: 'D-', type: 'bidirectional'}, {name: 'GND', type: 'ground'}]
    } 
  },
];

const initialEdges = [
  { id: 'e1-2', source: '2', target: '1', animated: true, style: { stroke: '#6366f1' } }
];

type EditorView = 'schematic' | 'pcb' | '3d';

export function useReplayEngine(tracesRef: React.MutableRefObject<AIExecutionTrace[]>) {
  const [replayIndex, setReplayIndex] = useState<number | null>(null);

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < tracesRef.current.length) {
      console.time('replayStepRender');
      setReplayIndex(index);
    }
  }, [tracesRef]);

  const next = useCallback(() => {
    setReplayIndex(prev => {
      if (prev === null) return tracesRef.current.length > 0 ? 0 : null;
      return prev + 1 < tracesRef.current.length ? prev + 1 : prev;
    });
  }, [tracesRef]);

  const prev = useCallback(() => {
    setReplayIndex(prev => {
      if (prev === null) return null;
      return prev > 0 ? prev - 1 : 0;
    });
  }, []);

  const exitReplay = useCallback(() => {
    setReplayIndex(null);
  }, []);

  const replayGraph = replayIndex !== null && tracesRef.current[replayIndex]
    ? tracesRef.current[replayIndex].afterGraph
    : null;

  return {
    replayIndex,
    goToStep,
    next,
    prev,
    exitReplay,
    replayGraph
  };
}

const initialProjectGraph: ProjectGraph = {
  components: initialNodes.map(n => ({
    id: n.id,
    designator: n.data.label as string,
    partType: n.data.type as string,
    position: n.position,
    pins: (n.data.pins as any[]) || [],
    footprint: (n.data as any).footprint || 'DEFAULT',
    properties: (n.data as any).properties || {}
  })),
  nets: initialEdges.map(e => ({
    id: e.id,
    name: `Net-${e.source}-${e.target}`,
    netClass: "SIGNAL",
    type: "signal" as any,
    connections: [
      { componentId: e.source, pinName: (e as any).sourceHandle || '1' },
      { componentId: e.target, pinName: (e as any).targetHandle || '1' }
    ]
  }))
};

const TraceInspectorList = React.memo(function TraceInspectorList({ traces, replayIndex, goToStep }: { traces: any[], replayIndex: number | null, goToStep: (i: number) => void }) {
  if (traces.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">No traces recorded yet</p>
      </div>
    );
  }
  
  return (
    <>
      {traces.map((trace, i) => (
        <TraceRow 
          key={trace.timestamp + '-' + i}
          trace={trace}
          i={i}
          isReplaying={replayIndex === i}
          onGoToStep={goToStep}
        />
      ))}
    </>
  );
});

const SimWaveform = React.memo(function SimWaveform({ count, baseHeight, variation, color, duration, delayStep }: { count: number, baseHeight: number, variation: number, color: string, duration: number, delayStep: number }) {
   return (
      <div className="flex-1 flex items-end gap-[1px]">
         {Array.from({ length: count }).map((_, i) => (
           <motion.div 
             key={i} 
             className={`flex-1 ${color} rounded-t-[0.5px]`}
             animate={{ height: [`${baseHeight + Math.random() * variation}%`, `${baseHeight + Math.random() * variation}%`] }}
             transition={{ repeat: Infinity, duration, delay: i * delayStep }}
           />
         ))}
      </div>
   );
});

const TraceRow = React.memo(({ trace, i, isReplaying, onGoToStep }: { trace: AIExecutionTrace, i: number, isReplaying: boolean, onGoToStep: (i: number) => void }) => {
  const [expandedTraceActions, setExpandedTraceActions] = useState<Record<string, boolean>>({});
  const [rcaExpanded, setRcaExpanded] = useState<Record<string, boolean>>({});

  return (
    <div 
      onClick={() => onGoToStep(i)}
      className={cn(
        "p-3 rounded-lg border cursor-pointer transition-all hover:-translate-y-0.5",
        isReplaying ? "border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)] bg-indigo-500/10" : "border-white/5 bg-white/2 hover:border-white/20 hover:bg-white/5"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Step {i + 1}</span>
        <span className={cn(
          "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
          trace.status === 'committed' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
        )}>
          {trace.status}
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        {trace.inputActions.map((a, j) => {
          const actionKey = `${trace.timestamp}-${j}`;
          const isExpanded = expandedTraceActions[actionKey];
          const isValidated = trace.actionValidationMap && trace.actionValidationMap[j] !== undefined 
            ? trace.actionValidationMap[j] 
            : trace.status === 'committed'; // fallback
          const hasErrors = trace.status === 'rejected';

          return (
            <div
              key={actionKey}
              className="flex flex-col gap-1 border border-white/5 rounded w-full bg-black/20 p-1.5 cursor-pointer hover:bg-white/5 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedTraceActions(prev => ({ ...prev, [actionKey]: !prev[actionKey] }));
              }}
            >
              <div className="text-[10px] text-gray-300 font-mono flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("w-1.5 h-1.5 rounded-full", isValidated ? "bg-emerald-500" : (hasErrors ? "bg-rose-500" : "bg-white/20"))} />
                  {a.name}
                </div>
                <span className="text-[8px] text-gray-500">{isExpanded ? '▼' : '▶'}</span>
              </div>
              
              {isExpanded && (
                <div className="mt-2 text-[9px] font-mono space-y-2 border-t border-white/10 pt-2 pb-1" onClick={e => e.stopPropagation()}>
                  <div>
                    <span className="text-gray-500 font-bold uppercase tracking-widest block mb-1">Args:</span>
                    <pre className="text-gray-400 whitespace-pre-wrap bg-white/5 p-1.5 rounded">{JSON.stringify(a.args, null, 2)}</pre>
                  </div>
                  {a.reasoning && (
                    <div>
                      <span className="text-gray-500 font-bold uppercase tracking-widest block mb-1">Reasoning:</span>
                      <div className="text-indigo-300/80 italic font-sans leading-relaxed border-l-2 border-indigo-500/30 pl-2">
                        {a.reasoning}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center bg-white/5 p-1.5 rounded">
                    <span className="text-gray-500 font-bold uppercase tracking-widest">Validation Status:</span>
                    <span className={cn(
                      "font-bold uppercase tracking-widest",
                      isValidated ? "text-emerald-400" : (hasErrors ? "text-rose-400" : "text-gray-400")
                    )}>
                      {isValidated ? 'Success' : (hasErrors ? 'Failed' : 'Pending')}
                    </span>
                  </div>
                  {trace.explanation && (
                    <div>
                      <span className="text-gray-500 font-bold uppercase tracking-widest block mb-1">Batch Explanation:</span>
                      <div className="text-indigo-300/80 italic font-sans leading-relaxed border-l-2 border-indigo-500/30 pl-2">
                        {trace.explanation}
                      </div>
                    </div>
                  )}
                  {(!isValidated && hasErrors) && (
                    <div className="mt-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setRcaExpanded(prev => ({...prev, [actionKey]: !prev[actionKey]})) }}
                        className="px-2 py-1.5 text-[9px] bg-rose-500/20 text-rose-400 rounded hover:bg-rose-500/30 transition-colors uppercase font-bold tracking-widest flex items-center gap-1 w-full justify-center"
                      >
                         Explain Failure {rcaExpanded[actionKey] ? '▲' : '▼'}
                      </button>
                      
                      {rcaExpanded[actionKey] && (
                         <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded space-y-3">
                            <div>
                               <span className="text-rose-500/70 font-bold uppercase tracking-widest block mb-0.5">Validation Rule Failed:</span>
                               <span className="text-rose-300 font-mono tracking-tight bg-rose-500/10 px-1.5 py-0.5 rounded leading-relaxed">{trace.errors.find(e => (e || '').includes(`'${a.name}'`)) || trace.errors[0] || 'Unknown Rule violation'}</span>
                            </div>
                            <div>
                               <span className="text-rose-500/70 font-bold uppercase tracking-widest block mb-0.5">Graph Context:</span>
                               <pre className="text-gray-400 font-mono tracking-tight whitespace-pre-wrap bg-black/40 p-1.5 rounded">{JSON.stringify(a.args, null, 2)}</pre>
                            </div>
                            <div>
                               <span className="text-rose-500/70 font-bold uppercase tracking-widest block mb-0.5">Root Cause Explanation:</span>
                               <span className="text-gray-300 italic font-sans leading-relaxed block border-l-2 border-rose-500/30 pl-2">
                                 The "{a.name}" operation generated by the AI was rejected by the deterministic layout engine. This occurs when attempting to reference components or pins that do not exist in the current Project Graph state, or when violating invariant constraints like ID uniqueness.
                               </span>
                            </div>
                         </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[9px] font-mono p-2 bg-black/40 rounded border border-white/5 space-y-1.5">
        <div className="text-gray-500 font-bold uppercase tracking-widest mb-1 pb-1 border-b border-white/5">Graph Diff</div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Nodes:</span>
          <span className="text-gray-300">{trace.beforeGraph.components.length} → {trace.afterGraph.components.length}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Nets:</span>
          <span className="text-gray-300">{trace.beforeGraph.nets.length} → {trace.afterGraph.nets.length}</span>
        </div>
      </div>

      <div className="text-[9px] font-mono p-2 bg-black/40 rounded border border-white/5 space-y-1.5 mt-2">
        <div className="text-gray-500 font-bold uppercase tracking-widest mb-1 pb-1 border-b border-white/5">ERC Results</div>
        {trace.ercIssues && trace.ercIssues.length > 0 ? (
          <div className="space-y-1">
            {trace.ercIssues.map(issue => (
              <div key={issue.id} className={cn("px-1.5 py-1 rounded border", issue.severity === 'error' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20")}>
                <span className="font-bold uppercase tracking-widest text-[8px] mr-1">[{issue.severity}]</span>
                {issue.message}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-emerald-400">No ERC violations</span>
        )}
      </div>

      {trace.netDriverReports && trace.netDriverReports.length > 0 && (
        <div className="text-[9px] font-mono p-2 bg-black/40 rounded border border-white/5 space-y-1.5 mt-2">
          <div className="text-gray-500 font-bold uppercase tracking-widest mb-1 pb-1 border-b border-white/5">Net Drivers</div>
          {trace.netDriverReports.map(report => (
            <div key={report.netId} className="px-1.5 py-1 rounded border bg-indigo-500/10 text-indigo-300 border-indigo-500/20 mb-1">
              <div className="font-bold">Net: {report.netName}</div>
              <div className="text-[8px] text-indigo-400/80">
                Drivers: {report.drivers.length} ({report.drivers.map(d => d.type).join(', ') || 'None'}) | 
                Sinks: {report.sinks.length}
                {report.floating && <span className="text-amber-400 ml-1">(Floating)</span>}
                {report.contention && <span className="text-rose-400 ml-1">(Contention)</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default function SchematicEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'library' | 'hierarchy'>('library');
  const [view, setView] = useState<EditorView>('pcb');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [traceInspectorOpen, setTraceInspectorOpen] = useState(false);
  const [expandedTraceActions, setExpandedTraceActions] = useState<Record<string, boolean>>({});
  const [rcaExpanded, setRcaExpanded] = useState<Record<string, boolean>>({});
  const [diffModeEnabled, setDiffModeEnabled] = useState(true);
  const [drcWarnings, setDrcWarnings] = useState<string[]>([]);
  const [traceCount, setTraceCount] = useState(0);
  const lastWidth = useRef(window.innerWidth);
  const isProcessingActions = useRef(false);
  const actionQueue = useRef<{actions: AIAction[], explanation?: string}[]>([]);
  const executionTraces = useRef<AIExecutionTrace[]>([]);

  const {
    replayIndex,
    goToStep,
    next,
    prev,
    exitReplay,
    replayGraph
  } = useReplayEngine(executionTraces);

  const { history, currentIndex, commitTransaction, rollback, undo, redo, canUndo, canRedo } = useTransactionManager(initialProjectGraph);

  const activeGraph = replayGraph ?? history[currentIndex];

  const selectedIdsStr = nodes.filter((n: any) => n.selected).map((n: any) => n.id).join(',');
  const memoizedSelectedIds = useMemo(() => selectedIdsStr ? selectedIdsStr.split(',') : [], [selectedIdsStr]);
  const handlePcbSelect = useCallback((id: string) => {
    setNodes(ns => ns.map(n => ({ ...n, selected: n.id === id })));
  }, [setNodes]);

  const prevDiffNodes = useRef<any>(null);
  const prevDiffEdges = useRef<any>(null);

  const diffResult = useMemo(() => {
    if (replayIndex !== null && executionTraces.current[replayIndex] && diffModeEnabled) {
      console.time('computeDiffOverlay');
      const res = computeDiffOverlay(
        executionTraces.current[replayIndex].beforeGraph, 
        executionTraces.current[replayIndex].afterGraph,
        prevDiffNodes.current,
        prevDiffEdges.current
      );
      prevDiffNodes.current = res.nodes;
      prevDiffEdges.current = res.edges;
      console.timeEnd('computeDiffOverlay');
      return res;
    }
    prevDiffNodes.current = null;
    prevDiffEdges.current = null;
    return null;
  }, [replayIndex, diffModeEnabled]);

  const prevMapNodes = useRef<any>(null);
  const prevMapEdges = useRef<any>(null);

  const mapResult = useMemo(() => {
    if (replayIndex !== null && replayGraph && !diffModeEnabled) {
      console.time('mapGraphToFlow');
      const res = mapGraphToFlow(replayGraph, prevMapNodes.current, prevMapEdges.current);
      prevMapNodes.current = res.nodes;
      prevMapEdges.current = res.edges;
      console.timeEnd('mapGraphToFlow');
      return res;
    }
    prevMapNodes.current = null;
    prevMapEdges.current = null;
    return null;
  }, [replayIndex, diffModeEnabled, replayGraph]);

  const displayNodes = diffResult ? diffResult.nodes : (mapResult ? mapResult.nodes : nodes);
  const displayEdges = diffResult ? diffResult.edges : (mapResult ? mapResult.edges : edges);

  useEffect(() => {
    if (replayIndex !== null) {
      // In a real scenario we'd use a useLayoutEffect on the rendered items, but this works for simple profiling
      requestAnimationFrame(() => {
        try { console.timeEnd('replayStepRender'); } catch (e) {}
      });
    }
  }, [replayIndex]);

  useEffect(() => {
    // DRC Warnings are driven purely by transaction results now.
    
    const checkMobile = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      setIsMobile(mobile);
      
      // Only force state changes if the layout mode (mobile/desktop) actually changes
      const modeChanged = (width < 768) !== (lastWidth.current < 768);
      if (modeChanged) {
        if (mobile) {
          setSidebarOpen(false);
          setCopilotOpen(false);
        } else {
          setSidebarOpen(true);
          setCopilotOpen(true);
        }
      }
      lastWidth.current = width;
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  const applyGraphToEditor = useCallback((graph: ProjectGraph) => {
    setNodes((prevNodes) => {
      console.time('apply mapGraphToFlow - nodes');
      const { nodes: newNodes } = mapGraphToFlow(graph, prevNodes, undefined);
      console.timeEnd('apply mapGraphToFlow - nodes');
      const prevMap = new Map<string, any>((prevNodes || []).map((p: any) => [p.id, p]));
      return newNodes.map((nn) => {
        const existingNode = prevMap.get(nn.id);
        if (existingNode && existingNode === nn) {
          return existingNode;
        }
        if (existingNode) {
          return {
            ...existingNode,
            ...nn,
            selected: existingNode.selected,
            dragging: existingNode.dragging,
            position: existingNode.dragging ? existingNode.position : nn.position
          };
        }
        return nn;
      });
    });
    
    setEdges((prevEdges) => {
      console.time('apply mapGraphToFlow - edges');
      const { edges: newEdges } = mapGraphToFlow(graph, undefined, prevEdges);
      console.timeEnd('apply mapGraphToFlow - edges');
      const prevMap = new Map<string, any>((prevEdges || []).map((p: any) => [p.id, p]));
      return newEdges.map((ne) => {
        const existingEdge = prevMap.get(ne.id);
        if (existingEdge && existingEdge === ne) {
          return existingEdge;
        }
        if (existingEdge) {
          return {
            ...existingEdge,
            ...ne,
            selected: existingEdge.selected
          } as any;
        }
        return ne;
      });
    });
  }, [setNodes, setEdges]);

  const handleAiActionsDeps = useRef({ applyGraphToEditor, commitTransaction, rollback, exitReplay });
  useEffect(() => {
    handleAiActionsDeps.current = { applyGraphToEditor, commitTransaction, rollback, exitReplay };
  }, [applyGraphToEditor, commitTransaction, rollback, exitReplay]);

  const handleAiActions = useCallback((actions: AIAction[], explanation?: string) => {
    actionQueue.current.push({ actions, explanation });

    if (isProcessingActions.current) {
      return;
    }

    const processQueue = async () => {
      isProcessingActions.current = true;
      const { exitReplay: exit, rollback: rb, commitTransaction: commit, applyGraphToEditor: apply } = handleAiActionsDeps.current;
      
      exit();
      let workingGraph = rb();
      let finalGraphToCommit: ProjectGraph | null = null;
      
      const sessionBeforeGraph = rb();
      const sessionInputActions: AIAction[] = [];
      const sessionValidatedActions: AIAction[] = [];
      const sessionExplanations: string[] = [];

      try {
        while (actionQueue.current.length > 0) {
          const { actions: currentActions, explanation } = actionQueue.current.shift()!;
          if (explanation) sessionExplanations.push(explanation);
          const beforeBatchGraph = deepCloneGraph(workingGraph);

          // Yield to event loop to prevent blocking React render
          await new Promise(resolve => setTimeout(resolve, 0));

          const { rollback: currentRb } = handleAiActionsDeps.current; // Re-fetch in case changed across async yields
          
          // 1. Validate actions against the current Project Graph structure
          const { updatedGraph, errors, validActions } = validateAndApplyActions(currentActions, workingGraph);

          const isRejected = errors.length > 0;

          // 2. Transaction Check
          if (isRejected) {
            // Track Execution Trace (Rejected) immediately
            const validationMap = currentActions.map(a => validActions.some(
                va => va.name === a.name && JSON.stringify(va.args) === JSON.stringify(a.args)
            ));
            executionTraces.current = [...executionTraces.current, {
              inputActions: currentActions,
              validatedActions: validActions,
              actionValidationMap: validationMap,
              errors,
              beforeGraph: beforeBatchGraph,
              afterGraph: beforeBatchGraph,
              status: 'rejected',
              timestamp: Date.now(),
              explanation
            }];
            if (executionTraces.current.length > 50) {
              executionTraces.current = executionTraces.current.slice(-50);
            }
            setTraceCount(executionTraces.current.length);

            // Revert completely on any invalid operation: no state changes
            const newLogs = [`BLOCKED: Invalid actions detected.`];
            errors.forEach(e => {
              newLogs.push(`ERROR: ${e}`);
            });
            setDrcWarnings(prev => [...newLogs, ...prev].slice(0, 10));
            continue; 
          }

          workingGraph = updatedGraph;
          finalGraphToCommit = workingGraph;

          sessionInputActions.push(...currentActions);
          sessionValidatedActions.push(...validActions);

          // 3. Provide feedback metrics
          const newLogs: string[] = [];
          for (const a of validActions) {
            try {
              if (a.name === 'run_simulator') newLogs.push(`SIM: probing net ${(a.args || {}).targetNet}... INFO: Voltage stabilized.`);
              else if (a.name === 'calculate_trace_width') newLogs.push(`CALC: Computed trace width for ${(a.args || {}).current}A`);
              else if (a.name === 'search_components') {
                const results = GlobalLibrary.searchComponents(a.args?.query || '');
                const formatted = results.map(r => `${r.partNumber} (${r.category}) - ${r.metadata.description}`).join('; ');
                newLogs.push(`SEARCH: Identified alternative components for ${(a.args || {}).query}: ${formatted || 'None found'}`);
              }
              else newLogs.push(`INFO: Formally verified and executed ${a.name}`);
            } catch (error) {
              console.error("Action failed:", error, a);
            }
          }
          
          if (newLogs.length > 0) {
            setDrcWarnings(prev => [...newLogs, ...prev].slice(0, 10));
          }
        }
        
        // 4. Commit Transaction ONCE at the end
        if (finalGraphToCommit && sessionInputActions.length > 0) {
          const { commitTransaction: currentCommit, applyGraphToEditor: currentApply } = handleAiActionsDeps.current;
          currentCommit(finalGraphToCommit);
          currentApply(finalGraphToCommit);
          
          const issues = runERC(finalGraphToCommit);
          const rawNetDriverReports = resolveNetDrivers(finalGraphToCommit);
          
          // Create ONE finalized AIExecutionTrace object
          const validationMap = sessionInputActions.map(a => sessionValidatedActions.some(
              va => va.name === a.name && JSON.stringify(va.args) === JSON.stringify(a.args)
          ));
          executionTraces.current = [...executionTraces.current, {
            inputActions: sessionInputActions,
            validatedActions: sessionValidatedActions,
            actionValidationMap: validationMap,
            errors: [],
            ercIssues: issues,
            netDriverReports: rawNetDriverReports,
            beforeGraph: sessionBeforeGraph,
            afterGraph: finalGraphToCommit,
            status: 'committed',
            timestamp: Date.now(),
            explanation: sessionExplanations.join('\n\n')
          }];
          
          if (executionTraces.current.length > 50) {
            executionTraces.current = executionTraces.current.slice(-50);
          }
          setTraceCount(executionTraces.current.length);
        }
      } finally {
        isProcessingActions.current = false;
      }
    };

    processQueue();
  }, []);

  const onConnect = useCallback((params: Connection) => {
    if (isProcessingActions.current) return;
    handleAiActions([{
      name: 'connect_net',
      args: {
        from: `${params.source}.${params.sourceHandle || '1'}`,
        to: `${params.target}.${params.targetHandle || '1'}`
      }
    }], "Manual connection");
  }, [handleAiActions]);

  const handleNodesChange = useCallback((changes: any) => {
    if (replayIndex === null && !isProcessingActions.current) {
      onNodesChange(changes);
    }
  }, [replayIndex, onNodesChange, isProcessingActions]);

  const handleEdgesChange = useCallback((changes: any) => {
    if (replayIndex === null && !isProcessingActions.current) {
      onEdgesChange(changes);
    }
  }, [replayIndex, onEdgesChange, isProcessingActions]);

  const handleNodeDragStop = useCallback((event: any, node: any) => {
    if (replayIndex !== null || isProcessingActions.current) return;
    handleAiActions([{
      name: 'move_component',
      args: {
        designator: node.data.label,
        x: node.position.x,
        y: node.position.y
      }
    }], "Manual component move");
  }, [replayIndex, isProcessingActions, handleAiActions]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      const pastGraph = undo();
      if (pastGraph) {
         applyGraphToEditor(pastGraph);
         setDrcWarnings(prev => [`INFO: Undid previous action.`, ...prev].slice(0, 5));
      }
    }
  }, [canUndo, undo, applyGraphToEditor]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      const futureGraph = redo();
      if (futureGraph) {
         applyGraphToEditor(futureGraph);
         setDrcWarnings(prev => [`INFO: Redid previous action.`, ...prev].slice(0, 5));
      }
    }
  }, [canRedo, redo, applyGraphToEditor]);

  const topNavigation = useMemo(() => (
      <header className="h-12 border-b border-white/10 flex items-center justify-between px-3 md:px-4 z-[100] bg-[#0d0d0d] shrink-0">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 md:w-8 md:h-8 bg-black border border-white/10 rounded flex items-center justify-center font-bold text-base md:text-lg text-white italic">F</div>
            {!isMobile && <span className="font-black text-xs uppercase tracking-widest text-indigo-400">Flux Intel v4.0</span>}
          </div>
          
          <div className="h-4 w-[1px] bg-white/10 mx-1 md:mx-2" />

          {/* Breadcrumbs - Simplified on Mobile */}
          <div className="flex items-center gap-1 md:gap-1.5 overflow-hidden">
            <button className="text-gray-300 md:text-gray-500 hover:text-white transition-colors text-xs font-bold md:font-medium truncate max-w-[100px] md:max-w-none">PRO-DESIGN-POOL</button>
            <ChevronDown size={10} className="text-gray-700 -rotate-90 shrink-0" />
            <div className="flex items-center gap-1 bg-indigo-500/10 px-1.5 md:px-2 py-0.5 rounded border border-indigo-500/20 shrink-0">
              <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-[9px] md:text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none">LIVE MESH ACTIVE</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {/* User Avatars - Hide on Mobile or show single */}
          <div className="hidden sm:flex -space-x-2 mr-2 text-white">
            <div className="w-6 h-6 md:w-7 md:h-7 rounded-full border-2 border-[#0d0d0d] bg-indigo-600 flex items-center justify-center text-[8px] md:text-[9px] font-bold">JS</div>
            <div className="w-6 h-6 md:w-7 md:h-7 rounded-full border-2 border-[#0d0d0d] bg-purple-600 flex items-center justify-center text-[8px] md:text-[9px] font-bold">+2</div>
          </div>

          <button className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-indigo-600/20 active:scale-95">
            <Plus size={14} />
            {!isMobile && "New"}
          </button>

          <button className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all cursor-pointer text-gray-400 hover:text-white">
            <FileText size={14} />
            {!isMobile && "BOM"}
          </button>

          <button className={cn(
            "flex items-center gap-2 bg-white text-black hover:bg-gray-200 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg active:scale-95",
            isMobile ? "p-2" : "px-4 py-1.5"
          )}>
            <Share2 size={isMobile ? 16 : 14} />
            {!isMobile && "Share"}
          </button>
          
          <button className="p-2 text-gray-400 hover:text-white transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </header>
  ), [isMobile]);

  const leftSidebar = useMemo(() => (
        <aside className={cn(
          "w-64 border-r border-white/10 flex flex-col bg-[#0d0d0d] transition-all z-50 overflow-hidden shrink-0",
          isMobile ? (mobileMenuOpen ? "fixed inset-y-0 left-0 translate-x-0" : "fixed inset-y-0 left-0 -translate-x-full") : (sidebarOpen ? "translate-x-0" : "-ml-64")
        )}>
           <div className="flex border-b border-white/10">
              <button 
                onClick={() => setActiveTab('library')}
                className={cn(
                  "flex-1 py-3 text-[9px] uppercase tracking-[0.2em] font-black",
                  activeTab === 'library' ? "text-white border-b-2 border-indigo-500" : "text-zinc-600"
                )}
              >
                Inventory
              </button>
              <button 
                onClick={() => setActiveTab('hierarchy')}
                className={cn(
                  "flex-1 py-3 text-[9px] uppercase tracking-[0.2em] font-black",
                  activeTab === 'hierarchy' ? "text-white border-b-2 border-indigo-500" : "text-zinc-600"
                )}
              >
                Project
              </button>
           </div>
           
           <div className="p-3 border-b border-white/10">
              <div className="relative group">
                <Search size={12} className="absolute left-3 top-2.5 text-zinc-600 group-focus-within:text-indigo-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Scan design pool..." 
                  className="w-full bg-white/2 border border-white/5 rounded-lg py-2 pl-9 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium text-white placeholder:text-zinc-800"
                />
              </div>
           </div>

           <div className="flex-1 overflow-y-auto p-2 space-y-6 scrollbar-hide">
              <section>
                <div className="flex items-center justify-between px-2 mb-3">
                  <h3 className="text-[9px] text-zinc-600 uppercase tracking-[0.2em] font-black">AI Components</h3>
                </div>
                <div className="space-y-2">
                  {[
                    { name: 'STM32U5 MPU', type: 'block', desc: 'Ultra-low-power', tag: 'AI' },
                    { name: 'Power Mesh', type: 'block', desc: 'Auto-balanced rail', tag: 'SMART' },
                    { name: 'BQ25792 Charger', type: 'block', desc: 'Buck-Boost' },
                  ].map((part, i) => (
                    <div key={i} className="group p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 cursor-grab active:cursor-grabbing transition-all">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <CircuitBoard size={12} className="text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                          <span className="text-[11px] text-zinc-300 font-bold group-hover:text-white">{part.name}</span>
                        </div>
                        {part.tag && <span className="text-[8px] bg-indigo-500/20 text-indigo-400 px-1 rounded uppercase font-black">{part.tag}</span>}
                      </div>
                      <p className="text-[9px] text-zinc-600 font-medium pl-[20px]">{part.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between px-2 mb-3">
                  <h3 className="text-[9px] text-zinc-600 uppercase tracking-[0.2em] font-black">Design Primitives</h3>
                  <div className="w-4 h-4 bg-white/5 rounded flex items-center justify-center">
                    <Plus size={10} className="text-zinc-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 px-1">
                  {[
                    { name: 'R', label: 'Resistor' },
                    { name: 'C', label: 'Capacitor' },
                    { name: 'L', label: 'Inductor' },
                    { name: 'D', label: 'Diode' },
                    { name: 'U', label: 'IC' },
                    { name: 'J', label: 'Jack' }
                  ].map((part, i) => (
                    <div key={i} className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.01] border border-white/5 hover:border-zinc-500/30 hover:bg-white/[0.04] cursor-grab transition-all">
                      <span className="text-sm font-black italic text-zinc-500 group-hover:text-zinc-300 mb-1">{part.name}</span>
                      <span className="text-[8px] text-zinc-700 font-bold uppercase tracking-widest">{part.label}</span>
                    </div>
                  ))}
                </div>
              </section>
           </div>
        </aside>
  ), [isMobile, mobileMenuOpen, sidebarOpen, activeTab]);

  const editorToolbar = useMemo(() => (
          <div className="h-10 bg-[#0d0d0d] border-b border-white/10 flex items-center px-2 md:px-4 justify-between select-none z-10 shrink-0">
             <div className="flex items-center gap-1">
                {isMobile && (
                  <button 
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="p-1.5 text-gray-400 hover:text-white"
                  >
                    <Layers size={18} />
                  </button>
                )}
                <div className="flex items-center gap-1 md:bg-white/5 rounded-lg md:p-0.5">
                  {replayIndex !== null ? (
                    <>
                      <button 
                        onClick={prev}
                        className="p-1.5 rounded-md transition-all text-gray-400 hover:text-white"
                        title="Previous Replay Step"
                      >
                        <Undo2 size={16}/>
                      </button>
                      <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest px-2">
                        Replay: {replayIndex + 1} / {executionTraces.current.length}
                      </span>
                      <button 
                        onClick={next}
                        className="p-1.5 rounded-md transition-all text-gray-400 hover:text-white"
                        title="Next Replay Step"
                      >
                        <Redo2 size={16}/>
                      </button>
                      <button
                        onClick={() => setDiffModeEnabled(!diffModeEnabled)}
                        className={cn("p-1.5 rounded-md transition-all", diffModeEnabled ? "bg-indigo-500/20 text-indigo-400" : "text-gray-500 hover:text-white")}
                        title="Toggle Diff Overlay"
                      >
                        <Layers size={16} />
                      </button>
                      <button 
                        onClick={exitReplay}
                        className="px-2 py-1 ml-1 rounded-md transition-all bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 text-[10px] font-black uppercase tracking-widest"
                        title="Exit Replay"
                      >
                        Exit
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={handleUndo} 
                        disabled={!canUndo} 
                        className={cn("p-1.5 rounded-md transition-all", canUndo ? "text-gray-400 hover:text-white" : "text-gray-700 opacity-50 cursor-not-allowed")}
                        title="Undo"
                      >
                        <Undo2 size={16}/>
                      </button>
                      <button 
                        onClick={handleRedo} 
                        disabled={!canRedo} 
                        className={cn("p-1.5 rounded-md transition-all", canRedo ? "text-gray-400 hover:text-white" : "text-gray-700 opacity-50 cursor-not-allowed")}
                        title="Redo"
                      >
                        <Redo2 size={16}/>
                      </button>
                      <div className="w-[1px] h-4 bg-white/10 mx-1 hidden md:block" />
                      {[
                        { icon: <MousePointer2 size={16}/>, id: 'select' },
                        { icon: <CircuitBoard size={16}/>, id: 'add' },
                        { icon: <Activity size={16}/>, id: 'simulate' },
                        { icon: <Play size={16}/>, id: 'replay', action: () => { if (executionTraces.current.length > 0) goToStep(0); } },
                        { icon: <List size={16}/>, id: 'trace_inspector', action: () => setTraceInspectorOpen(!traceInspectorOpen) }
                      ].map((tool, i) => (
                        <button key={i} onClick={tool.action} className={cn(
                          "p-1.5 rounded-md transition-all",
                          i === 0 ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : 
                          tool.id === 'replay' && executionTraces.current.length === 0 ? "text-gray-700 opacity-50 cursor-not-allowed" : "text-gray-500 hover:text-white"
                        )}>
                          {tool.icon}
                        </button>
                      ))}
                    </>
                  )}
                </div>
             </div>

             <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-2 text-gray-600">
                  <span className="text-[10px] font-mono">X: 124.00</span>
                  <span className="text-[10px] font-mono whitespace-nowrap">GRID: 0.1mm</span>
                </div>
                <div className="flex items-center gap-2">
                   <button className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-[10px] font-black uppercase tracking-widest transition-all">
                     <ShieldCheck size={14} />
                     <span className="hidden md:inline">AI Fix</span>
                   </button>
                   <button className="flex items-center gap-2 px-3 md:px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg text-[10px] md:text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-indigo-600/20 active:scale-95">
                     <Zap size={12} className="fill-current" />
                     Run
                   </button>
                </div>
             </div>
          </div>
  ), [
    isMobile, mobileMenuOpen, replayIndex, diffModeEnabled, canUndo, canRedo, traceInspectorOpen,
    prev, next, exitReplay, handleUndo, handleRedo, goToStep
  ]);

  const rightSidebars = useMemo(() => {
     if (isMobile) return null;
     return (
          <div className="flex relative items-stretch h-full overflow-hidden">
            <aside className={cn(
              "w-72 border-l border-white/10 flex flex-col bg-[#0d0d0d] z-10 transition-all",
              sidebarOpen ? "translate-x-0" : "translate-x-full w-0 border-none"
            )}>
              <div className="p-4 h-12 border-b border-white/10 flex items-center justify-between shrink-0">
                <h2 className="text-xs font-black text-gray-100 flex items-center gap-2 uppercase tracking-widest">
                  <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                  Inspector
                </h2>
                <Settings size={14} className="text-gray-600" />
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-8 scrollbar-hide">
                <section>
                  <h3 className="text-[10px] text-gray-600 uppercase tracking-widest font-extrabold mb-4">Geometry</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {['X', 'Y', 'ROT', 'SCALE'].map(label => (
                      <div key={label} className="space-y-1.5">
                        <label className="text-[9px] text-gray-600 font-black uppercase tracking-tighter">{label}</label>
                        <input type="text" value="0.00" className="w-full bg-[#1a1a1a] border border-white/5 rounded-lg px-2.5 py-2 text-[11px] text-white font-mono focus:ring-1 focus:ring-indigo-500 outline-none" readOnly />
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] text-gray-600 uppercase tracking-widest font-extrabold mb-4">Part Metadata</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'Reference', value: 'U1' },
                      { label: 'Manufacturer', value: 'Espressif Systems' },
                      { label: 'Part Number', value: 'ESP32-S3-WROOM-1' },
                      { label: 'Datasheet', value: 'PDF Link' },
                      { label: 'Operating Temp', value: '-40°C to 85°C' }
                    ].map((attr, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-white/5 pb-2">
                        <span className="text-[11px] text-gray-500 font-bold">{attr.label}</span>
                        <span className="text-[11px] text-gray-300 font-mono text-right truncate ml-2">{attr.value}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                   <div className="flex items-center gap-2 mb-2">
                      <Zap size={14} className="text-indigo-400" />
                      <span className="text-[10px] font-black uppercase text-indigo-300">Net Intelligence</span>
                   </div>
                   <p className="text-[10px] text-indigo-400 leading-relaxed italic opacity-80">
                     Copilot suggests adding a 10uF decoupling capacitor between VCC and GND for hardware stability.
                   </p>
                </div>
              </div>
            </aside>

            {/* Copilot Sidebar */}
            <div className={cn(
              "transition-all duration-300 overflow-hidden border-l border-white/10 shrink-0",
              copilotOpen ? "w-80" : "w-0 border-none"
            )}>
              <div className="w-80 h-full">
                <FluxCopilot onAiAction={handleAiActions} projectState={activeGraph} />
              </div>
            </div>
            
            {/* Copilot Toggle Bar */}
            <div className="w-10 bg-[#0d0d0d] border-l border-white/10 flex flex-col items-center py-4 gap-6 shrink-0 relative z-20">
               <button 
                onClick={() => setCopilotOpen(!copilotOpen)}
                className="p-2 text-indigo-400 hover:text-white transition-all hover:scale-110"
               >
                 <Sparkles size={20} className={cn(copilotOpen && "animate-pulse")} />
               </button>
               <button className="p-2 text-gray-600 hover:text-white">
                 <MessageSquare size={18} />
               </button>
               <div className="mt-auto flex flex-col gap-4">
                  <div className="w-6 h-6 rounded bg-gradient-to-tr from-orange-400 to-rose-500 animate-pulse shadow-lg shadow-orange-500/20" />
                  <div className="w-[1px] h-32 bg-white/5 self-center" />
               </div>
            </div>
          </div>
     );
  }, [isMobile, sidebarOpen, copilotOpen, activeGraph, handleAiActions]);

  const mobileBottomNavigation = useMemo(() => {
     if (!isMobile) return null;
     return (
        <>
          <div className="fixed bottom-0 left-0 right-0 h-16 bg-[#0a0a0a]/90 backdrop-blur border-t border-white/10 z-[100] flex items-center justify-around px-2 pb-safe">
             {[
               { icon: <CircuitBoard size={20} />, label: 'Editor', active: true },
               { icon: <Activity size={20} />, label: 'Sim' },
               { icon: <Sparkles size={20} />, label: 'Copilot', toggle: 'copilot' },
               { icon: <Box size={20} />, label: '3D' }
             ].map((item, i) => (
               <button 
                key={i}
                onClick={() => {
                  if (item.toggle === 'copilot') setCopilotOpen(!copilotOpen);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-xl transition-all",
                  item.active ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"
                )}
               >
                 {item.icon}
                 <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
               </button>
             ))}
          </div>

          <AnimatePresence>
             {copilotOpen && (
               <motion.div 
                 initial={{ y: '100%' }}
                 animate={{ y: 0 }}
                 exit={{ y: '100%' }}
                 transition={{ type: "spring", damping: 25, stiffness: 300 }}
                 className="fixed inset-0 z-[110] bg-[#0d0d0d] flex flex-col"
               >
                  <div className="h-12 border-b border-white/10 flex items-center justify-between px-4">
                     <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                       <Sparkles size={16} className="text-indigo-400" />
                       Copilot
                     </h2>
                     <button onClick={() => setCopilotOpen(false)} className="p-2 text-gray-500 hover:text-white">
                       <X size={20} />
                     </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <FluxCopilot onAiAction={handleAiActions} projectState={activeGraph} />
                  </div>
               </motion.div>
             )}
          </AnimatePresence>
        </>
     );
  }, [isMobile, copilotOpen, activeGraph, handleAiActions]);

  const traceInspectorPanel = useMemo(() => (
    <AnimatePresence>
      {traceInspectorOpen && (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="absolute right-4 top-4 w-80 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 z-[60] shadow-2xl flex flex-col p-4 rounded-xl max-h-[80vh]"
        >
          <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
            <h2 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-2">
              <List size={14} className="text-indigo-400" />
              Trace Inspector
            </h2>
            <button onClick={() => setTraceInspectorOpen(false)} className="text-gray-500 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-hide">
            <TraceInspectorList 
              traces={executionTraces.current} 
              replayIndex={replayIndex} 
              goToStep={goToStep} 
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  ), [traceInspectorOpen, replayIndex, goToStep]);

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-[#0a0a0a] font-sans text-gray-200">
      {/* Top Navigation */}
      {topNavigation}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar - Drawer on Mobile */}
        {leftSidebar}

        {/* Workspace */}
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {/* Editor Toolbar - Simplified on Mobile */}
          {editorToolbar}

          {/* View Container */}
          <div className="flex-1 w-full bg-[#050505] relative overflow-hidden">
            <AnimatePresence mode="wait">
              {view === 'schematic' ? (
                <motion.div 
                  key="schematic"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full"
                >
                  <ReactFlow
                    nodes={displayNodes}
                    edges={displayEdges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView={false}
                    colorMode="dark"
                    onlyRenderVisibleElements={true}
                    minZoom={0.05}
                    maxZoom={5}
                    nodesDraggable={replayIndex === null && !isProcessingActions.current}
                    nodesConnectable={replayIndex === null && !isProcessingActions.current}
                    elementsSelectable={replayIndex === null && !isProcessingActions.current}
                    onNodeDragStop={handleNodeDragStop}
                  >
                    <Background variant={BackgroundVariant.Lines} gap={20} size={1} color="#111" />
                    <Controls showInteractive={false} className="bg-[#1a1a1a] !border-white/10 !shadow-2xl" />
                    
                    <Panel position="top-right" className="bg-[#0d0d0d]/90 backdrop-blur border border-white/10 rounded-xl p-1 flex gap-1 shadow-2xl z-20">
                      {['SCHEMATIC', 'PCB', '3D'].map((v) => (
                        <button 
                          key={v}
                          onClick={() => setView(v.toLowerCase() as EditorView)}
                          className={cn(
                            "p-1.5 px-3 text-[9px] md:text-[10px] font-black rounded-lg transition-all uppercase tracking-widest",
                            view === v.toLowerCase() ? "text-white bg-indigo-600 shadow-lg shadow-indigo-600/30" : "text-gray-500 hover:text-gray-300"
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </Panel>
                  </ReactFlow>

                  {/* Flux-centric Bottom Simulator Panel */}
                  <div className={cn(
                    "absolute bottom-0 left-0 right-0 bg-[#0d0d0d]/98 backdrop-blur border-t border-white/10 z-30 flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-all",
                    isMobile ? "h-48" : "h-40"
                  )}>
                    <div className="h-9 border-b border-white/5 flex items-center justify-between px-4 bg-white/2">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-indigo-400">
                          <Sparkles size={12} className="animate-pulse" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Simulation Core</span>
                        </div>
                        {!isMobile && <div className="h-3 w-[1px] bg-white/10" />}
                        <div className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                           <span className="text-[9px] font-bold text-gray-500 uppercase">Interactive</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button className="text-[10px] font-extrabold text-gray-600 hover:text-white transition-colors uppercase">Docs</button>
                        <button className="p-1 px-2 bg-white/5 hover:bg-white/10 rounded text-[9px] font-bold text-gray-400 uppercase tracking-widest">Expand</button>
                      </div>
                    </div>
                    
                    <div className="flex-1 p-3 flex flex-col md:flex-row gap-4 overflow-hidden">
                       <div className="flex-shrink-0 flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                          <div className="relative w-12 h-12 flex items-center justify-center">
                             <svg className="w-full h-full -rotate-90">
                               <circle cx="24" cy="24" r="20" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-white/5" />
                               <motion.circle 
                                 cx="24" cy="24" r="20" fill="transparent" stroke="currentColor" strokeWidth="4" 
                                 className="text-indigo-500"
                                 strokeDasharray={125.6}
                                 initial={{ strokeDashoffset: 125.6 }}
                                 animate={{ strokeDashoffset: 125.6 * (1 - 0.94) }}
                                 transition={{ duration: 2, ease: "easeOut" }}
                               />
                             </svg>
                             <span className="absolute text-[10px] font-black text-white">94%</span>
                          </div>
                          <div>
                             <p className="text-[10px] font-black uppercase text-white leading-none mb-1">AI Health Score</p>
                             <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">DRC Validated • v4.2</p>
                          </div>
                       </div>

                       <div className="flex-1 min-w-0 font-mono text-[10px] space-y-1 overflow-y-auto scrollbar-hide">
                          <p className="text-gray-500">[{new Date().toLocaleTimeString()}] Engine initialized. 24 nets detected.</p>
                          {drcWarnings.map((msg, i) => (
                            <p key={i} className={cn(
                              (msg || '').includes('WARN') ? 'text-amber-500' : (msg || '').includes('SUCCESS') ? 'text-emerald-400' : 'text-indigo-400'
                            )}>
                              {msg}
                            </p>
                          ))}
                          <p className="text-emerald-400">INFO: Matrix solved in 4ms (0.01% error)</p>
                       </div>
                       
                       <div className={cn(
                         "flex gap-4",
                         isMobile ? "h-20" : "w-72"
                       )}>
                          <div className="flex-1 flex flex-col gap-1.5">
                             <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest leading-none">Net_3V3_Stable</span>
                                <span className="text-[9px] font-mono text-indigo-400">3.298V</span>
                             </div>
                             <SimWaveform count={40} baseHeight={40} variation={20} color="bg-indigo-500/40" duration={0.3} delayStep={0.01} />
                          </div>
                          
                          <div className="flex-1 flex flex-col gap-1.5">
                             <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest leading-none">Net_VBUS_In</span>
                                <span className="text-[9px] font-mono text-emerald-400">5.042V</span>
                             </div>
                             <SimWaveform count={40} baseHeight={60} variation={10} color="bg-emerald-500/40" duration={0.5} delayStep={0.02} />
                          </div>
                       </div>
                    </div>

                    <div className="p-2 px-4 bg-white/2 border-t border-white/5 flex items-center justify-between">
                       <span className="text-[9px] text-gray-600 font-bold uppercase italic">Flux Simulation Engine v4.2-stable</span>
                       <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                             <div className="w-1 h-1 rounded-full bg-gray-600" />
                             <span className="text-[9px] text-gray-600 uppercase">GPU Acceleration</span>
                          </div>
                       </div>
                    </div>
                  </div>
                </motion.div>
              ) : view === 'pcb' ? (
                <motion.div 
                   key="pcb"
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 1.05 }}
                   className="w-full h-full relative"
                >
                  <PCBEditor 
                    graph={activeGraph} 
                    selectedIds={memoizedSelectedIds} 
                    onSelect={handlePcbSelect}
                  />
                </motion.div>
              ) : (
                <motion.div key="3d" className="w-full h-full bg-[#050505] flex items-center justify-center p-6 md:p-12 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                   <div className="flex flex-col items-center gap-8 relative">
                    <div className="absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full" />
                    <div className="w-48 h-64 md:w-64 md:h-96 bg-[#0a0a0a] border-2 border-indigo-500/50 rounded-2xl relative shadow-[0_0_50px_rgba(99,102,241,0.2)] overflow-hidden">
                       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#111,transparent)] opacity-50" />
                       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4">
                          <Box size={40} className="text-indigo-400 animate-bounce" />
                          <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
                             <motion.div className="h-full bg-indigo-500" animate={{ x: ['-100%', '100%'] }} transition={{ repeat: Infinity, duration: 1.5 }} />
                          </div>
                       </div>
                       {/* Components simulation in 3D */}
                       <div className="absolute top-10 left-10 w-12 h-12 bg-zinc-800 rounded border border-white/5 shadow-inner" />
                       <div className="absolute bottom-10 right-10 w-20 h-8 bg-zinc-800 rounded-lg border border-white/5 shadow-inner" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xl font-black uppercase tracking-[0.3em] text-white">Flux 3D Engine</h2>
                      <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest opacity-60">High Resolution WebGL Rasterization...</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {traceInspectorPanel}
          </div>
        </main>

        {rightSidebars}
      </div>

      {/* Mobile Bottom Navigation & Mobile Copilot */}
      {mobileBottomNavigation}

      {/* Mobile Overlay for Sidebar */}
      {isMobile && mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
