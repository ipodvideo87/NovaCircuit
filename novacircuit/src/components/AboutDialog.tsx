import React from 'react';
import { Activity, Cpu, X, Zap } from 'lucide-react';

interface AboutDialogProps {
  onClose: () => void;
}

const AboutDialog: React.FC<AboutDialogProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="
        bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl
        w-full max-w-lg mx-4 overflow-hidden
      ">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500
              flex items-center justify-center">
              <Cpu size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">NovaCircuit EDA</h2>
              <p className="text-xs text-slate-500">Browser-native PCB design suite</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            NovaCircuit is a professional-grade, browser-native Electronic Design Automation
            environment for real-time schematic capture, controlled-impedance PCB routing,
            and automated design rule checking — all client-side.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <Zap size={14} />,      label: 'IPC-2141 Microstrip Solver',  color: 'text-amber-400'  },
              { icon: <Activity size={14} />,  label: 'PDN Impedance Analyzer',      color: 'text-cyan-400'   },
              { icon: <Cpu size={14} />,       label: 'Spatial Quadtree Rendering',  color: 'text-emerald-400'},
              { icon: <Zap size={14} />,       label: 'Gerber / BOM / PnP Export',   color: 'text-violet-400' },
            ].map(f => (
              <div key={f.label}
                className="flex items-start gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                <span className={`mt-0.5 flex-shrink-0 ${f.color}`}>{f.icon}</span>
                <span className="text-xs text-slate-300">{f.label}</span>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-500 font-mono bg-slate-800/40 rounded-lg px-4 py-3 space-y-1">
            <p>React 18 · TypeScript 5 · Zustand · Tailwind CSS</p>
            <p>Vite 5 · Express 5 · Gemini AI · jszip</p>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-slate-800 flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700
              text-sm text-slate-300 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutDialog;
