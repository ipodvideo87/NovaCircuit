import React from 'react';
import { PCBTrace } from '../../types/pcb';
import { generateSerpentineTuning } from '../../lib/routingSystem';

interface Props {
  traces: PCBTrace[];
  visibleIds: Set<string>;
  selectedTraceId: string | null;
  onSelectTrace: (id: string | null) => void;
  tunedTraceIds: Set<string>;
  serpentineAmplitude: number;
  serpentineSpacing: number;
}

export const TraceRenderer: React.FC<Props> = React.memo(({
  traces,
  visibleIds,
  selectedTraceId,
  onSelectTrace,
  tunedTraceIds,
  serpentineAmplitude,
  serpentineSpacing
}) => {
  return (
    <g className="traces-layer">
      {traces.map((trace) => {
        if (!visibleIds.has(trace.id)) return null;

        const isSelected = selectedTraceId === trace.id;
        const isTuned = tunedTraceIds.has(trace.id);
        
        // Define color based on netId
        let strokeColor = "#4b6bfb"; // High-speed/Default
        if (trace.netId.includes("vcc") || trace.netId.includes("pwr")) {
          strokeColor = "#e2d24a"; // Power
        } else if (trace.netId.includes("wifi") || trace.netId.includes("rf")) {
          strokeColor = "#ec4899"; // RF Antenna Path
        } else if (trace.netId.includes("analog") || trace.netId.includes("sig")) {
          strokeColor = "#10b981"; // Analog signal
        }

        if (isTuned) {
          // Generate serpentine points
          const start = { x: trace.startX, y: trace.startY };
          const end = { x: trace.endX, y: trace.endY };
          // Calculate direct length and target
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const directLen = Math.sqrt(dx * dx + dy * dy);
          const targetLen = directLen + 150 * (serpentineAmplitude / 15); // visual elongation
          
          const sPoints = generateSerpentineTuning(start, end, targetLen, serpentineAmplitude, serpentineSpacing);
          // Build SVG path
          const pathD = sPoints.reduce((acc, pt, index) => {
            return index === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
          }, "");

          return (
            <g key={trace.id} className="cursor-pointer" onClick={() => onSelectTrace(trace.id)}>
              {/* Thick transparent interactive area */}
              <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
              />
              {/* Selected Highlight Aura */}
              {isSelected && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={trace.width + 1.2}
                  opacity="0.8"
                  strokeLinecap="round"
                />
              )}
              {/* Ground shadow/underlay */}
              <path
                d={pathD}
                fill="none"
                stroke="#000"
                strokeWidth={trace.width + 0.4}
                strokeLinecap="round"
              />
              {/* Actual colored route */}
              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth={trace.width}
                strokeLinecap="round"
                className="transition-colors duration-150"
              />
              {/* Tiny serpentine pattern nodes */}
              {sPoints.slice(1, -1).map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.x}
                  cy={pt.y}
                  r={0.4}
                  fill="#ffffff"
                  opacity="0.4"
                />
              ))}
            </g>
          );
        }

        return (
          <g key={trace.id} className="cursor-pointer" onClick={() => onSelectTrace(trace.id)}>
            {/* Thick transparent interactive area */}
            <line
              x1={trace.startX}
              y1={trace.startY}
              x2={trace.endX}
              y2={trace.endY}
              stroke="transparent"
              strokeWidth={12}
            />
            {/* Selection highlights */}
            {isSelected && (
              <line
                x1={trace.startX}
                y1={trace.startY}
                x2={trace.endX}
                y2={trace.endY}
                stroke="#ffffff"
                strokeWidth={trace.width + 1.2}
                opacity="0.8"
                strokeLinecap="round"
              />
            )}
            {/* Normal line */}
            <line
              x1={trace.startX}
              y1={trace.startY}
              x2={trace.endX}
              y2={trace.endY}
              stroke={strokeColor}
              strokeWidth={trace.width}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </g>
  );
});
