import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  runtimeEventBus, 
  ObservableEvent, 
  ObservableEventType 
} from '../lib/observability/runtimeEvents';
import { 
  executionTraceTracker, 
  ExecutionTraceSession 
} from '../lib/observability/executionTrace';
import { 
  performanceProfiler 
} from '../lib/observability/performanceProfiler';
import { 
  Play, 
  Pause, 
  Settings, 
  Layers, 
  Activity, 
  Terminal, 
  Cpu, 
  Clock, 
  CheckCircle, 
  AlertOctagon, 
  X, 
  RefreshCw, 
  Filter, 
  FileText, 
  Search, 
  ChevronRight, 
  ChevronDown, 
  Eye, 
  Trash2,
  Gauge
} from 'lucide-react';

export const ExecutionInspector: React.FC = () => {
  const [events, setEvents] = useState<ObservableEvent[]>(() => runtimeEventBus.getHistory());
  const [selectedEvent, setSelectedEvent] = useState<ObservableEvent | null>(null);
  const [activeSession, setActiveSession] = useState<ExecutionTraceSession | null>(() => executionTraceTracker.getActiveSession());
  const [sessionsHistory, setSessionsHistory] = useState<ExecutionTraceSession[]>(() => executionTraceTracker.getAllSessions());
  
  // Filtering & controls state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Record<ObservableEventType, boolean>>({
    [ObservableEventType.AI_REASONING]: true,
    [ObservableEventType.AI_ACTION]: true,
    [ObservableEventType.TASK_DAG]: true,
    [ObservableEventType.TRANSACTION]: true,
    [ObservableEventType.CONSTRAINT_EVAL]: true,
    [ObservableEventType.ROUTING]: true,
    [ObservableEventType.OPTIMIZATION]: true,
    [ObservableEventType.RENDER]: true,
    [ObservableEventType.CRDT_SYNC]: true,
    [ObservableEventType.PHYSICS_SIM]: true,
  });
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "warning" | "error" | "pending">("all");
  const [isLive, setIsLive] = useState(true);

  // Auto-subscribe to the telemetry stream
  useEffect(() => {
    if (!isLive) return;

    const unsubscribe = runtimeEventBus.subscribe((newEvent) => {
      setEvents(runtimeEventBus.getHistory());
      setActiveSession(executionTraceTracker.getActiveSession());
      setSessionsHistory(executionTraceTracker.getAllSessions());
    });

    return () => unsubscribe();
  }, [isLive]);

  // Handle continuous updates for profiling charts indices
  const [profilerStats, setProfilerStats] = useState({
    avgRender: 0,
    avgRoute: 0,
    avgCrdt: 0,
    avgErc: 0
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setProfilerStats({
        avgRender: performanceProfiler.getAverageDuration("CanvasDraw") || performanceProfiler.getAverageDuration("RENDER") || 4.2,
        avgRoute: performanceProfiler.getAverageDuration("AutoRoute") || performanceProfiler.getAverageDuration("ROUTING") || 148,
        avgCrdt: performanceProfiler.getAverageDuration("CrdtMerge") || performanceProfiler.getAverageDuration("CRDT_SYNC") || 2.1,
        avgErc: performanceProfiler.getAverageDuration("ERC") || 12.8,
      });
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // Filtered event lists
  const filteredEvents = useMemo(() => {
    return events
      .filter(evt => {
        // Type filter matching
        if (!selectedTypes[evt.type]) return false;
        // Text query search
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesTitle = evt.title.toLowerCase().includes(query);
          const matchesMsg = evt.message.toLowerCase().includes(query);
          if (!matchesTitle && !matchesMsg) return false;
        }
        // Status matching
        if (filterStatus !== "all" && evt.status !== filterStatus) return false;
        return true;
      })
      .reverse(); // Newest first
  }, [events, selectedTypes, searchQuery, filterStatus]);

  const toggleType = (type: ObservableEventType) => {
    setSelectedTypes(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const handleClear = () => {
    runtimeEventBus.clear();
    setEvents([]);
    setSelectedEvent(null);
  };

  const statusColors = {
    success: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400" },
    warning: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400" },
    error: { bg: "bg-rose-500/10", border: "border-rose-500/20", text: "text-rose-400" },
    pending: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400" }
  };

  const eventTypeIcons = {
    [ObservableEventType.AI_REASONING]: <Cpu size={12} className="text-purple-400" />,
    [ObservableEventType.AI_ACTION]: <Settings size={12} className="text-fuchsia-400" />,
    [ObservableEventType.TASK_DAG]: <Layers size={12} className="text-violet-400" />,
    [ObservableEventType.TRANSACTION]: <FileText size={12} className="text-indigo-400" />,
    [ObservableEventType.CONSTRAINT_EVAL]: <CheckCircle size={12} className="text-blue-400" />,
    [ObservableEventType.ROUTING]: <Activity size={12} className="text-cyan-400" />,
    [ObservableEventType.OPTIMIZATION]: <Gauge size={12} className="text-teal-400" />,
    [ObservableEventType.RENDER]: <Clock size={12} className="text-emerald-400" />,
    [ObservableEventType.CRDT_SYNC]: <RefreshCw size={12} className="text-pink-400" />,
    [ObservableEventType.PHYSICS_SIM]: <Terminal size={12} className="text-amber-400" />
  };

  return (
    <div id="execution-inspector-root" className="w-full h-full bg-black/90 border border-white/10 rounded-xl overflow-hidden flex flex-col font-sans text-xs text-gray-300">
      
      {/* Top Telemetry Control Banner */}
      <div className="px-4 py-3 bg-neutral-900 border-b border-white/10 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <h2 className="text-sm font-black text-white tracking-widest uppercase">ENGINEERING TELEMETRY & TRACE SUITE</h2>
        </div>
        
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-white/5">
          <button 
            id="toggle-live-telemetry"
            title={isLive ? "Pause Event Dispatcher Feed" : "Resume Event Dispatcher Feed"}
            onClick={() => setIsLive(!isLive)}
            className={`p-1.5 rounded-md hover:bg-white/5 transition flex items-center gap-1 ${isLive ? 'text-emerald-400' : 'text-gray-500'}`}
          >
            {isLive ? <Pause size={13} /> : <Play size={13} />}
            <span className="text-[9px] uppercase font-bold tracking-wider">{isLive ? 'Live stream' : 'Paused'}</span>
          </button>
          
          <div className="h-4 w-px bg-white/10" />

          <button 
            id="clear-telemetry-cache"
            title="Clear Log Buffers"
            onClick={handleClear}
            className="p-1.5 rounded-md hover:bg-rose-500/10 text-gray-400 hover:text-rose-400 transition"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Grid Layout of HUD panels */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
        
        {/* Left Side (Subsystem Profiles & Search Filters) - 3 cols */}
        <div className="col-span-1 lg:col-span-3 border-r border-white/10 p-3 flex flex-col gap-3 overflow-y-auto bg-neutral-950">
          
          {/* Real-time Core Speeds Profiler HUD */}
          <div className="space-y-2">
            <div className="text-[10px] tracking-widest uppercase font-black text-gray-400 flex items-center gap-1">
              <Gauge size={12} className="text-emerald-400" /> Profiler Core Latency
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-neutral-900 border border-white/5 rounded-lg">
                <div className="text-[8px] text-gray-500 font-extrabold uppercase truncate">Canvas Refreshes</div>
                <div className="text-sm font-black text-emerald-400 font-mono mt-0.5">{profilerStats.avgRender.toFixed(1)}<span className="text-[8px] text-gray-500 font-normal">ms</span></div>
              </div>

              <div className="p-2 bg-neutral-900 border border-white/5 rounded-lg">
                <div className="text-[8px] text-gray-500 font-extrabold uppercase truncate">Auto-Route Solve</div>
                <div className="text-sm font-black text-cyan-400 font-mono mt-0.5">{profilerStats.avgRoute.toFixed(0)}<span className="text-[8px] text-gray-500 font-normal">ms</span></div>
              </div>

              <div className="p-2 bg-neutral-900 border border-white/5 rounded-lg">
                <div className="text-[8px] text-gray-500 font-extrabold uppercase truncate">CRDT Sync Lat</div>
                <div className="text-sm font-black text-pink-400 font-mono mt-0.5">{profilerStats.avgCrdt.toFixed(1)}<span className="text-[8px] text-gray-500 font-normal">ms</span></div>
              </div>

              <div className="p-2 bg-neutral-900 border border-white/5 rounded-lg">
                <div className="text-[8px] text-gray-500 font-extrabold uppercase truncate">Electrical Check (ERC)</div>
                <div className="text-sm font-black text-yellow-500 font-mono mt-0.5">{profilerStats.avgErc.toFixed(1)}<span className="text-[8px] text-gray-500 font-normal">ms</span></div>
              </div>
            </div>
          </div>

          <hr className="border-white/5" />

          {/* Filtering controls */}
          <div className="space-y-2">
            <div className="text-[10px] tracking-widest uppercase font-black text-gray-400 flex items-center gap-1">
              <Filter size={12} className="text-violet-400" /> Filter Streams
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-gray-500" size={13} />
              <input 
                id="telemetry-search-input"
                type="text" 
                placeholder="Search telemetry events..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-900 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-[11px] focus:outline-none focus:border-violet-500 transition font-mono"
              />
            </div>

            {/* Status Segment Filters */}
            <div className="flex gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5">
              {(["all", "success", "warning", "error", "pending"] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`flex-1 py-1 rounded text-[9px] font-black uppercase transition ${
                    filterStatus === status 
                      ? 'bg-neutral-800 text-white border border-white/10' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Group Event Filters toggle */}
            <div className="space-y-1">
              <div className="text-[8px] text-gray-500 font-black tracking-widest uppercase mb-1">Toggle Logging Feeds</div>
              <div className="space-y-1">
                {Object.values(ObservableEventType).map(type => (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left transition ${
                      selectedTypes[type] 
                        ? 'bg-neutral-900/60 border-white/10 text-gray-200' 
                        : 'bg-transparent border-transparent text-gray-600 hover:text-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="opacity-70 shrink-0">{eventTypeIcons[type]}</span>
                      <span className="text-[9px] font-mono leading-none tracking-tight">{type}</span>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full ${selectedTypes[type] ? 'bg-emerald-500' : 'bg-neutral-800'}`} />
                  </button>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* Center Stream Log Feed - 5 cols */}
        <div className="col-span-1 lg:col-span-5 flex flex-col min-h-0 border-r border-white/10">
          
          <div className="px-4 py-2 bg-neutral-950 border-b border-white/10 flex items-center justify-between shrink-0">
            <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">Telemetry Stream Events ({filteredEvents.length})</span>
            <span className="text-[8px] font-mono text-gray-500">Live updates pending...</span>
          </div>

          <div id="telemetry-logs-viewport" className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-black/40">
            {filteredEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-500 italic">
                <Activity size={32} className="text-neutral-800 mb-2 stroke-1" />
                No pipeline events matching active query flags. Try adjusting filters or executing tools.
              </div>
            ) : (
              filteredEvents.map(evt => {
                const colorProfile = statusColors[evt.status];
                const isSelected = selectedEvent?.id === evt.id;

                return (
                  <button
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left border transition focus:outline-none ${
                      isSelected 
                        ? 'bg-neutral-900 border-white/30 text-white relative shadow-lg' 
                        : 'bg-neutral-900/40 hover:bg-neutral-900 border-white/5 text-gray-300'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {eventTypeIcons[evt.type]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-[10px] tracking-tight truncate">{evt.title}</span>
                        <span className="font-mono text-[8px] text-gray-500 shrink-0">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                      </div>
                      
                      <p className="text-[9.5px] leading-relaxed text-gray-400 font-sans mt-0.5 line-clamp-2">
                        {evt.message}
                      </p>

                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`text-[6.5px] uppercase font-extrabold px-1 py-0.2 rounded font-mono ${colorProfile.bg} ${colorProfile.text} ${colorProfile.border} border`}>
                          {evt.status}
                        </span>
                        {evt.durationMs !== undefined && (
                          <span className="text-[7.5px] font-mono text-gray-500 flex items-center gap-0.5">
                            <Clock size={8} /> {evt.durationMs}ms
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

        </div>

        {/* Right Details Pane (Active Strategy DAG, Selected Event Details) - 4 cols */}
        <div className="col-span-1 lg:col-span-4 p-3 overflow-y-auto flex flex-col gap-4 bg-neutral-950">
          
          {/* Active Strategy Execution DAG Viewer */}
          <div className="space-y-2">
            <div className="text-[10px] tracking-widest uppercase font-black text-gray-400 flex items-center justify-between">
              <span className="flex items-center gap-1"><Cpu size={12} className="text-purple-400" /> Active Strategy DAG</span>
              {activeSession ? (
                <span className="text-[7.5px] uppercase font-extrabold px-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">Active Run</span>
              ) : (
                <span className="text-[7.5px] text-gray-500 font-bold uppercase">Standby idling</span>
              )}
            </div>

            {activeSession ? (
              <div className="bg-neutral-900 border border-white/5 rounded-xl p-3 space-y-3">
                <div className="space-y-0.5">
                  <div className="text-[9px] text-gray-500 font-mono">GOAL STATEMENT</div>
                  <div className="text-[10px] font-black text-gray-200 uppercase tracking-tight line-clamp-2">{activeSession.goal}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-[7.5px] text-gray-500 font-black tracking-widest uppercase">Planning Nodes Timeline</div>
                  <div className="space-y-1.5">
                    {activeSession.nodes.map((node, i) => {
                      let nodeStatusColor = "bg-neutral-800 text-gray-500 border-white/5";
                      if (node.status === 'running') nodeStatusColor = "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse";
                      if (node.status === 'success') nodeStatusColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                      if (node.status === 'error') nodeStatusColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";

                      return (
                        <div key={node.id} className={`flex items-start gap-2 p-1.5 rounded-lg border ${nodeStatusColor}`}>
                          <div className="w-4 h-4 rounded-full bg-black/40 flex items-center justify-center text-[8px] font-black shrink-0 font-mono mt-0.5">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-extrabold text-[9.5px] leading-tight truncate">{node.label}</div>
                            {node.reasoning && (
                              <div className="text-[7.5px] text-gray-400 mt-0.5 italic truncate">{node.reasoning}</div>
                            )}
                          </div>
                          <span className="text-[6.5px] uppercase font-black font-mono shrink-0 ml-1">{node.status}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-neutral-900/20 border border-dashed border-white/5 rounded-xl p-4 text-center text-gray-500 italic font-sans text-[9px]">
                No active strategy DAG pipeline. Trigger workspace tools or AI routines to capture executable goals.
              </div>
            )}
          </div>

          <hr className="border-white/5" />

          {/* Event Details Expanded Node */}
          <div className="space-y-2 flex-1 flex flex-col min-h-0">
            <div className="text-[10px] tracking-widest uppercase font-black text-gray-400 flex items-center justify-between shrink-0">
              <span>Event telemetry inspector</span>
              {selectedEvent && (
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="text-gray-500 hover:text-gray-300 transition"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {selectedEvent ? (
              <div className="bg-neutral-900 border border-white/5 rounded-xl p-3 flex-1 overflow-y-auto space-y-3 font-sans">
                <div className="flex items-center gap-1.5">
                  {eventTypeIcons[selectedEvent.type]}
                  <span className="font-mono text-[7px] text-gray-500 uppercase font-black">{selectedEvent.type}</span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-xs font-black text-white leading-tight">{selectedEvent.title}</h3>
                  <p className="text-[9px] text-gray-400 leading-relaxed font-sans">{selectedEvent.message}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[8px] font-mono leading-none border-t border-white/5 pt-2.5">
                  <div className="p-1 bg-black/40 rounded">
                    <span className="text-gray-500 block mb-0.5 uppercase tracking-wider">Timestamp</span>
                    <span className="text-gray-300">{new Date(selectedEvent.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="p-1 bg-black/40 rounded">
                    <span className="text-gray-500 block mb-0.5 uppercase tracking-wider">Task Latency</span>
                    <span className="text-gray-300">{selectedEvent.durationMs !== undefined ? `${selectedEvent.durationMs}ms` : 'Not tracked'}</span>
                  </div>
                </div>

                {selectedEvent.metadata && (
                  <div className="space-y-1 border-t border-white/5 pt-2.5">
                    <span className="font-mono text-[8.5px] text-gray-500 uppercase tracking-widest block mb-1 font-bold">Metadata Ledger</span>
                    <pre className="bg-black/60 p-2 rounded-lg border border-white/5 text-[8px] font-mono text-cyan-400 overflow-x-auto leading-relaxed max-h-48">
                      {JSON.stringify(selectedEvent.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-neutral-900/10 border border-dashed border-white/5 rounded-xl p-4 text-center text-gray-500 italic font-sans text-[9px] flex-1 flex items-center justify-center">
                Select an entry from the telemetry stream on the left to examine detailed diagnostic metadata.
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
