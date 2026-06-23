// ─────────────────────────────────────────────────────────────────────────────
// PCBCanvas
//
// Multi-layer copper workspace.  Renders components, traces, ratsnest, and
// now vias.  Supports pan/zoom, component/trace/via selection, and optional
// via placement mode.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { PCBBoard, PCBVia, LayerId, ViaType } from '../../types/pcb';
import { ComponentRenderer } from './ComponentRenderer';
import { TraceRenderer } from './TraceRenderer';
import { RatsnestLayer } from './RatsnestLayer';
import { ViaRenderer } from './ViaRenderer';
import { createVia, getDefaultStackup } from '../../lib/viaManager';
import { useTransactionStore } from '../../lib/core/transaction';

interface PCBCanvasProps {
  board: PCBBoard;
  selectedComponentId: string | null;
  selectedTraceId: string | null;
  selectedViaId: string | null;
  onSelectComponent: (id: string | null) => void;
  onSelectTrace: (id: string | null) => void;
  onSelectVia: (id: string | null) => void;
  /** When set, clicking the canvas places a via of this type */
  viaPlacementMode?: ViaType | null;
  viaPlacementFrom?: LayerId;
  viaPlacementTo?: LayerId;
  viaPlacementNet?: string;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;
const ZOOM_SPEED = 0.0012;

export const PCBCanvas: React.FC<PCBCanvasProps> = ({
  board,
  selectedComponentId,
  selectedTraceId,
  selectedViaId,
  onSelectComponent,
  onSelectTrace,
  onSelectVia,
  viaPlacementMode,
  viaPlacementFrom = 'F.Cu',
  viaPlacementTo   = 'B.Cu',
  viaPlacementNet  = 'gnd',
}) => {
  const svgRef  = useRef<SVGSVGElement>(null);
  const [zoom,  setZoom]  = useState(1.0);
  const [panX,  setPanX]  = useState(0);
  const [panY,  setPanY]  = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const lastPan = useRef<{ x: number; y: number } | null>(null);

  // Ghost via cursor position
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);

  const { addVia } = useTransactionStore();

  // ── Pan / zoom handlers ────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_SPEED;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (1 + delta))));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsPanning(true);
        lastPan.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning && lastPan.current) {
        const dx = e.clientX - lastPan.current.x;
        const dy = e.clientY - lastPan.current.y;
        setPanX((p) => p + dx);
        setPanY((p) => p + dy);
        lastPan.current = { x: e.clientX, y: e.clientY };
      }

      // Update ghost via position
      if (viaPlacementMode && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const cx = (sx - panX) / zoom;
        const cy = (sy - panY) / zoom;
        setGhostPos({ x: cx, y: cy });
      }
    },
    [isPanning, viaPlacementMode, zoom, panX, panY]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    lastPan.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    lastPan.current = null;
    setGhostPos(null);
  }, []);

  // ── Canvas click: deselect or place via ───────────────────────────────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (isPanning) return;

      if (viaPlacementMode && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const cx = (sx - panX) / zoom;
        const cy = (sy - panY) / zoom;
        const stackup = board.stackup ?? getDefaultStackup('4L');
        const via: PCBVia = createVia(
          cx, cy,
          viaPlacementFrom, viaPlacementTo,
          viaPlacementNet,
          stackup
        );
        addVia(via);
        return;
      }

      // Deselect
      onSelectComponent(null);
      onSelectTrace(null);
      onSelectVia(null);
    },
    [
      isPanning, viaPlacementMode,
      viaPlacementFrom, viaPlacementTo, viaPlacementNet,
      board.stackup, zoom, panX, panY,
      addVia, onSelectComponent, onSelectTrace, onSelectVia,
    ]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        // Fit to view
        setZoom(1.0);
        setPanX(0);
        setPanY(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const vias   = board.vias ?? [];
  const stackup = board.stackup ?? getDefaultStackup('4L');

  return (
    <div className="relative w-full h-full bg-[#0b0b10] overflow-hidden select-none">
      {/* Grid background */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="pcb-grid"
            x={panX % (20 * zoom)}
            y={panY % (20 * zoom)}
            width={20 * zoom}
            height={20 * zoom}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={0} cy={0} r={0.6} fill="#ffffff10" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pcb-grid)" />
      </svg>

      {/* Main canvas */}
      <svg
        ref={svgRef}
        className={`absolute inset-0 w-full h-full ${
          viaPlacementMode ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-default'
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleCanvasClick}
      >
        {/* Ratsnest (lowest layer) */}
        <RatsnestLayer
          ratnest={board.ratnest}
          zoom={zoom}
          panX={panX}
          panY={panY}
        />

        {/* Traces */}
        <TraceRenderer
          traces={board.traces}
          zoom={zoom}
          panX={panX}
          panY={panY}
          selectedTraceId={selectedTraceId}
          onSelectTrace={onSelectTrace}
        />

        {/* Vias */}
        <ViaRenderer
          vias={vias}
          zoom={zoom}
          panX={panX}
          panY={panY}
          selectedViaId={selectedViaId}
          onSelectVia={onSelectVia}
        />

        {/* Components (top layer) */}
        <ComponentRenderer
          components={board.components}
          zoom={zoom}
          panX={panX}
          panY={panY}
          selectedComponentId={selectedComponentId}
          onSelectComponent={onSelectComponent}
        />

        {/* Ghost via cursor */}
        {viaPlacementMode && ghostPos && (
          <circle
            cx={ghostPos.x * zoom + panX}
            cy={ghostPos.y * zoom + panY}
            r={8}
            fill="none"
            stroke={
              viaPlacementMode === 'through' ? '#f59e0b'
              : viaPlacementMode === 'blind'  ? '#38bdf8'
              : viaPlacementMode === 'buried' ? '#a78bfa'
              : '#34d399'
            }
            strokeWidth={1.5}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
        )}
      </svg>

      {/* Via placement mode banner */}
      {viaPlacementMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-[#0f0f18]/90 border border-white/20 rounded-full px-4 py-1.5
                          text-xs font-semibold text-white/80 backdrop-blur-sm shadow-lg">
            Click to place{' '}
            <span className={
              viaPlacementMode === 'through' ? 'text-amber-400'
              : viaPlacementMode === 'blind'  ? 'text-sky-400'
              : viaPlacementMode === 'buried' ? 'text-violet-400'
              : 'text-emerald-400'
            }>
              {viaPlacementMode}
            </span>{' '}
            via &nbsp;·&nbsp; <kbd className="opacity-50">Esc</kbd> to cancel
          </div>
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 text-[10px] text-white/25 font-mono pointer-events-none">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
};

export default PCBCanvas;
