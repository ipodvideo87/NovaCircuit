// ─────────────────────────────────────────────────────────────────────────────
// StackupDrawer
//
// IPC stackup slide-up drawer that renders:
//   1. Layer cross-section SVG with copper / dielectric bands
//   2. Via cross-section overlay showing blind / buried / micro / through vias
//   3. Per-layer dimension table
//   4. Stackup preset selector (4L / 6L / 8L)
//   5. IPC-6012 via DRC summary panel
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import {
  PCBStackup,
  PCBVia,
  StackupPreset,
  ViaType,
  LayerId,
  LAYER_COLORS,
  LAYER_DISPLAY_NAMES,
  VIA_ASPECT_RATIO_LIMITS,
} from '../../types/pcb';
import { calcDrillDepth, runViaDRC, getLayerIndex } from '../../lib/viaManager';

interface StackupDrawerProps {
  stackup: PCBStackup;
  vias: PCBVia[];
  onStackupChange: (preset: StackupPreset) => void;
  isOpen: boolean;
  onClose: () => void;
}

// ── Cross-section SVG Constants ───────────────────────────────────────────────

const SVG_W          = 560;
const SVG_PAD_X      = 60;   // left/right margin for labels
const TRACE_W        = SVG_W - SVG_PAD_X * 2;
const COPPER_H_PX    = 10;   // copper layer band height (px)
const DIELECTRIC_SCALE = 80; // px per mm of dielectric thickness

