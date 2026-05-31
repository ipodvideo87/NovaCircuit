import React, { useMemo, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Info, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PCBBoard, PadShape } from '../../types/pcb';
import { GlobalLibrary } from '../../lib/componentLibrary';

// Component imports
import { GPUCanvas } from '../GPUCanvas';
import { ConstraintOverlayCanvas } from '../ConstraintOverlayCanvas';
import { AIAttentionOverlay } from '../AIAttentionOverlay';
import { PlacementPreviewGhosts } from '../PlacementPreviewGhosts';
import { RoutingPreviewOverlay } from '../RoutingPreviewOverlay';
import { PCBComponentNode } from './ComponentRenderer';
import { TracesSVG, ViasSVG } from './TraceRenderer';
import { ActiveRoutingGhost } from './RoutingEngine';
import { PolygonPour } from './PolygonPour';

function ComponentDragGhost({ ghost, processScale, minX = -50, minY = -50 }: { ghost: any, processScale: number, minX: number, minY: number }) {
  const fp = useMemo(() => GlobalLibrary.getFootprint(ghost.comp.defaultFootprint), [ghost.comp.defaultFootprint]);
  if (!fp) return null;

  const px = ghost.x * processScale + (-minX) * processScale;
  const py = ghost.y * processScale + (-minY) * processScale;

  return (
    <div 
      className="absolute pointer-events-none"
      style={{ left: px, top: py }}
    >
      <div className="absolute top-[-20px] left-[-10px] whitespace-nowrap bg-indigo-500/80 text-white text-[10px] px-1 rounded shadow">
        {ghost.comp.partNumber}
      </div>
      <div className="opacity-50">
        <svg style={{ overflow: 'visible' }}>
          {fp.graphics?.map((g, i) => {
             const cx = (g.x||0) * processScale;
             const cy = (g.y||0) * processScale;
             const cw = (g.width||0) * processScale;
             const ch = (g.height||0) * processScale;
             if (g.type === 'rect') return <rect key={`g-rect-${i}`} x={cx - cw/2} y={cy - ch/2} width={cw} height={ch} fill="none" stroke="#22d3ee" strokeWidth={(g.strokeWidth||0.1)*processScale}/>;
             if (g.type === 'circle') return <circle key={`g-circ-${i}`} cx={cx} cy={cy} r={(g.radius||1)*processScale} fill="none" stroke="#22d3ee" strokeWidth={(g.strokeWidth||0.1)*processScale} />;
             return null;
          })}
          {fp.pads.map(p => {
             const cx = p.x * processScale;
             const cy = p.y * processScale;
             const cw = p.width * processScale;
             const ch = p.height * processScale;
             const rx = (p.shape === 'circle' ? cw/2 : (p.shape as string === 'roundrect' ? 0.2*processScale : 0));
             return (
               <rect 
                 key={p.id}
                 x={cx - cw/2} y={cy - ch/2}
                 width={cw} height={ch}
                 fill="#ef4444" opacity={0.8}
                 rx={rx}
               />
             );
          })}
        </svg>
      </div>
    </div>
  );
}

interface RatsnestLayerProps {
  board: PCBBoard;
  processScale: number;
  minX?: number;
  minY?: number;
  isElementVisible?: (bx: number, by: number, radius?: number) => boolean;
}

export const RatsnestLayer = React.memo<RatsnestLayerProps>(function RatsnestLayer({ 
  board, 
  processScale, 
  minX = -50, 
  minY = -50, 
  isElementVisible 
}) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50 z-10 overflow-visible">
       {board.ratnest.map((line) => {
          if (isElementVisible && !isElementVisible(line.startX, line.startY, 2) && !isElementVisible(line.endX, line.endY, 2)) {
             return null;
          }
          const sx = line.startX * processScale + (-minX) * processScale;
          const sy = line.startY * processScale + (-minY) * processScale;
          const ex = line.endX * processScale + (-minX) * processScale;
          const ey = line.endY * processScale + (-minY) * processScale;
          return (
            <path 
              key={line.id}
              d={`M ${sx} ${sy} L ${ex} ${ey}`} 
              stroke="#a855f7" strokeWidth="1" strokeDasharray="2 2"
            />
          );
       })}
     </svg>
  );
}, (prev, next) => {
  if (prev.processScale !== next.processScale) return false;
  if (prev.minX !== next.minX || prev.minY !== next.minY) return false;
  if (prev.board.ratnest.length !== next.board.ratnest.length) return false;
  for (let i = 0; i < prev.board.ratnest.length; i++) {
    const p = prev.board.ratnest[i];
    const n = next.board.ratnest[i];
    if (p.id !== n.id || p.startX !== n.startX || p.startY !== n.startY || p.endX !== n.endX || p.endY !== n.endY) return false;
  }
  return true;
});

