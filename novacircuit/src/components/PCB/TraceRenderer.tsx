/**
 * TraceRenderer — Copper trace routing layer
 *
 * Renders PCB traces as SVG lines with:
 *  • Net-coded color (power = amber, signal = blue, GND = grey, RF = emerald)
 *  • Width proportional to trace.width in mm
 *  • Selected highlight
 *  • Click-to-select interaction
 */

import React from 'react';
import type { PCBTrace } from '../../types/pcb';
import { useTransactionStore } from '../../lib/core/transaction';

interface TraceRendererProps {
  traces: PCBTrace[];
  onTraceClick: (id: string) => void;
}

// Net → colour mapping
const NET_COLORS: Record<string, string> = {
  'vcc-3.3v':    '#f59e0b',  // amber
  'vcc-5v':      '#fb923c',  // orange
  'vbus':        '#facc15',  // yellow
  'gnd':         '#475569',  // slate
  'usb-dp':      '#60a5fa',  // blue
  'usb-dn':      '#60a5fa',  // blue
  'wifi-ant-rf': '#34d399',  // emerald (RF — 50Ω)
};

function getTraceColor(netId: string): string {
  if (NET_COLORS[netId]) return NET_COLORS[netId];
  if (/vcc|vdd|pwr|3\.3|5v|1\.8|1\.2/i.test(netId)) return '#f59e0b';
  if (/gnd|vss/i.test(netId)) return '#475569';
  if (/rf|ant/i.test(netId)) return '#34d399';
  if (/usb|dp|dn|diff/i.test(netId)) return '#60a5fa';
  // Generic signal: derive from hash
  let hash = 0;
  for (const ch of netId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

// Map trace width in mm to canvas pixel stroke width (1 mm ≈ 3.78 px at 96 dpi)
// Canvas units are not mm — we use a visual scale where 0.25 mm ≈ 2 canvas units stroke
function traceStrokeWidth(widthMm: number): number {
  return Math.max(1, widthMm * 8);
}

const TraceRenderer: React.FC<TraceRendererProps> = ({ traces, onTraceClick }) => {
  const selectedTraceId = useTransactionStore(s => s.selectedTraceId);

  return (
    <g aria-label="Copper trace layer">
      {traces.map(trace => {
        const color = getTraceColor(trace.netId);
        const sw = traceStrokeWidth(trace.width);
        const selected = trace.id === selectedTraceId;
        return (
          <g key={trace.id}>
            {/* Selection halo */}
            {selected && (
              <line
                x1={trace.startX} y1={trace.startY}
                x2={trace.endX}   y2={trace.endY}
                stroke="#22d3ee"
                strokeWidth={sw + 4}
                strokeLinecap="round"
                opacity={0.4}
              />
            )}
            {/* Trace */}
            <line
              x1={trace.startX} y1={trace.startY}
              x2={trace.endX}   y2={trace.endY}
              stroke={color}
              strokeWidth={sw}
              strokeLinecap="round"
              opacity={0.85}
              onClick={() => onTraceClick(trace.id)}
              className="cursor-pointer"
              role="button"
              aria-label={`Trace ${trace.netId} ${trace.width}mm`}
            />
            {/* Via dots at endpoints for non-trivial traces */}
            {(Math.abs(trace.endX - trace.startX) > 20 ||
              Math.abs(trace.endY - trace.startY) > 20) && (
              <>
                <circle
                  cx={trace.startX} cy={trace.startY}
                  r={sw / 2 + 1}
                  fill={color} opacity={0.6}
                  onClick={() => onTraceClick(trace.id)}
                  className="cursor-pointer"
                />
                <circle
                  cx={trace.endX} cy={trace.endY}
                  r={sw / 2 + 1}
                  fill={color} opacity={0.6}
                  onClick={() => onTraceClick(trace.id)}
                  className="cursor-pointer"
                />
              </>
            )}
          </g>
        );
      })}
    </g>
  );
};

export default TraceRenderer;
