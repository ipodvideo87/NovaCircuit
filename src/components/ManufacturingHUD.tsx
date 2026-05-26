import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../lib/core/store';
import { syncBoardFromGraph } from '../lib/board';
import { 
  generateGerberRS274X, 
  generateExcellonDrill, 
  generateBOMCSV, 
  generatePickAndPlaceCSV,
  generateIPCD356Netlist
} from '../lib/exporter';
import { 
  Download, 
  Layers, 
  AlertTriangle, 
  CheckCircle, 
  Settings, 
  FileText, 
  RefreshCw, 
  Sliders,
  Sparkles,
  Info,
  ZoomIn,
  ZoomOut,
  Maximize
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';

interface DFMViolation {
  id: string;
  type: 'clearance' | 'width' | 'refdes' | 'silkscreen';
  severity: 'error' | 'warning';
  title: string;
  description: string;
  coords?: { x: number; y: number };
}

export default function ManufacturingHUD() {
  const { graph } = useProjectStore();
  const board = syncBoardFromGraph(graph);

  // Active Gerber Layer Toggles
  const [layers, setLayers] = useState<Record<string, boolean>>({
    'F.Cu': true,
    'B.Cu': false,
    'F.Silkscreen': true,
    'B.Silkscreen': false,
    'Edge.Cuts': true,
    'F.Mask': true,
    'B.Mask': false,
  });

  const [violations, setViolations] = useState<DFMViolation[]>([]);
  const [selectedViolation, setSelectedViolation] = useState<DFMViolation | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'complete'>('idle');
  const [pcbColor, setPcbColor] = useState<'matte_black' | 'classic_green' | 'royal_blue'>('matte_black');

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // High Fidelity Zoom & Pan parameters
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPanning = useRef<boolean>(false);
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPanning.current) return;
    setPan({
      x: e.clientX - panStart.current.x,
      y: e.clientY - panStart.current.y
    });
  };

  const handleCanvasPointerUpOrLeave = () => {
    isPanning.current = false;
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(0.4, Math.min(10, nextZoom)));
  };

  const zoomIn = () => setZoom(z => Math.min(10, z * 1.2));
  const zoomOut = () => setZoom(z => Math.max(0.4, z / 1.2));
  const resetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Maps violation model coordinates to floating tooltips coordinates
  const getViolationOverlayPos = () => {
    if (!selectedViolation || !selectedViolation.coords || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    
    const baseScale = 3.6;
    const currentScale = baseScale * zoom;
    const offsetX = canvas.width / 2 + pan.x;
    const offsetY = canvas.height / 2 + pan.y;

    const vx = offsetX + (selectedViolation.coords.x - 50) * currentScale;
    const vy = offsetY + (selectedViolation.coords.y - 40) * currentScale;

    if (vx < 0 || vx > canvas.width || vy < 0 || vy > canvas.height) {
      return null; // Cull if zoomed off canvas
    }

    const xPct = (vx / canvas.width) * 100;
    const yPct = (vy / canvas.height) * 100;

    return { xPct, yPct };
  };

  // 1. Live DFM Engine calculations on actual board layout
  const runDFMChecks = () => {
    setStatus('running');
    setTimeout(() => {
      const issues: DFMViolation[] = [];

      // A. Trace width checks (power vs signal rules)
      board.traces.forEach((trace, idx) => {
        const width = (trace as any).width || 0.25;
        const isPower = trace.netId.toLowerCase().includes('vcc') || trace.netId.toLowerCase().includes('3v3') || trace.netId.toLowerCase().includes('5v');
        
        if (isPower && width < 0.4) {
          issues.push({
            id: `width_${idx}`,
            type: 'width',
            severity: 'warning',
            title: `Sub-optimal Power Trace Width on ${trace.netId}`,
            description: `Power trace has width of ${width}mm. Recommended is >= 0.4mm to prevent high thermal build-up.`,
            coords: { x: (trace.startX + trace.endX) / 2, y: (trace.startY + trace.endY) / 2 }
          });
        } else if (width < 0.15) {
          issues.push({
            id: `width_${idx}`,
            type: 'width',
            severity: 'error',
            title: 'Critical Trace Width Violation',
            description: `Trace for ${trace.netId} width of ${width}mm violates the minimum 0.15mm fab clearance.`,
            coords: { x: (trace.startX + trace.endX) / 2, y: (trace.startY + trace.endY) / 2 }
          });
        }
      });

      // B. Component reference designator checks
      board.components.forEach((comp, idx) => {
        if (!comp.designator || comp.designator.includes('?') || comp.designator === 'U') {
          issues.push({
            id: `refdes_${idx}`,
            type: 'refdes',
            severity: 'warning',
            title: 'Unresolved Component Placement Designator',
            description: `Component has placeholder ID '${comp.designator || 'empty'}'. This will block PCB manufacturing.`,
            coords: { x: comp.x, y: comp.y }
          });
        }
      });

      // C. Spatial Clearance Spacing Violations (Collision bounds)
      for (let i = 0; i < board.traces.length; i++) {
        const t1 = board.traces[i];
        // Compare against pins of other components
        board.components.forEach((c) => {
          c.pads.forEach((pad: any) => {
            if (t1.netId !== c.id) { // Not routing directly into this component
              const dist = Math.hypot(t1.startX - pad.x, t1.startY - pad.y);
              if (dist > 0 && dist < 1.2) {
                issues.push({
                  id: `clearance_${i}_${c.id}`,
                  type: 'clearance',
                  severity: 'error',
                  title: `Copper Airgap Clearance Limit Breached`,
                  description: `Airgap distance and width between trace ${t1.netId} and pad ${c.designator}.${pad.id} is ${dist.toFixed(2)}mm (min allowed: 0.15mm).`,
                  coords: { x: pad.x, y: pad.y }
                });
              }
            }
          });
        });
      }

      // Check silklscreen overlap on copper pads
      board.components.forEach((comp, idx) => {
        comp.pads.forEach((pad: any) => {
          // Check distance of text to pads
          const dist = Math.hypot(comp.x - pad.x, comp.y - pad.y);
          if (dist > 0 && dist < 1.8) {
            issues.push({
              id: `silk_${idx}`,
              type: 'silkscreen',
              severity: 'warning',
              title: `Silkscreen reference overlapping Pad coordinate`,
              description: `Component ${comp.designator} silkscreen bounds overlap copper pad ${pad.id}, representing a soldering mask hazard.`,
              coords: { x: pad.x, y: pad.y }
            });
          }
        });
      });

      setViolations(issues);
      setStatus('complete');
    }, 600);
  };

  useEffect(() => {
    runDFMChecks();
  }, [graph]);

  // 2. HTML5 Canvas Gerber Preview Rendering algorithm
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and draw board layout backdrop
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Backdrop colors
    const colors = {
      matte_black: { bg: '#121214', board: '#1e1e24', copper: '#ffaa00', via: '#ffd700', silk: '#fcfcfc', mask: '#2e2e38' },
      classic_green: { bg: '#111827', board: '#134e4a', copper: '#ffcc33', via: '#fbbf24', silk: '#f3f4f6', mask: '#0f766e' },
      royal_blue: { bg: '#0f172a', board: '#1e3a8a', copper: '#ffbd38', via: '#fbca1e', silk: '#f8fafc', mask: '#1d4ed8' },
    }[pcbColor];

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Coordinate mapping (scale and center board)
    const baseScale = 3.6;
    const currentScale = baseScale * zoom;
    const offsetX = canvas.width / 2 + pan.x;
    const offsetY = canvas.height / 2 + pan.y;

    const toCanvasX = (x: number) => offsetX + x * currentScale;
    const toCanvasY = (y: number) => offsetY + y * currentScale;

    // Draw board outline (Edge Cuts)
    if (layers['Edge.Cuts'] && board.outline && board.outline.points.length > 0) {
      ctx.beginPath();
      board.outline.points.forEach((pt, idx) => {
        const cx = toCanvasX(pt.x - 50);
        const cy = toCanvasY(pt.y - 40);
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.fillStyle = colors.board;
      ctx.fill();
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Draw traces
    board.traces.forEach((trace) => {
      const isTopTrace = trace.layer === 'F.Cu';
      const drawLayerMatched = (isTopTrace && layers['F.Cu']) || (!isTopTrace && layers['B.Cu']);
      
      if (drawLayerMatched) {
        ctx.beginPath();
        ctx.moveTo(toCanvasX(trace.startX - 50), toCanvasY(trace.startY - 40));
        ctx.lineTo(toCanvasX(trace.endX - 50), toCanvasY(trace.endY - 40));
        ctx.strokeStyle = isTopTrace ? '#ef4444' : '#3b82f6'; // top cue is red, bottom trace is blue
        ctx.lineWidth = ((trace as any).width || 0.25) * currentScale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    });

    // Draw component pads and footprints
    board.components.forEach((comp) => {
      const isTopComp = comp.layer === 'F.Cu';
      
      // Silkscreen Outlines
      const drawSilk = (isTopComp && layers['F.Silkscreen']) || (!isTopComp && layers['B.Silkscreen']);
      if (drawSilk) {
        ctx.strokeStyle = colors.silk;
        ctx.lineWidth = 1;
        const size = 12 * zoom;
        ctx.strokeRect(toCanvasX(comp.x - 50) - size/2, toCanvasY(comp.y - 40) - size/2, size, size);

        // Render reference designator label
        ctx.fillStyle = colors.silk;
        ctx.font = `bold ${Math.max(6, 8 * zoom)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(comp.designator, toCanvasX(comp.x - 50), toCanvasY(comp.y - 40) - size/2 - 2);
      }

      // Draw active copper pads
      comp.pads.forEach((pad: any) => {
        const drawCopper = (isTopComp && layers['F.Cu']) || (!isTopComp && layers['B.Cu']);
        if (drawCopper) {
          ctx.fillStyle = colors.copper;
          const px = toCanvasX(pad.x - 50);
          const py = toCanvasY(pad.y - 40);
          const size = (pad.type === 'smd' ? 5 : 4) * zoom;

          if (pad.type === 'smd') {
            ctx.fillRect(px - size/2, py - size/2, size, size);
          } else {
            ctx.beginPath();
            ctx.arc(px, py, size/2, 0, 2 * Math.PI);
            ctx.fill();
            // Hole circle inside THT
            ctx.fillStyle = colors.bg;
            ctx.beginPath();
            ctx.arc(px, py, size/4, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      });
    });

    // Draw raw routing vias
    if (layers['Edge.Cuts']) {
      board.vias.forEach((via) => {
        ctx.fillStyle = colors.via;
        const vx = toCanvasX(via.x - 50);
        const vy = toCanvasY(via.y - 40);
        ctx.beginPath();
        ctx.arc(vx, vy, 3 * zoom, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = colors.bg;
        ctx.beginPath();
        ctx.arc(vx, vy, 1 * zoom, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // Highlight selected DFM warning on the canvas overlay
    if (selectedViolation && selectedViolation.coords) {
      const vx = toCanvasX(selectedViolation.coords.x - 50);
      const vy = toCanvasY(selectedViolation.coords.y - 40);
      
      // pulsing red radar halo
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vx, vy, (16 + Math.sin(Date.now() / 150) * 4) * zoom, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(vx, vy, 4 * zoom, 0, 2 * Math.PI);
      ctx.fill();
    }

  }, [layers, board, selectedViolation, pcbColor, zoom, pan]);

  // Handle single-click file trigger download pipeline
  const processDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportBOM = () => {
    const csv = generateBOMCSV(board);
    processDownload(`${(graph as any).name || 'project'}_BOM_Revision_1.0.csv`, csv, 'text/csv');
  };

  const handleExportCPL = () => {
    const csv = generatePickAndPlaceCSV(board);
    processDownload(`${(graph as any).name || 'project'}_CPL_PickPlace.csv`, csv, 'text/csv');
  };

  const handleExportNC = () => {
    const drill = generateExcellonDrill(board);
    processDownload(`${(graph as any).name || 'project'}_NC_Drill.drl`, drill, 'text/plain');
  };

  const handleExportIPC = () => {
    const ip = generateIPCD356Netlist(board);
    processDownload(`${(graph as any).name || 'project'}_IPC-D-356.net`, ip, 'text/plain');
  };

  const handleExportAll = () => {
    try {
      const zip = new JSZip();
      
      const topGerber = generateGerberRS274X(board, 'F.Cu');
      const bottomGerber = generateGerberRS274X(board, 'B.Cu');
      const drill = generateExcellonDrill(board);
      const bom = generateBOMCSV(board);
      const cpl = generatePickAndPlaceCSV(board);
      const ipc = generateIPCD356Netlist(board);

      zip.file("Gerber_Top_Copper_F_Cu.gbr", topGerber);
      zip.file("Gerber_Bottom_Copper_B_Cu.gbr", bottomGerber);
      zip.file("Excellon_Drills_PTH.drl", drill);
      zip.file("BOM_Manufacturing_Order.csv", bom);
      zip.file("CPL_Placement_Centroids.csv", cpl);
      zip.file("IPC_D_356_Netlist.net", ipc);

      zip.generateAsync({ type: "blob" }).then((content) => {
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${(graph as any).name || 'project'}_full_manufacturing_pack.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
    } catch (err: any) {
      console.error("ZIP Export failure:", err);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 bg-[#030303]/90 backdrop-blur-lg border border-white/5 rounded-3xl h-full font-mono text-gray-300">
      {/* 3D Gerber layer preview pane */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-black uppercase text-gray-100 tracking-wider">High Fidelity Gerber RS-274X previewer</h2>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] bg-white/5 px-2.5 py-1 rounded-xl">
            <Settings size={12} className="text-gray-400 rotate-90" />
            <span>Theme:</span>
            <select 
              value={pcbColor} 
              onChange={(e) => setPcbColor(e.target.value as any)}
              className="bg-transparent text-gray-100 font-extrabold cursor-pointer border-none outline-none"
            >
              <option value="matte_black" className="bg-black">Matte Black</option>
              <option value="classic_green" className="bg-black">Classic Green</option>
              <option value="royal_blue" className="bg-black">Royal Blue</option>
            </select>
          </div>
        </div>

        <div className="relative border border-white/5 bg-[#0a0a0d] rounded-2xl overflow-hidden aspect-[4/3] max-h-[380px] flex items-center justify-center select-none">
          <canvas 
            ref={canvasRef} 
            width={580} 
            height={380} 
            className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUpOrLeave}
            onPointerLeave={handleCanvasPointerUpOrLeave}
            onWheel={handleCanvasWheel}
          />
          
          {/* Floating DFM Violation Callout Tooltip */}
          {selectedViolation && getViolationOverlayPos() && (
            <div 
              className="absolute pointer-events-none bg-rose-950/95 backdrop-blur text-rose-100 border border-rose-500/30 p-2.5 rounded-lg shadow-2xl max-w-[200px] text-[10px] z-50 transform -translate-x-1/2 -translate-y-[calc(100%+10px)] transition-all duration-200"
              style={{
                left: `${getViolationOverlayPos()?.xPct}%`,
                top: `${getViolationOverlayPos()?.yPct}%`,
              }}
            >
              <div className="flex items-center gap-1 font-black uppercase text-rose-400 mb-1 border-b border-rose-500/20 pb-1">
                <AlertTriangle size={10} className="text-rose-400 animate-pulse" />
                <span>DFM WARN</span>
              </div>
              <p className="leading-tight text-white/90">{selectedViolation.description}</p>
              <div className="absolute w-2 h-2 bg-rose-950 border-r border-b border-rose-500/30 rotate-45 left-1/2 -translate-x-1/2 top-full -translate-y-1" />
            </div>
          )}

          {/* Floating Zoom Controls overlay */}
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/80 backdrop-blur border border-white/5 p-1 rounded-xl shadow-2xl z-40">
            <button 
              onClick={zoomIn} 
              title="Zoom In"
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors"
            >
              <ZoomIn size={13} />
            </button>
            <button 
              onClick={zoomOut} 
              title="Zoom Out"
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors"
            >
              <ZoomOut size={13} />
            </button>
            <button 
              onClick={resetZoom} 
              title="Reset View"
              className="p-1 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors text-[9px] font-black px-2 flex items-center gap-1"
            >
              <Maximize size={10} />
              {(zoom * 100).toFixed(0)}%
            </button>
          </div>
          
          {/* Legend indicator */}
          <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur border border-white/5 p-2 rounded-xl text-[8px] space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>F.Cu / Top Trace</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>B.Cu / Bottom Trace</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>Vias (Plated Holes)</span>
            </div>
          </div>
        </div>

        {/* Gerber layer checkboxes */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest pb-2 mb-3 border-b border-white/5 flex items-center gap-1">
            <Layers size={12} className="text-indigo-400" />
            Active Vector Layer Toggles
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.keys(layers).map((layerKey) => (
              <label 
                key={layerKey} 
                className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-300 hover:text-white cursor-pointer select-none"
              >
                <input 
                  type="checkbox" 
                  checked={layers[layerKey]} 
                  onChange={(e) => setLayers(prev => ({ ...prev, [layerKey]: e.target.checked }))}
                  className="rounded accent-indigo-500 bg-neutral-800 border-neutral-700"
                />
                <span>{layerKey}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Side exporter control rail */}
      <div className="w-full lg:w-[320px] flex flex-col gap-5">
        
        {/* DFM violation monitor */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex-1 flex flex-col min-h-[180px]">
          <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest pb-2 mb-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <AlertTriangle size={12} />
              DFM Validation checks ({violations.length})
            </div>
            <button 
              onClick={runDFMChecks} 
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer flex items-center justify-center"
            >
              <RefreshCw size={10} className={status === 'running' ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[160px] pr-1">
            {violations.map((err) => (
              <div 
                key={err.id} 
                onClick={() => setSelectedViolation(err)}
                className={`p-2 border rounded-xl hover:bg-white/5 cursor-pointer transition-all ${
                  selectedViolation?.id === err.id 
                    ? 'border-indigo-500 bg-indigo-500/5' 
                    : err.severity === 'error' ? 'border-rose-500/10 bg-rose-500/5' : 'border-amber-500/10 bg-amber-500/5'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1 ${
                    err.severity === 'error' ? 'bg-rose-500' : 'bg-amber-500'
                  }`} />
                  <div>
                    <div className="text-[10px] font-black leading-tight text-gray-200">{err.title}</div>
                    <div className="text-[8px] text-gray-500 mt-1 leading-normal">{err.description}</div>
                  </div>
                </div>
              </div>
            ))}

            {violations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 gap-2 text-gray-500">
                <CheckCircle size={20} className="text-emerald-500 animate-bounce" />
                <span className="text-[10px] text-center italic font-bold">DFM audit fully passed! Layout contains zero manufacturing rule blocks.</span>
              </div>
            )}
          </div>
        </div>

        {/* CAD Exporters downloads block */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3.5">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest pb-2 mb-2 border-b border-white/5 flex items-center gap-1">
            <Sliders size={12} className="text-gray-400" />
            CAD Fab exporter tools
          </div>

          <div className="flex flex-col gap-2">
            <button 
              onClick={handleExportBOM}
              className="w-full flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 rounded-xl cursor-pointer transition-all hover:scale-[1.01] border border-white/5"
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-amber-400" />
                <span className="text-[10px] font-extrabold uppercase">Bill of Materials BOM</span>
              </div>
              <Download size={12} className="text-gray-400" />
            </button>

            <button 
              onClick={handleExportCPL}
              className="w-full flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 rounded-xl cursor-pointer transition-all hover:scale-[1.01] border border-white/5"
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-blue-400" />
                <span className="text-[10px] font-extrabold uppercase">Pick & Place Coordinates</span>
              </div>
              <Download size={12} className="text-gray-400" />
            </button>

            <button 
              onClick={handleExportNC}
              className="w-full flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 rounded-xl cursor-pointer transition-all hover:scale-[1.01] border border-white/5"
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-red-400" />
                <span className="text-[10px] font-extrabold uppercase">Excellon NC Drill Map</span>
              </div>
              <Download size={12} className="text-gray-400" />
            </button>

            <button 
              onClick={handleExportIPC}
              className="w-full flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 rounded-xl cursor-pointer transition-all hover:scale-[1.01] border border-white/5"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-indigo-400" />
                <span className="text-[10px] font-extrabold uppercase">IPC-D-356 netlist</span>
              </div>
              <Download size={12} className="text-gray-400" />
            </button>
          </div>

          <button 
            onClick={handleExportAll}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl cursor-pointer transition-all hover:scale-[1.02] border border-indigo-400 text-white font-extrabold uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-600/20"
          >
            <Download size={13} />
            Download Complete Package
          </button>
        </div>

      </div>
    </div>
  );
}
