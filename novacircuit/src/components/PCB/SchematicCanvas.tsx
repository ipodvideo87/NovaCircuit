/**
 * SchematicCanvas — Schematic symbol capture sheet
 *
 * Renders a classic engineering schematic grid with:
 *  • Component symbols (MCU, LDO, passives, connectors)
 *  • Net labels on power rails (VCC, GND)
 *  • Wire connections between pins
 *
 * Supports pan/zoom and component selection.
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import type { PCBBoard, PCBComponent } from '../../types/pcb';
import { useTransactionStore } from '../../lib/core/transaction';

interface SchematicCanvasProps {
  board: PCBBoard;
  activeTool: string;
  onCommit: (board: PCBBoard) => void;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

// ─── Symbol Renderers ─────────────────────────────────────────────────────────

const SYMBOL_COLORS: Record<string, string> = {
  MCU:         '#60a5fa',
  CONNECTOR:   '#a78bfa',
  LDO:         '#34d399',
  CAPACITOR:   '#f59e0b',
  RESISTOR:    '#fb923c',
  OSCILLATOR:  '#f472b6',
  RF_ANTENNA:  '#38bdf8',
  MOSFET:      '#4ade80',
  'OP-AMP':    '#e879f9',
  ADC:         '#fb7185',
  VOLTAGE_REF: '#fbbf24',
  IC:          '#94a3b8',
};

function getSymbolColor(type: string): string {
  return SYMBOL_COLORS[type] ?? '#64748b';
}

interface SymbolProps {
  comp: PCBComponent;
  selected: boolean;
  onClick: () => void;
}

const ComponentSymbol: React.FC<SymbolProps> = ({ comp, selected, onClick }) => {
  const color = getSymbolColor(comp.type);
  const scale = 0.6;
  const W = 50 * scale;
  const H = 30 * scale;

  // Two-pin passive symbol (capacitor / resistor / inductor)
  if (['CAPACITOR', 'RESISTOR', 'OSCILLATOR'].includes(comp.type)) {
    const isCAP = comp.type === 'CAPACITOR';
    const isOSC = comp.type === 'OSCILLATOR';
    return (
      <g
        transform={`translate(${comp.x},${comp.y}) rotate(${comp.rotation})`}
        onClick={onClick}
        className="cursor-pointer"
        role="button"
        aria-label={comp.name}
      >
        {selected && (
          <rect x={-W / 2 - 4} y={-H / 2 - 4} width={W + 8} height={H + 8}
            fill="none" stroke="#22d3ee" strokeWidth={1} strokeDasharray="3 2" rx={2} />
        )}
        {/* Pin wires */}
        <line x1={-W / 2 - 8} y1={0} x2={-W / 2} y2={0} stroke={color} strokeWidth={1} />
        <line x1={W / 2} y1={0} x2={W / 2 + 8} y2={0} stroke={color} strokeWidth={1} />
        {isCAP ? (
          <>
            <line x1={-3} y1={-H / 2 + 2} x2={-3} y2={H / 2 - 2} stroke={color} strokeWidth={1.5} />
            <line x1={3}  y1={-H / 2 + 2} x2={3}  y2={H / 2 - 2} stroke={color} strokeWidth={1.5} />
          </>
        ) : isOSC ? (
          <rect x={-W / 2} y={-H / 2} width={W} height={H}
            fill="#0f172a" stroke={color} strokeWidth={1} rx={2} />
        ) : (
          // Resistor zigzag simplified
          <rect x={-W / 2} y={-H / 2 + 4} width={W} height={H - 8}
            fill="none" stroke={color} strokeWidth={1} />
        )}
        <text x={0} y={H / 2 + 8} textAnchor="middle" fontSize={6} fill="#64748b">
          {comp.name.length > 10 ? comp.name.slice(0, 10) + '…' : comp.name}
        </text>
      </g>
    );
  }

  // IC / MCU / LDO box symbol
  const pinCount = comp.type === 'MCU' ? 8 : comp.type === 'CONNECTOR' ? 4 : 4;
  const pinH = Math.max(H, pinCount * 8);

  return (
    <g
      transform={`translate(${comp.x},${comp.y}) rotate(${comp.rotation})`}
      onClick={onClick}
      className="cursor-pointer"
      role="button"
      aria-label={comp.name}
    >
      {selected && (
        <rect
          x={-W / 2 - 4} y={-pinH / 2 - 4}
          width={W + 8} height={pinH + 8}
          fill="none" stroke="#22d3ee" strokeWidth={1}
          strokeDasharray="3 2" rx={2}
        />
      )}
      {/* Body */}
      <rect
        x={-W / 2} y={-pinH / 2}
        width={W} height={pinH}
        fill="#0f172a" stroke={color}
        strokeWidth={1} rx={2}
        fillOpacity={0.9}
      />
      {/* Type label */}
      <text
        x={0} y={-pinH / 2 + 8}
        textAnchor="middle" fontSize={7}
        fill={color} fontFamily="monospace"
      >
        {comp.type.slice(0, 6)}
      </text>
      {/* Name label */}
      <text
        x={0} y={-pinH / 2 + 16}
        textAnchor="middle" fontSize={5.5}
        fill="#64748b" fontFamily="monospace"
      >
        {comp.name.length > 12 ? comp.name.slice(0, 12) + '…' : comp.name}
      </text>
      {/* Left pins */}
      {Array.from({ length: Math.ceil(pinCount / 2) }).map((_, i) => {
        const py = -pinH / 2 + 20 + i * 10;
        return (
          <g key={`lpin-${i}`}>
            <line x1={-W / 2 - 8} y1={py} x2={-W / 2} y2={py} stroke={color} strokeWidth={0.8} />
            <circle cx={-W / 2 - 8} cy={py} r={1.5} fill={color} />
          </g>
        );
      })}
      {/* Right pins */}
      {Array.from({ length: Math.floor(pinCount / 2) }).map((_, i) => {
        const py = -pinH / 2 + 20 + i * 10;
        return (
          <g key={`rpin-${i}`}>
            <line x1={W / 2} y1={py} x2={W / 2 + 8} y2={py} stroke={color} strokeWidth={0.8} />
            <circle cx={W / 2 + 8} cy={py} r={1.5} fill={color} />
          </g>
        );
      })}
    </g>
  );
};

