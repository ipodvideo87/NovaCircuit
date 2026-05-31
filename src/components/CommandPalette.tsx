import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, CircuitBoard, RotateCw, Play, FileText, Layers, Download, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { GlobalLibrary } from '../lib/componentLibrary';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionId: string, payload?: any) => void;
}

interface CommandItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  group: string;
  shortcut?: string;
}

export default function CommandPalette({ isOpen, onClose, onSelectAction }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!isOpen) { 
          // Handled by parent to open
        } else {
          onClose();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const allCommands: CommandItem[] = [
    { id: 'rotate_selected', icon: <RotateCw size={14} />, label: 'Rotate Selected Component', group: 'Actions', shortcut: 'R' },
    { id: 'schematic_auto_annotate', icon: <CircuitBoard size={14} />, label: 'Smart Auto-Annotate Schematic', group: 'Tools' },
    { id: 'add_net_label', icon: <Plus size={14} />, label: 'Add Net Label / Flag', group: 'Tools' },
    { id: 'align_left', icon: <Layers size={14} />, label: 'Align Left', group: 'Layout' },
    { id: 'align_top', icon: <Layers size={14} />, label: 'Align Top', group: 'Layout' },
    { id: 'distribute_h', icon: <Layers size={14} />, label: 'Distribute Horizontally', group: 'Layout' },
    { id: 'distribute_v', icon: <Layers size={14} />, label: 'Distribute Vertically', group: 'Layout' },
    { id: 'lock_selection', icon: <RotateCw size={14} />, label: 'Lock/Unlock Component', group: 'Actions' },
    { id: 'mirror_footprint', icon: <RotateCw size={14} />, label: 'Mirror Footprint', group: 'Actions' },
    { id: 'run_erc', icon: <Play size={14} />, label: 'Run Electrical Rule Check', group: 'Tools' },
    { id: 'toggle_layers', icon: <Layers size={14} />, label: 'Toggle Routing Layers', group: 'View', shortcut: 'L' },
    { id: 'open_bom', icon: <FileText size={14} />, label: 'Generate Bill of Materials', group: 'Export', shortcut: 'B' },
    { id: 'export_board', icon: <Download size={14} />, label: 'Export Board File', group: 'Export' },
    { id: 'snapshot_save', icon: <Download size={14} />, label: 'Save Project Snapshot', group: 'Snapshots' },
    { id: 'snapshot_restore', icon: <Layers size={14} />, label: 'Restore Project Snapshot', group: 'Snapshots' },
    { id: 'snapshot_compare', icon: <Layers size={14} />, label: 'Compare Project Snapshot', group: 'Snapshots' },
    { id: 'ai_route_net', icon: <Play size={14} />, label: 'AI: Route Selected Net', group: 'AI Workflow' },
    { id: 'ai_place_decap', icon: <Plus size={14} />, label: 'AI: Place Decoupling Capacitors', group: 'AI Workflow' },
    { id: 'ai_optimize_placement', icon: <RotateCw size={14} />, label: 'AI: Optimize Placement', group: 'AI Workflow' },
    { id: 'ai_detect_floating', icon: <Search size={14} />, label: 'AI: Detect Floating Inputs', group: 'AI Workflow' },
    { id: 'ai_suggest_gnd', icon: <Plus size={14} />, label: 'AI: Suggest Ground Pours', group: 'AI Workflow' },
  ];

  // Dynamically add library components
  const libraryItems = GlobalLibrary.searchComponents(query);
  const partCommands = libraryItems.map(item => ({
    id: `place_${item.partNumber}`,
    icon: <Plus size={14} />,
    label: `Place ${item.partNumber} - ${item.metadata.description}`,
    group: 'Components',
    payload: item, 
  }));

  const filteredCommands = [...allCommands, ...partCommands].filter(c => 
    c.label.toLowerCase().includes(query.toLowerCase()) || 
    c.group.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50);

  const groups = Array.from(new Set(filteredCommands.map(c => c.group)));

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
          >
            <div className="flex items-center px-4 py-4 border-b border-white/10">
              <Search className="text-gray-500 mr-3" size={20} />
              <input 
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands, parts, or actions... (Esc to close)"
                className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500 text-lg"
              />
              <div className="flex items-center gap-1">
                 <kbd className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-gray-500 border border-white/5">ESC</kbd>
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 p-2 space-y-4 min-h-[300px]">
              {groups.map(group => (
                <div key={group}>
                   <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-600 mb-1">
                     {group}
                   </div>
                   {filteredCommands.filter(c => c.group === group).map(cmd => (
                     <button
                       key={cmd.id}
                       onClick={() => {
                         onSelectAction(cmd.id, (cmd as any).payload);
                         onClose();
                       }}
                       className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-indigo-500/20 text-gray-300 hover:text-indigo-300 transition-colors cursor-pointer group text-left min-h-[44px]"
                     >
                       <div className="flex items-center gap-3">
                         <div className="text-gray-500 group-hover:text-indigo-400">{cmd.icon}</div>
                         <span className="text-sm font-medium">{cmd.label}</span>
                       </div>
                       {('shortcut' in cmd) && (cmd as any).shortcut && (
                         <kbd className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-gray-500 border border-white/5 group-hover:border-indigo-500/30">
                           {(cmd as any).shortcut}
                         </kbd>
                       )}
                     </button>
                   ))}
                </div>
              ))}
              
              {filteredCommands.length === 0 && (
                <div className="py-12 text-center text-gray-500 flex flex-col items-center">
                  <CircuitBoard className="mb-4 opacity-50" size={32} />
                  <p className="text-sm font-medium">No commands found for "{query}"</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
