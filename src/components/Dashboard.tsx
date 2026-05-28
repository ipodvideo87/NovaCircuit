import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Clock, 
  Star, 
  Users, 
  LayoutGrid, 
  List, 
  MoreHorizontal, 
  Bell, 
  Menu,
  ChevronRight,
  Folder,
  Shield,
  CreditCard,
  Settings,
  Globe,
  Share2,
  Brain
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface Project {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  isStarred: boolean;
  team: string;
  thumbnail: string;
}

const mockProjects: Project[] = [
  {
    id: '1',
    name: 'IoT Sensor Core',
    description: 'Main board for environmental monitoring',
    updatedAt: '2 hours ago',
    isStarred: true,
    team: 'Hardware Engineering',
    thumbnail: 'https://picsum.photos/seed/pcb1/400/300'
  },
  {
    id: '2',
    name: 'Battery Management System',
    description: 'Safety circuit for Li-on packs',
    updatedAt: 'Yesterday',
    isStarred: false,
    team: 'Energy Team',
    thumbnail: 'https://picsum.photos/seed/pcb2/400/300'
  },
  {
    id: '3',
    name: 'Display Driver Adapter',
    description: 'Interface board for vintage CRT',
    updatedAt: '3 days ago',
    isStarred: true,
    team: 'Personal',
    thumbnail: 'https://picsum.photos/seed/pcb3/400/300'
  },
  {
    id: '4',
    name: 'USB-C Power Sink',
    description: 'PD trigger for lab equipment',
    updatedAt: '1 week ago',
    isStarred: false,
    team: 'Personal',
    thumbnail: 'https://picsum.photos/seed/pcb4/400/300'
  }
];

