import React, { useRef, useEffect, useState } from 'react';
import { PCBBoard } from '../lib/board';
import { generate3DViewerMesh, ComponentGeometry3D } from '../lib/exporter';
import { RotateCcw, Maximize2, RefreshCw } from 'lucide-react';

interface ThreeDBoardViewerProps {
  board: PCBBoard;
  onClose: () => void;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

export const ThreeDBoardViewer: React.FC<ThreeDBoardViewerProps> = ({ board, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 3D camera/orientation state
  const [rotX, setRotX] = useState(-0.6); // Pitch (radians)
  const [rotY, setRotY] = useState(0.5);  // Yaw (radians)
  const [zoom, setZoom] = useState(3.5);  // Scale multiplier
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const dragMode = useRef<'rotate' | 'pan'>('rotate');

  const { components3D, boardWidth, boardHeight } = generate3DViewerMesh(board);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      // Clear with elegant dark void
      ctx.fillStyle = '#0a0a0d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2 + pan.x;
      const cy = canvas.height / 2 + pan.y;

      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      // Projects 3D relative board coordinates to 2D screen pixels
      const project = (p: Point3D): { x: number; y: number; z: number } => {
        // Rotate around Y axis (horizontal yaw)
        let x1 = p.x * cosY - p.z * sinY;
        let z1 = p.x * sinY + p.z * cosY;

        // Rotate around X axis (vertical pitch)
        let y2 = p.y * cosX - z1 * sinX;
        let z2 = p.y * sinX + z1 * cosX;

        return {
          x: cx + x1 * zoom,
          y: cy + y2 * zoom,
          z: z2
        };
      };

      // Define Board Substrate box vertices (centered at 0,0,0)
      const halfW = boardWidth / 2;
      const halfH = boardHeight / 2;
      const boardThick = 1.6; // 1.6mm thickness

      const boardVertices: Point3D[] = [
        { x: -halfW, y: -halfH, z: -boardThick / 2 },
        { x: halfW, y: -halfH, z: -boardThick / 2 },
        { x: halfW, y: halfH, z: -boardThick / 2 },
        { x: -halfW, y: halfH, z: -boardThick / 2 },
        { x: -halfW, y: -halfH, z: boardThick / 2 },
        { x: halfW, y: -halfH, z: boardThick / 2 },
        { x: halfW, y: halfH, z: boardThick / 2 },
        { x: -halfW, y: halfH, z: boardThick / 2 }
      ];

      const projVertices = boardVertices.map(project);

      // Face definitions for depth sorting (Painter's Algorithm)
      // Indexes into vertices
      const faces = [
        { indices: [0, 1, 2, 3], color: '#14532d', type: 'board_bot' }, // Bottom green solder mask
        { indices: [4, 5, 6, 7], color: '#166534', type: 'board_top' }, // Top green solder mask
        { indices: [0, 1, 5, 4], color: '#0f3d21', type: 'board_side_n' }, // North edge
        { indices: [1, 2, 6, 5], color: '#115e2e', type: 'board_side_e' }, // East edge
        { indices: [2, 3, 7, 6], color: '#0f3d21', type: 'board_side_s' }, // South edge
        { indices: [3, 0, 4, 7], color: '#115e2e', type: 'board_side_w' }  // West edge
      ];

      // Draw Substrate base (render bottom, then sides, then top depending on pitch orientation)
      // Sort board faces by average depth `z` (higher `z` is closer to camera)
      const sortedFaces = faces.map(f => {
        const sumZ = f.indices.reduce((sum, i) => sum + projVertices[i].z, 0);
        return { ...f, avgZ: sumZ / f.indices.length };
      }).sort((a, b) => a.avgZ - b.avgZ);

      sortedFaces.forEach(f => {
        ctx.beginPath();
        ctx.moveTo(projVertices[f.indices[0]].x, projVertices[f.indices[0]].y);
        for (let i = 1; i < f.indices.length; i++) {
          ctx.lineTo(projVertices[f.indices[i]].x, projVertices[f.indices[i]].y);
        }
        ctx.closePath();
        ctx.fillStyle = f.color;
        ctx.fill();
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 1;
        ctx.stroke();

        // If rendering the top surface face, draw the layout paths overlay!
        if (f.type === 'board_top') {
          // Draw copper traces on Top copper layer (F.Cu)
          board.traces.forEach(t => {
             if (t.layer === 'F.Cu') {
                const sp = project({ x: t.startX, y: t.startY, z: boardThick / 2 + 0.1 });
                const ep = project({ x: t.endX, y: t.endY, z: boardThick / 2 + 0.1 });
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y);
                ctx.lineTo(ep.x, ep.y);
                ctx.strokeStyle = '#f87171'; // copper red contrast on green
                ctx.lineWidth = t.width * zoom * 0.7;
                ctx.stroke();
             }
          });

          // Draw vias
          board.vias.forEach(v => {
             const vp = project({ x: v.x, y: v.y, z: boardThick / 2 + 0.15 });
             ctx.beginPath();
             ctx.arc(vp.x, vp.y, (v.padSize || 0.6) * zoom / 2, 0, Math.PI * 2);
             ctx.fillStyle = '#fbbf24'; // Gold surface
             ctx.fill();
             ctx.beginPath();
             ctx.arc(vp.x, vp.y, (v.drillSize || 0.3) * zoom / 2, 0, Math.PI * 2);
             ctx.fillStyle = '#0a0a0d'; // Center dark drill hole
             ctx.fill();
          });
        }

        // If rendering the bottom surface, draw bottom copper traces (B.Cu)
        if (f.type === 'board_bot') {
          board.traces.forEach(t => {
             if (t.layer === 'B.Cu') {
                const sp = project({ x: t.startX, y: t.startY, z: -boardThick / 2 - 0.1 });
                const ep = project({ x: t.endX, y: t.endY, z: -boardThick / 2 - 0.1 });
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y);
                ctx.lineTo(ep.x, ep.y);
                ctx.strokeStyle = '#60a5fa'; // Blue solder-layer copper overlay standard
                ctx.lineWidth = t.width * zoom * 0.7;
                ctx.stroke();
             }
          });
        }
      });

