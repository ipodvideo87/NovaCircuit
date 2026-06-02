import React from 'react';
import { Layers, Sparkles, Cpu, BookOpen, ChevronRight } from 'lucide-react';

interface OnboardingDialogProps {
  onSelect: (level: 'beginner' | 'intermediate' | 'advanced') => void;
}

export const OnboardingDialog: React.FC<OnboardingDialogProps> = ({ onSelect }) => {
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[9999] p-4 backdrop-blur-md animate-fade-in animate-duration-300">
      <div 
        className="bg-[#0f0f15] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header decoration */}
        <div className="bg-gradient-to-tr from-indigo-900 via-indigo-950 to-[#0e0e13] px-8 py-10 relative border-b border-indigo-500/20 shrink-0">
          <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10">
            <Layers size={130} strokeWidth={1} className="text-white" />
          </div>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Layers className="text-white" size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-widest text-white uppercase">NovaCircuit Design Studio</h2>
              <p className="text-[11px] font-mono text-indigo-400 font-semibold tracking-wider uppercase mt-1">Select your experience level</p>
            </div>
          </div>
        </div>

        {/* Content body */}
        <div className="p-8 space-y-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-white/5">
          <p className="text-xs text-gray-400 leading-relaxed max-w-lg mb-2">
            Welcome to the NovaCircuit PCB Suite! We adapt our vocabulary, Copilot intelligence, planning gates, and design guidelines to fit your engineering background.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Beginner */}
            <button
              onClick={() => onSelect('beginner')}
              className="flex flex-col text-left p-5 rounded-xl border border-white/5 bg-[#13131c]/50 hover:bg-[#151522] hover:border-indigo-500/30 transition-all duration-300 hover:scale-[1.02] group focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                <BookOpen size={18} />
              </div>
              <h3 className="text-xs font-black uppercase text-white tracking-widest mb-1.5 flex items-center justify-between w-full">
                Beginner
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all text-indigo-400" />
              </h3>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Never designed a PCB before. Speaks simple, conversational language, asks friendly step-by-step questions, and avoids heavy hardware equations.
              </p>
            </button>

            {/* Intermediate */}
            <button
              onClick={() => onSelect('intermediate')}
              className="flex flex-col text-left p-5 rounded-xl border border-white/5 bg-[#13131c]/50 hover:bg-[#151522] hover:border-indigo-500/30 transition-all duration-300 hover:scale-[1.02] group focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
                <Sparkles size={18} />
              </div>
              <h3 className="text-xs font-black uppercase text-white tracking-widest mb-1.5 flex items-center justify-between w-full">
                Intermediate
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all text-indigo-400" />
              </h3>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Some layout experience. Speaks a balanced hardware vocabulary, identifies crosstalk concerns, and guides line-tuning processes on the layout.
              </p>
            </button>

            {/* Advanced */}
            <button
              onClick={() => onSelect('advanced')}
              className="flex flex-col text-left p-5 rounded-xl border border-white/5 bg-[#13131c]/50 hover:bg-[#151522] hover:border-indigo-500/30 transition-all duration-300 hover:scale-[1.02] group focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            >
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 group-hover:scale-110 transition-transform">
                <Cpu size={18} />
              </div>
              <h3 className="text-xs font-black uppercase text-white tracking-widest mb-1.5 flex items-center justify-between w-full">
                Advanced / Expert
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all text-indigo-400" />
              </h3>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Hardware veteran. Demands intense high-speed formulas, skin-depth parasitics, dielectric loss calculations, and immediate, compact EDA solutions.
              </p>
            </button>
          </div>
        </div>

        {/* Footer info line */}
        <div className="px-8 py-4 bg-[#111119] border-t border-white/5 text-[9px] font-mono text-gray-500 flex justify-between items-center shrink-0">
          <span>You can switch this mode at any time inside the studio header.</span>
          <span>NovaCircuit v1.4.2</span>
        </div>
      </div>
    </div>
  );
};
