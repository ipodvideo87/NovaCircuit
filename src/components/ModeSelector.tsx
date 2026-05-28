import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Wrench, Users, ChevronRight, Star, CircuitBoard } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type UserMode = 'maker' | 'engineer' | 'studio';

interface ModeSelectorProps {
  onSelect: (mode: UserMode) => void;
}

const modes = [
  {
    id: 'maker' as UserMode,
    icon: <Star size={28} className="text-amber-400" />,
    label: 'Maker Mode',
    tagline: 'Learn by building',
    description: 'Step-by-step guidance, smart templates, and tooltips at every turn. Perfect if you\'re just getting started with PCB design.',
    color: 'amber',
    border: 'border-amber-500/40',
    glow: 'shadow-amber-500/10',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    cta: 'bg-amber-500 hover:bg-amber-400 text-black',
    features: ['Guided project wizard', 'Contextual tooltips', '20+ starter templates', 'Smart DRC defaults', 'One-click AI suggestions'],
  },
  {
    id: 'engineer' as UserMode,
    icon: <Wrench size={28} className="text-indigo-400" />,
    label: 'Engineer Mode',
    tagline: 'Full power, no limits',
    description: 'Professional routing, constraint-driven DRC, advanced AI design execution, and full multi-layer support. Built for production.',
    color: 'indigo',
    border: 'border-indigo-500/60',
    glow: 'shadow-indigo-500/15',
    badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    cta: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    features: ['Advanced constraint router', 'Full DRC/ERC control', 'Multi-layer up to 8L', 'AI batch execution', 'Direct Gerber/fab export'],
    recommended: true,
  },
  {
    id: 'studio' as UserMode,
    icon: <Users size={28} className="text-purple-400" />,
    label: 'Studio Mode',
    tagline: 'Design together, ship faster',
    description: 'Real-time multiplayer collaboration, BOM cost tracking, transparent credit usage, and team-focused project management.',
    color: 'purple',
    border: 'border-purple-500/40',
    glow: 'shadow-purple-500/10',
    badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    cta: 'bg-purple-600 hover:bg-purple-500 text-white',
    features: ['Live multiplayer editing', 'Team BOM cost tracking', 'Shared credit budgets', 'Link-based sharing', 'Comment & review threads'],
  },
];

export default function ModeSelector({ onSelect }: ModeSelectorProps) {
  const [hoveredMode, setHoveredMode] = useState<UserMode | null>(null);

  return (
    <div className="fixed inset-0 bg-[#050507] flex flex-col items-center justify-center z-50 overflow-y-auto py-8 px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.06)_0%,transparent_60%)]" />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10 relative z-10"
      >
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-purple-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.4)]">
            <CircuitBoard size={24} className="text-white" />
          </div>
          <div className="text-left">
            <div className="text-2xl font-black tracking-tight text-white uppercase">NovaCircuit</div>
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">EDA Studio</div>
          </div>
        </div>

        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-3">
          Choose your workspace
        </h1>
        <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
          Pick the mode that fits how you work. You can switch anytime from the workspace settings.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl relative z-10">
        {modes.map((mode, idx) => (
          <motion.div
            key={mode.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 + 0.2, duration: 0.4 }}
            onMouseEnter={() => setHoveredMode(mode.id)}
            onMouseLeave={() => setHoveredMode(null)}
            className={cn(
              "relative flex flex-col bg-[#0d0d10] border rounded-2xl p-6 transition-all duration-300 cursor-pointer group",
              mode.border,
              mode.recommended ? `shadow-2xl ${mode.glow}` : 'hover:border-white/20',
              hoveredMode === mode.id && `shadow-2xl ${mode.glow}`
            )}
            onClick={() => onSelect(mode.id)}
          >
            {mode.recommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg">
                Most Popular
              </div>
            )}

            <div className="mb-4 flex items-start justify-between">
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', `bg-${mode.color}-500/10`)}>
                {mode.icon}
              </div>
              <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border', mode.badge)}>
                {mode.tagline}
              </span>
            </div>

            <h3 className="text-lg font-black text-white mb-2 tracking-tight">{mode.label}</h3>
            <p className="text-gray-500 text-xs leading-relaxed mb-5">{mode.description}</p>

            <ul className="space-y-2 mb-6 flex-1">
              {mode.features.map((feat, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px] text-gray-400">
                  <span className={cn('w-1 h-1 rounded-full flex-shrink-0', `bg-${mode.color}-400`)} />
                  {feat}
                </li>
              ))}
            </ul>

            <button
              className={cn(
                'w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95',
                mode.cta
              )}
              onClick={(e) => { e.stopPropagation(); onSelect(mode.id); }}
            >
              Enter {mode.label.split(' ')[0]}
              <ChevronRight size={14} />
            </button>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-8 text-[10px] text-gray-600 text-center relative z-10"
      >
        All modes include the full schematic & PCB editor. No features are locked by mode.
      </motion.p>
    </div>
  );
}