// Via colours per type
const VIA_STROKE: Record<ViaType, string> = {
  through: '#f59e0b',
  blind:   '#38bdf8',
  buried:  '#a78bfa',
  micro:   '#34d399',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

interface LayerBand {
  layerId: LayerId;
  yStart: number;  // px from SVG top
  height: number;  // px
  dielectricH: number; // px
}

function buildLayerBands(stackup: PCBStackup): { bands: LayerBand[]; totalH: number } {
  const bands: LayerBand[] = [];
  let y = 16; // top padding
  for (let i = 0; i < stackup.layers.length; i++) {
    const spec = stackup.layers[i];
    const dielH = i < stackup.layers.length - 1
      ? spec.dielectricThicknessMm * DIELECTRIC_SCALE
      : 0;
    bands.push({
      layerId: spec.layerId,
      yStart: y,
      height: COPPER_H_PX,
      dielectricH: dielH,
    });
    y += COPPER_H_PX + dielH;
  }
  return { bands, totalH: y + 16 };
}

function getBandY(layerId: LayerId, bands: LayerBand[]): number {
  const b = bands.find((bb) => bb.layerId === layerId);
  return b ? b.yStart + b.height / 2 : 0;
}

// ── Via Cross-Section Overlay ─────────────────────────────────────────────────

interface ViaCrossSectionProps {
  via: PCBVia;
  bands: LayerBand[];
  xOffset: number;
  highlighted?: boolean;
}

const ViaCrossSection: React.FC<ViaCrossSectionProps> = ({
  via,
  bands,
  xOffset,
  highlighted,
}) => {
  const y1 = getBandY(via.fromLayer, bands);
  const y2 = getBandY(via.toLayer, bands);
  const stroke = VIA_STROKE[via.viaType];
  const r = Math.max(3, via.drillDiameter * 8);

  return (
    <g>
      {/* Drill barrel */}
      <line
        x1={xOffset} y1={y1}
        x2={xOffset} y2={y2}
        stroke={stroke}
        strokeWidth={highlighted ? r * 2.2 : r * 2}
        strokeOpacity={0.18}
      />
      <line
        x1={xOffset} y1={y1}
        x2={xOffset} y2={y2}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={via.viaType === 'buried' ? '3 2' : undefined}
      />
      {/* Pad circles */}
      <circle cx={xOffset} cy={y1} r={r + 2} fill={stroke} fillOpacity={0.8} />
      <circle cx={xOffset} cy={y2} r={r + 2} fill={stroke} fillOpacity={0.8} />
      {/* Inner drill hole */}
      <circle cx={xOffset} cy={y1} r={r * 0.55} fill="#0b0b10" />
      <circle cx={xOffset} cy={y2} r={r * 0.55} fill="#0b0b10" />
      {/* Type label */}
      {highlighted && (
        <text
          x={xOffset}
          y={y1 - r - 5}
          textAnchor="middle"
          fill={stroke}
          fontSize={9}
          fontFamily="monospace"
        >
          {via.viaType.toUpperCase()}
        </text>
      )}
    </g>
  );
};

// ── IPC-6012 DRC Badge ────────────────────────────────────────────────────────

interface DRCBadgeProps {
  errorCount: number;
  warningCount: number;
  passCount: number;
  total: number;
}

const DRCBadge: React.FC<DRCBadgeProps> = ({
  errorCount, warningCount, passCount, total,
}) => (
  <div className="flex items-center gap-2 text-xs flex-wrap">
    {errorCount > 0 && (
      <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        {errorCount} Error{errorCount !== 1 ? 's' : ''}
      </span>
    )}
    {warningCount > 0 && (
      <span className="flex items-center gap-1 bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
        {warningCount} Warning{warningCount !== 1 ? 's' : ''}
      </span>
    )}
    {passCount > 0 && (
      <span className="flex items-center gap-1 bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        {passCount} Pass
      </span>
    )}
    <span className="text-white/30 ml-auto">{total} via{total !== 1 ? 's' : ''}</span>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

export const StackupDrawer: React.FC<StackupDrawerProps> = ({
  stackup,
  vias,
  onStackupChange,
  isOpen,
  onClose,
}) => {
  const [hoveredViaId, setHoveredViaId] = useState<string | null>(null);
  const [showDRCDetail, setShowDRCDetail] = useState(false);

  const { bands, totalH } = useMemo(
    () => buildLayerBands(stackup),
    [stackup]
  );

  const drc = useMemo(() => runViaDRC(vias, stackup), [vias, stackup]);

  // Spread vias across the cross-section horizontally
  const viaXPositions = useMemo(() => {
    const spread = TRACE_W - 80;
    return vias.map((_, i) =>
      SVG_PAD_X + 40 + (vias.length > 1 ? (i / (vias.length - 1)) * spread : spread / 2)
    );
  }, [vias]);

  const presets: StackupPreset[] = ['4L', '6L', '8L'];

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out
        ${isOpen ? 'translate-y-0' : 'translate-y-full'}
      `}
    >
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm -z-10"
          onClick={onClose}
        />
      )}

      <div className="bg-[#0f0f18] border-t border-white/10 shadow-2xl max-h-[80vh] overflow-y-auto">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        <div className="px-4 pb-6 space-y-5 max-w-4xl mx-auto">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold text-sm">IPC Stackup &amp; Via Cross-Section</h2>
              <p className="text-white/40 text-xs mt-0.5">
                {stackup.preset} · {stackup.totalThicknessMm} mm · FR-4
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Preset selector */}
              <div className="flex bg-white/5 rounded-lg overflow-hidden border border-white/10">
                {presets.map((p) => (
                  <button
                    key={p}
                    onClick={() => onStackupChange(p)}
                    className={`px-3 py-1.5 text-xs font-mono font-semibold transition-colors ${
                      stackup.preset === p
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={onClose}
                className="text-white/40 hover:text-white/80 text-xl leading-none px-2"
              >
                ×
              </button>
            </div>
          </div>

          {/* DRC Summary */}
          <div className="bg-white/5 rounded-lg p-3 border border-white/8">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/50 text-xs uppercase tracking-wider">Via DRC — IPC-6012</p>
              {vias.length > 0 && (
                <button
                  onClick={() => setShowDRCDetail(!showDRCDetail)}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  {showDRCDetail ? 'Hide' : 'Details'}
                </button>
              )}
            </div>
            {vias.length === 0 ? (
              <p className="text-white/30 text-xs">No vias on board.</p>
            ) : (
              <DRCBadge
                errorCount={drc.errorCount}
                warningCount={drc.warningCount}
                passCount={drc.passCount}
                total={drc.totalVias}
              />
            )}

            {/* DRC violation list */}
            {showDRCDetail && drc.violations.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                {drc.violations.map((v, i) => (
                  <div
                    key={i}
                    className={`text-xs rounded px-2 py-1.5 flex items-start gap-2 ${
                      v.severity === 'error'
                        ? 'bg-red-500/10 border border-red-500/20'
                        : 'bg-amber-500/10 border border-amber-500/20'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        v.severity === 'error' ? 'bg-red-400' : 'bg-amber-400'
                      }`}
                    />
                    <div>
                      <span className={`font-mono font-semibold ${
                        v.severity === 'error' ? 'text-red-400' : 'text-amber-400'
                      }`}>
                        [{v.rule}]
                      </span>{' '}
                      <span className="text-white/70">{v.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showDRCDetail && drc.violations.length === 0 && vias.length > 0 && (
              <p className="mt-2 text-emerald-400 text-xs">
                ✓ All vias pass IPC-6012 aspect ratio and annular ring checks.
              </p>
            )}
          </div>

          {/* Cross-section SVG */}
          <div className="overflow-x-auto">
            <svg
              width={SVG_W}
              height={totalH}
              className="block"
              style={{ minWidth: SVG_W }}
            >
              {/* Layer bands */}
              {bands.map((band, i) => {
                const spec = stackup.layers[i];
                return (
                  <g key={band.layerId}>
                    {/* Copper layer band */}
                    <rect
                      x={SVG_PAD_X}
                      y={band.yStart}
                      width={TRACE_W}
                      height={band.height}
                      fill={LAYER_COLORS[band.layerId]}
                      fillOpacity={0.85}
                      rx={1}
                    />
                    {/* Layer label (left) */}
                    <text
                      x={SVG_PAD_X - 6}
                      y={band.yStart + band.height / 2 + 4}
                      textAnchor="end"
                      fill="#ffffff99"
                      fontSize={9}
                      fontFamily="monospace"
                    >
                      {band.layerId}
                    </text>
                    {/* Copper thickness label (right) */}
                    <text
                      x={SVG_PAD_X + TRACE_W + 6}
                      y={band.yStart + band.height / 2 + 4}
                      textAnchor="start"
                      fill="#ffffff55"
                      fontSize={9}
                      fontFamily="monospace"
                    >
                      {spec.copperThicknessMicron}µm
                    </text>
                    {/* Dielectric region */}
                    {band.dielectricH > 0 && (
                      <>
                        <rect
                          x={SVG_PAD_X}
                          y={band.yStart + band.height}
                          width={TRACE_W}
                          height={band.dielectricH}
                          fill="#1e1e2e"
                          stroke="#ffffff15"
                          strokeWidth={0.5}
                        />
                        {/* Dielectric dimension label */}
                        <text
                          x={SVG_PAD_X + TRACE_W + 6}
                          y={band.yStart + band.height + band.dielectricH / 2 + 4}
                          textAnchor="start"
                          fill="#ffffff33"
                          fontSize={8}
                          fontFamily="monospace"
                        >
                          {spec.dielectricThicknessMm.toFixed(3)} mm · εr {spec.dielectricConstant}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* Via cross-sections */}
              {vias.map((via, i) => (
                <g
                  key={via.id}
                  onMouseEnter={() => setHoveredViaId(via.id)}
                  onMouseLeave={() => setHoveredViaId(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <ViaCrossSection
                    via={via}
                    bands={bands}
                    xOffset={viaXPositions[i]}
                    highlighted={hoveredViaId === via.id}
                  />
                </g>
              ))}
            </svg>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {(['through', 'blind', 'buried', 'micro'] as ViaType[]).map((t) => (
              <div key={t} className="flex items-center gap-1.5 text-xs text-white/50">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: VIA_STROKE[t] }}
                />
                {t.charAt(0).toUpperCase() + t.slice(1)} via
              </div>
            ))}
          </div>

          {/* Layer table */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Stackup Layers</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-white/30 border-b border-white/8">
                    <th className="pb-1.5 pr-4 font-normal">Layer</th>
                    <th className="pb-1.5 pr-4 font-normal">Cu (µm)</th>
                    <th className="pb-1.5 pr-4 font-normal">Diel. (mm)</th>
                    <th className="pb-1.5 pr-4 font-normal">εr</th>
                    <th className="pb-1.5 font-normal">tan δ</th>
                  </tr>
                </thead>
                <tbody>
                  {stackup.layers.map((spec, i) => (
                    <tr key={spec.layerId} className="border-b border-white/5">
                      <td className="py-1.5 pr-4">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                          style={{ backgroundColor: LAYER_COLORS[spec.layerId] }}
                        />
                        <span className="text-white/80 font-mono">
                          {LAYER_DISPLAY_NAMES[spec.layerId]}
                        </span>
                      </td>
                      <td className="py-1.5 pr-4 text-white/60 font-mono">
                        {spec.copperThicknessMicron}
                      </td>
                      <td className="py-1.5 pr-4 text-white/60 font-mono">
                        {i < stackup.layers.length - 1
                          ? spec.dielectricThicknessMm.toFixed(3)
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-white/60 font-mono">
                        {spec.dielectricConstant}
                      </td>
                      <td className="py-1.5 text-white/60 font-mono">
                        {spec.lossTangent}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Via type aspect ratio reference */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">
              IPC-6012 Aspect Ratio Limits
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['through', 'blind', 'buried', 'micro'] as ViaType[]).map((t) => (
                <div
                  key={t}
                  className="bg-white/5 rounded px-3 py-2 border border-white/8 text-center"
                >
                  <p
                    className="text-xs font-semibold mb-0.5"
                    style={{ color: VIA_STROKE[t] }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </p>
                  <p className="text-white font-mono text-sm">
                    {VIA_ASPECT_RATIO_LIMITS[t]}:1
                  </p>
                  <p className="text-white/30 text-xs">
                    {t === 'micro' ? 'IPC-2315' : 'IPC-6012'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StackupDrawer;
