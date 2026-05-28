import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, AlertTriangle, Zap, CheckCircle } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useProjectStore } from '../lib/core/store';

interface AIActionConfirmProps {
  isOpen: boolean;
  prompt: string;
  creditCost: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AIActionConfirm({ isOpen, prompt, creditCost, onConfirm, onCancel }: AIActionConfirmProps) {
  const userProfile = useProjectStore(s => s.userProfile);
  const remaining = userProfile ? (userProfile.isPro || userProfile.isAdmin ? 999 : Math.max(0, 20 - (userProfile.aiActionsThisMonth || 0))) : 20;
  const afterUse = Math.max(0, remaining - creditCost);
  const isLow = remaining <= 5;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative w-full max-w-sm bg-[#0e0e12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex items-center justify-center">
                    <Sparkles size={18} className="text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-white uppercase tracking-tight">Nova AI Action</div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Confirm before running</div>
                  </div>
                </div>
                <button onClick={onCancel} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer">
                  <X size={14} />
                </button>
              </div>

              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 mb-4">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1.5">Your request</div>
                <p className="text-sm text-gray-200 leading-relaxed font-medium line-clamp-3">"{prompt}"</p>
              </div>

              <div className="flex items-center justify-between mb-4 bg-white/[0.02] border border-white/5 rounded-xl p-3">
                <div className="text-center">
                  <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Credits used</div>
                  <div className="text-xl font-black text-white">{creditCost}</div>
                </div>
                <div className="text-gray-700">→</div>
                <div className="text-center">
                  <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Remaining after</div>
                  <div className={cn('text-xl font-black', afterUse <= 3 ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-emerald-400')}>
                    {userProfile?.isPro || userProfile?.isAdmin ? '∞' : afterUse}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Current balance</div>
                  <div className="text-xl font-black text-gray-300">
                    {userProfile?.isPro || userProfile?.isAdmin ? '∞' : remaining}
                  </div>
                </div>
              </div>

              {isLow && !(userProfile?.isPro || userProfile?.isAdmin) && (
                <div className="flex items-start gap-2 mb-4 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-300 leading-relaxed">
                    You're running low on credits. Upgrade to Pro for unlimited AI actions.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 py-2.5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Zap size={12} />
                  Run Action
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
