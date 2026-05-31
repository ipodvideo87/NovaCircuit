import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BoardNet, BoardPad, PCBBoard, Via } from '../../types/pcb';
import { resolveNetConstraints } from '../../lib/constraints';

export interface Point {
  x: number;
  y: number;
}

export function findDiffPair(board: any, netId: string) {
  if (!board.nets) return null;
  const net = board.nets.find((n: any) => n.id === netId);
  if (!net) return null;

  let isPositive = false;
  let isNegative = false;
  let baseName = "";

  if (net.name.endsWith("+")) {
    isPositive = true;
    baseName = net.name.slice(0, -1);
  } else if (net.name.endsWith("_P")) {
    isPositive = true;
    baseName = net.name.slice(0, -2);
  } else if (net.name.endsWith("DP") && net.name !== "GND" && net.name !== "VCC") {
    isPositive = true;
    baseName = net.name.slice(0, -2);
  } else if (net.name.endsWith("-")) {
    isNegative = true;
    baseName = net.name.slice(0, -1);
  } else if (net.name.endsWith("_N")) {
    isNegative = true;
    baseName = net.name.slice(0, -2);
  } else if (net.name.endsWith("DN") && net.name !== "GND" && net.name !== "VCC") {
    isNegative = true;
    baseName = net.name.slice(0, -2);
  }

  if (baseName) {
    const positiveNames = [baseName + "+", baseName + "_P", baseName + "DP"];
    const negativeNames = [baseName + "-", baseName + "_N", baseName + "DN"];
    const posNet = board.nets.find((n: any) => positiveNames.includes(n.name));
    const negNet = board.nets.find((n: any) => negativeNames.includes(n.name));
    if (posNet && negNet) {
      return {
        id: `auto-dp-${baseName}`,
        name: baseName,
        positiveNetId: posNet.id,
        negativeNetId: negNet.id,
        spacing: 0.25, // mm spacing
        width: 0.15, // mm trace width
        skewTolerance: 0.5, // mm skew tolerance before DRC flag
        targetImpedance: 90, // target differential impedance
        maxUncoupledLength: 5.0
      };
    }
  }
  return null;
}

interface ActiveRoutingGhostProps {
  activeTool: string;
  routingState: any;
  pointerPos: Point;
  pointerPosOther: Point;
  processScale: number;
  minX?: number;
  minY?: number;
  isElementVisible: (bx: number, by: number, radius: number) => boolean;
}

export const ActiveRoutingGhost: React.FC<ActiveRoutingGhostProps> = React.memo(function ActiveRoutingGhost({
  activeTool,
  routingState,
  pointerPos,
  pointerPosOther,
  processScale,
  minX = -50,
  minY = -50,
  isElementVisible
}) {
  if (activeTool !== 'route' || !routingState) return null;

  const pointsToSVGString = (points: Point[]) => {
    return points.map(p => {
      const px = p.x * processScale + (-minX) * processScale;
      const py = p.y * processScale + (-minY) * processScale;
      return `${px},${py}`;
    }).join(' ');
  };

  const primaryPoints = [...routingState.points, pointerPos];
  const primaryPointsStr = pointsToSVGString(primaryPoints);

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-40 overflow-visible">
         <polyline 
           points={primaryPointsStr}
           fill="none"
           stroke={routingState.layer === 'F.Cu' ? '#ef4444' : '#3b82f6'}
           strokeWidth={routingState.width * processScale}
           strokeLinecap="round"
           strokeLinejoin="round"
           opacity="0.6"
         />
      </svg>
      {routingState.isDiffPair && routingState.otherPoints && (
        <>
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-41 overflow-visible">
             <polyline 
               points={pointsToSVGString([...routingState.otherPoints, pointerPosOther])}
               fill="none"
               stroke={routingState.layer === 'F.Cu' ? '#10b981' : '#a855f7'}
               strokeWidth={(routingState.diffPair?.width || routingState.width) * processScale}
               strokeLinecap="round"
               strokeLinejoin="round"
               opacity="0.65"
               strokeDasharray="4 2"
             />
          </svg>
          {routingState.otherVias && routingState.otherVias.map((v: any, idx: number) => (
            <svg key={`via_oth_${idx}`} className="absolute inset-0 w-full h-full pointer-events-none z-42 overflow-visible">
               <circle 
                 cx={v.x * processScale + (-minX) * processScale}
                 cy={v.y * processScale + (-minY) * processScale}
                 r={0.6 * processScale / 2}
                 fill="#fbbf24"
                 stroke="#10b981"
                 strokeWidth="1.5"
                 opacity="0.8"
               />
               <circle 
                 cx={v.x * processScale + (-minX) * processScale}
                 cy={v.y * processScale + (-minY) * processScale}
                 r={0.3 * processScale / 2}
                 fill="#111"
                 opacity="0.8"
               />
            </svg>
          ))}
        </>
      )}

      {/* Render Active Routing Vias */}
      {routingState.vias && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-45 overflow-visible">
           {routingState.vias.map((v: any, idx: number) => {
             if (!isElementVisible(v.x, v.y, 1)) return null;
             const vx = v.x * processScale + (-minX) * processScale;
             const vy = v.y * processScale + (-minY) * processScale;
             return (
               <g key={idx}>
                 <circle 
                   cx={vx}
                   cy={vy}
                   r={0.6 * processScale / 2}
                   fill="#fbbf24"
                   opacity="0.6"
                 />
                 <circle 
                   cx={vx}
                   cy={vy}
                   r={0.3 * processScale / 2}
                   fill="#111"
                   opacity="0.6"
                 />
               </g>
             );
           })}
        </svg>
      )}
    </>
  );
});

