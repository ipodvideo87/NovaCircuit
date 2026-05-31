import React, { useMemo } from 'react';
import { PCBBoard, BoardPad, PolygonPourZone, BoardLayer } from '../../types/pcb';

interface PolygonPourProps {
  board: PCBBoard;
  activeLayer: "F.Cu" | "B.Cu";
  processScale: number;
  minX?: number;
  minY?: number;
  boardWidth?: number;
  boardHeight?: number;
  enabled?: boolean;
  drawingPoints?: { x: number; y: number }[]; // Hand-drawn active polygon preview points
}

export const PolygonPour: React.FC<PolygonPourProps> = React.memo(function PolygonPour({
  board,
  activeLayer,
  processScale,
  minX = -50,
  minY = -50,
  boardWidth = 100,
  boardHeight = 100,
  enabled = true,
  drawingPoints = []
}) {
  if (!enabled) return null;

  // 1. Gather all copper zones matching this layer.
  // If no zones are defined, we define a fallback full-board GND pour zone so the app retains its initial behavior.
  const zones: PolygonPourZone[] = useMemo(() => {
    const list = board.polygonPours || [];
    const matching = list.filter(z => z.layer === activeLayer);
    
    if (matching.length === 0) {
      // Fallback: Full Board GND Pour
      const pts = board.outline?.points || [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 }
      ];
      const gndNet = board.nets.find(n => n.name.toUpperCase().includes('GND'));
      return [{
        id: 'fallback-gnd-pour',
        netId: gndNet?.id || 'GND',
        layer: activeLayer,
        outlinePoints: pts,
        clearance: 0.4,
        minThickness: 0.2,
        thermalReliefEnabled: true,
        spokeWidth: 0.25,
        spokesCount: 4,
        priority: -100 // lowest priority so custom pours always overlay/cut it
      } as PolygonPourZone];
    }
    
    // Sort by priority (higher pours get processed and can cut out of lower priority ones)
    return [...matching].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [board.polygonPours, activeLayer, board.outline, board.nets]);

  // Colors based on layer
  const copperFill = activeLayer === "F.Cu" 
    ? "rgba(16, 185, 129, 0.15)" // Translucent green
    : "rgba(168, 85, 247, 0.15)"; // Translucent purple

  const copperStroke = activeLayer === "F.Cu"
    ? "rgba(16, 185, 129, 0.4)"
    : "rgba(168, 85, 247, 0.4)";

  // Helper to convert mm coordinates to SVG canvas coordinates
  const toCanvas = (pt: { x: number; y: number }) => ({
    x: pt.x * processScale + (-minX) * processScale,
    y: pt.y * processScale + (-minY) * processScale
  });

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-1 overflow-visible">
      {/* 1. Draw each individual active copper zone */}
      {zones.map((zone) => {
        const netObj = board.nets.find(n => n.id === zone.netId || n.name === zone.netId);
        const netName = netObj?.name || zone.netId;
        const targetNetId = netObj?.id || zone.netId;

        // Path generator for this zone outline
        const zonePath = zone.outlinePoints.map((p, idx) => {
          const cp = toCanvas(p);
          return `${idx === 0 ? 'M' : 'L'} ${cp.x} ${cp.y}`;
        }).join(' ') + " Z";

        // Generate dynamically positioned clearances inside THIS zone
        const clearancesList: React.ReactNode[] = [];

        // Subtract higher priority zones from this zone if they overlap boundary
        const higherPriorityZones = zones.filter(z => (z.priority || 0) > (zone.priority || 0));
        higherPriorityZones.forEach((hpZone, hpIdx) => {
          const hpPath = hpZone.outlinePoints.map((p, idx) => {
            const cp = toCanvas(p);
            return `${idx === 0 ? 'M' : 'L'} ${cp.x} ${cp.y}`;
          }).join(' ') + " Z";
          
          clearancesList.push(
            <path
              key={`hp-cutout-${zone.id}-${hpZone.id}-${hpIdx}`}
              d={hpPath}
              fill="#181818" // cuts out the lower-priority pour
              stroke="#181818"
              strokeWidth={(zone.clearance || 0.3) * processScale}
            />
          );
        });

        // Clearances for Pads
        board.components.forEach(comp => {
          comp.pads.forEach((pad, padIdx) => {
            const isThruHole = pad.type === 'tht';
            const isSameLayer = pad.layer === activeLayer || isThruHole;
            if (!isSameLayer) return;

            // Check if pad is physically inside or close to this zone.
            // (Simple bounding box check simplifies big matrix checks)
            const minZoneX = Math.min(...zone.outlinePoints.map(p => p.x));
            const maxZoneX = Math.max(...zone.outlinePoints.map(p => p.x));
            const minZoneY = Math.min(...zone.outlinePoints.map(p => p.y));
            const maxZoneY = Math.max(...zone.outlinePoints.map(p => p.y));
            if (pad.x < minZoneX - 2 || pad.x > maxZoneX + 2 || pad.y < minZoneY - 2 || pad.y > maxZoneY + 2) {
              return;
            }

            const isMatchingNet = pad.netId === targetNetId;
            const cp = toCanvas(pad);
            const padW = pad.width * processScale;
            const padH = pad.height * processScale;
            const clearanceGap = (zone.clearance || 0.3) * processScale;

            const key = `clear-pad-zone-${zone.id}-${comp.id}-${pad.id}-${padIdx}`;

            if (!isMatchingNet) {
              // NON-MATCHING Net: Full isolation hole
              if (pad.shape === 'circle') {
                clearancesList.push(
                  <circle
                    key={key}
                    cx={cp.x}
                    cy={cp.y}
                    r={(pad.width / 2) * processScale + clearanceGap}
                    fill="#181818"
                  />
                );
              } else {
                clearancesList.push(
                  <rect
                    key={key}
                    x={cp.x - padW / 2 - clearanceGap}
                    y={cp.y - padH / 2 - clearanceGap}
                    width={padW + 2 * clearanceGap}
                    height={padH + 2 * clearanceGap}
                    rx={2}
                    fill="#181818"
                  />
                );
              }
            } else {
              // MATCHING Net: Solid Connection OR Thermal Relief Spokes
              if (zone.thermalReliefEnabled) {
                const airgapWidth = 0.28 * processScale;
                const spokeW = (zone.spokeWidth || 0.25) * processScale;
                const spokesCount = zone.spokesCount || 4;

                if (pad.shape === 'circle') {
                  const rad = (pad.width / 2) * processScale;
                  clearancesList.push(
                    <g key={`thermal-${zone.id}-${comp.id}-${pad.id}`}>
                      {/* Subtracted air annulus */}
                      <circle
                        cx={cp.x}
                        cy={cp.y}
                        r={rad + airgapWidth}
                        fill="none"
                        stroke="#181818"
                        strokeWidth={airgapWidth}
                      />
                      {/* Re-bridge with copper spokes */}
                      <line x1={cp.x - rad - airgapWidth} y1={cp.y} x2={cp.x + rad + airgapWidth} y2={cp.y} stroke={copperStroke} strokeWidth={spokeW} opacity="0.7" />
                      {spokesCount === 4 && (
                        <line x1={cp.x} y1={cp.y - rad - airgapWidth} x2={cp.x} y2={cp.y + rad + airgapWidth} stroke={copperStroke} strokeWidth={spokeW} opacity="0.7" />
                      )}
                      <circle cx={cp.x} cy={cp.y} r={rad} fill={activeLayer === 'F.Cu' ? '#ef4444' : '#3b82f6'} opacity="0.85" />
                    </g>
                  );
                } else {
                  clearancesList.push(
                    <g key={`thermal-${zone.id}-${comp.id}-${pad.id}`}>
                      <rect
                        x={cp.x - padW / 2 - airgapWidth}
                        y={cp.y - padH / 2 - airgapWidth}
                        width={padW + 2 * airgapWidth}
                        height={padH + 2 * airgapWidth}
                        fill="none"
                        stroke="#181818"
                        strokeWidth={airgapWidth}
                        rx={2}
                      />
                      <line x1={cp.x - padW / 2 - airgapWidth} y1={cp.y} x2={cp.x + padW / 2 + airgapWidth} y2={cp.y} stroke={copperStroke} strokeWidth={spokeW} opacity="0.7" />
                      {spokesCount === 4 && (
                        <line x1={cp.x} y1={cp.y - padH / 2 - airgapWidth} x2={cp.x} y2={cp.y + padH / 2 + airgapWidth} stroke={copperStroke} strokeWidth={spokeW} opacity="0.7" />
                      )}
                      <rect x={cp.x - padW / 2} y={cp.y - padH / 2} width={padW} height={padH} fill={activeLayer === 'F.Cu' ? '#ef4444' : '#3b82f6'} rx={1} />
                    </g>
                  );
                }
              }
            }
          });
        });

        // Clearance Slots for Traces on other nets
        board.traces.forEach((trace, traceIdx) => {
          if (trace.layer !== activeLayer) return;
          if (trace.netId === targetNetId) return; // connected, no cutout

          const sc = toCanvas({ x: trace.startX, y: trace.startY });
          const ec = toCanvas({ x: trace.endX, y: trace.endY });
          const clearanceW = (trace.width + (zone.clearance || 0.3) * 2) * processScale;

          clearancesList.push(
            <line
              key={`clear-trace-${zone.id}-${trace.id}-${traceIdx}`}
              x1={sc.x}
              y1={sc.y}
              x2={ec.x}
              y2={ec.y}
              stroke="#181818"
              strokeWidth={clearanceW}
              strokeLinecap="round"
            />
          );
        });

        // Clearance Holes for Vias on other nets
        board.vias.forEach((via, viaIdx) => {
          const cp = toCanvas(via);
          if (via.netId === targetNetId) {
            // Thermal connections for GND/PWR stitching vias
            const rad = (via.padSize / 2) * processScale;
            clearancesList.push(
              <g key={`via-thermal-${zone.id}-${via.id}-${viaIdx}`}>
                <line x1={cp.x - rad - 2} y1={cp.y} x2={cp.x + rad + 2} y2={cp.y} stroke={copperStroke} strokeWidth={0.25 * processScale} opacity="0.6" />
                <line x1={cp.x} y1={cp.y - rad - 2} x2={cp.x} y2={cp.y + rad + 2} stroke={copperStroke} strokeWidth={0.25 * processScale} opacity="0.6" />
              </g>
            );
            return;
          }

          const clearanceR = (via.padSize / 2 + (zone.clearance || 0.3)) * processScale;
          clearancesList.push(
            <circle
              key={`clear-via-${zone.id}-${via.id}-${viaIdx}`}
              cx={cp.x}
              cy={cp.y}
              r={clearanceR}
              fill="#181818"
            />
          );
        });

        // Compute zone labels pos (center of zone polygon bounding box)
        const xs = zone.outlinePoints.map(p => p.x);
        const ys = zone.outlinePoints.map(p => p.y);
        const avgX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
        const avgY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
        const labelCp = toCanvas({ x: avgX, y: avgY });

        return (
          <g key={zone.id}>
            {/* Underlying copper flood polygon */}
            <path
              d={zonePath}
              fill={copperFill}
              stroke={copperStroke}
              strokeWidth={1.5}
            />
            {/* Isolated chemical copper pour clearances */}
            {clearancesList}
            {/* Informational label badge inside the zone indicating layer/net */}
            <text
              x={labelCp.x}
              y={labelCp.y}
              fill={activeLayer === 'F.Cu' ? '#10b981' : '#a855f7'}
              fontSize="7px"
              fontFamily="monospace"
              fontWeight="black"
              opacity="0.45"
              textAnchor="middle"
              className="select-none pointer-events-none uppercase font-black tracking-widest"
            >
              ZONE: {netName} ({zone.priority !== undefined && zone.priority !== -100 ? `P:${zone.priority}` : 'Low-P'})
            </text>
          </g>
        );
      })}

      {/* 2. Drawing active polygon boundary preview */}
      {drawingPoints && drawingPoints.length > 0 && (() => {
        const linePathObj = drawingPoints.map((p, idx) => {
          const cp = toCanvas(p);
          return `${idx === 0 ? 'M' : 'L'} ${cp.x} ${cp.y}`;
        }).join(' ');

        return (
          <g key="drawing-zone-preview">
            <path
              d={linePathObj}
              fill="none"
              stroke="#06b6d4"
              strokeWidth={1.5}
              strokeDasharray="4,4"
              className="animate-[dash-loop_30s_linear_infinite]"
            />
            {drawingPoints.map((p, i) => {
              const cp = toCanvas(p);
              return (
                <circle
                  key={`draw-pt-${i}`}
                  cx={cp.x}
                  cy={cp.y}
                  r={4}
                  fill="#06b6d4"
                  stroke="#ffffff"
                  strokeWidth={1}
                />
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
});
