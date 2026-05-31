import React from 'react';
import { BoardTrace, Via } from '../../types/pcb';

export interface Point {
  x: number;
  y: number;
}

export function generateSerpentineTrace(A: Point, B: Point, addedLen: number, spacing: number): Point[] {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const L = Math.hypot(dx, dy);
  if (L < 1.0 || addedLen <= 0) {
    return [A, B];
  }
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;

  const startRatio = 0.2;
  const endRatio = 0.8;
  const startPt = { x: A.x + ux * L * startRatio, y: A.y + uy * L * startRatio };
  const endPt = { x: A.x + ux * L * endRatio, y: A.y + uy * L * endRatio };

  const L_m = L * (endRatio - startRatio);
  const cycles = 4;
  const stepX = L_m / cycles;
  
  // Total vertical segments = cycles * 4 vertical runs
  // Cap at 2.5mm to avoid clearance overlap errors
  const H = Math.min(2.5, addedLen / (cycles * 4)); 

  const points: Point[] = [A];
  points.push(startPt);

  for (let i = 0; i < cycles; i++) {
    const cycleStartDist = startRatio * L + i * stepX;
    
    // Step 1: Upwards perpendicular bend
    const p1 = cycleStartDist;
    const pt1 = { x: A.x + ux * p1 + px * H, y: A.y + uy * p1 + py * H };
    
    // Step 2: Forward parallel bend
    const p2 = cycleStartDist + stepX * 0.25;
    const pt2 = { x: A.x + ux * p2 + px * H, y: A.y + uy * p2 + py * H };
    
    // Step 3: Cross over to down vertical loop
    const pt3 = { x: A.x + ux * p2 - px * H, y: A.y + uy * p2 - py * H };
    
    // Step 4: Forward parallel bend
    const p4 = cycleStartDist + stepX * 0.75;
    const pt4 = { x: A.x + ux * p4 - px * H, y: A.y + uy * p4 - py * H };

    // Step 5: Return to main track axis
    const p5 = cycleStartDist + stepX;
    const pt5 = { x: A.x + ux * p5, y: A.y + uy * p5 };

    points.push(pt1, pt2, pt3, pt4, pt5);
  }

  points.push(endPt);
  points.push(B);
  return points;
}

interface TracesLayerProps {
  traces: BoardTrace[];
  isFCuVisible: boolean;
  isBCuVisible: boolean;
  processScale: number;
  diffPairs?: any[];
  isElementVisible: (bx: number, by: number, radius: number) => boolean;
  minX?: number;
  minY?: number;
}

export const COMMITTED_TRACE_D_P_COLOR = "#10b981";

export const TracesSVG = React.memo<TracesLayerProps>(function TracesSVG({
  traces,
  isFCuVisible,
  isBCuVisible,
  processScale,
  diffPairs = [],
  isElementVisible,
  minX = -50,
  minY = -50
}) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
      {traces.map((t, idx) => {
         const visible = t.layer === 'F.Cu' ? isFCuVisible : isBCuVisible;
         if (!visible) return null;
         
         // Viewport culling check
         if (!isElementVisible(t.startX, t.startY, 2) && !isElementVisible(t.endX, t.endY, 2)) {
             return null;
         }
         
         const isDpTrace = diffPairs.some((dp: any) => dp.positiveNetId === t.netId || dp.negativeNetId === t.netId)
                           || t.netId.includes("USB_D") || t.netId.includes("_P") || t.netId.includes("_N");
         const sx = t.startX * processScale + (-minX) * processScale;
         const sy = t.startY * processScale + (-minY) * processScale;
         const ex = t.endX * processScale + (-minX) * processScale;
         const ey = t.endY * processScale + (-minY) * processScale;
         
         const key = `${t.id || 'trace'}-${idx}`;

         return (
           <g key={key}>
             {isDpTrace && (
               <line 
                 x1={sx}
                 y1={sy}
                 x2={ex}
                 y2={ey}
                 stroke={COMMITTED_TRACE_D_P_COLOR}
                 strokeWidth={t.width * processScale + 6}
                 opacity="0.12"
                 strokeLinecap="round"
               />
             )}
             <line 
               x1={sx}
               y1={sy}
               x2={ex}
               y2={ey}
               stroke={t.layer === 'F.Cu' ? '#ef4444' : '#3b82f6'}
               strokeWidth={t.width * processScale}
               strokeLinecap="round"
             />
           </g>
         );
      })}
    </svg>
  );
});

interface ViasLayerProps {
  vias: Via[];
  processScale: number;
  isElementVisible: (bx: number, by: number, radius: number) => boolean;
  minX?: number;
  minY?: number;
}

export const ViasSVG = React.memo<ViasLayerProps>(function ViasSVG({
  vias,
  processScale,
  isElementVisible,
  minX = -50,
  minY = -50
}) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible">
      {vias.map((v: any, idx) => {
         if (!isElementVisible(v.x, v.y, 1)) return null;
         const vx = v.x * processScale + (-minX) * processScale;
         const vy = v.y * processScale + (-minY) * processScale;
         const key = `${v.id || 'via'}-${idx}`;
         return (
           <g key={key}>
             <circle 
               cx={vx}
               cy={vy}
               r={(v.padSize || 0.6) * processScale / 2}
               fill="#fbbf24"
               stroke="#d97706"
               strokeWidth="1"
             />
             <circle 
               cx={vx}
               cy={vy}
               r={(v.drillSize || 0.3) * processScale / 2}
               fill="#111"
             />
           </g>
         );
      })}
    </svg>
  );
});
