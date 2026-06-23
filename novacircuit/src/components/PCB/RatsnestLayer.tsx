// ─────────────────────────────────────────────────────────────────────────────
// RatsnestLayer
//
// Renders unrouted airwire connections (ratsnest) as dashed lines.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { PCBRatsnest } from '../../types/pcb';

interface RatsnestLayerProps {
  ratnest: PCBRatsnest[];
  zoom: number;
  panX: number;
  panY: number;
}

function sc(coord: number, zoom: number, pan: number): number {
  return coord * zoom + pan;
}

export const RatsnestLayer: React.FC<RatsnestLayerProps> = ({
  ratnest,
  zoom,
  panX,
  panY,
}) => {
  if (ratnest.length === 0) return null;

  return (
    <g className="ratsnest-layer" opacity={0.4}>
      {ratnest.map((rn) => (
        <line
          key={rn.id}
          x1={sc(rn.startX, zoom, panX)}
          y1={sc(rn.startY, zoom, panY)}
          x2={sc(rn.endX,   zoom, panX)}
          y2={sc(rn.endY,   zoom, panY)}
          stroke="#ffffff"
          strokeWidth={0.8}
          strokeDasharray="4 4"
          strokeOpacity={0.5}
          pointerEvents="none"
        />
      ))}
    </g>
  );
};

export default RatsnestLayer;