// Custom Routing Hook wrapping all mouse movement, keyboard hotkeys, and snapping actions!
export function useRoutingEngine({
  board,
  graph,
  onCommitTransaction,
  processScale,
  showToast,
  isReadOnly,
  boardWidth = 100,
  boardHeight = 100,
  minX = -50,
  minY = -50,
  boardRef
}: {
  board: PCBBoard;
  graph: any;
  onCommitTransaction?: (graph: any) => void;
  processScale: number;
  showToast: (msg: string) => void;
  isReadOnly: boolean;
  boardWidth?: number;
  boardHeight?: number;
  minX?: number;
  minY?: number;
  boardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [activeTool, setActiveTool] = useState<'select' | 'route' | 'zone'>('select');
  const [routingState, setRoutingState] = useState<any | null>(null);
  const [pointerPos, setPointerPos] = useState<Point>({ x: 0, y: 0 });
  const [pointerPosOther, setPointerPosOther] = useState<Point>({ x: 0, y: 0 });
  const [snapStatus, setSnapStatus] = useState<string | null>(null);

  const commitRoutingTrace = useCallback((finalPoint?: Point) => {
    if (!routingState || !onCommitTransaction || isReadOnly) return;
    
    const targetPoints = [...routingState.points];
    const otherTargetPoints = routingState.otherPoints ? [...routingState.otherPoints] : [];

    if (finalPoint) {
      targetPoints.push(finalPoint);
      if (routingState.isDiffPair) {
        const lastP = routingState.points[routingState.points.length - 1];
        const dx = finalPoint.x - lastP.x;
        const dy = finalPoint.y - lastP.y;
        const dist = Math.hypot(dx, dy);
        let siblingFinal = finalPoint;
        if (dist > 0.01) {
          const ux = dx / dist;
          const uy = dy / dist;
          const sideSign = routingState.sideSign || 1;
          siblingFinal = {
            x: finalPoint.x - uy * sideSign * routingState.diffPair.spacing,
            y: finalPoint.y + ux * sideSign * routingState.diffPair.spacing
          };
        }
        otherTargetPoints.push(siblingFinal);
      }
    } else {
      targetPoints.push(pointerPos);
      if (routingState.isDiffPair) {
        otherTargetPoints.push(pointerPosOther);
      }
    }
    
    if (targetPoints.length < 2) {
      setRoutingState(null);
      return;
    }
    
    const newTraceId = `trace_${Date.now()}`;
    const newSegments: any[] = [];
    
    // Plotted main track segments
    for (let i = 0; i < targetPoints.length - 1; i++) {
        newSegments.push({
            id: `${newTraceId}_${i}`,
            netId: routingState.activeNetId,
            layer: routingState.layer,
            width: routingState.width,
            startX: targetPoints[i].x,
            startY: targetPoints[i].y,
            endX: targetPoints[i+1].x,
            endY: targetPoints[i+1].y
        });
    }

    // Companion offset segments for differential routing
    if (routingState.isDiffPair && otherTargetPoints.length >= 2) {
      const otherNetId = routingState.activeNetId === routingState.diffPair.positiveNetId 
        ? routingState.diffPair.negativeNetId 
        : routingState.diffPair.positiveNetId;
      const otherTraceId = `trace_neg_${Date.now()}`;
      
      for (let i = 0; i < otherTargetPoints.length - 1; i++) {
        newSegments.push({
          id: `${otherTraceId}_${i}`,
          netId: otherNetId,
          layer: routingState.layer,
          width: routingState.diffPair.width || routingState.width,
          startX: otherTargetPoints[i].x,
          startY: otherTargetPoints[i].y,
          endX: otherTargetPoints[i+1].x,
          endY: otherTargetPoints[i+1].y
        });
      }
    }

    // Process primary vias
    const newVias = [...(graph.vias || [])];
    if (routingState.vias && routingState.vias.length > 0) {
      routingState.vias.forEach((via: any, idx: number) => {
         newVias.push({
            id: `via_${Date.now()}_${idx}`,
            netId: routingState.activeNetId,
            x: via.x,
            y: via.y,
            drillSize: 0.3,
            padSize: 0.6
         });
      });
    }

    // Process symmetric partner vias
    if (routingState.isDiffPair && routingState.otherVias && routingState.otherVias.length > 0) {
      routingState.otherVias.forEach((via: any, idx: number) => {
         newVias.push({
            id: `via_neg_${Date.now()}_${idx}`,
            netId: via.netId,
            x: via.x,
            y: via.y,
            drillSize: 0.3,
            padSize: 0.6
         });
      });
    }

    const newGraph = {
        ...graph,
        traces: [...(graph.traces || []), ...newSegments],
        vias: newVias
    };

    onCommitTransaction?.(newGraph);
    showToast("SUCCESS: Committed stable geometry route.");
    setRoutingState(null);
    setSnapStatus(null);
  }, [routingState, pointerPos, pointerPosOther, graph, onCommitTransaction, isReadOnly, showToast]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (activeTool !== 'route' || !boardRef.current) return;

    const rect = boardRef.current.getBoundingClientRect();
    const styleScale = rect.width / (boardWidth * processScale);
    const rawX = (e.clientX - rect.left) / styleScale;
    const rawY = (e.clientY - rect.top) / styleScale;

    // Convert pixels to Board Space millimetres
    const bx = (rawX / processScale) + minX;
    const by = (rawY / processScale) + minY;

    let snapPad: BoardPad | null = null;
    let targetX = bx;
    let targetY = by;
    let statusMessage = null;

    // 1. Connectivity checking & magnet snapped pad locating
    let minDistance = 2.5; // mm snap radius magnet
    board.components.forEach(comp => {
      comp.pads.forEach(p => {
        const dist = Math.hypot(bx - p.x, by - p.y);
        if (dist < minDistance) {
          minDistance = dist;
          snapPad = p;
        }
      });
    });

    if (snapPad) {
      const pad: BoardPad = snapPad;
      targetX = pad.x;
      targetY = pad.y;

      // Realtime net matching validator
      if (routingState) {
        if (pad.netId === routingState.activeNetId) {
          statusMessage = `VALID CONNECTION: Snap lock to ${pad.id} (${(board.nets.find(n => n.id === pad.netId)?.name || 'UNKNOWN')})`;
        } else if (pad.netId) {
          statusMessage = `DRC CONFLICT: Net Mismatch! ${pad.id} belongs to ${(board.nets.find(n => n.id === pad.netId)?.name || 'ANOTHER_NET')}`;
        } else {
          statusMessage = `UNCONNECTED: Pad ${pad.id} carrying no signal.`;
        }
      } else {
        const matchingNetName = pad.netId ? (board.nets.find(n => n.id === pad.netId)?.name || pad.netId) : 'No Net';
        statusMessage = `PAD PIN: ${pad.id} | NET: ${matchingNetName}`;
      }
    }

    setSnapStatus(statusMessage);

    let cx = targetX;
    let cy = targetY;

    // 2. Compute 45-degree orthomode lock unless Shift is pressed
    if (routingState && routingState.points.length > 0) {
      const lastP = routingState.points[routingState.points.length - 1];
      const dx = targetX - lastP.x;
      const dy = targetY - lastP.y;
      
      if (e.shiftKey) {
          // Free form vector trace
      } else {
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          if (absDx < absDy * 0.4) {
            cx = lastP.x;
          } else if (absDy < absDx * 0.4) {
            cy = lastP.y;
          } else {
            const maxSide = Math.max(absDx, absDy);
            cx = lastP.x + Math.sign(dx) * maxSide;
            cy = lastP.y + Math.sign(dy) * maxSide;
          }
      }
    }

    let cx_other = cx;
    let cy_other = cy;

    // 3. Differential paired tracks geometry calculation (Side clearance spacer)
    if (routingState && routingState.points.length > 0) {
      const lastP = routingState.points[routingState.points.length - 1];
      const dx = cx - lastP.x;
      const dy = cy - lastP.y;
      
      if (routingState.isDiffPair && routingState.otherPoints) {
        const lastP_other = routingState.otherPoints[routingState.otherPoints.length - 1];
        const dist = Math.hypot(dx, dy);
        
        if (dist > 0.01) {
          const ux = dx / dist;
          const uy = dy / dist;
          const px = -uy;
          const py = ux;
          
          let sideSign = 1;
          if (routingState.points.length === 1 && !routingState.sideSign) {
            const otherStart = routingState.otherPoints[0];
            const dot_perp = (otherStart.x - lastP.x) * px + (otherStart.y - lastP.y) * py;
            sideSign = dot_perp >= 0 ? 1 : -1;
            routingState.sideSign = sideSign;
          } else {
            sideSign = routingState.sideSign || 1;
          }
          
          cx_other = cx + px * sideSign * routingState.diffPair.spacing;
          cy_other = cy + py * sideSign * routingState.diffPair.spacing;
        } else {
          cx_other = lastP_other.x;
          cy_other = lastP_other.y;
        }
      }
    }

    setPointerPos({ x: cx, y: cy });
    setPointerPosOther({ x: cx_other, y: cy_other });
  }, [activeTool, routingState, board, boardWidth, processScale, minX, minY]);

  const handleBoardClick = useCallback((e: React.MouseEvent) => {
    if (isReadOnly) return;
    if (activeTool === 'route' && routingState) {
        // Prevent adding a redundant point directly overlapping the last point
        const lastP = routingState.points[routingState.points.length - 1];
        if (lastP && Math.hypot(pointerPos.x - lastP.x, pointerPos.y - lastP.y) < 0.05) {
          return;
        }

        setRoutingState((prev: any) => {
          if (!prev) return null;
          const nextPoints = [...prev.points, pointerPos];
          let nextOtherPoints = prev.otherPoints ? [...prev.otherPoints] : undefined;
          if (prev.isDiffPair && prev.otherPoints) {
            nextOtherPoints = [...prev.otherPoints, pointerPosOther];
          }
          return {
            ...prev,
            points: nextPoints,
            otherPoints: nextOtherPoints
          };
        });
    }
  }, [isReadOnly, activeTool, routingState, pointerPos, pointerPosOther]);

  const handlePadClick = useCallback((compId: string, padId: string, e: React.PointerEvent) => {
    if (isReadOnly) return;
    if (activeTool === 'route') {
      const pad = board.components.find(c => c.id === compId)?.pads.find(p => p.id === padId);
      if (pad) {
        if (!routingState) {
           if (pad.netId) {
               const dp = findDiffPair(board, pad.netId);
               if (dp) {
                 const clickedComp = board.components.find((c: any) => c.id === compId);
                 const otherNetId = pad.netId === dp.positiveNetId ? dp.negativeNetId : dp.positiveNetId;
                 const otherPad = clickedComp?.pads.find((p: any) => p.netId === otherNetId);
                 
                 if (otherPad) {
                   setRoutingState({
                     activeNetId: pad.netId,
                     layer: pad.layer.includes('F.Cu') ? 'F.Cu' : 'B.Cu',
                     width: dp.width || 0.15,
                     points: [{ x: pad.x, y: pad.y }],
                     isDiffPair: true,
                     diffPair: dp,
                     role: pad.netId === dp.positiveNetId ? 'positive' : 'negative',
                     otherPoints: [{ x: otherPad.x, y: otherPad.y }],
                     otherVias: []
                   });
                   showToast(`INFO: Paired Differential Routing [${dp.name}] Started.`);
                   return;
                 }
               }

               const rules = resolveNetConstraints(board, pad.netId);
               setRoutingState({
                 activeNetId: pad.netId,
                 layer: pad.layer.includes('F.Cu') ? 'F.Cu' : 'B.Cu',
                 width: rules.preferredWidth || rules.minWidth || 0.25,
                 points: [{ x: pad.x, y: pad.y }]
               });
           } else {
               showToast("WARN: Cannot route unconnected pad.");
           }
        } else {
           // We are currently routing, and we clicked a pad.
           // Connectivity check: ensure pad is on the matching network.
           if (pad.netId === routingState.activeNetId) {
               commitRoutingTrace({ x: pad.x, y: pad.y });
           } else {
               showToast("DRC BLOCK: Short circuit mismatch! Cannot connect to a different net.");
           }
        }
      }
    }
  }, [isReadOnly, activeTool, routingState, board, commitRoutingTrace, showToast]);

  // Hotkeys handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRoutingState(null);
        setActiveTool('select');
        setSnapStatus(null);
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (routingState) {
          if (routingState.points.length > 1) {
             setRoutingState((prev: any) => {
                if (!prev) return null;
                const nextPoints = [...prev.points];
                nextPoints.pop();
                let nextOtherPoints = prev.otherPoints ? [...prev.otherPoints] : undefined;
                if (nextOtherPoints && nextOtherPoints.length > 1) {
                  nextOtherPoints.pop();
                }
                return { 
                  ...prev, 
                  points: nextPoints,
                  otherPoints: nextOtherPoints
                };
             });
             showToast("INFO: Removed last routing segment.");
          } else {
             setRoutingState(null);
             showToast("INFO: Cancelled routing.");
          }
        }
      }
      
      if (e.key === 'Enter') {
        if (routingState) {
          commitRoutingTrace();
        }
      }

      // 'V' to drop standard high-speed layer transition via
      if (e.key === 'v' || e.key === 'V') {
        if (activeTool === 'route' && routingState) {
          const currentLayer = routingState.layer;
          const nextLayer = currentLayer === 'F.Cu' ? 'B.Cu' : 'F.Cu';
          
          setRoutingState((prev: any) => {
            if (!prev) return null;
            const currentPoints = [...prev.points, pointerPos];
            const currentVias = prev.vias ? [...prev.vias] : [];
            currentVias.push({ x: pointerPos.x, y: pointerPos.y, netId: prev.activeNetId });
            
            let nextOtherPoints = prev.otherPoints ? [...prev.otherPoints] : undefined;
            let nextOtherVias = prev.otherVias ? [...prev.otherVias] : undefined;
            
            if (prev.isDiffPair && prev.otherPoints) {
              nextOtherPoints = [...prev.otherPoints, pointerPosOther];
              nextOtherVias = prev.otherVias ? [...prev.otherVias] : [];
              const otherNetId = prev.activeNetId === prev.diffPair.positiveNetId 
                ? prev.diffPair.negativeNetId 
                : prev.diffPair.positiveNetId;
              nextOtherVias.push({ x: pointerPosOther.x, y: pointerPosOther.y, netId: otherNetId });
            }

            return {
              ...prev,
              layer: nextLayer,
              points: currentPoints,
              vias: currentVias,
              otherPoints: nextOtherPoints,
              otherVias: nextOtherVias
            };
          });
          
          showToast(`SUCCESS: Placed Transition Vias & Switched Layer to ${nextLayer === 'F.Cu' ? 'Top (F.Cu)' : 'Bottom (B.Cu)'}`);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, routingState, pointerPos, pointerPosOther, commitRoutingTrace, showToast]);

  return {
    activeTool,
    setActiveTool,
    routingState,
    setRoutingState,
    pointerPos,
    pointerPosOther,
    snapStatus,
    handlePointerMove,
    handleBoardClick,
    handlePadClick,
    commitRoutingTrace
  };
}
