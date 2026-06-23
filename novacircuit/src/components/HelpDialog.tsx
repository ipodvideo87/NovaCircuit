import React from 'react';
import { X } from 'lucide-react';

interface HelpDialogProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'V',       description: 'Select tool' },
  { key: 'M',       description: 'Move tool' },
  { key: 'R',       description: 'Route trace' },
  { key: 'P',       description: 'Place component' },
  { key: 'D',       description: 'Measure distance' },
  { key: 'X',       description: 'Delete selected' },
  { key: 'Ctrl+Z',  description: 'Undo' },
  { key: 'Ctrl+Y',  description: 'Redo' },
  { key: 'Ctrl+S',  description: 'Save checkpoint' },
  { key: 'Escape',  description: 'Deselect / cancel' },
  { key: 'Scroll',  description: 'Zoom in / out' },
  { key: 'Mid-drag',description: 'Pan canvas' },
];

const HelpDialog: React.FC<HelpDialogProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="
        bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl
        w-full max-w-md mx-4
      ">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-base font-bold text-slate-100">Keyboard Shortcuts</h2>
          <button onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="space-y-1">
            {SHORTCUTS.map(s => (
              <div key={s.key}
                className="flex items-center justify-between py-1.5 border-b border-slate-800/50">
                <span className="text-sm text-slate-400">{s.description}</span>
                <kbd className="
                  px-2 py-0.5 rounded text-xs font-mono
                  bg-slate-800 border border-slate-700 text-slate-300
                ">{s.key}</kbd>
              </div>
            ))}
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

export default HelpDialog;