      // Assemble 3D coordinates for Component boxes
      const projectedComponents = components3D.map(comp => {
         // Create local rotated bounding box vertices for component
         const cw = comp.width / 2;
         const ch = comp.height / 2;
         const cd = comp.depth / 2;
         const localRad = (comp.rotation || 0) * Math.PI / 180;
         const lCos = Math.cos(localRad);
         const lSin = Math.sin(localRad);

         const localOffset = (lx: number, ly: number, lz: number): Point3D => {
           // Rotate around local Z of footprint
           const rx = lx * lCos - ly * lSin;
           const ry = lx * lSin + ly * lCos;
           return {
             x: comp.x + rx,
             y: comp.y + ry,
             z: comp.z + lz
           };
         };

         const boxVertices = [
           localOffset(-cw, -ch, -cd),
           localOffset(cw, -ch, -cd),
           localOffset(cw, ch, -cd),
           localOffset(-cw, ch, -cd),
           localOffset(-cw, -ch, cd),
           localOffset(cw, -ch, cd),
           localOffset(cw, ch, cd),
           localOffset(-cw, ch, cd)
         ].map(project);

         // Helper to get average Depth Z level of component
         const avgZ = boxVertices.reduce((sum, v) => sum + v.z, 0) / boxVertices.length;

         return {
           comp,
           boxVertices,
           avgZ
         };
      });

