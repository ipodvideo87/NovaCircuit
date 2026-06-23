// ─────────────────────────────────────────────────────────────────────────────
// ViaInspector
//
// Property panel for a selected via.  Shows drill/pad dimensions, layer span,
// net class, aspect ratio status, and allows editing key parameters.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import {
  PCBVia,
  PCBStackup,
  ViaType,
  LAYER_DISPLAY_NAMES,
  VIA_ASPECT_RATIO_LIMITS,
  MICRO_VIA_MAX_DRILL_MM,
} from '../../types/pcb';
import { calcDrillDepth, inferViaType } from '../../lib/viaManager';

interface ViaInspectorProps {
  via: PCBVia;
  stackup: PCBStackup;
  onUpdate: (updated: PCBVia) => void;
  onClose: () => void;
}

const VIA_TYPE_LABELS: Record<ViaType, string> = {
  through: 'Through-Hole',
  blind:   'Blind',
  buried:  'Buried',
  micro:   'Micro',
};

const VIA_TYPE_COLORS: Record<ViaType, string> = {
  through: 'text-amber-400',
  blind:   'text-sky-400',
  buried:  'text-violet-400',
  micro:   'text-emerald-400',
};

export const ViaInspector: React.FC<ViaInspectorProps> = ({
  via,
  stackup,
  onUpdate,
  onClose,
}) => {
  const depth   = calcDrillDepth(via.fromLayer, via.toLayer, stackup);
  const ar      = via.drillDiameter > 0 ? depth / via.drillDiameter : 0;
  const arLimit = VIA_ASPECT_RATIO_LIMITS[via.viaType];
  const arPass  = ar <= arLimit;
  const annular = (via.padDiameter - via.drillDiameter) / 2;

  const handleDrillChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const d = parseFloat(e.target.value);
      if (isNaN(d) || d <= 0) return;
      const newType = inferViaType(via.fromLayer, via.toLayer, d, stackup);
      onUpdate({ ...via, drillDiameter: d, viaType: newType });
    },
    [via, stackup, onUpdate]
  );

  const handlePadChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const p = parseFloat(e.target.value);
      if (isNaN(p) || p <= via.drillDiameter) return;
      onUpdate({ ...via, padDiameter: p });
    },
    [via, onUpdate]
  );

  const handleNetChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ ...via, netId: e.target.value });
    },
    [via, onUpdate]
  );

  return (
    <div className="bg-[#12121a] border border-white/10 rounded-lg p-4 space-y-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-white/50 text-xs uppercase tracking-wider">Via</span>
          <p className="font-mono text-white font-semibold">{via.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase ${VIA_TYPE_COLORS[via.viaType]}`}>
            {VIA_TYPE_LABELS[via.viaType]}
          </span>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Layer span */}
      <div className="bg-white/5 rounded p-3 space-y-1">
        <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Layer Span</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-amber-300">
            {LAYER_DISPLAY_NAMES[via.fromLayer]}
          </span>
          <span className="text-white/30">→</span>
          <span className="font-mono text-xs text-amber-300">
            {LAYER_DISPLAY_NAMES[via.toLayer]}
          </span>
        </div>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-white/50 text-xs">Drill Ø (mm)</span>
          <input
            type="number"
            step="0.01"
            min="0.05"
            max={via.viaType === 'micro' ? MICRO_VIA_MAX_DRILL_MM : 2.0}
            value={via.drillDiameter}
            onChange={handleDrillChange}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white
                       font-mono text-xs focus:outline-none focus:border-amber-400/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-white/50 text-xs">Pad Ø (mm)</span>
          <input
            type="number"
            step="0.01"
            min={via.drillDiameter + 0.05}
            value={via.padDiameter}
            onChange={handlePadChange}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white
                       font-mono text-xs focus:outline-none focus:border-amber-400/50"
          />
        </label>
      </div>

      {/* Net */}
      <label className="block space-y-1">
        <span className="text-white/50 text-xs">Net</span>
        <input
          type="text"
          value={via.netId}
          onChange={handleNetChange}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white
                     font-mono text-xs focus:outline-none focus:border-amber-400/50"
        />
      </label>

      {/* DRC Metrics */}
      <div className="space-y-2">
        <p className="text-white/50 text-xs uppercase tracking-wider">IPC-6012 Metrics</p>

        {/* Aspect Ratio */}
        <div className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
          <div>
            <p className="text-white/60 text-xs">Aspect Ratio</p>
            <p className="font-mono text-xs text-white">
              {ar.toFixed(2)}:1
              <span className="text-white/40 ml-1">/ limit {arLimit}:1</span>
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              arPass ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}
          >
            {arPass ? 'PASS' : 'FAIL'}
          </span>
        </div>

        {/* Drill depth */}
        <div className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
          <div>
            <p className="text-white/60 text-xs">Drill Depth</p>
            <p className="font-mono text-xs text-white">{depth.toFixed(3)} mm</p>
          </div>
        </div>

        {/* Annular ring */}
        <div className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
          <div>
            <p className="text-white/60 text-xs">Annular Ring</p>
            <p className="font-mono text-xs text-white">
              {(annular * 1000).toFixed(0)} µm per side
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              annular >= 0.075
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {annular >= 0.075 ? 'OK' : 'TIGHT'}
          </span>
        </div>
      </div>

      {/* Position */}
      <div className="grid grid-cols-2 gap-3 text-xs text-white/40">
        <div>
          <span className="text-white/30">X</span>
          <span className="ml-2 font-mono">{via.x.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-white/30">Y</span>
          <span className="ml-2 font-mono">{via.y.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default ViaInspector;
