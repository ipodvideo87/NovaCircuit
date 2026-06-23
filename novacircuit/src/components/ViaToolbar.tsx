// ─────────────────────────────────────────────────────────────────────────────
// ViaToolbar
//
// Floating toolbar for via placement mode selection.
// Lets the user choose via type, layer pair, and net before clicking the
// canvas to place a via.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';
import { X, Layers, ChevronDown } from 'lucide-react';
import {
  ViaType,
  LayerId,
  PCBStackup,
  LAYER_DISPLAY_NAMES,
  DEFAULT_NET_CLASSES,
} from '../types/pcb';

interface ViaToolbarProps {
  stackup: PCBStackup;
  onActivate: (params: {
    viaType: ViaType;
    fromLayer: LayerId;
    toLayer: LayerId;
    netId: string;
  }) => void;
  onDeactivate: () => void;
  isActive: boolean;
  activeViaType: ViaType | null;
}

const VIA_TYPE_META: Record<ViaType, { label: string; desc: string; color: string; shortcut: string }> = {
  through: {
    label:    'Through',
    desc:     'Spans all layers (mechanically drilled)',
    color:    'amber',
    shortcut: '1',
  },
  blind: {
    label:    'Blind',
    desc:     'Outer layer → inner layer',
    color:    'sky',
    shortcut: '2',
  },
  buried: {
    label:    'Buried',
    desc:     'Inner layer → inner layer',
    color:    'violet',
    shortcut: '3',
  },
  micro: {
    label:    'Micro',
    desc:     'Laser-drilled, ≤0.15 mm, 1 layer span',
    color:    'emerald',
    shortcut: '4',
  },
};

const COLOR_CLASSES: Record<string, {
  bg: string; border: string; text: string; activeBg: string;
}> = {
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400',   activeBg: 'bg-amber-500/25'   },
  sky:     { bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     text: 'text-sky-400',     activeBg: 'bg-sky-500/25'     },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-400',  activeBg: 'bg-violet-500/25'  },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', activeBg: 'bg-emerald-500/25' },
};

