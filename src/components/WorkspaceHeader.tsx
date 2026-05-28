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
  HelpCircle,
  Cloud,
  Terminal
} from 'lucide-react';
import { cn } from '../lib/utils';

interface WorkspaceHeaderProps {
  currentView: 'schematic' | 'pcb' | '3d' | 'mfg' | 'observability';
  onViewChange: (view: 'schematic' | 'pcb' | '3d' | 'mfg' | 'observability') => void;
  onOpenShare?: () => void;
  onOpenSettings?: () => void;
  onOpenNewProject?: () => void;
  onOpenCloudVault?: () => void;
  userMode?: string;
  onChangeMode?: (mode: any) => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  currentView,
  onViewChange,
  onOpenShare,
  onOpenSettings,
  onOpenNewProject,
  onOpenCloudVault,
  userMode,
  onChangeMode
}) => {
  const isConnected = useProjectStore(state => state.isConnected);
  const presences = useProjectStore(state => state.presences);
  const multiplayerClient = useProjectStore(state => state.multiplayerClient);

  // Authentication & Subscription state hooks
  const user = useProjectStore(state => state.user);
  const userProfile = useProjectStore(state => state.userProfile);
  const requirePro = useProjectStore(state => state.requirePro);
  const setPricingModalOpen = useProjectStore(state => state.setPricingModalOpen);
  const isSaving = useProjectStore(state => state.isSaving);
  const signIn = useProjectStore(state => state.signIn);
  const signOut = useProjectStore(state => state.signOut);

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

  const handleTabClick = (viewId: any) => {
    if (viewId === 'mfg') {
      const authorized = requirePro('export_manufacturing');
      if (!authorized) return;
    }
    onViewChange(viewId);
  };

  return (
    <header className="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-[#0a0a0c] shrink-0 font-mono text-gray-300 z-50">
      
      {/* Brand logo and room status info */}
      <div className="flex items-center gap-4 overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-purple-500 border border-indigo-400/50 rounded-xl flex items-center justify-center font-black text-white text-base shadow-[0_0_15px_rgba(99,102,241,0.4)]">
            N
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-[11px] text-gray-100 tracking-wider leading-none">NovaCircuit</span>
            <span className="text-[8px] text-gray-500 mt-1 uppercase font-bold tracking-widest">EDA Studio</span>
          </div>
        </div>

        <div className="h-5 w-[1px] bg-white/5 mx-1" />

        {/* User Mode Badge */}
        {userMode && (
          <button
            onClick={() => onChangeMode && onChangeMode(userMode === 'maker' ? 'engineer' : userMode === 'engineer' ? 'studio' : 'maker')}
            title="Click to change mode"
            className={cn(
              "hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-widest cursor-pointer transition-all",
              userMode === 'maker' ? "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20" :
              userMode === 'studio' ? "bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20" :
              "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20"
            )}
          >
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              userMode === 'maker' ? 'bg-amber-400' : userMode === 'studio' ? 'bg-purple-400' : 'bg-indigo-400'
            )} />
            {userMode} mode
          </button>
        )}

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
          { id: 'observability', label: 'Telemetry HUD', icon: <Terminal size={12} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id as any)}
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

        {/* Freemium & Pro subscription status box */}
        <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.02] border border-white/5 rounded-xl text-[10px] shrink-0">
          {user ? (
            <div className="flex items-center gap-2">
              {userProfile?.isAdmin ? (
                <div className="flex items-center gap-1">
                  <span className="py-0.5 px-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded font-black tracking-widest text-[8px] uppercase animate-pulse" title="Developer Unlimited Access Bypass Active">
                    DEV UNLIMITED
                  </span>
                </div>
              ) : userProfile?.isPro ? (
                <div className="flex items-center gap-1">
                  <span className="py-0.5 px-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded font-black tracking-widest text-[8px] uppercase animate-pulse">
                    PRO
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col text-right leading-none gap-0.5">
                    <span className="text-[7.5px] text-amber-500 font-black uppercase tracking-wider">FREE WORKSPACE</span>
                    <span className="text-[8px] text-gray-500 font-extrabold tracking-tighter">
                      {userProfile?.aiActionsThisMonth || 0}/20 CO_ACTS
                    </span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setPricingModalOpen(true)}
                    className="px-1.5 py-0.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-[8px] uppercase tracking-wider rounded transition-all active:scale-95 cursor-pointer"
                  >
                    UPGRADE
                  </button>
                </div>
              )}

              {/* User Avatar Circle */}
              <div 
                title={`${user.email} - Double click to Sign Out`}
                onDoubleClick={() => { if (window.confirm("Do you want to Sign Out?")) signOut(); }}
                className="w-6 h-6 rounded-full overflow-hidden border border-indigo-500/25 flex items-center justify-center cursor-pointer select-none bg-indigo-950/50 font-black text-indigo-300 text-[9px]"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  getInitials(user.displayName || user.email || '??')
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => signIn()}
              className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[8px] uppercase tracking-wider rounded transition-all active:scale-95 cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
        
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
          {isSaving && (
            <div className="flex items-center gap-1.5 text-[8px] md:text-[9px] uppercase tracking-wider text-indigo-400 font-extrabold px-2.5 py-1.5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl animate-pulse">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-600"></span>
              </span>
              <span>Auto-Syncing...</span>
            </div>
          )}
          
          <button 
            onClick={onOpenCloudVault}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#141418] hover:bg-indigo-600/10 hover:text-indigo-400 border border-white/5 rounded-xl text-[9px] font-bold uppercase cursor-pointer text-gray-400 transition-all active:scale-95"
          >
            <Cloud size={11} />
            <span className="hidden md:inline">Cloud Vault</span>
          </button>

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
