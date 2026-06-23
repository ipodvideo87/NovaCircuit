// ─────────────────────────────────────────────────────────────────────────────
// HelpDialog
//
// Keyboard shortcut guide and feature reference.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface HelpDialogProps {
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; desc: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: ['Ctrl', 'Z'],    desc: 'Undo'                    },
      { keys: ['Ctrl', 'Y'],    desc: 'Redo'                    },
      { keys: ['Ctrl', 'S'],    desc: 'Export Gerber ZIP'       },
      { keys: ['Esc'],          desc: 'Cancel / deselect'       },
      { keys: ['F'],            desc: 'Fit board to view'       },
    ],
  },
  {
    title: 'Via Placement',
    shortcuts: [
      { keys: ['V'],            desc: 'Open Via Toolbar'        },
      { keys: ['1'],            desc: 'Select through-hole via' },
      { keys: ['2'],            desc: 'Select blind via'        },
      { keys: ['3'],            desc: 'Select buried via'       },
      { keys: ['4'],            desc: 'Select micro-via'        },
      { keys: ['Click'],        desc: 'Place via at cursor'     },
      { keys: ['Esc'],          desc: 'Cancel via placement'    },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Scroll'],       desc: 'Zoom in/out'             },
      { keys: ['Alt', 'Drag'],  desc: 'Pan canvas'              },
      { keys: ['Middle Drag'],  desc: 'Pan canvas (alternative)'},
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['Click'],        desc: 'Select component/trace/via' },
      { keys: ['Click canvas'], desc: 'Deselect all'            },
    ],
  },
  {
    title: 'Analysis',
    shortcuts: [
      { keys: ['Ctrl', 'D'],    desc: 'Run Via DRC'             },
    ],
  },
];

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 text-[10px] bg-white/10 border border-white/20 rounded font-mono text-white/70">
    {children}
  </kbd>
);

export const HelpDialog: React.FC<HelpDialogProps> = ({ onClose }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onClick={onClose}
  >
    <div
      className="bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl
                 w-full max-w-lg max-h-[80vh] overflow-y-auto m-4"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Keyboard size={16} className="text-amber-400" />
          <h2 className="text-white font-semibold">Keyboard Shortcuts</h2>
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white/80 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="px-6 py-4 space-y-6">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">
              {group.title}
            </p>
            <div className="space-y-1.5">
              {group.shortcuts.map((sc, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sc.keys.map((k, j) => (
                      <React.Fragment key={j}>
                        <Kbd>{k}</Kbd>
                        {j < sc.keys.length - 1 && (
                          <span className="text-white/25 text-xs">+</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <span className="text-white/60 text-xs ml-4 text-right">
                    {sc.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Via type reference */}
        <div className="border-t border-white/8 pt-4">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-3">
            Via Types (IPC-6012 / IPC-2315)
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { type: 'Through', color: '#f59e0b', desc: 'F.Cu → B.Cu, all layers, mechanically drilled, AR ≤ 10:1' },
              { type: 'Blind',   color: '#38bdf8', desc: 'Outer → inner layer, AR ≤ 10:1' },
              { type: 'Buried',  color: '#a78bfa', desc: 'Inner → inner, not visible, AR ≤ 10:1' },
              { type: 'Micro',   color: '#34d399', desc: 'Laser drilled, ≤0.15mm, 1 layer span, AR ≤ 1:1' },
            ].map((v) => (
              <div key={v.type} className="bg-white/5 rounded-lg p-2.5 border border-white/8">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                  <span className="font-semibold" style={{ color: v.color }}>{v.type}</span>
                </div>
                <p className="text-white/40 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default HelpDialog;
