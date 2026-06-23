/**
 * PCBCanvas — Multi-layer copper workspace
 *
 * Renders:
 *  • Copper traces (TraceRenderer)
 *  • Placed component footprints (ComponentRenderer)
 *  • Ratsnest airwires (RatsnestLayer)
 *
 * Handles pan (drag), zoom (wheel), and tool interactions.
 * Uses SpatialIndex for viewport-culled rendering at 60 FPS.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { PCBBoard } from '../../types/pcb';
import ComponentRenderer from './ComponentRenderer';
import TraceRenderer from './TraceRenderer';
import RatsnestLayer from './RatsnestLayer';
import { useTransactionStore } from '../../lib/core/transaction';
import { SpatialIndex } from '../../lib/core/spatial';

interface LayerVisibility {
  copper: boolean;
  ratsnest: boolean;
  silkscreen: boolean;
  courtyard: boolean;
}

interface PCBCanvasProps {
  board: PCBBoard;
  activeTool: string;
  layerVisibility: LayerVisibility;
  zoom: number;
  onCommit: (board: PCBBoard) => void;
  onStatusMessage: (msg: string) => void;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

const GRID_SIZE = 10; // canvas units per grid cell

const PCBCanvas: React.FC<PCBCanvasProps> = ({
  board,
  activeTool,
  layerVisibility,
  zoom,
  onCommit,
  onStatusMessage,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const setSelectedComponentId = useTransactionStore(s => s.setSelectedComponentId);
  const setSelectedTraceId = useTransactionStore(s => s.setSelectedTraceId);
  const selectedComponentId = useTransactionStore(s => s.selectedComponentId);

  // Sync external zoom prop → transform
  useEffect(() => {
    setTransform(prev => ({ ...prev, scale: zoom }));
  }, [zoom]);

  // Resize observer
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Build spatial index for viewport culling
  const visibleComponentIds = React.useMemo(() => {
    const index = new SpatialIndex<string>();
    board.components.forEach(c => {
      index.insert(c.id, c.x - 25, c.y - 25, c.x + 25, c.y + 25);
    });

    const { x, y, scale } = transform;
    const vpLeft   = (-x) / scale;
    const vpTop    = (-y) / scale;
    const vpRight  = (size.w - x) / scale;
    const vpBottom = (size.h - y) / scale;

    const visibleSet = new Set<string>();
    index.query({ minX: vpLeft, minY: vpTop, maxX: vpRight, maxY: vpBottom }, visibleSet);
    return visibleSet;
  }, [board.components, transform, size]);

  const visibleTraceIds = React.useMemo(() => {
    const index = new SpatialIndex<string>();
    board.traces.forEach(t => {
      index.insert(
        t.id,
        Math.min(t.startX, t.endX),
        Math.min(t.startY, t.endY),
        Math.max(t.startX, t.endX),
        Math.max(t.startY, t.endY),
      );
    });

    const { x, y, scale } = transform;
    const vpLeft   = (-x) / scale;
    const vpTop    = (-y) / scale;
    const vpRight  = (size.w - x) / scale;
    const vpBottom = (size.h - y) / scale;

    const visibleSet = new Set<string>();
    index.query({ minX: vpLeft, minY: vpTop, maxX: vpRight, maxY: vpBottom }, visibleSet);
    return visibleSet;
  }, [board.traces, transform, size]);

  // ── Pan handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'select' || activeTool === 'move') return;
    if (e.button !== 1 && activeTool !== 'move') {
      // Middle mouse or explicit move tool
    }
    if (e.button === 1 || activeTool === 'move') {
      setIsPanning(true);
      panStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y };
      e.preventDefault();
    }
  }, [activeTool, transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStart.current) return;
    const dx = e.clientX - panStart.current.mx;
    const dy = e.clientY - panStart.current.my;
    setTransform(prev => ({
      ...prev,
      x: panStart.current!.tx + dx,
      y: panStart.current!.ty + dy,
    }));
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStart.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setTransform(prev => {
      const newScale = Math.max(0.1, Math.min(10, prev.scale * factor));
      const dx = cx - (cx - prev.x) * (newScale / prev.scale);
      const dy = cy - (cy - prev.y) * (newScale / prev.scale);
      return { x: dx, y: dy, scale: newScale };
    });
  }, []);

  const handleComponentClick = useCallback((id: string) => {
    if (activeTool === 'select') {
      setSelectedComponentId(id);
      const comp = board.components.find(c => c.id === id);
      if (comp) onStatusMessage(`Selected: ${comp.name} (${comp.type})`);
    } else if (activeTool === 'delete') {
      const newBoard = {
        ...board,
        components: board.components.filter(c => c.id !== id),
      };
      onCommit(newBoard);
      onStatusMessage(`Deleted component ${id}`);
    }
  }, [activeTool, board, onCommit, onStatusMessage, setSelectedComponentId]);

  const handleTraceClick = useCallback((id: string) => {
    if (activeTool === 'select') {
      setSelectedTraceId(id);
      const trace = board.traces.find(t => t.id === id);
      if (trace) onStatusMessage(`Trace: ${trace.netId} · ${trace.width}mm`);
    } else if (activeTool === 'delete') {
      const newBoard = {
        ...board,
        traces: board.traces.filter(t => t.id !== id),
      };
      onCommit(newBoard);
      onStatusMessage(`Deleted trace ${id}`);
    }
  }, [activeTool, board, onCommit, onStatusMessage, setSelectedTraceId]);

  // Cursor style per tool
  const cursorStyle = {
    select: 'cursor-default',
    move: isPanning ? 'cursor-grabbing' : 'cursor-grab',
    route: 'cursor-crosshair',
    place: 'cursor-crosshair',
    measure: 'cursor-crosshair',
    delete: 'cursor-not-allowed',
  }[activeTool] ?? 'cursor-default';

  // Grid dot pattern
  const gridDots = React.useMemo(() => {
    const { x, y, scale } = transform;
    const step = GRID_SIZE * scale;
    if (step < 6) return null; // Too dense to render

    const startX = Math.floor(-x / step) * step + x;
    const startY = Math.floor(-y / step) * step + y;
    const cols = Math.ceil(size.w / step) + 1;
    const rows = Math.ceil(size.h / step) + 1;

    const dots: React.ReactElement[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push(
          <circle
            key={`${r}-${c}`}
            cx={startX + c * step}
            cy={startY + r * step}
            r={0.8}
            fill="#1e293b"
          />
        );
      }
    }
    return dots;
  }, [transform, size]);

  const { x: tx, y: ty, scale: ts } = transform;
  const visibleComponents = board.components.filter(c => visibleComponentIds.has(c.id));
  const visibleTraces = board.traces.filter(t => visibleTraceIds.has(t.id));

  return (
    <div
      ref={containerRef}
      className={`w-full h-full bg-[#0a0f1a] relative overflow-hidden ${cursorStyle}`}
    >
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="absolute inset-0"
        aria-label="PCB layout canvas"
      >
        {/* Grid */}
        {gridDots}

        {/* Board content */}
        <g transform={`translate(${tx},${ty}) scale(${ts})`}>
          {/* Ratsnest */}
          {layerVisibility.ratsnest && (
            <RatsnestLayer ratnest={board.ratnest} />
          )}

          {/* Copper traces */}
          {layerVisibility.copper && (
            <TraceRenderer
              traces={visibleTraces}
              onTraceClick={handleTraceClick}
            />
          )}

          {/* Component footprints */}
          <ComponentRenderer
            components={visibleComponents}
            selectedId={selectedComponentId}
            showSilkscreen={layerVisibility.silkscreen}
            showCourtyard={layerVisibility.courtyard}
            onComponentClick={handleComponentClick}
          />
        </g>

        {/* Layer badge */}
        <text x={8} y={size.h - 8} fontSize={10} fill="#1e293b" fontFamily="monospace">
          PCB · F.Cu · {Math.round(ts * 100)}%
        </text>
      </svg>

      {/* Viewport info overlay */}
      <div className="
        absolute top-2 right-2 text-[9px] font-mono text-slate-700
        pointer-events-none
      ">
        {visibleComponents.length}/{board.components.length} comps ·{' '}
        {visibleTraces.length}/{board.traces.length} traces
      </div>
    </div>
  );
};

export default PCBCanvas;