export default function Dashboard({ 
  onOpenProject, 
  onOpenAILab, 
  activeTab = 'recent' 
}: { 
  onOpenProject: (id: string) => void;
  onOpenAILab: () => void;
  activeTab?: string;
}) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] bg-[#0a0a0a] text-gray-200 overflow-hidden font-sans relative">
      {/* Mobile Sidebar Toggle */}
      <button 
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-[100] p-2 bg-[#0d0d0d] border border-white/10 rounded-lg text-gray-400 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
      >
        <Menu size={20} />
      </button>

      {/* Main Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 border-r border-white/10 flex flex-col bg-[#0d0d0d] transition-transform lg:relative lg:translate-x-0 shrink-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-purple-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">N</div>
              <span className="font-black text-lg tracking-tight uppercase">NovaCircuit</span>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              <Menu size={20} />
            </button>
          </div>

          <button 
            onClick={() => onOpenProject('new')}
            className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 py-3 min-h-[44px] rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all mb-8 shadow-xl active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            New Project
          </button>

          <nav className="space-y-1">
            {[
              { icon: <Clock size={18} />, label: 'Recent', active: activeTab === 'recent' },
              { icon: <Star size={18} />, label: 'Starred', active: activeTab === 'starred' },
              { icon: <Brain size={18} />, label: 'AI Lab', active: activeTab === 'ailab' },
              { icon: <Folder size={18} />, label: 'Drafts', active: activeTab === 'drafts' },
              { icon: <Users size={18} />, label: 'Shared with me', active: activeTab === 'shared' },
              { icon: <Globe size={18} />, label: 'Public', active: activeTab === 'public' },
            ].map((item) => (
              <button 
                key={item.label}
                onClick={() => {
                  if (item.label === 'AI Lab') onOpenAILab();
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg text-sm transition-colors cursor-pointer",
                  item.active ? "bg-white/5 text-white font-medium" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-10">
            <div className="flex items-center justify-between px-3 mb-4">
              <span className="text-[10px] uppercase font-bold text-gray-600 tracking-widest">Teams</span>
              <button onClick={() => alert("INFO: Team creation coming in next release.")} className="min-w-[44px] min-h-[44px] flex items-center justify-end text-gray-600 hover:text-white cursor-pointer -mr-2"><Plus size={14} /></button>
            </div>
            <div className="space-y-1">
                {[
                  { name: 'Hardware Eng', color: 'bg-indigo-500' },
                  { name: 'Core OS', color: 'bg-purple-500' },
                  { name: 'Energy', color: 'bg-amber-500' }
                ].map(team => (
                  <button onClick={() => alert(`INFO: Switched workspace context to ${team.name}`)} key={team.name} className="w-full flex items-center justify-between px-3 py-2 min-h-[44px] text-sm text-gray-400 hover:text-white transition-colors group cursor-pointer">
                    <div className="flex items-center gap-3">
                       <div className={cn("w-2 h-2 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]", team.color)} />
                       {team.name}
                    </div>
                    <ChevronRight size={14} className="text-gray-800 group-hover:text-gray-600" />
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="mt-auto p-6 space-y-1 border-t border-white/10">
           <button onClick={() => alert("INFO: Billing preview not available.")} className="w-full flex items-center gap-3 px-3 py-2 min-h-[44px] text-sm text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">
              <CreditCard size={18} />
              Billing
           </button>
           <button onClick={() => alert("INFO: General settings not available.")} className="w-full flex items-center gap-3 px-3 py-2 min-h-[44px] text-sm text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">
              <Settings size={18} />
              Settings
           </button>
           <div className="flex items-center gap-3 px-3 py-4 mt-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-xs text-white">JS</div>
              <div className="flex flex-col">
                <span className="text-sm font-medium leading-none text-white">John Smith</span>
                <span className="text-[10px] text-gray-500">designer@novacircuit.io</span>
              </div>
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a] min-w-0">
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-4 md:px-8 sticky top-0 bg-[#0a0a0a]/80 backdrop-blur z-10">
           <div className="flex items-center gap-4 flex-1 max-w-xl ml-12 lg:ml-0">
             <div className="relative w-full">
               <Search size={18} className="absolute left-3 top-2.5 text-gray-600" />
               <input 
                 type="text" 
                 placeholder="Search documents..." 
                 className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-indigo-600 transition-all font-medium text-white placeholder:text-gray-700"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
               />
             </div>
           </div>

           <div className="hidden sm:flex items-center gap-4 shrink-0">
             <button onClick={() => alert("INFO: No new notifications.")} className="p-2 min-w-[44px] min-h-[44px] flex justify-center items-center text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
               <Bell size={20} />
             </button>
             <button onClick={() => alert("INFO: Upgrades disabled in preview.")} className="px-4 py-1.5 min-h-[44px] border border-zinc-800 hover:border-zinc-700 rounded-lg text-sm font-medium transition-all cursor-pointer">
               Upgrade
             </button>
           </div>
        </header>

        <div className="p-4 md:p-10 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 text-white uppercase italic">Generation Gallery</h1>
              <p className="text-gray-600 text-xs font-bold uppercase tracking-widest pl-1">Hardware design pool • {mockProjects.length} active units</p>
            </div>
            
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10 self-start md:self-center">
               <button 
                 onClick={() => setViewMode('grid')}
                 className={cn(
                   "p-1.5 rounded-lg transition-all",
                   viewMode === 'grid' ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
                 )}
               >
                 <LayoutGrid size={18} />
               </button>
               <button 
                 onClick={() => setViewMode('list')}
                 className={cn(
                   "p-1.5 rounded-lg transition-all",
                   viewMode === 'list' ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
                 )}
               >
                 <List size={18} />
               </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {mockProjects.map((project, idx) => (
              <motion.div 
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => onOpenProject(project.id)}
                className="group relative bg-[#0d0d0d] border border-white/10 rounded-2xl overflow-hidden hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all cursor-pointer flex flex-col"
              >
                <div className="h-48 w-full relative bg-zinc-900">
                   <img 
                    src={project.thumbnail} 
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" 
                    alt={project.name}
                    referrerPolicy="no-referrer"
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
                   {project.isStarred && (
                     <div className="absolute top-3 right-3 p-1.5 bg-white/10 backdrop-blur rounded-full text-indigo-400">
                       <Star size={14} fill="currentColor" />
                     </div>
                   )}
                </div>
                
                <div className="p-5 flex-1 flex flex-col">
                   <div className="flex items-start justify-between mb-1">
                     <h3 className="font-bold text-lg leading-tight group-hover:text-indigo-400 transition-colors text-white">{project.name}</h3>
                     <button onClick={(e) => { e.stopPropagation(); alert("INFO: Context menu coming soon.")}} className="p-1 opacity-0 group-hover:opacity-100 transition-opacity min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 -mt-2">
                        <MoreHorizontal size={18} className="text-gray-500 hover:text-white" />
                     </button>
                   </div>
                   <p className="text-gray-500 text-sm line-clamp-1 mb-4">{project.description}</p>
                   
                   <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users size={12} className="text-gray-600" />
                        <span className="text-[10px] uppercase font-bold text-gray-600 tracking-wider">
                          {project.team}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-600 font-mono italic">
                        {project.updatedAt}
                      </span>
                   </div>
                </div>
              </motion.div>
            ))}
            
            {/* New Project Outline */}
            <button onClick={() => onOpenProject('new')} className="border-2 border-dashed border-white/5 hover:border-white/10 rounded-2xl flex flex-col items-center justify-center p-8 gap-4 group transition-all cursor-pointer h-[320px]">
               <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-600 group-hover:scale-110 group-hover:bg-white/10 group-hover:text-white transition-all">
                  <Plus size={24} />
               </div>
               <div className="text-center">
                  <span className="block font-bold text-gray-400 group-hover:text-white transition-colors">Start New Creation</span>
                  <span className="text-xs text-gray-600">Explore the latest models</span>
               </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
