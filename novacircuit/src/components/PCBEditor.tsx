// ─────────────────────────────────────────────────────────────────────────────
// PCBEditor — Grand Workspace
//
// Primary layout container housing:
//   • Collapsible sidebar
//   • AI Chat console panel
//   • Split-view: SchematicCanvas + PCBCanvas
//   • IPC Stackup Drawer (slide-up) with via cross-sections
//   • Via Toolbar (placement mode)
//   • Via DRC Panel
//   • Via Inspector (for selected via)
//   • PDN Analyzer panel
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  Layers,
  Cpu,
  GitBranch,
  ZapOff,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  DownloadCloud,
  AlertCircle,
  CheckCircle,
  Info,
  HelpCircle,
  Zap,
  Circle,
  Shield,
} from 'lucide-react';

import { useTransactionStore } from '../lib/core/transaction';
import { PCBBoard, ViaType, LayerId, PCBStackup } from '../types/pcb';
import { getDefaultStackup } from '../lib/viaManager';
import { exportBoard }     from '../lib/exporter';

import { PCBCanvas }        from './PCB/PCBCanvas';
import { SchematicCanvas }  from './PCB/SchematicCanvas';
import { StackupDrawer }    from './PCB/StackupDrawer';
import { ViaInspector }     from './PCB/ViaInspector';
import { ViaRenderer }      from './PCB/ViaRenderer';
import { ViaDRCPanel }      from './ViaDRCPanel';
import { ViaToolbar }       from './ViaToolbar';
import { PDNAnalyzer }      from './PDNAnalyzer';
import { AboutDialog }      from './AboutDialog';
import { HelpDialog }       from './HelpDialog';

// ── AI Chat ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const ChatConsole: React.FC<{ board: PCBBoard }> = ({ board }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          boardContext: {
            componentCount: board.components.length,
            traceCount: board.traces.length,
            viaCount: board.vias?.length ?? 0,
            stackup: board.stackup?.preset ?? '4L',
          },
        }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.response ?? 'No response.' },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'AI Copilot unavailable. Check server and API key.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, board]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {messages.length === 0 && (
          <p className="text-white/30 text-center py-8">
            Ask the AI Copilot about your PCB design, via strategy, or impedance matching…
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 max-w-[90%] ${
              m.role === 'user'
                ? 'ml-auto bg-amber-500/15 text-amber-100 border border-amber-500/20'
                : 'bg-white/5 text-white/80 border border-white/8'
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="bg-white/5 text-white/40 rounded-lg px-3 py-2 text-xs border border-white/8 max-w-[80%]">
            <span className="animate-pulse">Thinking…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-white/8 p-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask AI Copilot…"
          className="flex-1 bg-white/5 rounded px-3 py-1.5 text-xs text-white
                     placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-amber-400/30
                     border border-white/10"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 text-xs
                     hover:bg-amber-500/30 transition-colors disabled:opacity-30"
        >
          Send
        </button>
      </div>
    </div>
  );
};

// ── Sidebar Item ──────────────────────────────────────────────────────────────

const SidebarItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string | number;
  badgeColor?: string;
  onClick: () => void;
}> = ({ icon, label, active, badge, badgeColor = 'bg-white/20', onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors
      ${active
        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
        : 'text-white/50 hover:text-white/80 hover:bg-white/5'
      }`}
  >
    <span className="flex-shrink-0">{icon}</span>
    <span className="flex-1 text-left font-medium">{label}</span>
    {badge !== undefined && (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badgeColor} leading-none`}>
        {badge}
      </span>
    )}
  </button>
);

// ── Main PCBEditor ─────────────────────────────────────────────────────────────

type ActivePanel =
  | 'schematic'
  | 'pcb'
  | 'split'
  | 'chat'
  | 'via-drc'
  | 'pdn';

