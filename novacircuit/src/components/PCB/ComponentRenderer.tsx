/**
 * ComponentRenderer — PCB footprint visualization layer
 *
 * Renders component pads, courtyard outlines, and silkscreen
 * for all placed components on the PCB canvas.
 */

import React from 'react';
import type { PCBComponent } from '../../types/pcb';

interface ComponentRendererProps {
  components: PCBComponent[];
  selectedId: string | null;
  showSilkscreen: boolean;
  showCourtyard: boolean;
  onComponentClick: (id: string) => void;
}

// Footprint dimensions by component type (canvas units)
const FOOTPRINT_SIZES: Record<string, { w: number; h: number }> = {
  MCU:         { w: 40, h: 40 },
  CONNECTOR:   { w: 20, h: 30 },
  LDO:         { w: 15, h: 12 },
  CAPACITOR:   { w: 8,  h: 5  },
  RESISTOR:    { w: 8,  h: 5  },
  OSCILLATOR:  { w: 12, h: 10 },
  RF_ANTENNA:  { w: 30, h: 8  },
  MOSFET:      { w: 10, h: 12 },
  'OP-AMP':    { w: 18, h: 14 },
  ADC:         { w: 22, h: 18 },
  VOLTAGE_REF: { w: 12, h: 10 },
  IC:          { w: 20, h: 16 },
};

const DEFAULT_SIZE = { w: 10, h: 8 };

// Body fill colours per layer
const BODY_COLORS: Record<string, string> = {
  MCU:         '#172554',
  CONNECTOR:   '#1e1b4b',
  LDO:         '#052e16',
  CAPACITOR:   '#1c1917',
  RESISTOR:    '#1c1917',
  OSCILLATOR:  '#1e293b',
  RF_ANTENNA:  '#082f49',
  MOSFET:      '#052e16',
  'OP-AMP':    '#2d1b69',
  ADC:         '#4a044e',
  VOLTAGE_REF: '#451a03',
  IC:          '#1e293b',
};

const SILKSCREEN_COLOR = '#f8fafc22';
const PAD_COLOR = '#d97706';
const PAD_SELECTED_COLOR = '#22d3ee';

interface FootprintProps {
  comp: PCBComponent;
  selected: boolean;
  showSilkscreen: boolean;
  showCourtyard: boolean;
  onClick: () => void;
}

const Footprint: React.FC<FootprintProps> = ({
  comp,
  selected,
  showSilkscreen,
  showCourtyard,
  onClick,
}) => {
  const { w, h } = FOOTPRINT_SIZES[comp.type] ?? DEFAULT_SIZE;
  const bodyFill = BODY_COLORS[comp.type] ?? '#1e293b';
  const padColor = selected ? PAD_SELECTED_COLOR : PAD_COLOR;

  // Pad positions depend on type
  const pads = getPads(comp.type, w, h);

  return (
    <g
      transform={`translate(${comp.x},${comp.y}) rotate(${comp.rotation})`}
      onClick={onClick}
      className="cursor-pointer"
      role="button"
      aria-label={`${comp.name} (${comp.type})`}
    >
      {/* Courtyard */}
      {showCourtyard && (
        <rect
          x={-w / 2 - 3} y={-h / 2 - 3}
          width={w + 6} height={h + 6}
          fill="none"
          stroke="#facc1544"
          strokeWidth={0.5}
          strokeDasharray="2 1"
        />
      )}

      {/* Selection highlight */}
      {selected && (
        <rect
          x={-w / 2 - 2} y={-h / 2 - 2}
          width={w + 4} height={h + 4}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={1}
          strokeDasharray="3 2"
          rx={1}
        />
      )}

      {/* Component body */}
      <rect
        x={-w / 2} y={-h / 2}
        width={w} height={h}
        fill={bodyFill}
        stroke={selected ? '#22d3ee' : '#334155'}
        strokeWidth={0.5}
        rx={1}
      />

      {/* Pin 1 marker */}
      <circle cx={-w / 2 + 2} cy={-h / 2 + 2} r={1} fill="#f8fafc66" />

      {/* Pads */}
      {pads.map((pad, i) => (
        <rect
          key={i}
          x={pad.x - pad.pw / 2}
          y={pad.y - pad.ph / 2}
          width={pad.pw}
          height={pad.ph}
          fill={padColor}
          rx={0.5}
          opacity={0.85}
        />
      ))}

      {/* Silkscreen: ref label */}
      {showSilkscreen && (
        <text
          x={0} y={-h / 2 - 2}
          textAnchor="middle"
          fontSize={Math.max(4, Math.min(6, w / 5))}
          fill={SILKSCREEN_COLOR}
          fontFamily="monospace"
        >
          {comp.name.slice(0, 8)}
        </text>
      )}
    </g>
  );
};

interface Pad { x: number; y: number; pw: number; ph: number }

function getPads(type: string, w: number, h: number): Pad[] {
  const pw = 2.5;
  const ph = 2;
  switch (type) {
    case 'CAPACITOR':
    case 'RESISTOR':
      return [
        { x: -w / 2 - 1, y: 0, pw, ph },
        { x:  w / 2 + 1, y: 0, pw, ph },
      ];
    case 'MOSFET':
      return [
        { x: -w / 2 - 1, y: 0,  pw, ph },  // GATE
        { x: 0,          y: -h / 2 - 1, pw: ph, ph: pw }, // DRAIN
        { x: 0,          y:  h / 2 + 1, pw: ph, ph: pw }, // SOURCE
      ];
    case 'LDO':
    case 'VOLTAGE_REF':
      return [
        { x: -w / 2 - 1, y: 0, pw, ph },   // IN
        { x: 0, y: h / 2 + 1, pw, ph },    // GND
        { x: w / 2 + 1,  y: 0, pw, ph },   // OUT
      ];
    case 'CONNECTOR': {
      const pinCount = 4;
      const pinSpacing = h / (pinCount + 1);
      return Array.from({ length: pinCount }, (_, i) => ({
        x: w / 2 + 1,
        y: -h / 2 + pinSpacing * (i + 1),
        pw,
        ph,
      }));
    }
    case 'MCU': {
      const pins = 8;
      const spacing = h / (pins / 2 + 1);
      const leftPins = Array.from({ length: pins / 2 }, (_, i) => ({
        x: -w / 2 - 1,
        y: -h / 2 + spacing * (i + 1),
        pw,
        ph,
      }));
      const rightPins = Array.from({ length: pins / 2 }, (_, i) => ({
        x: w / 2 + 1,
        y: -h / 2 + spacing * (i + 1),
        pw,
        ph,
      }));
      return [...leftPins, ...rightPins];
    }
    default: {
      // Generic IC: 2 pins per side
      return [
        { x: -w / 2 - 1, y: -h / 4, pw, ph },
        { x: -w / 2 - 1, y:  h / 4, pw, ph },
        { x:  w / 2 + 1, y: -h / 4, pw, ph },
        { x:  w / 2 + 1, y:  h / 4, pw, ph },
      ];
    }
  }
}

const ComponentRenderer: React.FC<ComponentRendererProps> = ({
  components,
  selectedId,
  showSilkscreen,
  showCourtyard,
  onComponentClick,
}) => {
  return (
    <g aria-label="Component layer">
      {components.map(comp => (
        <Footprint
          key={comp.id}
          comp={comp}
          selected={comp.id === selectedId}
          showSilkscreen={showSilkscreen}
          showCourtyard={showCourtyard}
          onClick={() => onComponentClick(comp.id)}
        />
      ))}
    </g>
  );
};

export default ComponentRenderer;