// ─── Main Canvas ──────────────────────────────────────────────────────────────

const SchematicCanvas: React.FC<SchematicCanvasProps> = ({ board, activeTool, onCommit }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 0.7 });
  const [size, setSize] = useState({ w: 600, h: 500 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const selectedComponentId = useTransactionStore(s => s.selectedComponentId);
  const setSelectedComponentId = useTransactionStore(s => s.setSelectedComponentId);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || activeTool === 'move') {
      setIsPanning(true);
      panStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y };
      e.preventDefault();
    }
  }, [activeTool, transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStart.current) return;
    setTransform(prev => ({
      ...prev,
      x: panStart.current!.tx + e.clientX - panStart.current!.mx,
      y: panStart.current!.ty + e.clientY - panStart.current!.my,
    }));
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStart.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale * factor)),
    }));
  }, []);

  // Sample a subset of components for schematic view (avoid rendering all 300)
  const schematicComponents = useMemo(() => {
    // Prioritise MCU, LDO, CONNECTOR, then first 50 of others
    const priority = board.components.filter(
      c => ['MCU', 'LDO', 'CONNECTOR', 'OP-AMP', 'ADC', 'MOSFET', 'VOLTAGE_REF', 'OSCILLATOR'].includes(c.type)
    );
    const rest = board.components
      .filter(c => !priority.includes(c))
      .slice(0, Math.max(0, 60 - priority.length));
    return [...priority, ...rest];
  }, [board.components]);

  // Grid lines
  const gridStep = 20;
  const { x: tx, y: ty, scale: ts } = transform;

  return (
    <div
      ref={containerRef}
      className={`
        w-full h-full bg-[#07090f] overflow-hidden relative
        ${isPanning ? 'cursor-grabbing' : 'cursor-default'}
      `}
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
        aria-label="Schematic capture canvas"
        className="absolute inset-0"
      >
        <defs>
          <pattern
            id="schematic-grid"
            x={(tx % (gridStep * ts)).toString()}
            y={(ty % (gridStep * ts)).toString()}
            width={(gridStep * ts).toString()}
            height={(gridStep * ts).toString()}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridStep * ts} 0 L 0 0 0 ${gridStep * ts}`}
              fill="none"
              stroke="#0f172a"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width={size.w} height={size.h} fill="url(#schematic-grid)" />

        <g transform={`translate(${tx},${ty}) scale(${ts})`}>
          {/* Net power symbols */}
          {[{ label: 'VCC', x: 50, y: 30, color: '#f59e0b' },
            { label: 'GND', x: 100, y: 30, color: '#94a3b8' },
            { label: '+3.3V', x: 160, y: 30, color: '#34d399' }
          ].map(sym => (
            <g key={sym.label} transform={`translate(${sym.x},${sym.y})`}>
              <line x1={0} y1={0} x2={0} y2={-12} stroke={sym.color} strokeWidth={1} />
              <text x={0} y={-15} textAnchor="middle" fontSize={8}
                fill={sym.color} fontFamily="monospace">
                {sym.label}
              </text>
            </g>
          ))}

          {/* Component symbols */}
          {schematicComponents.map(comp => (
            <ComponentSymbol
              key={comp.id}
              comp={comp}
              selected={comp.id === selectedComponentId}
              onClick={() => {
                if (activeTool === 'select') {
                  setSelectedComponentId(comp.id);
                } else if (activeTool === 'delete') {
                  onCommit({
                    ...board,
                    components: board.components.filter(c => c.id !== comp.id),
                  });
                }
              }}
            />
          ))}
        </g>

        {/* Canvas label */}
        <text x={8} y={size.h - 8} fontSize={10} fill="#0f172a" fontFamily="monospace">
          SCH · {Math.round(ts * 100)}%
        </text>
      </svg>

      {/* Hint overlay */}
      <div className="absolute top-2 left-2 text-[9px] font-mono text-slate-800 pointer-events-none">
        Schematic · {schematicComponents.length} symbols
      </div>
    </div>
  );
};

export default SchematicCanvas;
