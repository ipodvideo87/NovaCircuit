import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useTransactionStore } from '../../lib/core/transaction';
import { PCBComponent } from '../../types/pcb';
import { RefreshCw, Plus, Trash2, Edit3, X, SlidersHorizontal, Check, Sparkles } from 'lucide-react';
import { getPinsForType, getLogicalNetForPin, autoRouteBoardNets } from '../../lib/core/netlist';

export const SchematicCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [zoom, setZoom] = useState(0.9);
  
  // Zustand sync states
  const { history, currentIndex, commitTransaction, selectedComponentId, selectedTraceId, setSelectedComponentId, setSelectedTraceId } = useTransactionStore();
  const board = history[currentIndex];

  // Tool states
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);
  const [activeToolTab, setActiveToolTab] = useState<'place' | 'properties'>('place');
  const [newPartType, setNewPartType] = useState<'RESISTOR' | 'CAPACITOR' | 'LED' | 'IC'>('RESISTOR');
  const [newPartValue, setNewPartValue] = useState<string>('1k');
  const [newPartNet, setNewPartNet] = useState<string>('net-new');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      // Observer active
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute robust schematic coordinates for components if not explicitly saved
  const schemComponents = useMemo(() => {
    return board.components.map((comp, idx) => {
      // If template contains coordinate details, let's derive them beautifully
      let sx = comp.schX;
      let sy = comp.schY;
      
      if (sx === undefined || sy === undefined) {
        // Run auto-placement algorithm
        const type = comp.type.toUpperCase();
        if (type === 'CONNECTOR') {
          sx = 150;
          sy = 200 + idx * 80;
        } else if (type === 'LDO' || type === 'VOLTAGE_REF') {
          sx = 320;
          sy = 180 + idx * 70;
        } else if (type === 'MCU' || type === 'IC') {
          sx = 520;
          sy = 300;
        } else if (type === 'CAPACITOR' || type === 'RESISTOR' || type === 'INDUCTOR') {
          // Cluster near main chips or regulators
          if (comp.name.toLowerCase().includes('decouple') || comp.name.toLowerCase().includes('output')) {
            sx = 400;
            sy = 150 + (idx % 3) * 60;
          } else {
            sx = comp.x > 400 ? 680 : 420;
            sy = 380 + (idx % 4) * 50;
          }
        } else if (type === 'RF_ANTENNA') {
          sx = 750;
          sy = 180;
        } else {
          sx = 620 + (idx % 3) * 60;
          sy = 200 + Math.floor(idx / 3) * 80;
        }
      }

      return {
        ...comp,
        schX: sx,
        schY: sy,
        value: comp.value || (comp.type === 'MCU' ? 'ESP32' : comp.name.split(' ')[0] || 'Value')
      };
    });
  }, [board.components]);

  // Map out wire connection nets by checking traces/ratsnest on physical Board
  const schematicWires = useMemo(() => {
    // Generate logical net connection paths between schematic pins
    // To do this, we map out which pins connect to which nets
    const netToPinsMap: Record<string, { compId: string; pinName: string; x: number; y: number }[]> = {};

    schemComponents.forEach(comp => {
      const pins = getPinsForType(comp.type);
      pins.forEach(pin => {
        // Calculate pin absolute coordinate on schematic
        let px = comp.schX! || 0;
        let py = comp.schY! || 0;
        const offset = pin.offset;

        let w = 40;
        let h = 40;
        const typeUpper = comp.type.toUpperCase();
        if (typeUpper === 'MCU') { w = 84; h = 84; }
        else if (typeUpper === 'CONNECTOR') { w = 40; h = 60; }
        else if (typeUpper === 'LDO') { w = 50; h = 40; }

        if (pin.side === 'left') { px -= w / 2; py += offset; }
        else if (pin.side === 'right') { px += w / 2; py += offset; }
        else if (pin.side === 'top') { px += offset; py -= h / 2; }
        else if (pin.side === 'bottom') { px += offset; py += h / 2; }

        // Find which net connects to this component and this logical pin using our robust template-aware solver
        let pinNet = getLogicalNetForPin(comp.id, comp.name, comp.type, pin.name);

        // If the logical net turns out to be a generic fallback, check physical spatial traces
        if (pinNet.startsWith('net-') && pinNet.includes(comp.id)) {
          const connections = [
            ...board.traces.map(t => ({ netId: t.netId, startX: t.startX, startY: t.startY, endX: t.endX, endY: t.endY })),
            ...board.ratnest.map(r => ({ netId: r.netId, startX: r.startX, startY: r.startY, endX: r.endX, endY: r.endY }))
          ].filter(conn => {
            const distStart = Math.sqrt((conn.startX - comp.x) ** 2 + (conn.startY - comp.y) ** 2);
            const distEnd = Math.sqrt((conn.endX - comp.x) ** 2 + (conn.endY - comp.y) ** 2);
            return distStart < 60 || distEnd < 60;
          });

          if (connections.length > 0) {
            const matched = connections.find(c => c.netId.toLowerCase().includes(pin.name.toLowerCase())) || connections[0];
            pinNet = matched.netId;
          }
        }

        if (!netToPinsMap[pinNet]) {
          netToPinsMap[pinNet] = [];
        }
        netToPinsMap[pinNet].push({ compId: comp.id, pinName: pin.name, x: px, y: py });
      });
    });

    // Translate pin connection groups to orthogonal wires (Manhattan orthogonal routing paths)
    const wires: { netId: string; points: { x: number; y: number }[] }[] = [];

    Object.entries(netToPinsMap).forEach(([netId, pinGroup]) => {
      if (pinGroup.length < 2) return;
      
      // Let's chain points with orthogonal lines
      // Simple routing: connect all to a central trunk or chain-link them
      const sortedByX = [...pinGroup].sort((a, b) => a.x - b.x);
      
      for (let i = 0; i < sortedByX.length - 1; i++) {
        const p1 = sortedByX[i];
        const p2 = sortedByX[i + 1];

        // Draw orthogonal bend: p1 -> (midX, p1.y) -> (midX, p2.y) -> p2
        const midX = (p1.x + p2.x) / 2;
        
        wires.push({
          netId,
          points: [
            { x: p1.x, y: p1.y },
            { x: midX, y: p1.y },
            { x: midX, y: p2.y },
            { x: p2.x, y: p2.y }
          ]
        });
      }
    });

    return wires;
  }, [schemComponents, board.traces, board.ratnest]);

  // Dynamic set of existing nets for auto-completion
  const existingNets = useMemo(() => {
    const nets = new Set<string>();
    nets.add('gnd');
    nets.add('vcc-5v');
    nets.add('vcc-3.3v');
    nets.add('wifi-ant-rf');
    nets.add('en');
    nets.add('usb-dp');
    nets.add('usb-dn');
    
    board.traces.forEach(t => { if (t.netId) nets.add(t.netId); });
    board.ratnest.forEach(r => { if (r.netId) nets.add(r.netId); });
    return Array.from(nets);
  }, [board.traces, board.ratnest]);

  // Touch handlers for panning and zooming on mobile
  const lastTouchDistance = useRef<number | null>(null);
  const touchStart = useRef({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setSelectedTraceId(null);
    if (e.button === 0 || e.button === 1) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(5, z * factor)));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastTouchDistance.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - touchStart.current.x;
      const dy = e.touches[0].clientY - touchStart.current.y;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDistance.current !== null && lastTouchDistance.current > 0) {
        const factor = dist / lastTouchDistance.current;
        setZoom(z => Math.max(0.2, Math.min(5, z * (factor > 1 ? 1.05 : 0.95))));
      }
      lastTouchDistance.current = dist;
    }
  };

  // Add Component (Synchronizes Schematic Component and Generates PCB footprint + ratsnest link)
  const handleAddComponentWithSync = () => {
    const id = `U${board.components.length + 1}_S`;
    const name = `${newPartType}_${newPartValue}`;

    // Place the schematic part
    const newSchemComp: PCBComponent = {
      id,
      name,
      rotation: 0,
      type: newPartType === 'IC' ? 'MCU' : newPartType,
      x: 300 + Math.random() * 200, // PCB coordinate layout
      y: 300 + Math.random() * 200,
      schX: 450, // Schematic coordinate layout
      schY: 450,
      value: newPartValue
    };

    // Push new component + standard GND ratsnest airwire
    const updatedComponents = [...board.components, newSchemComp];
    const updatedRatnest = [
      ...board.ratnest,
      {
        id: `rat-added-${Date.now()}`,
        startX: newSchemComp.x,
        startY: newSchemComp.y,
        endX: 400,
        endY: 300,
        netId: newPartNet
      }
    ];

    const fullyRouted = autoRouteBoardNets({
      ...board,
      components: updatedComponents,
      ratnest: updatedRatnest
    });

    commitTransaction(fullyRouted);

    setSelectedComponentId(id);
    setSyncFeedback(`Synced symbol ${id} on net "${newPartNet}"`);
    setTimeout(() => setSyncFeedback(null), 4000);
  };

  // Delete component from Schematic & erase footprint + traces from layout
  const handleDeleteComponentWithSync = (compId: string) => {
    if (!compId) return;
    const updatedComponents = board.components.filter(c => c.id !== compId);
    const updatedTraces = board.traces.filter(t => {
      // Disconnect traces near that component center
      const comp = board.components.find(c => c.id === compId);
      if (!comp) return true;
      const distStart = Math.sqrt((t.startX - comp.x) ** 2 + (t.startY - comp.y) ** 2);
      const distEnd = Math.sqrt((t.endX - comp.x) ** 2 + (t.endY - comp.y) ** 2);
      return distStart >= 40 && distEnd >= 40;
    });
    const updatedRatnest = board.ratnest.filter(r => {
      const comp = board.components.find(c => c.id === compId);
      if (!comp) return true;
      const distStart = Math.sqrt((r.startX - comp.x) ** 2 + (r.startY - comp.y) ** 2);
      const distEnd = Math.sqrt((r.endX - comp.x) ** 2 + (r.endY - comp.y) ** 2);
      return distStart >= 40 && distEnd >= 40;
    });

    commitTransaction({
      ...board,
      components: updatedComponents,
      traces: updatedTraces,
      ratnest: updatedRatnest
    });

    setSelectedComponentId(null);
    setSyncFeedback(`Erased symbol ${compId} from design workspace`);
    setTimeout(() => setSyncFeedback(null), 4000);
  };

  const selectedCompData = useMemo(() => {
    if (!selectedComponentId) return null;
    return schemComponents.find(c => c.id === selectedComponentId) || null;
  }, [selectedComponentId, schemComponents]);

  // Render symbol visual SVG based on part taxonomy
  const renderSymbolVisual = (comp: PCBComponent & { schX?: number; schY?: number; value?: string }, isSelected: boolean) => {
    const typeUpper = comp.type.toUpperCase();
    let w = 40;
    let h = 40;

    if (typeUpper === 'MCU') { w = 84; h = 84; }
    else if (typeUpper === 'CONNECTOR') { w = 40; h = 60; }
    else if (typeUpper === 'LDO') { w = 50; h = 40; }

    const hw = w / 2;
    const hh = h / 2;

    const pins = getPinsForType(comp.type);

    return (
      <g>
        {/* Glow selection boundary */}
        {isSelected && (
          <rect
            x={-hw - 4}
            y={-hh - 4}
            width={w + 8}
            height={h + 8}
            fill="none"
            stroke="#818cf8"
            strokeWidth={1.5}
            strokeDasharray="3 2"
            rx={4}
            className="animate-pulse"
          />
        )}

        {/* Outer symbol enclosure rect */}
        <rect
          x={-hw}
          y={-hh}
          width={w}
          height={h}
          fill="#111118"
          stroke={isSelected ? "#818cf8" : "#818cf8" }
          strokeOpacity={isSelected ? 1 : 0.6}
          strokeWidth={1.5}
          rx={3}
        />

        {/* Custom graphic drawing inside package */}
        {typeUpper === 'LDO' && (
          <g transform="translate(0, -5)" stroke="#6366f1" strokeWidth={1} fill="none">
            <rect x={-15} y={-5} width={30} height={15} rx={1} fill="#14141e" />
            <text x={0} y={4} textAnchor="middle" className="text-[6px] fill-gray-400 font-mono">REG</text>
          </g>
        )}

        {typeUpper === 'CONNECTOR' && (
          <g stroke="#38bdf8" strokeWidth={1} fill="none">
            {Array.from({ length: 4 }).map((_, i) => (
              <line key={i} x1={-10} y1={-15 + i * 10} x2={10} y2={-15 + i * 10} strokeOpacity="0.4" />
            ))}
          </g>
        )}

        {/* Passive schematic graphics inside (resistor wiggles / cap lines) */}
        {(typeUpper === 'RESISTOR' || typeUpper === 'LED') && (
          <g stroke="#f5d44f" strokeWidth={1.2} fill="none">
            {/* IEEE zigzag resistor symbol */}
            <path d="M -15 0 L -10 0 L -7 -5 L -2 5 L 3 -5 L 8 5 L 11 0 L 15 0" />
          </g>
        )}

        {typeUpper === 'CAPACITOR' && (
          <g stroke="#10b981" strokeWidth={1.5} fill="none">
            {/* Capacitor parallel plates */}
            <line x1={-15} y1={0} x2={-4} y2={0} strokeWidth={1} />
            <line x1={-4} y1={-12} x2={-4} y2={12} />
            <line x1={4} y1={-12} x2={4} y2={12} />
            <line x1={4} y1={0} x2={15} y2={0} strokeWidth={1} />
          </g>
        )}

        {typeUpper === 'RF_ANTENNA' && (
          <g stroke="#ec4899" strokeWidth={1.2} fill="none">
            {/* Standard Antenna symbol */}
            <line x1={0} y1={12} x2={0} y2={-6} />
            <path d="M -8 -6 L 0 6 L 8 -6 Z" fill="#ec4899" fillOpacity="0.1" />
          </g>
        )}

        {/* Display Pins */}
        {pins.map((pin, i) => {
          let px = 0;
          const py = pin.offset;

          let lx1 = 0, ly1 = py, lx2 = 0, ly2 = py;
          let txtAnchor: 'start' | 'end' | 'middle' = 'middle';
          let tx = 0, ty = py;

          if (pin.side === 'left') {
            lx1 = -hw; lx2 = -hw - 10;
            txtAnchor = 'start';
            tx = -hw + 4;
            ty = py + 2.5;
          } else if (pin.side === 'right') {
            lx1 = hw; lx2 = hw + 10;
            txtAnchor = 'end';
            tx = hw - 4;
            ty = py + 2.5;
          } else if (pin.side === 'top') {
            px = pin.offset;
            lx1 = px; ly1 = -hh;
            lx2 = px; ly2 = -hh - 10;
            txtAnchor = 'middle';
            tx = px;
            ty = -hh + 8;
          } else if (pin.side === 'bottom') {
            px = pin.offset;
            lx1 = px; ly1 = hh;
            lx2 = px; ly2 = hh + 10;
            txtAnchor = 'middle';
            tx = px;
            ty = hh - 3;
          }

          return (
            <g key={i}>
              {/* Pin lead lines extension */}
              <line
                x1={lx1}
                y1={ly1}
                x2={lx2}
                y2={ly2}
                stroke="#475569"
                strokeWidth={1}
              />
              {/* Tiny terminal dot */}
              <circle cx={lx2} cy={ly2} r={1.5} fill="#38bdf8" />
              {/* Pin Labels inside */}
              <text
                x={tx}
                y={ty}
                textAnchor={txtAnchor}
                className="font-mono text-[5px] fill-gray-500 font-bold select-none pointer-events-none"
              >
                {pin.name}
              </text>
            </g>
          );
        })}

        {/* Reference identifiers designator & values */}
        <text
          x={0}
          y={-hh - 8}
          textAnchor="middle"
          className="font-mono text-[8px] fill-emerald-400 font-extrabold select-none uppercase tracking-wide"
        >
          {comp.id}
        </text>
        <text
          x={0}
          y={hh + 9}
          textAnchor="middle"
          className="font-mono text-[7px] fill-gray-300 font-medium select-none"
        >
          {comp.value}
        </text>
      </g>
    );
  };

  return (
    <div className="absolute inset-0 flex flex-col md:flex-row bg-[#08080d]">
      
      {/* 1. Left View schematic paper sheet */}
      <div 
        ref={containerRef}
        className="flex-1 h-full overflow-hidden bg-[#07070b] relative select-none cursor-grab"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        style={{ touchAction: 'none' }}
      >
        <svg 
          width="100%" 
          height="100%" 
          onClick={() => {
            setSelectedComponentId(null);
            setSelectedTraceId(null);
          }}
        >
          {/* Engineering blueprint grid background pattern */}
          <defs>
            <pattern id="schematic-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="none" />
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#6366f1" strokeWidth="0.5" opacity="0.08" />
              <circle cx="10" cy="10" r="0.5" fill="#6366f1" opacity="0.1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#schematic-grid)" />

          {/* Pan / Zoom Group */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            
            {/* Beautiful schematic title block frame border */}
            <rect 
              x="50" 
              y="50" 
              width="850" 
              height="550" 
              fill="none" 
              stroke="#50506a" 
              strokeWidth="1.5" 
              strokeOpacity="0.4" 
            />
            {/* Bottom-right Title sheet info placard */}
            <g transform="translate(650, 500)" opacity="0.8">
              <rect x="0" y="0" width="250" height="100" fill="#0b0b10" stroke="#475569" strokeWidth="1" />
              <text x="15" y="25" className="fill-indigo-400 font-mono text-[9px] font-black uppercase">Suite: NovaCircuit Professional</text>
              <line x1="0" y1="35" x2="250" y2="35" stroke="#475569" strokeWidth="0.5" />
              <text x="15" y="50" className="fill-gray-300 font-sans text-xs font-bold">SCHEMATIC CAPTURE SHEET</text>
              <text x="15" y="70" className="fill-gray-500 font-mono text-[7px]">Sheet: 1 of 1 | Scale: 1:1</text>
              <text x="15" y="85" className="fill-emerald-400 font-mono text-[7.5px] uppercase font-bold">Electrical Solvers: active</text>
            </g>

            {/* Manhattan Connection Wires (Nets) */}
            <g className="schematic-wires-layer">
              {schematicWires.map((wire, idx) => {
                const isSelected = selectedTraceId === wire.netId;
                const pathD = wire.points.reduce((acc, pt, index) => {
                  return index === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
                }, "");

                const wireColor = wire.netId.includes('vcc') || wire.netId.includes('5v')
                  ? '#ef4444' // VCC Power lines (red)
                  : wire.netId === 'GND' || wire.netId === 'gnd'
                  ? '#a8a29e' // GND return paths (slate grey)
                  : '#10b981'; // Signal lines (traditional schematic green)

                return (
                  <g 
                    key={idx} 
                    className="cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTraceId(wire.netId);
                    }}
                  >
                    {/* Thick transparent interactive selector zone */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={10}
                    />

                    {/* Outer glow during net highlight selection */}
                    {isSelected && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth={4.5}
                        opacity="0.8"
                        className="animate-pulse"
                      />
                    )}

                    {/* Sharp Manhattan signal schematic wire */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={wireColor}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />

                    {/* Net connection label identifiers */}
                    {wire.points.length > 2 && (
                      <text
                        x={(wire.points[1].x + wire.points[2].x) / 2}
                        y={(wire.points[1].y + wire.points[2].y) / 2 - 4}
                        textAnchor="middle"
                        className="font-mono text-[6.5px] fill-gray-500 font-bold select-none pointer-events-none uppercase transition-colors"
                      >
                        {wire.netId}
                      </text>
                    )}

                    {/* Dynamic connection T-junction points */}
                    <circle 
                      cx={wire.points[1].x} 
                      cy={wire.points[1].y} 
                      r={3} 
                      fill={wireColor} 
                      opacity="0.9" 
                    />
                  </g>
                );
              })}
            </g>

            {/* Schematic Symbols Capture Layer */}
            <g className="symbols-layer">
              {schemComponents.map((comp) => {
                const isSelected = selectedComponentId === comp.id;
                return (
                  <g
                    key={comp.id}
                    transform={`translate(${comp.schX}, ${comp.schY})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedComponentId(comp.id);
                    }}
                  >
                    {renderSymbolVisual(comp, isSelected)}
                  </g>
                );
              })}
            </g>

          </g>
        </svg>

        {/* Top Floating Helper HUD */}
        <div className="absolute top-4 left-4 z-15 flex gap-2">
          <div className="bg-[#111116]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 text-[9px] uppercase font-mono flex items-center gap-2 text-indigo-400 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Schematic Capture: Sync Engine Stable
          </div>
          <button 
            onClick={() => { setPan({ x: 100, y: 100 }); setZoom(0.9); }}
            className="bg-[#111116]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 hover:border-indigo-500/30 text-[9px] uppercase font-mono text-gray-400 flex items-center gap-1 transition-all"
          >
            <RefreshCw size={11} /> Reset Sheet Zoom
          </button>
          <button 
            onClick={() => {
              const fullyRouted = autoRouteBoardNets(board);
              commitTransaction(fullyRouted);
              setSyncFeedback("Auto-Fix Complete: Same-net paths mapped dynamically!");
              setTimeout(() => setSyncFeedback(null), 4000);
            }}
            id="btn-auto-fix-nets"
            className="bg-[#111116]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 hover:border-emerald-500/30 text-[9px] uppercase font-mono text-emerald-400 flex items-center gap-1 transition-all"
            title="Automatically run orthogonal same-net routing checks and generate ratsnest airwires for direct sync"
          >
            <Sparkles size={11} className="text-emerald-400 animate-pulse" /> Complete Connections
          </button>
        </div>

        {/* FLOATING ACTION TRIGGER ON MOBILE FOR DRAWER */}
        <button
          onClick={() => setIsSidebarOpenMobile(true)}
          className="md:hidden absolute bottom-4 right-4 z-25 flex items-center gap-1.5 px-3 py-2 bg-indigo-650 hover:bg-indigo-600 border border-indigo-500/30 text-white rounded-xl shadow-2xl focus:outline-none"
        >
          <SlidersHorizontal size={14} />
          <span className="text-[10px] uppercase tracking-wider font-extrabold font-sans">Symbols & Fields</span>
        </button>
      </div>

      {/* MOBILE DRAWER SHIELD OVERLAY */}
      {isSidebarOpenMobile && (
        <div 
          onClick={() => setIsSidebarOpenMobile(false)}
          className="md:hidden fixed inset-0 bg-black/70 z-30 transition-opacity"
        />
      )}

      {/* 2. Right View: Co-design synchronization controller sidebar */}
      <div 
        className={`fixed md:relative top-0 right-0 bottom-0 w-80 sm:w-96 border-l border-white/5 bg-[#101015]/98 backdrop-blur-xl flex flex-col h-full overflow-hidden transition-transform duration-300 z-40 md:translate-x-0 ${
          isSidebarOpenMobile ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2 bg-[#14141d]/50 border-b border-white/5 md:hidden shrink-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Symbols & Parameters</span>
          <button 
            onClick={() => setIsSidebarOpenMobile(false)}
            className="p-1 rounded bg-white/5 text-gray-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex h-11 border-b border-white/5 bg-[#14141d]/20 shrink-0">
          <button
            onClick={() => setActiveToolTab('place')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors outline-none ${
              activeToolTab === 'place' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-white/[0.01]' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Plus size={12} /> ADD SYMBOLS
          </button>
          <button
            onClick={() => setActiveToolTab('properties')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors outline-none ${
              activeToolTab === 'properties' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-white/[0.01]' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Edit3 size={11} /> INSPECT PARAMETERS
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {syncFeedback && (
            <div className="bg-[#10b981]/10 border border-[#10b981]/25 p-3 rounded-lg text-[#10b981] text-[10px] font-bold flex items-center gap-2 animate-in fade-in duration-200">
              <Check size={11} strokeWidth={3} />
              {syncFeedback}
            </div>
          )}

          {activeToolTab === 'place' && (
            <div className="space-y-4 text-xs">
              <div className="bg-indigo-500/5 border border-indigo-500/10 p-3 rounded-lg leading-relaxed text-gray-400">
                <span className="font-bold text-white text-[11px] block mb-1">⚡ Dynamic Layout Synchronization</span>
                Adding symbols to the schematic capture dynamically provisions corresponding mechanical footprint pads and GND ratsnest airwires to the active PCB core board file in real time.
              </div>

              {/* Pin mapping inputs */}
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 block">Symbol Type Classifier</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['RESISTOR', 'CAPACITOR', 'LED', 'IC'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => {
                        setNewPartType(type);
                        setNewPartValue(type === 'RESISTOR' ? '4.7k' : type === 'CAPACITOR' ? '0.1uF' : type === 'LED' ? 'Red Indicator' : 'MCP2551 CAN');
                      }}
                      className={`py-2 text-[10px] font-bold tracking-wider rounded-lg border uppercase transition-all ${
                        newPartType === type
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-[#15151a] border-white/5 hover:border-white/20 text-gray-400'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 block">Technical Value label</label>
                <input
                  type="text"
                  value={newPartValue}
                  onChange={(e) => setNewPartValue(e.target.value)}
                  className="w-full bg-[#15151a] border border-white/5 hover:border-indigo-500/20 rounded-lg py-1.5 px-3 font-mono text-[11px] text-white focus:outline-none focus:border-indigo-500/30 transition-all font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 block">Net Connectivity ID</label>
                <input
                  type="text"
                  list="schematic-nets-datalist"
                  value={newPartNet}
                  onChange={(e) => setNewPartNet(e.target.value)}
                  className="w-full bg-[#15151a] border border-white/5 hover:border-indigo-500/20 text-white rounded-lg py-1.5 px-3 font-mono text-[11px] focus:outline-none transition-all placeholder-gray-600"
                  placeholder="Type or select a net..."
                />
                <datalist id="schematic-nets-datalist">
                  {existingNets.map((net) => (
                    <option key={net} value={net}>
                      {net === 'gnd' ? 'Ground Plane (GND)' : net}
                    </option>
                  ))}
                </datalist>
                <span className="text-[8px] text-gray-500 font-mono italic block">Supports keying custom paths to autotrack.</span>
              </div>

              <button
                onClick={handleAddComponentWithSync}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black tracking-widest text-[10px] uppercase shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all flex items-center justify-center gap-1 mt-4"
              >
                <Plus size={14} strokeWidth={2.5} /> Sync symbol to layout
              </button>
            </div>
          )}

          {activeToolTab === 'properties' && (
            <div className="space-y-4 text-xs">
              {selectedCompData ? (
                <div className="space-y-4">
                  {/* Selected summary */}
                  <div className="bg-[#171722] p-4 rounded-xl border border-white/5 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-mono text-indigo-400 font-bold block uppercase tracking-wider">Symbol Designator</span>
                      <h4 className="text-sm font-black font-mono text-white tracking-tight mt-0.5">{selectedCompData.id}</h4>
                    </div>
                    <button
                      onClick={() => handleDeleteComponentWithSync(selectedCompData.id)}
                      className="p-2 bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:text-white hover:bg-rose-500 transition-colors rounded-lg"
                      title="Erase Symbol and Footprint"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 block">Footprint Identifier label</span>
                    <input
                      type="text"
                      value={selectedCompData.name}
                      onChange={(e) => {
                        const nextComps = board.components.map(c => 
                          c.id === selectedCompData.id ? { ...c, name: e.target.value } : c
                        );
                        commitTransaction({ ...board, components: nextComps });
                      }}
                      className="w-full bg-[#15151a] border border-white/5 hover:border-indigo-500/20 text-white rounded-lg py-1.5 px-3 font-mono text-[11px] focus:outline-none focus:border-indigo-500/30 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 block">Symbol Value Value</span>
                    <input
                      type="text"
                      value={selectedCompData.value || ''}
                      onChange={(e) => {
                        const nextComps = board.components.map(c => 
                          c.id === selectedCompData.id ? { ...c, value: e.target.value } : c
                        );
                        commitTransaction({ ...board, components: nextComps });
                      }}
                      className="w-full bg-[#15151a] border border-white/5 hover:border-indigo-500/20 text-white rounded-lg py-1.5 px-3 font-mono text-[11px] focus:outline-none focus:border-indigo-500/30 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 block">Class Category</span>
                    <div className="py-1 px-3 bg-white/5 border border-white/5 rounded-lg text-gray-300 font-mono text-[10px] uppercase font-bold self-start">
                      {selectedCompData.type} Package
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-44 bg-[#15151a] border border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center p-4 text-center">
                  <Plus className="text-gray-650 mb-2" size={24} />
                  <p className="text-[10px] text-gray-500 max-w-xs leading-relaxed">
                    Click any capturing component or net trace inside the schematic capture diagram sheet to inspect or modify engineering properties.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