interface BoardOutlineOverlayProps {
  outlinePoints: { x: number; y: number }[];
  processScale: number;
  minX?: number;
  minY?: number;
}

const BoardOutlineOverlay = React.memo<BoardOutlineOverlayProps>(function BoardOutlineOverlay({ 
  outlinePoints, 
  processScale,
  minX = -50,
  minY = -50
}) {
  const pointsStr = useMemo(() => {
    return outlinePoints.map(p => {
      const px = p.x * processScale + (-minX) * processScale;
      const py = p.y * processScale + (-minY) * processScale;
      return `${px},${py}`;
    }).join(' ');
  }, [outlinePoints, processScale, minX, minY]);

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
      <polygon 
        points={pointsStr} 
        fill="#111115" stroke="#3b0764" strokeWidth="2.5" 
      />
    </svg>
  );
}, (prev, next) => {
  if (prev.processScale !== next.processScale) return false;
  if (prev.minX !== next.minX || prev.minY !== next.minY) return false;
  if (prev.outlinePoints.length !== next.outlinePoints.length) return false;
  for (let i = 0; i < prev.outlinePoints.length; i++) {
    const p = prev.outlinePoints[i];
    const n = next.outlinePoints[i];
    if (p.x !== n.x || p.y !== n.y) return false;
  }
  return true;
});

interface PCBCanvasProps {
  boardRef: React.RefObject<HTMLDivElement | null>;
  board: PCBBoard;
  graph: any;
  processScale: number;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pointerPos: { x: number; y: number };
  pointerPosOther: { x: number; y: number };
  routingState: any;
  activeTool: string;
  isDragging: boolean;
  setIsDragging: (val: boolean) => void;
  isReadOnly: boolean;
  mode: string;
  gpuAccelerated: boolean;
  pan: { x: number; y: number };
  presences: any;
  activeLocks: any;
  isFixing: boolean;
  fixProgress: number;
  isEdgeCutsVisible: boolean;
  isFCuVisible: boolean;
  isBCuVisible: boolean;
  selectedIds: string[];
  onBoardClick: (e: React.MouseEvent) => void;
  onPadClick: (compId: string, padId: string, e: React.PointerEvent) => void;
  onSelect: (id: string, e?: React.PointerEvent) => void;
  onApplyAiAction: (actions: any) => void;
  isElementVisible: (bx: number, by: number, radius: number) => boolean;

  // New flexible electrical bounding foundations
  minX?: number;
  minY?: number;
  boardWidth?: number;
  boardHeight?: number;
  pourEnabled?: boolean;
  previewStatuses?: Record<string, 'green' | 'amber' | 'red'>;
  drawingPoints?: { x: number; y: number }[];
}