      // Depth sort 3D physical components so closer blocks render on top correctly
      projectedComponents.sort((a, b) => b.avgZ - a.avgZ || a.avgZ - b.avgZ).forEach(({ comp, boxVertices }) => {
         const compFaces = [
           { indices: [4, 5, 6, 7], color: comp.color }, // Top face
           { indices: [0, 1, 5, 4], color: '#1f2937' }, // Side faces (slightly shaded)
           { indices: [1, 2, 6, 5], color: '#1f2937' },
           { indices: [2, 3, 7, 6], color: '#111827' },
           { indices: [3, 0, 4, 7], color: '#111827' }
         ];

         compFaces.forEach(f => {
            ctx.beginPath();
            ctx.moveTo(boxVertices[f.indices[0]].x, boxVertices[f.indices[0]].y);
            for (let i = 1; i < f.indices.length; i++) {
              ctx.lineTo(boxVertices[f.indices[i]].x, boxVertices[f.indices[i]].y);
            }
            ctx.closePath();
            ctx.fillStyle = f.color;
            ctx.fill();
            ctx.strokeStyle = '#4b5563';
            ctx.lineWidth = 0.5;
            ctx.stroke();
         });

         // Render Text designator (RefDes R1/U1) right on top of component center
         const topCtr = boxVertices[6]; // vertex index on top face
         if (topCtr) {
           ctx.fillStyle = '#f3f4f6';
           ctx.font = 'bold 9px monospace';
           ctx.textAlign = 'center';
           ctx.fillText(comp.name, topCtr.x, topCtr.y - 3);
         }
      });
    };

    render();

    // Trigger safe animation frame render loop
    const onTick = () => {
      render();
      animId = requestAnimationFrame(onTick);
    };
    animId = requestAnimationFrame(onTick);

    return () => cancelAnimationFrame(animId);
  }, [rotX, rotY, zoom, pan, boardWidth, boardHeight, board, components3D]);

  // Pointer/Mouse rotation events
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    dragMode.current = e.button === 2 || e.shiftKey ? 'pan' : 'rotate';
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    if (dragMode.current === 'rotate') {
      setRotY(y => y + dx * 0.015);
      setRotX(x => Math.min(Math.PI / 2, Math.max(-Math.PI / 2, x + dy * 0.015)));
    } else {
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    }

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(1, Math.min(10, z - e.deltaY * 0.005)));
  };

  const resetView = () => {
    setRotX(-0.6);
    setRotY(0.5);
    setZoom(3.5);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-[#09090d] border border-white/10 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between shrink-0 bg-[#0c0c12]">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Maximize2 size={16} className="text-emerald-400" />
              INTEGRATED STEP/3D WEBVIEWER ENGINE
            </h3>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">Real-time depth-sorted multi-layer board rendering</p>
          </div>
          <button 
            onClick={onClose}
            className="text-xs bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Close Viewer
          </button>
        </div>

        {/* 3D Canvas Area */}
        <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
          <canvas 
            ref={canvasRef}
            width={850}
            height={480}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onContextMenu={e => e.preventDefault()}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          />

          {/* Interactive controls HUD */}
          <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-[#0c0c12]/95 border border-white/10 px-3 py-1.5 rounded-full shadow-2xl">
             <button 
               onClick={() => setRotY(y => y + 0.3)} 
               title="Rotate Clockwise"
               className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer"
             >
               <RefreshCw size={14} />
             </button>
             <div className="w-[1.5px] h-4 bg-white/15" />
             <button 
               onClick={resetView} 
               title="Reset Camera View"
               className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer"
             >
               <RotateCcw size={14} />
             </button>
          </div>

          <div className="absolute top-4 left-4 flex flex-col gap-1 bg-[#0c0c12]/80 border border-white/5 p-3 rounded-xl pointer-events-none">
             <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider">Navigation Guide</span>
             <span className="text-[10px] font-mono text-gray-100 flex items-center gap-1.5 mt-1">
               <span className="bg-white/10 px-1 py-0.5 rounded text-[8px] text-gray-300 border border-white/5">Drag</span> Rotation Orbit
             </span>
             <span className="text-[10px] font-mono text-gray-100 flex items-center gap-1.5">
               <span className="bg-white/10 px-1 py-0.5 rounded text-[8px] text-gray-300 border border-white/5">Shift+Drag</span> Horizontal/Vertical Pan
             </span>
             <span className="text-[10px] font-mono text-gray-100 flex items-center gap-1.5">
               <span className="bg-white/10 px-1 py-0.5 rounded text-[8px] text-gray-300 border border-white/5">Scroll</span> Canvas Zoom ({Math.round(zoom * 28)}%)
             </span>
          </div>
        </div>
      </div>
    </div>
  );
};
