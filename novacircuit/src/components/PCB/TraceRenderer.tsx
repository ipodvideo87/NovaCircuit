// ─────────────────────────────────────────────────────────────────────────────
// TraceRenderer
//
// Renders all routed copper trace segments on the PCB canvas.
// Colour-codes traces by layer and highlights selected/hovered traces.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import { PCBTrace, LayerId, LAYER_COLORS } from '../../types/pcb';

interface TraceRendererProps {
  traces: PCBTrace[];
  zoom: number;
  panX: number;
  panY: number;
  selectedTraceId: string | null;
  onSelectTrace: (id: string | null) => void;
}

const DEFAULT_TRACE_COLOR = '#f59e0b';

function traceColor(trace: PCBTrace): string {
  if (trace.layer && trace.layer in LAYER_COLORS) {
    return LAYER_COLORS[trace.layer as LayerId];
  }
  return DEFAULT_TRACE_COLOR;
}

function mmToPx(mm: number, zoom: number): number {
  return mm * 3.779527559 * zoom;
}

function cx(x: number, zoom: number, pan: number): number {
  return x * zoom + pan;
}

export const TraceRenderer: React.FC<TraceRendererProps> = ({
  traces,
  zoom,
  panX,
  panY,
  selectedTraceId,
  onSelectTrace,
}) => {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const handleClick = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectTrace(id === selectedTraceId ? null : id);
    },
    [selectedTraceId, onSelectTrace]
  );

  return (
    <g className="trace-layer">
      {traces.map((trace) => {
        const isSelected = trace.id === selectedTraceId;
        const isHovered  = trace.id === hoverId;
        const color      = traceColor(trace);
        const widthPx    = Math.max(1.5, mmToPx(trace.width, zoom));

        const x1 = cx(trace.startX, zoom, panX);
        const y1 = cx(trace.startY, zoom, panY);
        const x2 = cx(trace.endX,   zoom, panX);
        const y2 = cx(trace.endY,   zoom, panY);

        return (
          <g key={trace.id}>
            {/* Hit area (wider invisible stroke for easy click) */}
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="transparent"
              strokeWidth={Math.max(8, widthPx * 2)}
              style={{ cursor: 'pointer' }}
              onClick={handleClick(trace.id)}
              onMouseEnter={() => setHoverId(trace.id)}
              onMouseLeave={() => setHoverId(null)}
            />
            {/* Selection glow */}
            {(isSelected || isHovered) && (
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={color}
                strokeWidth={widthPx + 4}
                strokeOpacity={0.25}
                strokeLinecap="round"
                pointerEvents="none"
              />
            )}
            {/* Copper trace */}
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color}
              strokeWidth={widthPx}
              strokeOpacity={isSelected ? 1 : 0.75}
              strokeLinecap="round"
              pointerEvents="none"
            />
          </g>
        );
      })}
    </g>
  );
};

export default TraceRenderer;