export const PCBCanvas: React.FC<PCBCanvasProps> = React.memo(function PCBCanvas({
  boardRef,
  board,
  graph,
  processScale,
  zoom,
  setZoom,
  pointerPos,
  pointerPosOther,
  routingState,
  activeTool,
  isDragging,
  setIsDragging,
  isReadOnly,
  mode,
  gpuAccelerated,
  pan,
  presences,
  activeLocks,
  isFixing,
  fixProgress,
  isEdgeCutsVisible,
  isFCuVisible,
  isBCuVisible,
  selectedIds,
  onBoardClick,
  onPadClick,
  onSelect,
  onApplyAiAction,
  isElementVisible,
  minX = -50,
  minY = -50,
  boardWidth = 100,
  boardHeight = 100,
  pourEnabled = true,
  previewStatuses,
  drawingPoints = []
}) {
  const [dragGhost, setDragGhost] = useState<{ x: number, y: number, comp: import('../../lib/componentLibrary').LibraryComponent } | null>(null);

  useEffect(() => {
    const onHover = (e: any) => {
      const comp = (window as any).__draggingLibraryComponent;
      if (comp) setDragGhost({ x: e.detail.x, y: e.detail.y, comp });
    };
    const onLeave = () => setDragGhost(null);
    window.addEventListener('library_component_hover', onHover);
    window.addEventListener('library_component_hover_leave', onLeave);
    return () => {
      window.removeEventListener('library_component_hover', onHover);
      window.removeEventListener('library_component_hover_leave', onLeave);
    };
  }, []);

  return (
    <>
      {isReadOnly && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500/15 backdrop-blur border border-amber-500/30 text-amber-400 text-[10px] px-3 py-1.5 rounded-full flex items-center gap-2 shadow-2xl z-40 font-sans">
          <Info size={14} className="animate-pulse text-amber-400" />
          <span className="font-extrabold uppercase tracking-widest">{mode === 'replay' ? 'Replay Mode' : 'Inspect Mode'} Active &mdash; Board is Read-Only</span>
        </div>
      )}

      {/* The PCB Board Simulation */}
      <motion.div 
        ref={boardRef}
        onClick={onBoardClick}
        className={cn("relative bg-[#181818] border-[4px] border-[#222] shadow-[0_0_100px_rgba(0,0,0,0.55),inset_0_0_50px_rgba(0,0,0,0.9)] overflow-hidden", activeTool === 'route' ? "cursor-crosshair" : "")}
        style={{ width: boardWidth * processScale, height: boardHeight * processScale }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: zoom, opacity: 1 }}
        transition={{ type: 'tween', duration: 0 }}
        drag={activeTool !== 'route'}
        dragConstraints={{ left: -800, right: 800, top: -800, bottom: 800 }}
        dragElastic={0.05}
        onDragStart={(e) => {
          // If we're initiating a standard framer-motion drag, let it happen
          setIsDragging(true);
        }}
        onDragEnd={() => setIsDragging(false)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/json')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            
            const rect = boardRef.current?.getBoundingClientRect();
            if (rect) {
              const x = (e.clientX - rect.left) / zoom / processScale;
              const y = (e.clientY - rect.top) / zoom / processScale;
              
              const customEvent = new CustomEvent('library_component_hover', {
                detail: { x, y }
              });
              window.dispatchEvent(customEvent);
            }
          }
        }}
        onDragLeave={() => {
           window.dispatchEvent(new CustomEvent('library_component_hover_leave'));
        }}
        onDrop={(e) => {
          window.dispatchEvent(new CustomEvent('library_component_hover_leave'));
          try {
            const data = e.dataTransfer.getData('application/json');
            if (data) {
              const payload = JSON.parse(data);
              if (payload.type === 'library_component') {
                 // Trigger global event or callback handled higher up
                 const customEvent = new CustomEvent('add_library_component', { 
                   detail: { 
                     partNumber: payload.partNumber, 
                     clientX: e.clientX, 
                     clientY: e.clientY 
                   }
                 });
                 window.dispatchEvent(customEvent);
              }
            }
          } catch(e) {}
        }}
      >
        {/* WebGL GPU Accelerated Canvas Background Layer */}
        {gpuAccelerated && (
          <GPUCanvas
            graph={graph}
            activeLayer={(routingState?.layer as any) || "F.Cu"}
            pan={pan}
            zoom={zoom}
            presences={presences}
            activeLocks={activeLocks}
            showMultiplayerCursors={false} // Handled by PCBEditor Top Level Overlay
          />
        )}
        {gpuAccelerated && (
          <ConstraintOverlayCanvas
            graph={graph}
            activeLayer={(routingState?.layer as any) || "F.Cu"}
            pan={pan}
            zoom={zoom}
            presences={presences}
            activeLocks={activeLocks}
            onApplyAiAction={onApplyAiAction}
          />
        )}
        
        {/* DRC Checking Loading overlay */}
        {isFixing && (
          <motion.div 
            className="absolute inset-0 z-50 pointer-events-none overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
             <motion.div 
              className="absolute inset-x-0 h-1 bg-indigo-500 shadow-[0_0_15px_#6366f1] z-50"
              style={{ top: `${fixProgress}%` }}
             />
             <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-[1px]" />
             <motion.div 
              className="absolute inset-0 flex items-center justify-center font-sans"
             >
                 <div className="bg-[#0d0d0d]/95 border border-indigo-500/40 px-4 py-2 rounded-full flex items-center gap-2.5 shadow-2xl">
                   <ShieldCheck size={14} className="text-indigo-400 animate-pulse" />
                   <span className="text-[10px] font-black text-white uppercase tracking-widest">DRC Checking: {Math.floor(fixProgress)}%</span>
                 </div>
              </motion.div>
          </motion.div>
        )}

        {/* Board Outline cuts underlay */}
        {isEdgeCutsVisible && (
          <BoardOutlineOverlay outlinePoints={board.outline.points} processScale={processScale} minX={minX} minY={minY} />
        )}

        {/* Real-time copper zone Polygon Pour */}
        <PolygonPour 
          board={board} 
          activeLayer={(routingState?.layer as any) || "F.Cu"} 
          processScale={processScale} 
          minX={minX} 
          minY={minY} 
          boardWidth={boardWidth} 
          boardHeight={boardHeight} 
          enabled={pourEnabled} 
          drawingPoints={drawingPoints}
        />

        {/* Render Committed Traces: SVG fallback underlays */}
        {!gpuAccelerated && (
          <TracesSVG
            traces={board.traces}
            isFCuVisible={isFCuVisible}
            isBCuVisible={isBCuVisible}
            processScale={processScale}
            diffPairs={board.diffPairs}
            isElementVisible={isElementVisible}
          />
        )}

        {/* Render Vias: SVG fallback underlays */}
        {!gpuAccelerated && (
          <ViasSVG
            vias={board.vias}
            processScale={processScale}
            isElementVisible={isElementVisible}
          />
        )}

        {/* Render Active Routing Tracking feedback */}
        <ActiveRoutingGhost
          activeTool={activeTool}
          routingState={routingState}
          pointerPos={pointerPos}
          pointerPosOther={pointerPosOther}
          processScale={processScale}
          minX={minX}
          minY={minY}
          isElementVisible={isElementVisible}
        />

        {/* Render Placed SMD Pads and physical Component outlines */}
        <div className={cn("absolute inset-0", isDragging && "pointer-events-none")}>
          {board.components.map((comp: any) => {
            const isSelected = selectedIds.includes(comp.id);
            const previewStatus = previewStatuses?.[comp.id];
            if (!isElementVisible(comp.x, comp.y, 8)) {
                return null;
            }
            return (
              <PCBComponentNode 
                key={comp.id} 
                comp={comp} 
                isSelected={isSelected} 
                previewStatus={previewStatus}
                processScale={processScale} 
                showLabels={zoom >= 1.5}
                isFCuVisible={isFCuVisible}
                isBCuVisible={isBCuVisible}
                isReadOnly={isReadOnly}
                isLocked={!!activeLocks[comp.id]}
                onSelect={onSelect} 
                onPadClick={onPadClick}
                zoom={zoom}
                minX={minX}
                minY={minY}
              />
            );
          })}
          
          {dragGhost && (
            <ComponentDragGhost ghost={dragGhost} processScale={processScale} minX={minX} minY={minY} />
          )}
        </div>

        {/* Ratsnest Lines guide layering */}
        <RatsnestLayer board={board} processScale={processScale} minX={minX} minY={minY} isElementVisible={isElementVisible} />

        {/* AI overlays */}
        <AIAttentionOverlay />
        <PlacementPreviewGhosts />
        <RoutingPreviewOverlay />
      </motion.div>
    </>
  );
});
