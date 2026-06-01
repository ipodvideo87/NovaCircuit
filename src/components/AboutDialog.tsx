import React from 'react';
import { Layers, Heart } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export const AboutDialog: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-[#0f0f15] border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modern decorative banner */}
        <div className="bg-gradient-to-tr from-indigo-900 via-indigo-950 to-[#0e0e13] px-6 py-8 relative border-b border-indigo-500/20 shrink-0">
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10">
            <Layers size={96} strokeWidth={1} className="text-white" />
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Layers className="text-white" size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-widest text-white uppercase">NovaCircuit</h2>
              <p className="text-[10px] font-mono text-indigo-400 font-semibold tracking-wider uppercase">Advanced EDA CAD Layout Suite</p>
            </div>
          </div>
        </div>

        {/* Dynamic version credentials list */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-white/5">
          <div className="space-y-1.5 border-b border-white/5 pb-4">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 font-mono text-[10px] uppercase">Engine Version</span>
              <span className="text-white font-mono font-bold">v1.4.2-stable</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 font-mono text-[10px] uppercase">IPC Solver</span>
              <span className="text-white font-mono">IPC-2141 Compliant</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 font-mono text-[10px] uppercase">DFM Checker</span>
              <span className="text-emerald-400 font-mono font-bold">Enabled</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 font-mono text-[10px] uppercase">License</span>
              <span className="text-indigo-400 font-mono font-bold hover:underline">CERN-OHL-W v2</span>
            </div>
          </div>

          {/* Core concept statement */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Product Description</h4>
            <p className="text-xs text-gray-300 leading-relaxed font-sans">
              NovaCircuit is a professional browser-native CAD and simulation platform, engineered for rapid hardware development. Features include real-time high-speed trace Impedance-aware calculations, Serpentine tuning, complete airwires Ratsnest analysis, and instant DFM report compilation.
            </p>
          </div>

          {/* Credits */}
          <div className="space-y-2 pt-2 border-t border-white/5">
            <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Credits & System Hardware</h4>
            <div className="text-[11px] text-gray-400 leading-relaxed font-mono flex flex-col gap-1">
              <span>• Solvers: NovaCircuit AI Origen Engine</span>
              <span>• Calculations: IPC Microstripline formulation</span>
              <span>• Open Source contributor libraries: Lucide React</span>
            </div>
          </div>

          {/* Footer acknowledgements */}
          <div className="pt-4 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-500">
            <span className="flex items-center gap-1">Crafted with <Heart size={10} className="text-rose-500 animate-pulse fill-rose-500" /> globally</span>
            <span>MIT & CERN Open Hardware License</span>
          </div>
        </div>

        {/* Bottom Button Panel */}
        <div className="p-4 bg-[#111119] border-t border-white/5 flex gap-2">
          <button
            onClick={onClose}
            className="w-full text-center py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase transition-colors tracking-wider"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
