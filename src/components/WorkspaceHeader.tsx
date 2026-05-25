import React from 'react';
import { useProjectStore } from '../lib/core/store';
import { 
  Users, 
  Wifi, 
  WifiOff, 
  Activity, 
  CircuitBoard, 
  Box, 
  Sliders, 
  Plus, 
  Share2, 
  Settings,
  HelpCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

interface WorkspaceHeaderProps {
  currentView: 'schematic' | 'pcb' | '3d' | 'mfg';
  onViewChange: (view: 'schematic' | 'pcb' | '3d' | 'mfg') => void;
  onOpenShare?: () => void;
  onOpenSettings?: () => void;
  onOpenNewProject?: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  currentView,
  onViewChange,
  onOpenShare,
  onOpenSettings,
  onOpenNewProject
}) => {
  const isConnected = useProjectStore(state => state.isConnected);
  const presences = useProjectStore(state => state.presences);
  const multiplayerClient = useProjectStore(state => state.multiplayerClient);

  // Derive active designer details
  const activeCoDesignersCount = presences.length;

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getUserColor = (userId: string) => {
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#eab308', '#a855f7', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <header className="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-[#0a0a0c] shrink-0 font-mono text-gray-300 z-50">
      
      {/* Brand logo and room status info */}
      <div className="flex items-center gap-4 overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 border border-indigo-400 rounded-xl flex items-center justify-center font-black text-white text-base shadow-[0_0_15px_rgba(79,70,229,0.4)]">
            E
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-[11px] text-gray-100 tracking-wider leading-none">FirstEDA Studio</span>
            <span className="text-[8px] text-gray-500 mt-1 uppercase font-bold tracking-widest">v4.0.0-stable</span>
          </div>
        </div>

        <div className="h-5 w-[1px] bg-white/5 mx-1" />

        {/* Room network status and connection statistics */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-bold uppercase tracking-widest shadow-inner",
            isConnected 
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          )}>
            {isConnected ? (
              <>
                <Wifi size={10} className="animate-pulse" />
                <span>Synced Room</span>
              </>
            ) : (
              <>
                <WifiOff size={10} />
                <span>Offline mode</span>
              </>
            )}
          </div>

          {isConnected && (
            <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/5 px-2 py-0.5 rounded text-[8px] text-gray-400">
              <span className="font-bold uppercase tracking-tighter">Latency:</span>
              <span className="text-emerald-400 font-extrabold">24ms</span>
            </div>
          )}
        </div>
      </div>

      {/* Center view selector tabs containing Manufacturing Export */}
      <div className="hidden sm:flex items-center bg-[#111115] border border-white/5 rounded-xl p-1 gap-1">
        {[
          { id: 'schematic', label: 'Schematic', icon: <CircuitBoard size={12} /> },
          { id: 'pcb', label: 'Board Layout', icon: <Activity size={12} /> },
          { id: '3d', label: '3D Preview', icon: <Box size={12} /> },
          { id: 'mfg', label: 'Manufacturing', icon: <Sliders size={12} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => onViewChange(tab.id as any)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
              currentView === tab.id 
                ? "bg-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.3)] border border-indigo-500" 
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Peer user avatars + operations buttons */}
      <div className="flex items-center gap-3">
        
        {/* Collaborative Indicator Avatars Tray */}
        {isConnected && activeCoDesignersCount > 0 && (
          <div className="flex items-center -space-x-1.5 mr-2">
            {presences.slice(0, 3).map((u) => {
              const borderCol = getUserColor(u.userId);
              return (
                <div 
                  key={u.userId}
                  title={`${u.userName} (${u.role})`}
                  className="group relative w-6 h-6 rounded-full text-[8px] font-black text-white border-2 flex items-center justify-center cursor-help select-none shrink-0"
                  style={{ backgroundColor: `${borderCol}dd`, borderColor: '#0a0a0c' }}
                >
                  {getInitials(u.userName)}
                  
                  {/* Tooltip on hover */}
                  <div className="absolute top-8 right-0 hidden group-hover:block bg-[#0e0e11] border border-white/10 p-2 rounded-xl text-[9px] min-w-[120px] shadow-2xl z-50 leading-relaxed font-sans font-bold">
                    <div className="text-gray-100">{u.userName}</div>
                    <div className="text-gray-500 text-[8px] uppercase tracking-wider mt-0.5">{u.role}</div>
                    {u.activeTraceId && <div className="text-yellow-400 mt-1 text-[7px] font-mono">Routing: {u.activeTraceId}</div>}
                  </div>
                </div>
              );
            })}
            
            {activeCoDesignersCount > 3 && (
              <div className="w-6 h-6 rounded-full bg-neutral-800 text-[8px] font-black border-2 border-[#0a0a0c] flex items-center justify-center text-gray-400 shrink-0">
                +{activeCoDesignersCount - 3}
              </div>
            )}
          </div>
        )}

        {/* Functional header buttons */}
        <div className="flex items-center gap-2">
          
          <button 
            onClick={onOpenNewProject}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#141418] hover:bg-[#1a1a20] border border-white/5 rounded-xl text-[9px] font-bold uppercase cursor-pointer text-gray-400 hover:text-white transition-all active:scale-95"
          >
            <Plus size={11} />
            <span className="hidden md:inline">New block</span>
          </button>

          <button 
            onClick={onOpenShare}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-gray-100 text-black rounded-xl text-[9px] font-black uppercase cursor-pointer transition-all active:scale-95 shadow-md shadow-white/5"
          >
            <Share2 size={11} />
            <span className="hidden md:inline font-black">Share Studio</span>
          </button>

          <button 
            onClick={onOpenSettings}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all cursor-pointer min-h-[30px] min-w-[30px] flex items-center justify-center active:scale-95"
          >
            <Settings size={14} />
          </button>
        </div>

      </div>

    </header>
  );
};
