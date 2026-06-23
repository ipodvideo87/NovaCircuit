/**
 * RatsnestLayer — Unrouted airwire (ratsnest) visualizer
 *
 * Renders thin dashed lines between same-net pads that have not yet been
 * routed as copper traces. Colour-coded by net ID.
 */

import React from 'react';
import type { PCBRatsnest } from '../../types/pcb';

interface RatsnestLayerProps {
  ratnest: PCBRatsnest[];
}

const NET_COLORS: Record<string, string> = {
  'vcc-3.3v':    '#f59e0b44',
  'vcc-5v':      '#fb923c44',
  'gnd':         '#47556944',
  'usb-dp':      '#60a5fa44',
  'usb-dn':      '#60a5fa44',
  'wifi-ant-rf': '#34d39944',
};

function getRatsnestColor(netId: string): string {
  if (NET_COLORS[netId]) return NET_COLORS[netId];
  let hash = 0;
  for (const ch of netId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `hsla(${hue}, 60%, 55%, 0.25)`;
}

const RatsnestLayer: React.FC<RatsnestLayerProps> = ({ ratnest }) => {
  if (ratnest.length === 0) return null;

  return (
    <g aria-label="Ratsnest airwire layer" opacity={0.8}>
      {ratnest.map(rn => (
        <line
          key={rn.id}
          x1={rn.startX} y1={rn.startY}
          x2={rn.endX}   y2={rn.endY}
          stroke={getRatsnestColor(rn.netId)}
          strokeWidth={0.8}
          strokeDasharray="4 3"
          strokeLinecap="round"
          pointerEvents="none"
        />
      ))}
    </g>
  );
};

export default RatsnestLayer;
