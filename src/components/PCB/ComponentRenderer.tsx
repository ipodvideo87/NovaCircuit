import React from 'react';
import { PCBComponent } from '../../types/pcb';

interface Props {
  components: PCBComponent[];
  visibleIds: Set<string>;
  selectedComponentId: string | null;
  onSelectComponent: (id: string | null) => void;
}

export const ComponentRenderer: React.FC<Props> = React.memo(({
  components,
  visibleIds,
  selectedComponentId,
  onSelectComponent
}) => {
  return (
    <g className="components-layer">
      {components.map((comp) => {
        if (!visibleIds.has(comp.id)) return null;

        const isSelected = selectedComponentId === comp.id;
        const type = comp.type.toUpperCase();

        // Render distinct bodies depending on part taxonomy
        let bodyWidth = 20;
        let bodyHeight = 20;
        const isMCU = type === 'MCU';
        const isConnector = type === 'CONNECTOR';
        const isTransistor = type === 'MOSFET' || type === 'LDO';

        if (isMCU) {
          bodyWidth = 44;
          bodyHeight = 44;
        } else if (isConnector) {
          bodyWidth = 14;
          bodyHeight = 28;
        } else if (isTransistor) {
          bodyWidth = 22;
          bodyHeight = 16;
        }

        const halW = bodyWidth / 2;
        const halH = bodyHeight / 2;

        return (
          <g
            key={comp.id}
            transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})`}
            className="cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              onSelectComponent(comp.id);
            }}
          >
            {/* Outline Glow under selection */}
            {isSelected && (
              <rect
                x={-halW - 2}
                y={-halH - 2}
                width={bodyWidth + 4}
                height={bodyHeight + 4}
                fill="none"
                stroke="#6366f1"
                strokeWidth={1.5}
                rx={4}
                className="animate-pulse"
              />
            )}

            {/* Hover shadow */}
            <rect
              x={-halW}
              y={-halH}
              width={bodyWidth}
              height={bodyHeight}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1}
              rx={3}
              opacity={0}
              className="group-hover:opacity-30 transition-opacity"
            />

            {/* Solid Part Package Body */}
            <rect
              x={-halW}
              y={-halH}
              width={bodyWidth}
              height={bodyHeight}
              fill={isMCU ? "#181824" : isConnector ? "#1c1917" : "#22222a"}
              stroke={isSelected ? "#818cf8" : "#4a4a5e"}
              strokeWidth={1.2}
              rx={3}
            />

            {/* Specific component pin detailing */}
            {isMCU && (
              <g opacity="0.7">
                {/* Microcontroller solder ball array or pins representation */}
                {Array.from({ length: 8 }).map((_, i) => (
                  <g key={i}>
                    {/* Left pins */}
                    <rect x={-halW - 2} y={-halH + 5 + i * 5} width={3} height={1.5} fill="#94a3b8" />
                    {/* Right pins */}
                    <rect x={halW - 1} y={-halH + 5 + i * 5} width={3} height={1.5} fill="#94a3b8" />
                  </g>
                ))}
              </g>
            )}

            {isConnector && (
              <g>
                {/* USB/Connector inner slots */}
                <rect x={-4} y={-halH + 2} width={8} height={4} fill="#a8a29e" rx={1} />
                <rect x={-halW - 1} y={halH - 5} width={bodyWidth + 2} height={2} fill="#78716c" />
              </g>
            )}

            {isTransistor && (
              <g>
                {/* Thermal tab */}
                <rect x={-halW + 2} y={-halH + 1} width={bodyWidth - 4} height={2} fill="#d1d5db" />
                {/* Pins */}
                <rect x={-6} y={halH - 1} width={3} height={3} fill="#9ca3af" />
                <rect x={3} y={halH - 1} width={3} height={3} fill="#9ca3af" />
              </g>
            )}

            {/* Standard pin 1 indicator dot */}
            <circle cx={-halW + 3} cy={-halH + 3} r={1.5} fill="#f5d44f" />

            {/* Reference Designator and Value label */}
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              className="font-mono text-[6px] fill-gray-200 select-none pointer-events-none font-bold"
              y={-1}
            >
              {comp.id}
            </text>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              className="font-mono text-[4.5px] fill-indigo-300/80 select-none pointer-events-none mt-1"
              y={6}
            >
              {comp.name}
            </text>
          </g>
        );
      })}
    </g>
  );
});