export const PCBEditor: React.FC = () => {
  const store = useTransactionStore();
  const board = store.currentBoard();
  const vias  = board.vias ?? [];
  const stackup = board.stackup ?? getDefaultStackup('4L');

  // ── Layout state ────────────────────────────────────────────────────────────
  const [sidebarOpen,    setSidebarOpen]   = useState(true);
  const [activePanel,    setActivePanel]   = useState<ActivePanel>('split');
  const [stackupOpen,    setStackupOpen]   = useState(false);
  const [showAbout,      setShowAbout]     = useState(false);
  const [showHelp,       setShowHelp]      = useState(false);

  // ── Via placement mode ──────────────────────────────────────────────────────
  const [viaPlacement, setViaPlacement] = useState<{
    active: boolean;
    viaType: ViaType;
    fromLayer: LayerId;
    toLayer: LayerId;
    netId: string;
  }>({
    active:    false,
    viaType:   'through',
    fromLayer: 'F.Cu',
    toLayer:   'B.Cu',
    netId:     'gnd',
  });
  const [showViaToolbar, setShowViaToolbar] = useState(false);

  // ── Selection ───────────────────────────────────────────────────────────────
  const selectedVia = vias.find((v) => v.id === store.selectedViaId) ?? null;

  // ── DRC ─────────────────────────────────────────────────────────────────────
  const [drcRunning, setDRCRunning] = useState(false);

  const runDRC = useCallback(() => {
    setDRCRunning(true);
    // Yield to browser so the spinner renders before computation
    requestAnimationFrame(() => {
      store.runViasDRC();
      setDRCRunning(false);
    });
  }, [store]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    try {
      await exportBoard(board);
    } catch (e) {
      console.error('Export failed', e);
    }
  }, [board]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        setViaPlacement((p) => ({ ...p, active: false }));
        store.setSelectedVia(null);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { store.undo(); e.preventDefault(); }
        if (e.key === 'y') { store.redo(); e.preventDefault(); }
        if (e.key === 's') { handleExport(); e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, handleExport]);

  // ── Via placement activate/deactivate ─────────────────────────────────────
  const activateViaPlacement = useCallback(
    (params: { viaType: ViaType; fromLayer: LayerId; toLayer: LayerId; netId: string }) => {
      setViaPlacement({ active: true, ...params });
    },
    []
  );

  const deactivateViaPlacement = useCallback(() => {
    setViaPlacement((p) => ({ ...p, active: false }));
  }, []);

  // ── DRC badge ─────────────────────────────────────────────────────────────
  const drcBadge = store.viaDRCResult
    ? store.viaDRCResult.errorCount > 0
      ? { label: store.viaDRCResult.errorCount, color: 'bg-red-500/30 text-red-400' }
      : store.viaDRCResult.warningCount > 0
      ? { label: store.viaDRCResult.warningCount, color: 'bg-amber-500/30 text-amber-400' }
      : { label: '✓', color: 'bg-emerald-500/30 text-emerald-400' }
    : undefined;

  return (
    <div className="flex h-screen bg-[#0b0b10] text-white overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <div
        className={`flex flex-col border-r border-white/8 bg-[#0f0f18] transition-all duration-200 flex-shrink-0 ${
          sidebarOpen ? 'w-52' : 'w-12'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-white/8">
          <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Cpu size={13} className="text-amber-400" />
          </div>
          {sidebarOpen && (
            <span className="text-xs font-bold text-white/80 truncate">NovaCircuit</span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-white/30 hover:text-white/70 transition-colors"
          >
            {sidebarOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {sidebarOpen ? (
            <>
              <p className="text-white/25 text-[9px] uppercase tracking-widest px-2 py-1.5">Views</p>
              <SidebarItem icon={<Layers size={13} />} label="Split View"    active={activePanel === 'split'}  onClick={() => setActivePanel('split')}  />
              <SidebarItem icon={<GitBranch size={13} />} label="Schematic"  active={activePanel === 'schematic'} onClick={() => setActivePanel('schematic')} />
              <SidebarItem icon={<Cpu size={13} />}    label="PCB Layout"    active={activePanel === 'pcb'}    onClick={() => setActivePanel('pcb')}    />
              <SidebarItem icon={<MessageSquare size={13} />} label="AI Copilot" active={activePanel === 'chat'} onClick={() => setActivePanel('chat')} />

              <p className="text-white/25 text-[9px] uppercase tracking-widest px-2 py-1.5 mt-2">Analysis</p>
              <SidebarItem
                icon={<Shield size={13} />}
                label="Via DRC"
                active={activePanel === 'via-drc'}
                onClick={() => setActivePanel('via-drc')}
                badge={drcBadge?.label}
                badgeColor={drcBadge?.color}
              />
              <SidebarItem icon={<ZapOff size={13} />} label="PDN Analyzer" active={activePanel === 'pdn'} onClick={() => setActivePanel('pdn')} />

              <p className="text-white/25 text-[9px] uppercase tracking-widest px-2 py-1.5 mt-2">Tools</p>
              <SidebarItem
                icon={<Circle size={13} />}
                label="Place Via"
                active={showViaToolbar}
                onClick={() => setShowViaToolbar(!showViaToolbar)}
                badge={vias.length > 0 ? vias.length : undefined}
                badgeColor="bg-white/15 text-white/50"
              />
              <SidebarItem icon={<Layers size={13} />} label="Stackup" onClick={() => setStackupOpen(true)} />
              <SidebarItem icon={<DownloadCloud size={13} />} label="Export Gerber" onClick={handleExport} />

              <p className="text-white/25 text-[9px] uppercase tracking-widest px-2 py-1.5 mt-2">Help</p>
              <SidebarItem icon={<HelpCircle size={13} />} label="Shortcuts" onClick={() => setShowHelp(true)} />
              <SidebarItem icon={<Info size={13} />}       label="About"     onClick={() => setShowAbout(true)} />
            </>
          ) : (
            // Collapsed icon rail
            <div className="flex flex-col items-center gap-1">
              {[
                { icon: <Layers size={14} />,       tip: 'Split',    action: () => setActivePanel('split')   },
                { icon: <GitBranch size={14} />,    tip: 'Schem.',   action: () => setActivePanel('schematic') },
                { icon: <Cpu size={14} />,          tip: 'PCB',      action: () => setActivePanel('pcb')     },
                { icon: <MessageSquare size={14} />,tip: 'AI',       action: () => setActivePanel('chat')    },
                { icon: <Shield size={14} />,       tip: 'Via DRC',  action: () => setActivePanel('via-drc') },
                { icon: <ZapOff size={14} />,       tip: 'PDN',      action: () => setActivePanel('pdn')     },
                { icon: <Circle size={14} />,       tip: 'Via',      action: () => setShowViaToolbar(!showViaToolbar) },
                { icon: <Layers size={14} />,       tip: 'Stackup',  action: () => setStackupOpen(true)      },
              ].map((item, i) => (
                <button
                  key={i}
                  title={item.tip}
                  onClick={item.action}
                  className="w-8 h-8 flex items-center justify-center rounded text-white/40
                             hover:text-white/80 hover:bg-white/8 transition-colors"
                >
                  {item.icon}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Stackup / undo-redo footer */}
        {sidebarOpen && (
          <div className="p-2 border-t border-white/8 space-y-1">
            <div className="flex gap-1">
              <button
                onClick={() => store.undo()}
                className="flex-1 text-xs text-white/40 hover:text-white/70 py-1 rounded hover:bg-white/5"
                title="Undo (Ctrl+Z)"
              >
                ↩ Undo
              </button>
              <button
                onClick={() => store.redo()}
                className="flex-1 text-xs text-white/40 hover:text-white/70 py-1 rounded hover:bg-white/5"
                title="Redo (Ctrl+Y)"
              >
                Redo ↪
              </button>
            </div>
            <div className="text-[9px] text-white/20 text-center font-mono">
              {board.components.length}C · {board.traces.length}T · {vias.length}V
            </div>
          </div>
        )}
      </div>

      {/* ── Main content area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top toolbar */}
        <div className="h-9 flex items-center gap-2 px-3 border-b border-white/8 bg-[#0f0f18] flex-shrink-0">
          {/* Stackup badge */}
          <button
            onClick={() => setStackupOpen(true)}
            className="flex items-center gap-1.5 text-[10px] text-white/50 hover:text-white/80
                       bg-white/5 border border-white/10 rounded px-2 py-0.5 transition-colors"
          >
            <Layers size={10} />
            {stackup.preset} · {stackup.totalThicknessMm}mm
          </button>

          {/* Via placement active indicator */}
          {viaPlacement.active && (
            <div className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded
                            bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Circle size={9} className="animate-pulse" />
              Placing {viaPlacement.viaType} via · {viaPlacement.fromLayer}→{viaPlacement.toLayer}
              <button onClick={deactivateViaPlacement} className="ml-1 text-amber-400/60 hover:text-amber-400">×</button>
            </div>
          )}

          {/* DRC status chip */}
          {store.viaDRCResult && (
            <button
              onClick={() => setActivePanel('via-drc')}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${
                store.viaDRCResult.errorCount > 0
                  ? 'bg-red-500/10 border-red-500/25 text-red-400'
                  : store.viaDRCResult.warningCount > 0
                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
              }`}
            >
              {store.viaDRCResult.errorCount > 0
                ? <><AlertCircle size={9} /> {store.viaDRCResult.errorCount} DRC err</>
                : store.viaDRCResult.warningCount > 0
                ? <><AlertCircle size={9} /> {store.viaDRCResult.warningCount} warn</>
                : <><CheckCircle size={9} /> DRC pass</>
              }
            </button>
          )}

          <div className="flex-1" />

          {/* Quick action buttons */}
          <button
            onClick={runDRC}
            disabled={drcRunning}
            className="text-[10px] text-white/40 hover:text-white/70 px-2 py-0.5 rounded
                       bg-white/5 border border-white/10 hover:border-white/20 transition-colors
                       disabled:opacity-40"
          >
            {drcRunning ? 'Running…' : 'Run DRC'}
          </button>
          <button
            onClick={handleExport}
            className="text-[10px] text-white/40 hover:text-white/70 px-2 py-0.5 rounded
                       bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
          >
            Export
          </button>
        </div>

        {/* ── Panel area ─────────────────────────────────────────────────────── */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          {/* Canvas panels */}
          <div className="flex-1 min-w-0 flex min-h-0">
            {/* Schematic */}
            {(activePanel === 'schematic' || activePanel === 'split') && (
              <div className={`${activePanel === 'split' ? 'w-1/2 border-r border-white/8' : 'flex-1'} min-h-0`}>
                <SchematicCanvas
                  board={board}
                  selectedComponentId={store.selectedComponentId}
                  onSelectComponent={store.setSelectedComponent}
                />
              </div>
            )}

            {/* PCB canvas */}
            {(activePanel === 'pcb' || activePanel === 'split') && (
              <div className={`${activePanel === 'split' ? 'w-1/2' : 'flex-1'} min-h-0`}>
                <PCBCanvas
                  board={board}
                  selectedComponentId={store.selectedComponentId}
                  selectedTraceId={store.selectedTraceId}
                  selectedViaId={store.selectedViaId}
                  onSelectComponent={store.setSelectedComponent}
                  onSelectTrace={store.setSelectedTrace}
                  onSelectVia={store.setSelectedVia}
                  viaPlacementMode={viaPlacement.active ? viaPlacement.viaType : null}
                  viaPlacementFrom={viaPlacement.fromLayer}
                  viaPlacementTo={viaPlacement.toLayer}
                  viaPlacementNet={viaPlacement.netId}
                />
              </div>
            )}

            {/* AI Chat panel */}
            {activePanel === 'chat' && (
              <div className="flex-1 min-h-0 bg-[#0f0f18]">
                <div className="h-full flex flex-col">
                  <div className="px-4 py-3 border-b border-white/8">
                    <h2 className="text-sm font-semibold text-white/80">AI Copilot</h2>
                    <p className="text-xs text-white/30 mt-0.5">Powered by Gemini</p>
                  </div>
                  <div className="flex-1 min-h-0">
                    <ChatConsole board={board} />
                  </div>
                </div>
              </div>
            )}

            {/* Via DRC panel */}
            {activePanel === 'via-drc' && (
              <div className="flex-1 min-h-0 bg-[#0f0f18] overflow-y-auto">
                <div className="p-4">
                  <ViaDRCPanel
                    drcResult={store.viaDRCResult}
                    vias={vias}
                    onRunDRC={runDRC}
                    onSelectVia={(id) => {
                      store.setSelectedVia(id);
                      setActivePanel('pcb');
                    }}
                    isRunning={drcRunning}
                  />
                </div>
              </div>
            )}

            {/* PDN Analyzer panel */}
            {activePanel === 'pdn' && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PDNAnalyzer board={board} />
              </div>
            )}
          </div>

          {/* ── Via Inspector (right sidebar overlay when via selected) ──────── */}
          {selectedVia && (
            <div className="w-72 flex-shrink-0 border-l border-white/8 bg-[#0f0f18] overflow-y-auto p-3">
              <ViaInspector
                via={selectedVia}
                stackup={stackup}
                onUpdate={store.updateVia}
                onClose={() => store.setSelectedVia(null)}
              />
            </div>
          )}

          {/* ── Via Toolbar (floating) ───────────────────────────────────────── */}
          {showViaToolbar && (
            <div className="absolute bottom-4 right-4 z-30 shadow-2xl">
              <ViaToolbar
                stackup={stackup}
                onActivate={activateViaPlacement}
                onDeactivate={deactivateViaPlacement}
                isActive={viaPlacement.active}
                activeViaType={viaPlacement.active ? viaPlacement.viaType : null}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── IPC Stackup Drawer ─────────────────────────────────────────────── */}
      <StackupDrawer
        stackup={stackup}
        vias={vias}
        onStackupChange={(preset) => store.setStackupPreset(preset)}
        isOpen={stackupOpen}
        onClose={() => setStackupOpen(false)}
      />

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showHelp  && <HelpDialog  onClose={() => setShowHelp(false)}  />}
    </div>
  );
};

export default PCBEditor;
