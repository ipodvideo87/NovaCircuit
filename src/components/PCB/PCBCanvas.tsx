import React, { useRef, useMemo, useState, useEffect } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { ComponentRenderer } from './ComponentRenderer';
import { TraceRenderer } from './TraceRenderer';
import { RatsnestLayer } from './RatsnestLayer';
import { useTransactionStore } from '../../lib/core/transaction';
import { SpatialIndex } from '../../lib/core/spatial';
import {
  calculateTraceWidthForImpedance,
  analyzeBoardTraces
} from '../../lib/routingSystem';
import {
  runDesignValidation,
  DesignReport
} from '../../lib/orchestrator';
import { TEMPLATES } from '../../lib/core/templates';
import {
  SlidersHorizontal,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  FileDown,
  Sparkles,
  RefreshCw,
  FolderDown,
  Layers,
  MousePointerClick
} from 'lucide-react';

export const PCBCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });
  
  // Selection/tuning States from Zustand store (enabling dual alignment)
  const selectedTraceId = useTransactionStore((state) => state.selectedTraceId);
  const selectedComponentId = useTransactionStore((state) => state.selectedComponentId);
  const setSelectedTraceId = useTransactionStore((state) => state.setSelectedTraceId);
  const setSelectedComponentId = useTransactionStore((state) => state.setSelectedComponentId);
  const [tunedTraceIds, setTunedTraceIds] = useState<Set<string>>(new Set(["trace-rf-path", "trace-spi-sck"]));
  const [serpentineAmplitude, setSerpentineAmplitude] = useState<number>(12);
  const [serpentineSpacing, setSerpentineSpacing] = useState<number>(8);

  useEffect(() => {
    const handleTuneEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.ids) {
        setTunedTraceIds(prev => {
          const next = new Set(prev);
          customEvent.detail.ids.forEach((id: string) => next.add(id));
          return next;
        });
      }
    };
    window.addEventListener('novacircuit:tune-traces', handleTuneEvent);
    return () => window.removeEventListener('novacircuit:tune-traces', handleTuneEvent);
  }, []);

  // Stackup Config
  const [layersCount, setLayersCount] = useState<number>(4);
  const [dielectricHeight, setDielectricHeight] = useState<number>(0.2); // mm, default prepreg for 4-layer boards
  const [dielectricConstant, setDielectricConstant] = useState<number>(4.4); // FR-4
  const [copperThickness, setCopperThickness] = useState<number>(35); // um (1oz)
  const [targetImpedance, setTargetImpedance] = useState<50 | 90 | 100>(50);

  // Validation report state
  const [activeReport, setActiveReport] = useState<DesignReport | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'stackup' | 'matching' | 'validation'>('stackup');

  // Mobile layout state
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);

  // Transaction sync
  const history = useTransactionStore((state) => state.history);
  const currentIndex = useTransactionStore((state) => state.currentIndex);
  const loadBoard = useTransactionStore((state) => state.loadBoard);
  const commitTransaction = useTransactionStore((state) => state.commitTransaction);
  const board = history[currentIndex];

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setViewport({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync mobile drawer on trace selection
  const handleSelectTraceFull = (id: string | null) => {
    setSelectedTraceId(id);
    setSelectedComponentId(null);
    if (id) {
      setIsSidebarOpenMobile(true); // Open sidebar automatically on mobile
      setActiveTab('matching'); // Direct user to calculations
    }
  };

  const handleSelectComponentFull = (id: string | null) => {
    setSelectedComponentId(id);
    setSelectedTraceId(null);
    if (id) {
      setIsSidebarOpenMobile(true); // Open sidebar automatically on mobile
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.1, Math.min(10, z * zoomFactor)));
    } else {
      setPan(p => ({ x: p.x - e.deltaX / zoom, y: p.y - e.deltaY / zoom }));
    }
  };

  // Drag interaction to pan with standard middle click or space key drag
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0) { // Left or middle click
      if (e.button === 0 && selectedComponentId) return; // Ignore drag if selecting component
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan(p => ({ x: p.x + dx / zoom, y: p.y + dy / zoom }));
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // ---------------- GESTURE CONTROLS FOR TABLET & PHONES ----------------
  const lastTouchDistance = useRef<number | null>(null);
  const touchStart = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastTouchDistance.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      lastTouchDistance.current = distance;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - touchStart.current.x;
      const dy = e.touches[0].clientY - touchStart.current.y;
      setPan(p => ({ x: p.x + dx / zoom, y: p.y + dy / zoom }));
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (lastTouchDistance.current !== null && lastTouchDistance.current > 0) {
        const ratio = distance / lastTouchDistance.current;
        const factor = ratio > 1 ? 1.05 : 0.95;
        setZoom(z => Math.max(0.1, Math.min(10, z * factor)));
      }
      lastTouchDistance.current = distance;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastTouchDistance.current = null;
  };
  // ----------------------------------------------------------------------

  const spatialIndex = useMemo(() => {
    const idx = new SpatialIndex<string>();
    board.components.forEach(c => {
      idx.insert(c.id, c.x - 25, c.y - 25, c.x + 25, c.y + 25);
    });
    board.traces.forEach(t => {
      const minX = Math.min(t.startX, t.endX) - 5;
      const minY = Math.min(t.startY, t.endY) - 5;
      const maxX = Math.max(t.startX, t.endX) + 5;
      const maxY = Math.max(t.startY, t.endY) + 5;
      idx.insert(t.id, minX, minY, maxX, maxY);
    });
    board.ratnest.forEach(r => {
      const minX = Math.min(r.startX, r.endX) - 2;
      const minY = Math.min(r.startY, r.endY) - 2;
      const maxX = Math.max(r.startX, r.endX) + 2;
      const maxY = Math.max(r.startY, r.endY) + 2;
      idx.insert(r.id, minX, minY, maxX, maxY);
    });
    return idx;
  }, [board]);

  const visibleIds = useMemo(() => {
    const minX = -pan.x;
    const minY = -pan.y;
    const maxX = -pan.x + viewport.w / zoom;
    const maxY = -pan.y + viewport.h / zoom;
    
    const margin = 120 / zoom;
    return spatialIndex.queryWindow(minX - margin, minY - margin, maxX + margin, maxY + margin);
  }, [spatialIndex, pan.x, pan.y, zoom, viewport.w, viewport.h]);

  // IPC target impedance calculations
  const recommendedTraceWidth = useMemo(() => {
    return calculateTraceWidthForImpedance(targetImpedance, dielectricHeight, dielectricConstant, copperThickness);
  }, [targetImpedance, dielectricHeight, dielectricConstant, copperThickness]);

  // Live matching analysis
  const traceAnalyses = useMemo(() => {
    return analyzeBoardTraces(board.traces, targetImpedance, dielectricHeight, dielectricConstant, copperThickness);
  }, [board.traces, targetImpedance, dielectricHeight, dielectricConstant, copperThickness]);

  const activeTraceAnalysis = useMemo(() => {
    if (!selectedTraceId) return null;
    return traceAnalyses.find(a => a.id === selectedTraceId) || null;
  }, [selectedTraceId, traceAnalyses]);

  // Set trace width to match impedance target
  const applyImpedanceWidth = (traceId: string) => {
    const updatedTraces = board.traces.map(t => {
      if (t.id === traceId) {
        return { ...t, width: recommendedTraceWidth };
      }
      return t;
    });
    commitTransaction({ ...board, traces: updatedTraces });
  };

  const applyImpedanceWidthGlobally = () => {
    const updatedTraces = board.traces.map(t => {
      if (t.netId.includes("rf") || t.netId.includes("dp") || t.netId.includes("dn") || t.netId.includes("spi")) {
        return { ...t, width: recommendedTraceWidth };
      }
      return t;
    });
    commitTransaction({ ...board, traces: updatedTraces });
  };

  const toggleSerpentineTuning = (traceId: string) => {
    const nextTuned = new Set(tunedTraceIds);
    if (nextTuned.has(traceId)) {
      nextTuned.delete(traceId);
    } else {
      nextTuned.add(traceId);
    }
    setTunedTraceIds(nextTuned);
  };

  const runValidation = () => {
    const report = runDesignValidation(board);
    setActiveReport(report);
    setShowReportModal(true);
  };

  const exportFullProject = () => {
    const projectBlob = new Blob([JSON.stringify({ 
      meta: {
        exportedAt: new Date().toISOString(),
        version: "1.4.2-stable",
        stackup: {
          dielectricHeight,
          dielectricConstant,
          copperThickness,
          targetImpedance
        }
      },
      board: board
    }, null, 2)], { type: 'application/json' });

    const url = URL.createObjectURL(projectBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NovaCircuit_Project_${Date.now()}.novacircuit`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadReportHTML = () => {
    if (!activeReport) return;
    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>NovaCircuit Validation Report</title>
        <style>
          body { font-family: sans-serif; color: #1e293b; background: #f8fafc; padding: 40px; }
          .container { max-width: 900px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
          h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; color: #0f172a; margin-top: 0; }
          .summary-card { padding: 24px; border-radius: 8px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
          .status-APPROVED { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
          .status-REQUIRES_REVISION { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
          .status-REJECTED { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
          .score { font-size: 48px; font-weight: bold; }
          .rule { border: 1px solid #e2e8f0; padding: 18px; border-radius: 6px; margin-bottom: 12px; }
          .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
          .badge-FAIL { background: #ef4444; color: #ffffff; }
          .badge-WARNING { background: #f59e0b; color: #ffffff; }
          .badge-PASS { background: #10b981; color: #ffffff; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .panel { background: #f1f5f9; padding: 18px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>NovaCircuit Electrical Design Report</h1>
          <div class="summary-card status-${activeReport.summary.status}">
            <div>
              <div style="text-transform: uppercase; font-size: 13px; font-weight: bold; letter-spacing: 0.05em; opacity: 0.8">Board Validation Status</div>
              <div style="font-size: 28px; font-weight: bold; margin-top: 5px">${activeReport.summary.status}</div>
              <div style="margin-top: 8px; font-size: 14px">Errors: ${activeReport.summary.totalErrors} | Warnings: ${activeReport.summary.totalWarnings}</div>
            </div>
            <div style="text-align: right">
              <div style="font-size: 13px; font-weight: bold; opacity: 0.8">MANUFACTURABILITY SCORE</div>
              <div class="score">${activeReport.summary.score}%</div>
            </div>
          </div>

          <div class="grid">
            <div class="panel">
              <h3>Stackup Parameter Specification</h3>
              <p><b>Dielectric Constant (Er):</b> ${dielectricConstant}</p>
              <p><b>Dielectric Height (H):</b> ${dielectricHeight} mm</p>
              <p><b>Copper Plane Thickness:</b> ${copperThickness} um</p>
              <p><b>Trace Target Impedance:</b> ${targetImpedance} &Omega;</p>
            </div>
            <div class="panel">
              <h3>Physical Diagnostics</h3>
              <p><b>Total Components:</b> ${board.components.length}</p>
              <p><b>Total Traces:</b> ${board.traces.length}</p>
              <p><b>Unrouted Airwires (Ratsnest):</b> ${board.ratnest.length}</p>
              <p><b>Controlled-Impedance Standard:</b> IPC-2141 Microstrip</p>
            </div>
          </div>

          <h2>Full Verification Checklist</h2>
          ${activeReport.checks.map(item => `
            <div class="rule">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <b style="font-size: 16px;">${item.ruleName}</b>
                <span class="status-badge badge-${item.status}">${item.status}</span>
              </div>
              <p style="margin: 0; font-size: 14px; color: #475569;">${item.description}</p>
              ${item.affectedIds.length > 0 ? `<p style="margin: 8px 0 0 0; font-size: 12px; font-family: monospace; color: #64748b;">Affected Net/Comp IDs: ${item.affectedIds.join(', ')}</p>` : ''}
            </div>
          `).join('')}

          <div style="text-align: center; margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px;">
            Generated by NovaCircuit AI EDA Suite - ${new Date(activeReport.timestamp).toLocaleString()}
          </div>
        </div>
      </body>
      </html>
    `;

    const reportBlob = new Blob([reportHTML], { type: 'text/html' });
    const url = URL.createObjectURL(reportBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PCB_Manufacturing_Report_${Date.now()}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute inset-0 flex flex-col lg:flex-row overflow-hidden">
      {/* Interactive PCB Work Area */}
      <div 
        ref={containerRef}
        className="flex-1 h-full overflow-hidden bg-[#0a0a0e] relative select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'none' }}
      >
        {/* Onboarding templates wizard - show if we have only random or empty layout default */}
        {board.components.length > 200 && (
          <div className="absolute inset-0 bg-[#07070b]/95 z-40 flex flex-col items-center justify-start py-12 px-6 sm:px-8 overflow-y-auto scrollbar-thin">
            <div className="max-w-2xl text-center flex flex-col items-center my-auto">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
                <Sparkles className="text-indigo-400 w-8 h-8 animate-pulse" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-2">Welcome to NovaCircuit Workspace</h2>
              <p className="text-sm text-gray-400 mb-8 max-w-lg">
                Instantly initialize your canvas with a gold-standard reference design to start simulation, routing optimization, and DFM impedance verification.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
                {Object.entries(TEMPLATES).map(([key, temp]) => (
                  <button
                    key={key}
                    onClick={() => {
                      loadBoard(temp.board);
                    }}
                    className="flex flex-col bg-[#111116] border border-white/5 hover:border-indigo-500/50 p-5 rounded-xl text-left transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 group focus:outline-none"
                  >
                    <span className="text-xs font-mono text-indigo-400 font-semibold mb-2 block uppercase tracking-wider">
                      {key === 'esp32' ? 'IoT Reference' : key === 'powerDelivery' ? 'Power Supply' : 'Mixed Signal'}
                    </span>
                    <h4 className="text-sm font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors uppercase tracking-tight">
                      {temp.name}
                    </h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-auto">
                      {temp.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <ErrorBoundary>
          <svg 
            width="100%" 
            height="100%" 
            style={{ backgroundColor: '#07070b' }}
            onClick={() => {
              // Clear focus
              setSelectedTraceId(null);
              setSelectedComponentId(null);
            }}
          >
            <g transform={`scale(${zoom}) translate(${pan.x}, ${pan.y})`}>
              {/* Copper grid points */}
              <pattern id="dot-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="15" cy="15" r="1" fill="#475569" opacity="0.15" />
              </pattern>
              <rect x="-20000" y="-20000" width="40000" height="40000" fill="url(#dot-grid)" />

              {/* Selection reference airwire guides */}
              {selectedComponentId && (
                (() => {
                  const comp = board.components.find(c => c.id === selectedComponentId);
                  if (!comp) return null;
                  return (
                    <g opacity="0.4">
                      <line x1={comp.x - 50} y1={comp.y} x2={comp.x + 50} y2={comp.y} stroke="#818cf8" strokeWidth="0.5" strokeDasharray="3 3" />
                      <line x1={comp.x} y1={comp.y - 50} x2={comp.x} y2={comp.y + 50} stroke="#818cf8" strokeWidth="0.5" strokeDasharray="3 3" />
                    </g>
                  );
                })()
              )}

              {/* Trace Layer */}
              <TraceRenderer 
                traces={board.traces} 
                visibleIds={visibleIds} 
                selectedTraceId={selectedTraceId} 
                onSelectTrace={handleSelectTraceFull}
                tunedTraceIds={tunedTraceIds}
                serpentineAmplitude={serpentineAmplitude}
                serpentineSpacing={serpentineSpacing}
              />

              {/* Airwires Ratsnest Layer */}
              <RatsnestLayer ratnest={board.ratnest} visibleIds={visibleIds} />

              {/* Physical Component Footprints */}
              <ComponentRenderer 
                components={board.components} 
                visibleIds={visibleIds} 
                selectedComponentId={selectedComponentId} 
                onSelectComponent={handleSelectComponentFull}
              />
            </g>
          </svg>
        </ErrorBoundary>

        {/* HUD Navigation controller overlay */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <div className="bg-[#111116]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 text-[10px] uppercase font-mono flex items-center gap-2 text-gray-400 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse animate-duration-1000" />
            Viewport: {Math.round(pan.x)}, {Math.round(pan.y)} @ {Math.round(zoom * 100)}%
          </div>
          <button 
            onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}
            className="bg-[#111116]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 hover:border-indigo-500/30 text-[10px] uppercase font-mono text-indigo-400 flex items-center gap-1 transition-all"
          >
            <RefreshCw size={11} /> Reset zoom
          </button>
        </div>

        {/* FLOATING ACTION TRIGGER ON MOBILE FOR DRAWER */}
        <button
          onClick={() => setIsSidebarOpenMobile(true)}
          className="lg:hidden absolute bottom-4 right-4 z-25 flex items-center gap-1.5 px-3 py-2 bg-indigo-650 hover:bg-indigo-600 border border-indigo-500/30 text-white rounded-xl shadow-2xl focus:outline-none"
        >
          <SlidersHorizontal size={14} />
          <span className="text-[10px] uppercase tracking-wider font-extrabold font-sans">Solver Panel</span>
        </button>
      </div>

      {/* MOBILE DRAWER SHIELD OVERLAY */}
      {isSidebarOpenMobile && (
        <div 
          onClick={() => setIsSidebarOpenMobile(false)}
          className="lg:hidden fixed inset-0 bg-black/70 z-30 transition-opacity"
        />
      )}

      {/* Advanced Electrical Intelligence Suite sidebar / drawer */}
      <div 
        className={`fixed lg:relative top-0 right-0 bottom-0 w-80 sm:w-96 lg:w-96 border-l border-white/5 bg-[#111116]/98 backdrop-blur-xl flex flex-col h-full overflow-hidden transition-transform duration-300 z-40 lg:translate-x-0 ${
          isSidebarOpenMobile ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2 bg-[#14141d]/50 border-b border-white/5 lg:hidden shrink-0">
          <span className="text-[10px] font-black uppercase tracking-wider">Suite Inspector</span>
          <button 
            onClick={() => setIsSidebarOpenMobile(false)}
            className="p-1 rounded bg-white/5 text-gray-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex h-12 border-b border-white/5 bg-[#0a0a0f]/50 shrink-0">
          <button
            onClick={() => setActiveTab('stackup')}
            className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold tracking-widest uppercase transition-colors outline-none pb-0.5 ${
              activeTab === 'stackup' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-white/[0.02]' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Layers size={12} /> STACKUP
          </button>
          <button
            onClick={() => setActiveTab('matching')}
            className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold tracking-widest uppercase transition-colors outline-none pb-0.5 ${
              activeTab === 'matching' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-white/[0.02]' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Activity size={12} /> IMPEDANCE
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold tracking-widest uppercase transition-colors outline-none pb-0.5 ${
              activeTab === 'validation' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-white/[0.02]' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles size={12} /> VALIDATE
          </button>
        </div>

        {/* Tab contents */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'stackup' && (
            <div className="space-y-4">
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-indigo-400" /> Layer Stackup settings
                </h4>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Adjust dielectric substrates and foil thickness to match fabrication tolerances. Custom width is solved via IPC-2141 microstrip.
                </p>
              </div>

              {/* Layer count selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">PCB Board Layer Count</label>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 4, 6, 8].map(num => (
                    <button
                      key={num}
                      onClick={() => {
                        setLayersCount(num);
                        // Auto-adjust default heights based on layers
                        if (num === 2) setDielectricHeight(1.6);
                        else if (num === 4) setDielectricHeight(0.2);
                        else if (num === 6) setDielectricHeight(0.15);
                        else if (num === 8) setDielectricHeight(0.1);
                      }}
                      className={`py-2 text-xs font-mono font-black rounded-lg border transition-all ${
                        layersCount === num
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-[#15151a] border-white/5 hover:border-white/20 text-gray-400'
                      }`}
                    >
                      {num}L
                    </button>
                  ))}
                </div>
              </div>

              {/* Stackup Layer Diagram */}
              <div className="bg-[#111116] border border-white/5 p-4 rounded-xl space-y-3">
                <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {layersCount}-Layer Foil Stackup Core
                </div>
                <div className="space-y-1.5 font-mono text-[9px]">
                  {Array.from({ length: layersCount }).map((_, index) => {
                    const isSignal = index === 0 || index === layersCount - 1;
                    const isGnd = index === 1 || (layersCount >= 8 && index === 6);
                    const isPwr = index === layersCount - 2;
                    let label = `Inner Plane ${index}`;
                    if (isSignal) label = index === 0 ? 'L1: Top Signal (GTL)' : `L${layersCount}: Bottom Signal (GBL)`;
                    else if (isGnd) label = `L${index + 1}: Inner GND Plane`;
                    else if (isPwr) label = `L${index + 1}: Inner PWR Rail Plane`;
                    else label = `L${index + 1}: Inner Signal Route`;

                    return (
                      <div key={index} className="space-y-1">
                        {/* Copper Foil */}
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2 rounded bg-amber-600 shrink-0" />
                          <span className="text-gray-300 font-bold">{label}</span>
                          <span className="ml-auto text-[8px] text-gray-500">copper ({copperThickness}µm)</span>
                        </div>
                        {/* Dielectric insulation layer (not after last copper sheet) */}
                        {index < layersCount - 1 && (
                          <div className="ml-5 pl-3 border-l-2 border-indigo-500/20 py-2.5 flex items-center gap-2 text-gray-500 text-[8px]">
                            <span className="w-2 h-2.5 rounded bg-indigo-500/10 border border-indigo-500/10 shrink-0" />
                            <span>
                              {index === 0 || index === layersCount - 2 ? 'FR-4 Prepreg' : 'FR-4 Rigid Core'}
                            </span>
                            <span className="ml-auto text-gray-400 font-bold">
                              {(dielectricHeight / (layersCount / 2)).toFixed(2)}mm
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Target Impedance Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Target Impedance (Z₀)</label>
                <div className="grid grid-cols-3 gap-2 flex-wrap">
                  {[50, 90, 100].map(val => (
                    <button
                      key={val}
                      onClick={() => setTargetImpedance(val as 50 | 90 | 100)}
                      className={`py-2 text-xs font-mono font-bold rounded-lg border transition-all ${
                        targetImpedance === val
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-[#15151a] border-white/5 hover:border-white/20 text-gray-400'
                      }`}
                    >
                      {val}Ω
                    </button>
                  ))}
                </div>
              </div>

              {/* Dielectric Height Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-400 tracking-wider">
                  <span>Dielectric Height (H)</span>
                  <span className="font-mono text-indigo-400 font-bold">{dielectricHeight} mm</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.2"
                  step="0.1"
                  value={dielectricHeight}
                  onChange={(e) => setDielectricHeight(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 bg-[#15151a] rounded-lg appearance-none h-1.5 cursor-pointer"
                />
              </div>

              {/* Dielectric Constant Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-400 tracking-wider">
                  <span>Dielectric Constant (εᵣ)</span>
                  <span className="font-mono text-indigo-400 font-bold">{dielectricConstant} ε</span>
                </div>
                <input
                  type="range"
                  min="2.2"
                  max="6.0"
                  step="0.05"
                  value={dielectricConstant}
                  onChange={(e) => setDielectricConstant(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 bg-[#15151a] rounded-lg appearance-none h-1.5 cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-gray-550">
                  <span>2.2 (PTFE Rogers)</span>
                  <span>4.4 (Standard FR-4)</span>
                </div>
              </div>

              {/* Copper weight */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Copper Foil Weight (T)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[{ t: 18, label: '0.5 oz (18um)' }, { t: 35, label: '1.0 oz (35um)' }, { t: 70, label: '2.0 oz (70um)' }].map(item => (
                    <button
                      key={item.t}
                      onClick={() => setCopperThickness(item.t)}
                      className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                        copperThickness === item.t
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-[#15151a] border-white/5 hover:border-white/20 text-gray-205'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Solver Result */}
              <div className="bg-[#15151a] border border-white/5 rounded-xl p-4 mt-6">
                <div className="text-[9px] font-black text-gray-500 uppercase tracking-wider mb-2">IPC-2141 Solver Output</div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-gray-400">Target trace width</span>
                  <span className="text-xl font-mono font-black text-white">{recommendedTraceWidth} mm</span>
                </div>
                <div className="text-[8.5px] text-gray-400 leading-relaxed mb-4">
                  Maintaining impedance matching minimizes signals reflection at high speeds.
                </div>
                <button
                  onClick={applyImpedanceWidthGlobally}
                  className="w-full text-center text-[10px] font-black uppercase py-2.5 bg-indigo-500 hover:bg-indigo-400 transition-colors rounded-lg text-white"
                >
                  Apply recommended width to High-Speed nets
                </button>
              </div>
            </div>
          )}

          {activeTab === 'matching' && (
            <div className="space-y-4">
              <div className="bg-[#15151a] border border-white/5 p-4 rounded-xl">
                <p className="text-[10px] leading-relaxed text-gray-400">
                  Select a trace line in the canvas to run high frequency matching solver. Activate serpentine tuning below to adjust length.
                </p>
              </div>

              {activeTraceAnalysis ? (
                <div className="space-y-4">
                  {/* Selected Trace analysis status card */}
                  <div className="bg-[#1a1a24] p-4 rounded-xl border border-white/5 space-y-3">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2 gap-2">
                      <span className="text-xs font-bold text-white font-mono truncate">{activeTraceAnalysis.id}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                        activeTraceAnalysis.isMatched ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {activeTraceAnalysis.isMatched ? 'Z MATCHED' : 'Z INACCURATE'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Inductive impedance</div>
                        <div className="text-base font-mono font-semibold text-white">{activeTraceAnalysis.impedance} Ω</div>
                      </div>
                      <div>
                        <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Physical length</div>
                        <div className="text-base font-mono font-semibold text-white">{activeTraceAnalysis.length} mm</div>
                      </div>
                    </div>

                    <p className="text-[9.5px] leading-relaxed text-indigo-300">
                      {activeTraceAnalysis.notes}
                    </p>

                    <button
                      onClick={() => applyImpedanceWidth(activeTraceAnalysis.id)}
                      className="w-full text-[10px] font-bold tracking-wider uppercase py-2 bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-white rounded-lg"
                    >
                      Set Width to recommended ({recommendedTraceWidth} mm)
                    </button>
                  </div>

                  {/* Serpentine Tuning Controls */}
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-400 tracking-wider">
                      <span>Serpentine Length Tuning</span>
                      <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-400 px-2 rounded-full border border-indigo-500/20 py-0.5">
                        {tunedTraceIds.has(activeTraceAnalysis.id) ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    <button
                      onClick={() => toggleSerpentineTuning(activeTraceAnalysis.id)}
                      className={`w-full py-2.5 rounded-lg border text-[10px] font-black uppercase transition-all tracking-wider ${
                        tunedTraceIds.has(activeTraceAnalysis.id)
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400'
                      }`}
                    >
                      {tunedTraceIds.has(activeTraceAnalysis.id) ? 'Disable Serpentine Wiggles' : 'Tuning Waves (Serpentine)'}
                    </button>

                    {/* Amplitude Tuner slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>Serpentine Amplitude</span>
                        <span className="font-mono text-white font-bold">{serpentineAmplitude}px</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="24"
                        step="1"
                        value={serpentineAmplitude}
                        onChange={(e) => setSerpentineAmplitude(parseInt(e.target.value))}
                        className="w-full accent-indigo-500 bg-[#15151a] rounded-lg appearance-none h-1.5 cursor-pointer"
                      />
                    </div>

                    {/* Spacing Tuner slider */}
                    <div className="space-y-2 pt-1">
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>Serpentine Pitch Spacing</span>
                        <span className="font-mono text-white font-bold">{serpentineSpacing}px</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="20"
                        step="1"
                        value={serpentineSpacing}
                        onChange={(e) => setSerpentineSpacing(parseInt(e.target.value))}
                        className="w-full accent-indigo-500 bg-[#15151a] rounded-lg appearance-none h-1.5 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-44 bg-[#15151a] border border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center p-4 text-center">
                  <MousePointerClick className="text-gray-650 mb-2" size={24} />
                  <p className="text-[10px] text-gray-500 max-w-xs leading-relaxed">
                    Click trace lines inside visual workspace directly to solve matching properties or enforce serpentine tuning.
                  </p>
                </div>
              )}

              {/* Matched Nets Checklist */}
              <div className="pt-4 space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Matching checklist summary</label>
                <div className="space-y-1.5">
                  {traceAnalyses.map(analysis => (
                    <div
                      key={analysis.id}
                      onClick={() => setSelectedTraceId(analysis.id)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-[10px] cursor-pointer transition-all ${
                        selectedTraceId === analysis.id 
                          ? 'bg-white/10 border-white/30 text-white font-bold'
                          : 'bg-[#15151a] border-white/5 hover:bg-white/[0.02] text-gray-400 hover:text-white'
                      }`}
                    >
                      <span className="font-mono">{analysis.id} ({analysis.calculatedWidth}mm)</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span>{analysis.impedance}Ω</span>
                        {analysis.isMatched ? (
                          <CheckCircle2 size={12} className="text-emerald-500" />
                        ) : (
                          <AlertTriangle size={12} className="text-amber-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'validation' && (
            <div className="space-y-4">
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-indigo-400" /> Design verification rules
                </h4>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Run physical ERC and advanced DFM simulation suite checks to detect faults (acid traps, copper short risk, annular layout proximity issues).
                </p>
              </div>

              <button
                onClick={runValidation}
                className="w-full flex items-center justify-center gap-2 text-center text-[10px] font-black tracking-widest uppercase py-3 bg-indigo-600 hover:bg-indigo-500 transition-colors rounded-xl text-white shadow-lg shadow-indigo-600/10"
              >
                Assemble Design Report
              </button>

              <div className="bg-[#15151a] border border-white/5 rounded-xl p-4 space-y-3">
                <div className="text-[9px] font-black text-gray-500 uppercase tracking-wider">PROJECT ASSET RETRIEVAL</div>
                
                <button
                  onClick={exportFullProject}
                  className="w-full flex items-center justify-center gap-1.5 py-2 hover:bg-white/5 transition-colors border border-white/10 text-[10px] uppercase font-bold text-white rounded-lg font-mono tracking-wider"
                >
                  <FolderDown size={14} className="text-gray-400" /> Export workspace package (.novacircuit)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Validation modal layout details */}
      {showReportModal && activeReport && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#111116] border border-white/10 rounded-2xl w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <header className="p-4 border-b border-white/5 flex items-center justify-between bg-[#14141c] shrink-0">
              <div>
                <h3 className="text-xs font-black uppercase text-white tracking-widest">NovaCircuit Validation Diagnostic</h3>
                <span className="text-[8.5px] font-mono text-gray-500">{new Date(activeReport.timestamp).toLocaleString()}</span>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="p-1 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-all"
              >
                <XCircularDismiss />
              </button>
            </header>

            {/* Scoreboard and metrics summary */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#15151e] border border-white/5 gap-3">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">Design Verification outcome</div>
                  <div className={`text-lg font-black mt-1 ${
                    activeReport.summary.status === 'APPROVED' ? 'text-emerald-400' : activeReport.summary.status === 'REQUIRES_REVISION' ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {activeReport.summary.status}
                  </div>
                  <p className="text-[10px] mt-0.5 text-gray-500">
                    Errors: {activeReport.summary.totalErrors} | Warnings: {activeReport.summary.totalWarnings}
                  </p>
                </div>
                
                <div className="sm:text-right">
                  <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">Scorecard</div>
                  <div className="text-2xl font-mono font-black text-indigo-400 mt-0.5">
                    {activeReport.summary.score}%
                  </div>
                </div>
              </div>

              {/* Individual tests list */}
              <div className="space-y-3">
                <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">Diagnostic Suite logs</div>
                <div className="space-y-2.5">
                  {activeReport.checks.map((check, index) => (
                    <div key={index} className="bg-[#15151a] border border-white/5 p-4 rounded-xl space-y-1.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] gap-1">
                        <span className="font-bold text-white uppercase tracking-wider leading-tight">{check.ruleName}</span>
                        <div className="flex items-center gap-1.5 font-bold font-mono text-[9px]">
                          <span className="text-gray-500 tracking-wider font-semibold uppercase">{check.category}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[8.5px] ${
                            check.status === 'PASS' 
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : check.status === 'WARNING'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {check.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-relaxed">
                        {check.description}
                      </p>
                      {check.affectedIds.length > 0 && (
                        <div className="text-[8px] font-mono text-indigo-400/80 uppercase">
                          Identifiers: {check.affectedIds.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer containing downloading tools */}
            <footer className="p-4 border-t border-white/5 bg-[#14141d]/70 flex flex-col sm:flex-row gap-2 shrink-0">
              <button
                onClick={downloadReportHTML}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-md"
              >
                <FileDown size={13} /> Download Printable HTML Report
              </button>
              <button
                onClick={() => setShowReportModal(false)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 transition-colors text-gray-300 font-semibold text-[10px] uppercase tracking-wider rounded-lg border border-white/10"
              >
                Dismiss
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

/* Mini Sub-component to dismiss modal */
const XCircularDismiss: React.FC = () => {
  return <XCircle size={18} />;
};
