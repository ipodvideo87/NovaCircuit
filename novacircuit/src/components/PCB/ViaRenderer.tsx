// ─────────────────────────────────────────────────────────────────────────────
// ViaRenderer
//
// SVG layer for rendering placed vias on the PCBCanvas viewport.
// Each via is drawn as concentric rings (pad → annular ring → drill hole),
// colour-coded by via type, with selection / hover interaction.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import { PCBVia, ViaType } from '../../types/pcb';

interface ViaRendererProps {
  vias: PCBVia[];
  zoom: number;
  panX: number;
  panY: number;
  selectedViaId: string | null;
  onSelectVia: (id: string) => void;
}

// px per mm at zoom=1
const PX_PER_MM = 3.779527559;

// Colour scheme matching StackupDrawer legend
const VIA_FILL: Record<ViaType, string> = {
  through: '#f59e0b',
  blind:   '#38bdf8',
  buried:  '#a78bfa',
  micro:   '#34d399',
};

const VIA_STROKE_SELECTED = '#ffffff';

function mmToPx(mm: number, zoom: number): number {
  return mm * PX_PER_MM * zoom;
}

function canvasToScreen(
  cx: number,
  cy: number,
  zoom: number,
  panX: number,
  panY: number
): [number, number] {
  return [cx * zoom + panX, cy * zoom + panY];
}

/**
 * A single via ring group.
 *
 * Rendering layers (back to front):
 *   1. Outer pad ring     – fill = via type colour, opacity 0.35
 *   2. Annular copper     – fill = via type colour, opacity 0.75
 *   3. Drill hole         – fill = dark background
 *   4. Optional selection ring
 */
const ViaGlyph: React.FC<{
  via: PCBVia;
  sx: number;
  sy: number;
  zoom: number;
  selected: boolean;
  onClick: () => void;
}> = ({ via, sx, sy, zoom, selected, onClick }) => {
  const padR   = mmToPx(via.padDiameter / 2, zoom);
  const drillR = mmToPx(via.drillDiameter / 2, zoom);
  const fill   = VIA_FILL[via.viaType];

  // Clamp to minimum visible size
  const minVisR = 3;
  const padRv   = Math.max(minVisR + 2, padR);
  const drillRv = Math.max(minVisR,     drillR);

  return (
    <g
      transform={`translate(${sx}, ${sy})`}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    >
      {/* Outer pad / annular ring */}
      <circle
        r={padRv}
        fill={fill}
        fillOpacity={0.35}
        stroke={selected ? VIA_STROKE_SELECTED : fill}
        strokeWidth={selected ? 1.5 : 0.75}
        strokeOpacity={selected ? 1 : 0.7}
      />

      {/* Copper annular ring (solid) */}
      <circle
        r={padRv * 0.72}
        fill={fill}
        fillOpacity={0.75}
        stroke="none"
      />

      {/* Drill hole */}
      <circle
        r={drillRv}
        fill="#0b0b10"
        stroke={fill}
        strokeWidth={0.5}
        strokeOpacity={0.6}
      />

      {/* Via type initial badge at higher zoom */}
      {zoom > 3 && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.max(6, padRv * 0.6)}
          fill={fill}
          fillOpacity={0.9}
          fontFamily="monospace"
          fontWeight="bold"
          pointerEvents="none"
        >
          {via.viaType[0].toUpperCase()}
        </text>
      )}
    </g>
  );
};

export const ViaRenderer: React.FC<ViaRendererProps> = ({
  vias,
  zoom,
  panX,
  panY,
  selectedViaId,
  onSelectVia,
}) => {
  const handleClick = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectVia(id);
    },
    [onSelectVia]
  );

  if (vias.length === 0) return null;

  return (
    <g className="via-layer">
      {vias.map((via) => {
        const [sx, sy] = canvasToScreen(via.x, via.y, zoom, panX, panY);
        return (
          <ViaGlyph
            key={via.id}
            via={via}
            sx={sx}
            sy={sy}
            zoom={zoom}
            selected={selectedViaId === via.id}
            onClick={handleClick(via.id) as unknown as () => void}
          />
        );
      })}
    </g>
  );
};

export default ViaRenderer;
