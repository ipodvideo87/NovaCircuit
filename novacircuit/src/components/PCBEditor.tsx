/**
 * PCBEditor — Grand Workspace
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  Topbar (logo · net stats · actions)                            │
 *  ├──────────┬──────────────────────────────────────────┬───────────┤
 *  │          │                                          │           │
 *  │ Sidebar  │  Split Canvas                            │ PDN Panel │
 *  │ (tools)  │  SchematicCanvas | PCBCanvas             │ (slide-in)│
 *  │          │                                          │           │
 *  ├──────────┴──────────────────────────────────────────┴───────────┤
 *  │  Status bar · AI chat toggle · DRC summary                      │
 *  └─────────────────────────────────────────────────────────────────┘
 *
 * New: PDN Analyzer panel toggled via toolbar button (Activity icon).
 * Renders as a right-side drawer (380 px wide on desktop, full-width modal on mobile).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Download,
  FileText,
  Grid,
  HelpCircle,
  Info,
  Layers,
  MessageSquare,
  Minus,
  Move,
  MousePointer,
  Package,
  Plus,
  Radio,
  RotateCcw,
  RotateCw,
  Ruler,
  Settings,
  Share2,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
import { useTransactionStore } from '../lib/core/transaction';
import type { PCBBoard, PCBComponent, PCBTrace } from '../types/pcb';
import PCBCanvas from './PCB/PCBCanvas';
import SchematicCanvas from './PCB/SchematicCanvas';
import AboutDialog from './AboutDialog';
import HelpDialog from './HelpDialog';
import OnboardingDialog from './OnboardingDialog';
import PDNAnalyzer from './PDNAnalyzer';

// ─── Tool Definitions ─────────────────────────────────────────────────────────

type ToolId =
  | 'select' | 'move' | 'route' | 'place' | 'measure'
  | 'delete' | 'zoom-in' | 'zoom-out';

interface Tool {
  id: ToolId;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}

const TOOLS: Tool[] = [
  { id: 'select',   icon: <MousePointer size={16} />, label: 'Select',     shortcut: 'V' },
  { id: 'move',     icon: <Move size={16} />,          label: 'Move',       shortcut: 'M' },
  { id: 'route',    icon: <Share2 size={16} />,         label: 'Route Trace',shortcut: 'R' },
  { id: 'place',    icon: <Package size={16} />,        label: 'Place Part', shortcut: 'P' },
  { id: 'measure',  icon: <Ruler size={16} />,          label: 'Measure',    shortcut: 'D' },
  { id: 'delete',   icon: <Trash2 size={16} />,         label: 'Delete',     shortcut: 'X' },
];

// ─── Layer Visibility State ───────────────────────────────────────────────────

interface LayerVisibility {
  copper: boolean;
  ratsnest: boolean;
  silkscreen: boolean;
  courtyard: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

const PCBEditor: React.FC = () => {
  const history = useTransactionStore(s => s.history);
  const currentIndex = useTransactionStore(s => s.currentIndex);
  const commitTransaction = useTransactionStore(s => s.commitTransaction);
  const undo = useTransactionStore(s => s.undo);
  const redo = useTransactionStore(s => s.redo);
  const selectedComponentId = useTransactionStore(s => s.selectedComponentId);
  const selectedTraceId = useTransactionStore(s => s.selectedTraceId);
  const setSelectedComponentId = useTransactionStore(s => s.setSelectedComponentId);
  const experienceLevel = useTransactionStore(s => s.experienceLevel);

  const board = history[currentIndex];

  // ── UI State ──
  const [activeTool, setActiveTool] = useState<ToolId>('select');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSchematic, setShowSchematic] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(!experienceLevel);
  const [showPDNAnalyzer, setShowPDNAnalyzer] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    {
      role: 'ai',
      text: 'NovaCircuit AI Copilot ready. Ask me about your design — impedance targets, decoupling strategy, DRC violations, or routing topology.',
    },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [layers, setLayers] = useState<LayerVisibility>({
    copper: true,
    ratsnest: true,
    silkscreen: true,
    courtyard: false,
  });
  const [zoom, setZoom] = useState(1.0);
  const [statusMessage, setStatusMessage] = useState('Ready');

  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toUpperCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'Z') { e.preventDefault(); undo(); setStatusMessage('Undo'); }
        if (key === 'Y') { e.preventDefault(); redo(); setStatusMessage('Redo'); }
        if (key === 'S') { e.preventDefault(); setStatusMessage('Saved'); }
        return;
      }
      const tool = TOOLS.find(t => t.shortcut === key);
      if (tool) { setActiveTool(tool.id); setStatusMessage(`Tool: ${tool.label}`); }
      if (key === 'ESCAPE') setSelectedComponentId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, setSelectedComponentId]);

  // ── Chat scroll ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Handlers ──
  const handleUndo = useCallback(() => {
    const prev = undo();
    if (prev) setStatusMessage('Undo');
  }, [undo]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (next) setStatusMessage('Redo');
  }, [redo]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedComponentId && !selectedTraceId) return;
    const newBoard: PCBBoard = {
      ...board,
      components: selectedComponentId
        ? board.components.filter(c => c.id !== selectedComponentId)
        : board.components,
      traces: selectedTraceId
        ? board.traces.filter(t => t.id !== selectedTraceId)
        : board.traces,
    };
    commitTransaction(newBoard);
    setStatusMessage('Deleted');
  }, [board, commitTransaction, selectedComponentId, selectedTraceId]);

  const handleChatSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isChatLoading) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setIsChatLoading(true);
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: {
            componentCount: board.components.length,
            traceCount: board.traces.length,
            nets: [...new Set(board.traces.map(t => t.netId))].slice(0, 10),
          },
        }),
      });
      if (!resp.ok) throw new Error('API error');
      const data = await resp.json() as { reply: string };
      setChatMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch {
      setChatMessages(prev => [
        ...prev,
        { role: 'ai', text: 'AI Copilot is offline. Check GEMINI_API_KEY configuration.' },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, board]);

  const toggleLayer = useCallback((key: keyof LayerVisibility) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // DRC summary (lightweight)
  const drcSummary = React.useMemo(() => {
    const violations: string[] = [];
    // Overlapping check (simplified)
    if (board.ratnest.length > 0) {
      violations.push(`${board.ratnest.length} unrouted`);
    }
    return violations;
  }, [board]);

  // ── Render ──
  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0b10] text-gray-200 overflow-hidden">

      {/* ══════════ TOPBAR ══════════ */}
      <div className="
        flex items-center justify-between px-3 py-2
        border-b border-slate-800 bg-slate-900/80 backdrop-blur-md
        flex-shrink-0 z-30
      ">
        {/* Left: Logo + project info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500
              flex items-center justify-center shadow-lg">
              <Cpu size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold text-slate-100 tracking-tight hidden sm:inline">
              NovaCircuit
            </span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <span className="text-xs text-slate-500 font-mono hidden md:inline">
            Untitled Board · {board.components.length} components · {board.traces.length} traces
          </span>
        </div>

        {/* Center: Undo/Redo + View toggles */}
        <div className="flex items-center gap-1">
          <button onClick={handleUndo}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Undo (Ctrl+Z)">
            <RotateCcw size={14} />
          </button>
          <button onClick={handleRedo}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Redo (Ctrl+Y)">
            <RotateCw size={14} />
          </button>

          <div className="w-px h-4 bg-slate-700 mx-1" />

          <button
            onClick={() => setShowSchematic(v => !v)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors
              ${showSchematic ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}
            `}
            title="Toggle schematic view"
          >
            <Grid size={12} />
            <span className="hidden lg:inline">Schematic</span>
          </button>

          {/* PDN Analyzer toggle */}
          <button
            onClick={() => setShowPDNAnalyzer(v => !v)}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all duration-150
              ${showPDNAnalyzer
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }
            `}
            title="Power Distribution Network Analyzer"
          >
            <Activity size={13} className={showPDNAnalyzer ? 'text-cyan-400' : ''} />
            <span className="hidden lg:inline font-medium">PDN Analyzer</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {drcSummary.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-red-900/20
              border border-red-800/40 text-red-400 text-xs mr-1">
              <AlertTriangle size={11} />
              <span className="hidden sm:inline">{drcSummary.join(' · ')}</span>
            </div>
          )}
          <button
            onClick={() => setShowChat(v => !v)}
            className={`
              p-1.5 rounded transition-colors
              ${showChat ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}
            `}
            title="AI Copilot"
          >
            <MessageSquare size={14} />
          </button>
          <button onClick={() => setShowHelp(true)}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Help">
            <HelpCircle size={14} />
          </button>
          <button onClick={() => setShowAbout(true)}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="About">
            <Info size={14} />
          </button>
          <button
            className="
              flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold
              bg-cyan-600 hover:bg-cyan-500 text-white transition-colors ml-1
            "
          >
            <Download size={12} />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* ══════════ MAIN AREA ══════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <div className={`
          flex flex-col flex-shrink-0
          bg-slate-900/60 border-r border-slate-800
          transition-all duration-200
          ${sidebarCollapsed ? 'w-12' : 'w-14'}
        `}>
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="flex items-center justify-center h-8 text-slate-600
              hover:text-slate-400 transition-colors border-b border-slate-800"
          >
            {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>

          {/* Tools */}
          <div className="flex flex-col gap-0.5 py-2 px-1">
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                title={`${tool.label} (${tool.shortcut})`}
                className={`
                  flex flex-col items-center gap-0.5 p-2 rounded transition-all
                  ${activeTool === tool.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                  }
                `}
              >
                {tool.icon}
                {!sidebarCollapsed && (
                  <span className="text-[8px] font-mono text-center leading-tight">
                    {tool.shortcut}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-2 my-1 border-t border-slate-800" />

          {/* Layer toggles */}
          <div className="flex flex-col gap-0.5 py-1 px-1">
            {(Object.keys(layers) as (keyof LayerVisibility)[]).map(key => (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                title={`Toggle ${key} layer`}
                className={`
                  flex flex-col items-center gap-0.5 p-1.5 rounded text-[9px] transition-all
                  ${layers[key]
                    ? 'text-slate-300 bg-slate-800/60'
                    : 'text-slate-600 hover:text-slate-500'
                  }
                `}
              >
                <Layers size={12} />
                {!sidebarCollapsed && (
                  <span className="font-mono capitalize text-center"
                    style={{ fontSize: '7px' }}>
                    {key.slice(0, 4)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Bottom: zoom */}
          <div className="mt-auto flex flex-col gap-0.5 py-2 px-1 border-t border-slate-800">
            <button
              onClick={() => setZoom(z => Math.min(z + 0.25, 4))}
              className="flex items-center justify-center p-1.5 rounded text-slate-500
                hover:text-slate-300 hover:bg-slate-800 transition-colors"
              title="Zoom in"
            >
              <Plus size={13} />
            </button>
            <span className="text-[8px] font-mono text-slate-600 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
              className="flex items-center justify-center p-1.5 rounded text-slate-500
                hover:text-slate-300 hover:bg-slate-800 transition-colors"
              title="Zoom out"
            >
              <Minus size={13} />
            </button>
          </div>
        </div>

        {/* ── Canvas Area ── */}
        <div className="flex flex-1 overflow-hidden relative">

          {/* Split: Schematic + PCB */}
          <div className={`flex flex-1 overflow-hidden ${showSchematic ? 'flex-row' : ''}`}>
            {showSchematic && (
              <div className="flex-1 overflow-hidden border-r border-slate-800/60 min-w-0">
                <SchematicCanvas
                  board={board}
                  activeTool={activeTool}
                  onCommit={commitTransaction}
                />
              </div>
            )}
            <div className={`${showSchematic ? 'flex-1' : 'flex-1'} overflow-hidden min-w-0`}>
              <PCBCanvas
                board={board}
                activeTool={activeTool}
                layerVisibility={layers}
                zoom={zoom}
                onCommit={commitTransaction}
                onStatusMessage={setStatusMessage}
              />
            </div>
          </div>

          {/* AI Chat panel (overlay) */}
          {showChat && (
            <div className="
              absolute bottom-8 right-4 w-80 max-h-96
              bg-slate-900 border border-slate-700 rounded-xl shadow-2xl
              flex flex-col z-20 overflow-hidden
            ">
              <div className="flex items-center justify-between px-3 py-2
                border-b border-slate-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Wand2 size={13} className="text-cyan-400" />
                  <span className="text-xs font-semibold text-slate-200">AI Copilot</span>
                </div>
                <button onClick={() => setShowChat(false)}
                  className="text-slate-500 hover:text-slate-300 transition-colors">
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`text-xs rounded-lg px-3 py-2 ${
                    msg.role === 'user'
                      ? 'bg-cyan-900/30 text-cyan-100 text-right ml-4'
                      : 'bg-slate-800 text-slate-300 mr-4'
                  }`}>
                    {msg.text}
                  </div>
                ))}
                {isChatLoading && (
                  <div className="bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 mr-4
                    animate-pulse">
                    Thinking…
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-700 flex-shrink-0">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                  placeholder="Ask about your design…"
                  className="
                    flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1
                    text-xs text-slate-200 placeholder-slate-600
                    focus:outline-none focus:border-cyan-500
                  "
                />
                <button
                  onClick={handleChatSend}
                  disabled={isChatLoading || !chatInput.trim()}
                  className="
                    p-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                  "
                >
                  <Zap size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── PDN Analyzer Panel ── */}
        {showPDNAnalyzer && (
          <div className="
            flex-shrink-0 w-[400px] xl:w-[440px]
            border-l border-slate-800 overflow-hidden
            flex flex-col
          ">
            <PDNAnalyzer onClose={() => setShowPDNAnalyzer(false)} />
          </div>
        )}
      </div>

      {/* ══════════ STATUS BAR ══════════ */}
      <div className="
        flex items-center justify-between px-3 py-1
        border-t border-slate-800 bg-slate-900/60
        flex-shrink-0 z-30
      ">
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
          <span className="flex items-center gap-1">
            <Check size={10} className="text-emerald-500" />
            {statusMessage}
          </span>
          <span>·</span>
          <span>
            {board.components.length} components
          </span>
          <span>·</span>
          <span>
            {board.traces.length} traces
          </span>
          {selectedComponentId && (
            <>
              <span>·</span>
              <span className="text-cyan-400">
                Selected: {selectedComponentId}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600">
          <span>History: {currentIndex + 1}/{history.length}</span>
          <span>·</span>
          <span>
            {board.traces.filter(t => t.netId === 'vcc-3.3v').length} VCC traces
          </span>
          {showPDNAnalyzer && (
            <>
              <span>·</span>
              <span className="text-cyan-500 flex items-center gap-1">
                <Activity size={9} />
                PDN active
              </span>
            </>
          )}
        </div>
      </div>

      {/* ══════════ DIALOGS ══════════ */}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showOnboarding && (
        <OnboardingDialog onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
};

export default PCBEditor;