export const ViaToolbar: React.FC<ViaToolbarProps> = ({
  stackup,
  onActivate,
  onDeactivate,
  isActive,
  activeViaType,
}) => {
  const layers = stackup.layers.map((l) => l.layerId);
  const outerTop    = layers[0];
  const outerBottom = layers[layers.length - 1];
  const innerLayers = layers.slice(1, -1);

  const [selectedType, setSelectedType]     = useState<ViaType>('through');
  const [fromLayer,    setFromLayer]        = useState<LayerId>(outerTop);
  const [toLayer,      setToLayer]          = useState<LayerId>(outerBottom);
  const [netId,        setNetId]            = useState('gnd');
  const [showNetSugg,  setShowNetSugg]      = useState(false);

  const commonNets = ['gnd', 'vcc-3.3v', 'vcc-1.8v', 'vbus', 'usb-dp', 'usb-dn', 'gnd-shield'];

  // ── Type selection → auto-adjust layer pair ──────────────────────────────
  const handleTypeSelect = useCallback((t: ViaType) => {
    setSelectedType(t);
    if (t === 'through') {
      setFromLayer(outerTop);
      setToLayer(outerBottom);
    } else if (t === 'blind') {
      setFromLayer(outerTop);
      setToLayer(innerLayers[0] ?? outerBottom);
    } else if (t === 'buried') {
      setFromLayer(innerLayers[0] ?? layers[1]);
      setToLayer(innerLayers[innerLayers.length - 1] ?? layers[layers.length - 2]);
    } else if (t === 'micro') {
      setFromLayer(outerTop);
      setToLayer(innerLayers[0] ?? layers[1]);
    }
  }, [outerTop, outerBottom, innerLayers, layers]);

  const handleActivate = useCallback(() => {
    onActivate({ viaType: selectedType, fromLayer, toLayer, netId });
  }, [onActivate, selectedType, fromLayer, toLayer, netId]);

  // ── Layer options per via type ───────────────────────────────────────────
  const fromOptions: LayerId[] =
    selectedType === 'buried'
      ? innerLayers
      : [outerTop, outerBottom];

  const toOptions: LayerId[] =
    selectedType === 'through'
      ? [outerBottom]
      : selectedType === 'buried'
      ? innerLayers.filter((l) => l !== fromLayer)
      : selectedType === 'micro'
      ? layers.filter((_, i) => {
          const fi = layers.indexOf(fromLayer);
          return Math.abs(i - fi) === 1;
        })
      : innerLayers;

  return (
    <div className="bg-[#12121a] border border-white/10 rounded-xl p-4 shadow-2xl space-y-4 w-72">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-white/50" />
          <span className="text-white text-sm font-semibold">Place Via</span>
        </div>
        {isActive && (
          <button
            onClick={onDeactivate}
            className="text-white/30 hover:text-white/70 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Via type selector */}
      <div className="grid grid-cols-2 gap-1.5">
        {(Object.entries(VIA_TYPE_META) as [ViaType, typeof VIA_TYPE_META[ViaType]][]).map(
          ([type, meta]) => {
            const cc = COLOR_CLASSES[meta.color];
            const sel = selectedType === type;
            return (
              <button
                key={type}
                onClick={() => handleTypeSelect(type)}
                className={`
                  rounded-lg px-2.5 py-2 text-left transition-colors border
                  ${sel ? `${cc.activeBg} ${cc.border} ${cc.text}` : `bg-white/5 border-white/10 text-white/50 hover:text-white/80`}
                `}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{meta.label}</span>
                  <kbd className="text-[9px] opacity-50">{meta.shortcut}</kbd>
                </div>
                <p className="text-[10px] opacity-60 mt-0.5 leading-tight">{meta.desc}</p>
              </button>
            );
          }
        )}
      </div>

      {/* Layer span */}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-white/40 text-[10px] uppercase tracking-wider">From</span>
          <div className="relative">
            <select
              value={fromLayer}
              onChange={(e) => setFromLayer(e.target.value as LayerId)}
              disabled={selectedType === 'through'}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5
                         text-white text-xs font-mono appearance-none pr-6
                         focus:outline-none focus:border-amber-400/50
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {fromOptions.map((l) => (
                <option key={l} value={l} style={{ background: '#12121a' }}>
                  {l}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-2.5 text-white/30 pointer-events-none" />
          </div>
        </label>
        <label className="space-y-1">
          <span className="text-white/40 text-[10px] uppercase tracking-wider">To</span>
          <div className="relative">
            <select
              value={toLayer}
              onChange={(e) => setToLayer(e.target.value as LayerId)}
              disabled={selectedType === 'through'}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5
                         text-white text-xs font-mono appearance-none pr-6
                         focus:outline-none focus:border-amber-400/50
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {toOptions.map((l) => (
                <option key={l} value={l} style={{ background: '#12121a' }}>
                  {l}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-2.5 text-white/30 pointer-events-none" />
          </div>
        </label>
      </div>

      {/* Net */}
      <div className="space-y-1">
        <span className="text-white/40 text-[10px] uppercase tracking-wider">Net</span>
        <div className="relative">
          <input
            type="text"
            value={netId}
            onChange={(e) => setNetId(e.target.value)}
            onFocus={() => setShowNetSugg(true)}
            onBlur={() => setTimeout(() => setShowNetSugg(false), 150)}
            placeholder="e.g. gnd, vcc-3.3v"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5
                       text-white text-xs font-mono focus:outline-none focus:border-amber-400/50"
          />
          {showNetSugg && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-[#1a1a28]
                            border border-white/15 rounded-lg overflow-hidden shadow-xl">
              {commonNets.filter((n) => n.includes(netId) || netId === '').slice(0, 6).map((n) => (
                <button
                  key={n}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-white/70
                             hover:bg-white/10 hover:text-white transition-colors"
                  onMouseDown={() => setNetId(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Place button */}
      <button
        onClick={isActive ? onDeactivate : handleActivate}
        className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
          isActive
            ? 'bg-white/10 border border-white/20 text-white/70 hover:bg-white/15'
            : 'bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
        }`}
      >
        {isActive ? (
          <span className="flex items-center justify-center gap-1.5">
            <X size={11} /> Cancel placement
          </span>
        ) : (
          'Activate placement mode'
        )}
      </button>

      {isActive && (
        <p className="text-white/30 text-[10px] text-center leading-relaxed">
          Click on the canvas to place a{' '}
          <span className={
            activeViaType === 'through' ? 'text-amber-400'
            : activeViaType === 'blind'  ? 'text-sky-400'
            : activeViaType === 'buried' ? 'text-violet-400'
            : 'text-emerald-400'
          }>
            {activeViaType}
          </span>{' '}
          via.{' '}
          <kbd className="opacity-60">Esc</kbd> to cancel.
        </p>
      )}
    </div>
  );
};

export default ViaToolbar;
