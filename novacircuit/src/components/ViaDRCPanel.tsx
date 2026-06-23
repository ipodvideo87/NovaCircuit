// ─────────────────────────────────────────────────────────────────────────────
// ViaDRCPanel
//
// Full IPC-6012 via DRC results panel.
// Shows:
//   • Aggregate pass/fail/warning badges
//   • Violation list with rule code, message, and actual vs limit values
//   • Per-via-type statistics (through / blind / buried / micro count)
//   • Aspect ratio reference table
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info, RefreshCw } from 'lucide-react';
import {
  ViaDRCResult,
  ViaDRCViolation,
  ViaType,
  PCBVia,
  VIA_ASPECT_RATIO_LIMITS,
  MICRO_VIA_MAX_DRILL_MM,
} from '../types/pcb';

interface ViaDRCPanelProps {
  drcResult: ViaDRCResult | null;
  vias: PCBVia[];
  onRunDRC: () => void;
  onSelectVia: (id: string) => void;
  isRunning?: boolean;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const StatusIcon: React.FC<{ severity: 'error' | 'warning' | 'pass' }> = ({ severity }) => {
  if (severity === 'error')   return <XCircle     size={14} className="text-red-400 flex-shrink-0"     />;
  if (severity === 'warning') return <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />;
  return                             <CheckCircle   size={14} className="text-emerald-400 flex-shrink-0" />;
};

const ViolationRow: React.FC<{
  violation: ViaDRCViolation;
  onSelectVia: (id: string) => void;
}> = ({ violation, onSelectVia }) => {
  const [expanded, setExpanded] = useState(false);
  const isError = violation.severity === 'error';

  return (
    <div
      className={`rounded border text-xs transition-colors ${
        isError
          ? 'bg-red-500/8 border-red-500/20 hover:bg-red-500/12'
          : 'bg-amber-500/8 border-amber-500/20 hover:bg-amber-500/12'
      }`}
    >
      <div
        className="flex items-start gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon severity={violation.severity} />
        <div className="flex-1 min-w-0">
          <span
            className={`font-mono font-semibold mr-1.5 ${
              isError ? 'text-red-400' : 'text-amber-400'
            }`}
          >
            {violation.rule}
          </span>
          <span className="text-white/65 break-words">{violation.message}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelectVia(violation.viaId);
          }}
          className="text-white/30 hover:text-white/70 flex-shrink-0 text-xs underline underline-offset-2"
        >
          {violation.viaId}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-2 pt-0 text-white/40 space-y-0.5 border-t border-white/5">
          <div className="flex gap-4">
            <span>
              Actual:{' '}
              <span className={`font-mono ${isError ? 'text-red-300' : 'text-amber-300'}`}>
                {violation.actualValue.toFixed(4)}
              </span>
            </span>
            <span>
              Limit:{' '}
              <span className="font-mono text-white/60">
                {violation.limitValue.toFixed(4)}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Via Type Stats ────────────────────────────────────────────────────────────

const VIA_TYPE_COLORS: Record<ViaType, string> = {
  through: '#f59e0b',
  blind:   '#38bdf8',
  buried:  '#a78bfa',
  micro:   '#34d399',
};

// ── Main Panel ─────────────────────────────────────────────────────────────────

export const ViaDRCPanel: React.FC<ViaDRCPanelProps> = ({
  drcResult,
  vias,
  onRunDRC,
  onSelectVia,
  isRunning = false,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning'>('all');

  // ── Type counts ──────────────────────────────────────────────────────────
  const typeCounts: Record<ViaType, number> = { through: 0, blind: 0, buried: 0, micro: 0 };
  for (const v of vias) typeCounts[v.viaType]++;

  const filteredViolations = drcResult
    ? drcResult.violations.filter(
        (v) => filterSeverity === 'all' || v.severity === filterSeverity
      )
    : [];

  const overallStatus = drcResult
    ? drcResult.errorCount > 0 ? 'fail'
    : drcResult.warningCount > 0 ? 'warning'
    : 'pass'
    : null;

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Header / Run DRC */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Via DRC</h3>
          <p className="text-white/40 text-xs mt-0.5">IPC-6012 / IPC-2315 aspect ratio checks</p>
        </div>
        <button
          onClick={onRunDRC}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/15 border border-amber-500/30
                     text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={11} className={isRunning ? 'animate-spin' : ''} />
          Run DRC
        </button>
      </div>

      {/* Via type inventory */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.entries(typeCounts) as [ViaType, number][]).map(([type, count]) => (
          <div
            key={type}
            className="bg-white/5 rounded-lg px-2 py-2 text-center border border-white/8"
          >
            <p className="text-[10px] font-semibold mb-0.5" style={{ color: VIA_TYPE_COLORS[type] }}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </p>
            <p className="text-white font-mono text-base leading-none">{count}</p>
          </div>
        ))}
      </div>

      {/* DRC result summary */}
      {drcResult ? (
        <>
          <div
            className={`rounded-lg px-4 py-3 border flex items-center gap-3 ${
              overallStatus === 'fail'
                ? 'bg-red-500/10 border-red-500/30'
                : overallStatus === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-emerald-500/10 border-emerald-500/30'
            }`}
          >
            <StatusIcon severity={overallStatus === 'pass' ? 'pass' : overallStatus === 'fail' ? 'error' : 'warning'} />
            <div className="flex-1">
              <p className={`font-semibold text-xs ${
                overallStatus === 'fail' ? 'text-red-400'
                : overallStatus === 'warning' ? 'text-amber-400'
                : 'text-emerald-400'
              }`}>
                {overallStatus === 'pass'
                  ? `All ${drcResult.totalVias} via${drcResult.totalVias !== 1 ? 's' : ''} pass IPC-6012`
                  : overallStatus === 'fail'
                  ? `${drcResult.errorCount} DRC error${drcResult.errorCount !== 1 ? 's' : ''} detected`
                  : `${drcResult.warningCount} warning${drcResult.warningCount !== 1 ? 's' : ''} — review recommended`
                }
              </p>
              <p className="text-white/40 text-xs mt-0.5">
                {drcResult.errorCount} errors · {drcResult.warningCount} warnings · {drcResult.passCount} pass
              </p>
            </div>
          </div>

          {/* Filter tabs */}
          {drcResult.violations.length > 0 && (
            <>
              <div className="flex gap-1">
                {(['all', 'error', 'warning'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterSeverity(f)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      filterSeverity === f
                        ? f === 'all'
                          ? 'bg-white/15 border-white/20 text-white'
                          : f === 'error'
                          ? 'bg-red-500/20 border-red-500/40 text-red-400'
                          : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                        : 'bg-transparent border-white/10 text-white/40 hover:text-white/70'
                    }`}
                  >
                    {f === 'all'
                      ? `All (${drcResult.violations.length})`
                      : f === 'error'
                      ? `Errors (${drcResult.errorCount})`
                      : `Warnings (${drcResult.warningCount})`
                    }
                  </button>
                ))}
              </div>

              {/* Violation list */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                {filteredViolations.map((v, i) => (
                  <ViolationRow key={i} violation={v} onSelectVia={onSelectVia} />
                ))}
                {filteredViolations.length === 0 && (
                  <p className="text-white/30 text-xs text-center py-4">
                    No {filterSeverity} violations.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 text-white/30 text-xs py-4 justify-center">
          <Info size={14} />
          Run DRC to check via aspect ratios and annular rings.
        </div>
      )}

      {/* IPC-6012 Reference */}
      <div className="border-t border-white/8 pt-4">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-2">
          Aspect Ratio Limits Reference
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/30">
              <th className="text-left pb-1 font-normal">Via Type</th>
              <th className="text-center pb-1 font-normal">Max AR</th>
              <th className="text-center pb-1 font-normal">Standard</th>
              <th className="text-right pb-1 font-normal">Max Drill</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['through', 'IPC-6012 §3.3', '—'],
              ['blind',   'IPC-6012 §3.3', '—'],
              ['buried',  'IPC-6012 §3.3', '—'],
              ['micro',   'IPC-2315 §3',   `≤ ${MICRO_VIA_MAX_DRILL_MM * 1000} µm`],
            ] as [ViaType, string, string][]).map(([type, std, maxDrill]) => (
              <tr key={type} className="border-b border-white/5">
                <td className="py-1 pr-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                    style={{ backgroundColor: VIA_TYPE_COLORS[type] }}
                  />
                  <span className="text-white/70 capitalize">{type}</span>
                </td>
                <td className="py-1 text-center font-mono text-white/80">
                  {VIA_ASPECT_RATIO_LIMITS[type]}:1
                </td>
                <td className="py-1 text-center text-white/40">{std}</td>
                <td className="py-1 text-right font-mono text-white/50">{maxDrill}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ViaDRCPanel;
