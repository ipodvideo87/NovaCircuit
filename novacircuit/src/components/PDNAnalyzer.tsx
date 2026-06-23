/**
 * PDNAnalyzer — Power Distribution Network Analysis Panel
 *
 * Provides:
 *  • Per-net PDN impedance analysis (IPC-style RLC ladder model)
 *  • Bode-style |Z| vs frequency chart (1 kHz → 1 GHz, log-log)
 *  • Target impedance line derived from IC ΔV / ΔI spec
 *  • Gradient-descent optimizer recommendations
 *  • One-click "Apply All" commits suggestions as Zustand transactions
 *  • Individual suggestion cards with apply/dismiss controls
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Cpu,
  RefreshCw,
  Settings2,
  Sparkles,
  TrendingDown,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import type {
  PDNAnalysisResult,
  PDNNetModel,
  PDNOptimizerSuggestion,
  PDNSweepConfig,
  PDNTargetSpec,
} from '../types/pcb';
import {
  buildFrequencySweep,
  buildTargetLine,
  formatCapacitance,
  formatFrequency,
  runPDNAnalysis,
  sweepPDNImpedance,
} from '../lib/pdnAnalyzer';
import { useTransactionStore } from '../lib/core/transaction';
import PDNChart from './PCB/PDNChart';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingsState {
  fStart: number;
  fStop: number;
  nPoints: number;
  optimizerIterations: number;
}

const DEFAULT_SETTINGS: SettingsState = {
  fStart: 1e3,
  fStop: 1e9,
  nPoints: 200,
  optimizerIterations: 8,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatBadgeProps {
  label: string;
  value: string;
  variant?: 'ok' | 'warn' | 'error' | 'info';
}
const StatBadge: React.FC<StatBadgeProps> = ({ label, value, variant = 'info' }) => {
  const colors = {
    ok:    'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
    warn:  'bg-amber-900/40  text-amber-300   border-amber-700/50',
    error: 'bg-red-900/40    text-red-300     border-red-700/50',
    info:  'bg-slate-800/60  text-slate-300   border-slate-700/50',
  };
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded border text-center ${colors[variant]}`}>
      <span className="text-xs font-mono font-semibold">{value}</span>
      <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">{label}</span>
    </div>
  );
};

interface SuggestionCardProps {
  suggestion: PDNOptimizerSuggestion;
  onApply: (s: PDNOptimizerSuggestion) => void;
  onDismiss: (id: string) => void;
}
const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, onApply, onDismiss }) => {
  const isGood = suggestion.estimatedImprovementPct >= 15;
  return (
    <div className={`
      relative rounded-lg border p-3 text-xs font-mono
      ${suggestion.applied
        ? 'border-emerald-700/40 bg-emerald-900/10 opacity-60'
        : 'border-amber-700/40 bg-amber-900/10'
      }
    `}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {suggestion.applied
            ? <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />
            : <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
          }
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
            {suggestion.type === 'ADD_CAP' ? 'Add Capacitor' : suggestion.type}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`
            text-[10px] px-1.5 py-0.5 rounded font-semibold
            ${isGood ? 'bg-emerald-800/50 text-emerald-300' : 'bg-amber-800/50 text-amber-300'}
          `}>
            −{suggestion.estimatedImprovementPct.toFixed(1)}% |Z|
          </span>
          {!suggestion.applied && (
            <button
              onClick={() => onDismiss(suggestion.id)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              title="Dismiss"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-slate-300 leading-relaxed mb-2 text-[11px]">
        {suggestion.description}
      </p>

      {/* Cap params */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="bg-slate-800/50 rounded px-2 py-1 text-center">
          <div className="text-slate-200 font-semibold text-[11px]">
            {formatCapacitance(suggestion.cap.capacitance)}
          </div>
          <div className="text-slate-500 text-[9px]">Value</div>
        </div>
        <div className="bg-slate-800/50 rounded px-2 py-1 text-center">
          <div className="text-slate-200 font-semibold text-[11px]">
            {(suggestion.cap.esr * 1000).toFixed(0)} mΩ
          </div>
          <div className="text-slate-500 text-[9px]">ESR</div>
        </div>
        <div className="bg-slate-800/50 rounded px-2 py-1 text-center">
          <div className="text-slate-200 font-semibold text-[11px]">
            {(suggestion.cap.esl * 1e9).toFixed(1)} nH
          </div>
          <div className="text-slate-500 text-[9px]">ESL</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-slate-500 text-[9px]">
          Worst violation @ {formatFrequency(suggestion.worstViolationHz)}
        </span>
        {!suggestion.applied && (
          <button
            onClick={() => onApply(suggestion)}
            className="
              flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold
              bg-amber-600/30 hover:bg-amber-600/50 text-amber-200
              border border-amber-600/40 transition-colors
            "
          >
            <Zap size={9} />
            Apply
          </button>
        )}
        {suggestion.applied && (
          <span className="text-emerald-400 text-[10px] flex items-center gap-1">
            <CheckCircle size={9} /> Applied
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Target Spec Editor ───────────────────────────────────────────────────────

interface TargetSpecEditorProps {
  spec: PDNTargetSpec;
  onChange: (spec: PDNTargetSpec) => void;
}
const TargetSpecEditor: React.FC<TargetSpecEditorProps> = ({ spec, onChange }) => {
  const field = (
    label: string,
    key: keyof PDNTargetSpec,
    unit: string,
    scale: number,
    step: number
  ) => (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-slate-400 w-28 flex-shrink-0">{label}</label>
      <input
        type="number"
        step={step}
        value={Number((spec[key] as number) / scale).toFixed(
          step < 0.1 ? 3 : step < 1 ? 2 : 0
        )}
        onChange={e => {
          const val = parseFloat(e.target.value) * scale;
          if (!isNaN(val) && val > 0) onChange({ ...spec, [key]: val });
        }}
        className="
          w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1
          text-xs font-mono text-slate-200 focus:outline-none
          focus:border-cyan-500 transition-colors
        "
      />
      <span className="text-[10px] text-slate-500">{unit}</span>
    </div>
  );

  return (
    <div className="space-y-2">
      {field('Max ΔV', 'maxDeltaV', 'mV', 1e-3, 1)}
      {field('Max ΔI', 'maxCurrentStep', 'A', 1, 0.1)}
      {field('Slew Rate', 'slewRate', 'A/µs', 1e6, 1)}
      {field('Supply V', 'supplyVoltage', 'V', 1, 0.1)}
    </div>
  );
};

// ─── Net Selector ─────────────────────────────────────────────────────────────

interface NetSelectorProps {
  nets: string[];
  selected: string;
  onSelect: (net: string) => void;
  results: PDNAnalysisResult | null;
}
const NetSelector: React.FC<NetSelectorProps> = ({ nets, selected, onSelect, results }) => {
  function hasViolation(netId: string): boolean {
    if (!results) return false;
    const model = results.nets[netId];
    if (!model) return false;
    return model.impedanceCurve.some(
      (pt, i) => pt.impedanceMag > (model.targetLine.points[i]?.impedanceMag ?? Infinity)
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {nets.map(net => {
        const violation = hasViolation(net);
        return (
          <button
            key={net}
            onClick={() => onSelect(net)}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono
              border transition-all duration-150
              ${selected === net
                ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }
            `}
          >
            {violation
              ? <AlertTriangle size={9} className="text-red-400" />
              : <CheckCircle size={9} className="text-emerald-400" />
            }
            {net}
          </button>
        );
      })}
    </div>
  );
};

// ─── Main PDNAnalyzer Component ───────────────────────────────────────────────

interface PDNAnalyzerProps {
  onClose: () => void;
}

const PDNAnalyzer: React.FC<PDNAnalyzerProps> = ({ onClose }) => {
  const history = useTransactionStore(s => s.history);
  const currentIndex = useTransactionStore(s => s.currentIndex);
  const applyPDNSuggestions = useTransactionStore(s => s.applyPDNSuggestions);

  const board = history[currentIndex];

  // ── State ──
  const [analysisResult, setAnalysisResult] = useState<PDNAnalysisResult | null>(null);
  const [selectedNet, setSelectedNet] = useState<string>('vcc-3.3v');
  const [isRunning, setIsRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOptimized, setShowOptimized] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [customSpecs, setCustomSpecs] = useState<Record<string, PDNTargetSpec>>({});
  const [expandedSuggestions, setExpandedSuggestions] = useState(true);
  const [expandedNetDetails, setExpandedNetDetails] = useState(false);

  // Canvas width tracking for responsive chart
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(580);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setChartWidth(Math.max(300, entry.contentRect.width - 32));
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Run Analysis ──
  const runAnalysis = useCallback(() => {
    setIsRunning(true);
    // Yield to browser to update UI before heavy computation
    setTimeout(() => {
      try {
        const config: Partial<PDNSweepConfig> = {
          fStart: settings.fStart,
          fStop: settings.fStop,
          nPoints: settings.nPoints,
          optimizerIterations: settings.optimizerIterations,
        };
        const result = runPDNAnalysis(board, config);
        setAnalysisResult(result);
        // Select first available net
        const nets = Object.keys(result.nets);
        if (nets.length > 0 && !nets.includes(selectedNet)) {
          setSelectedNet(nets[0]);
        }
      } finally {
        setIsRunning(false);
      }
    }, 30);
  }, [board, settings, selectedNet]);

  // Auto-run on mount
  useEffect(() => {
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived values ──
  const currentModel: PDNNetModel | null = useMemo(() => {
    if (!analysisResult) return null;
    return analysisResult.nets[selectedNet] ?? null;
  }, [analysisResult, selectedNet]);

  const frequencies = useMemo(
    () => analysisResult?.frequencySweep ?? buildFrequencySweep(settings),
    [analysisResult, settings]
  );

  // Custom target spec override
  const activeTargetSpec = useMemo<PDNTargetSpec | null>(() => {
    if (!currentModel) return null;
    return customSpecs[selectedNet] ?? currentModel.targetSpec;
  }, [currentModel, customSpecs, selectedNet]);

  // Recomputed target line from custom spec
  const activeTargetLine = useMemo(() => {
    if (!activeTargetSpec) return currentModel?.targetLine ?? null;
    return buildTargetLine(activeTargetSpec, frequencies);
  }, [activeTargetSpec, frequencies, currentModel]);

  // Optimized curve: sweep with all virtual caps from suggestions
  const optimizedCurve = useMemo(() => {
    if (!currentModel || !showOptimized || !analysisResult) return undefined;
    const netSuggestions = analysisResult.suggestions.filter(
      s => s.netId === selectedNet && !dismissedIds.has(s.id)
    );
    if (netSuggestions.length === 0) return undefined;
    const augmentedCaps = [
      ...currentModel.decouplingCaps,
      ...netSuggestions.map(s => s.cap),
    ];
    return sweepPDNImpedance(
      { ...currentModel, decouplingCaps: augmentedCaps },
      frequencies
    );
  }, [currentModel, showOptimized, analysisResult, selectedNet, dismissedIds, frequencies]);

  // Net summary statistics
  const netStats = useMemo(() => {
    if (!currentModel || !activeTargetLine) return null;
    const curve = currentModel.impedanceCurve;
    const target = activeTargetLine.points;
    let peakZ = 0;
    let peakF = 0;
    let violations = 0;
    for (let i = 0; i < curve.length; i++) {
      if (curve[i].impedanceMag > peakZ) {
        peakZ = curve[i].impedanceMag;
        peakF = curve[i].frequency;
      }
      if (curve[i].impedanceMag > (target[i]?.impedanceMag ?? Infinity)) violations++;
    }
    const violationPct = (violations / curve.length) * 100;
    const margin = target[Math.floor(target.length / 2)]?.impedanceMag ?? 0.066;
    const midZ = curve[Math.floor(curve.length / 2)]?.impedanceMag ?? 0;
    const marginDb = midZ > 0 ? 20 * Math.log10(margin / midZ) : 0;
    return { peakZ, peakF, violationPct, marginDb, violations };
  }, [currentModel, activeTargetLine]);

  // Suggestions filtered for the current net
  const netSuggestions = useMemo<PDNOptimizerSuggestion[]>(() => {
    if (!analysisResult) return [];
    return analysisResult.suggestions
      .filter(s => s.netId === selectedNet && !dismissedIds.has(s.id))
      .map(s => ({ ...s, applied: appliedIds.has(s.id) }));
  }, [analysisResult, selectedNet, dismissedIds, appliedIds]);

  const unapplied = netSuggestions.filter(s => !s.applied);

  // ── Handlers ──
  const handleApplySuggestion = useCallback((suggestion: PDNOptimizerSuggestion) => {
    applyPDNSuggestions([suggestion]);
    setAppliedIds(prev => new Set([...prev, suggestion.id]));
  }, [applyPDNSuggestions]);

  const handleApplyAll = useCallback(() => {
    applyPDNSuggestions(unapplied);
    setAppliedIds(prev => new Set([...prev, ...unapplied.map(s => s.id)]));
  }, [applyPDNSuggestions, unapplied]);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  }, []);

  const handleCustomSpecChange = useCallback((spec: PDNTargetSpec) => {
    setCustomSpecs(prev => ({ ...prev, [selectedNet]: spec }));
  }, [selectedNet]);

  // ── Render ──
  const allNets = analysisResult ? Object.keys(analysisResult.nets) : [selectedNet];

  return (
    <div className="
      flex flex-col h-full bg-[#0b0b10] text-gray-200 overflow-hidden
      border-l border-slate-800
    ">
      {/* ── Header ── */}
      <div className="
        flex items-center justify-between px-4 py-3
        border-b border-slate-800 bg-slate-900/60 flex-shrink-0
      ">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30
            flex items-center justify-center">
            <Activity size={14} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 leading-tight">
              PDN Impedance Analyzer
            </h2>
            <p className="text-[10px] text-slate-500 leading-tight">
              DC – 1 GHz RLC ladder · IPC target line · Gradient-descent optimizer
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`
              p-1.5 rounded transition-colors
              ${showSettings ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:text-slate-200'}
            `}
            title="Analysis settings"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={runAnalysis}
            disabled={isRunning}
            className="
              flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold
              bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300
              border border-cyan-600/40 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <RefreshCw size={11} className={isRunning ? 'animate-spin' : ''} />
            {isRunning ? 'Analyzing…' : 'Re-analyze'}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-200 transition-colors rounded"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Settings Panel ── */}
      {showSettings && (
        <div className="border-b border-slate-800 bg-slate-900/40 px-4 py-3 flex-shrink-0">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 font-semibold">
            Sweep Configuration
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">
            {([
              ['Start Freq', 'fStart', 'kHz', 1e3, 1],
              ['Stop Freq',  'fStop',  'GHz', 1e9, 0.1],
              ['Points',     'nPoints','',    1,   10],
              ['Opt. Iter.', 'optimizerIterations','', 1, 1],
            ] as [string, keyof SettingsState, string, number, number][]).map(
              ([label, key, unit, scale, step]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-slate-400 w-20 text-[10px]">{label}</span>
                  <input
                    type="number"
                    step={step}
                    value={Number(settings[key] / scale)}
                    onChange={e => {
                      const v = parseFloat(e.target.value) * scale;
                      if (!isNaN(v) && v > 0) setSettings(s => ({ ...s, [key]: v }));
                    }}
                    className="
                      w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1
                      text-xs text-slate-200 focus:outline-none focus:border-cyan-500
                    "
                  />
                  {unit && <span className="text-slate-500 text-[10px]">{unit}</span>}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ── Loading Overlay ── */}
      {isRunning && (
        <div className="
          absolute inset-0 z-50 flex flex-col items-center justify-center
          bg-[#0b0b10]/80 backdrop-blur-sm
        ">
          <RefreshCw size={28} className="text-cyan-400 animate-spin mb-3" />
          <p className="text-sm text-slate-300 font-mono">Running PDN sweep…</p>
          <p className="text-xs text-slate-500 mt-1">
            {settings.nPoints} frequency points · {allNets.length} nets
          </p>
        </div>
      )}

      {/* ── Main Content ── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-4 py-3 space-y-4"
      >
        {/* Net Selector */}
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">
            Power Net
          </p>
          <NetSelector
            nets={allNets}
            selected={selectedNet}
            onSelect={setSelectedNet}
            results={analysisResult}
          />
        </div>

        {/* Stats Row */}
        {netStats && (
          <div className="grid grid-cols-4 gap-2">
            <StatBadge
              label="Peak |Z|"
              value={netStats.peakZ >= 1
                ? `${netStats.peakZ.toFixed(2)}Ω`
                : `${(netStats.peakZ * 1000).toFixed(1)}mΩ`
              }
              variant={netStats.violations > 0 ? 'error' : 'ok'}
            />
            <StatBadge
              label="Peak Freq"
              value={formatFrequency(netStats.peakF)}
              variant="info"
            />
            <StatBadge
              label="Violations"
              value={`${netStats.violationPct.toFixed(1)}%`}
              variant={netStats.violationPct > 20 ? 'error' : netStats.violationPct > 5 ? 'warn' : 'ok'}
            />
            <StatBadge
              label="Mid-band Margin"
              value={`${netStats.marginDb >= 0 ? '+' : ''}${netStats.marginDb.toFixed(1)} dB`}
              variant={netStats.marginDb >= 6 ? 'ok' : netStats.marginDb >= 0 ? 'warn' : 'error'}
            />
          </div>
        )}

        {/* Bode Chart */}
        {currentModel && activeTargetLine ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
              <span className="text-[10px] text-slate-400 font-mono font-semibold uppercase tracking-wider">
                |Z| vs Frequency — {selectedNet}
              </span>
              <button
                onClick={() => setShowOptimized(v => !v)}
                className={`
                  flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono
                  border transition-colors
                  ${showOptimized
                    ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
                  }
                `}
              >
                {showOptimized ? <TrendingDown size={9} /> : <Sparkles size={9} />}
                {showOptimized ? 'Optimized' : 'Show Optimized'}
              </button>
            </div>
            <PDNChart
              curve={currentModel.impedanceCurve}
              targetLine={activeTargetLine}
              netId={selectedNet}
              width={chartWidth}
              height={260}
              showViolations
              optimizedCurve={showOptimized ? optimizedCurve : undefined}
            />
          </div>
        ) : !isRunning ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8 text-center">
            <ZapOff size={28} className="mx-auto text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">No analysis data yet.</p>
            <p className="text-xs text-slate-600 mt-1">Click "Re-analyze" to run a PDN sweep.</p>
          </div>
        ) : null}

        {/* Target Spec Editor */}
        {activeTargetSpec && (
          <details className="group">
            <summary className="
              flex items-center gap-2 cursor-pointer
              text-[10px] text-slate-500 uppercase tracking-wider font-semibold
              hover:text-slate-300 transition-colors list-none
            ">
              <ChevronRight size={12}
                className="group-open:rotate-90 transition-transform" />
              IC Target Spec ({selectedNet})
            </summary>
            <div className="mt-2 pl-4 border-l border-slate-800">
              <TargetSpecEditor
                spec={activeTargetSpec}
                onChange={handleCustomSpecChange}
              />
              <p className="text-[9px] text-slate-600 mt-2">
                Z_target = ΔV / ΔI = {
                  activeTargetSpec.maxDeltaV >= 1
                    ? `${activeTargetSpec.maxDeltaV.toFixed(3)} V`
                    : `${(activeTargetSpec.maxDeltaV * 1000).toFixed(1)} mV`
                } / {activeTargetSpec.maxCurrentStep.toFixed(2)} A = {
                  (activeTargetSpec.maxDeltaV / activeTargetSpec.maxCurrentStep) < 1
                    ? `${((activeTargetSpec.maxDeltaV / activeTargetSpec.maxCurrentStep) * 1000).toFixed(1)} mΩ`
                    : `${(activeTargetSpec.maxDeltaV / activeTargetSpec.maxCurrentStep).toFixed(3)} Ω`
                }
              </p>
            </div>
          </details>
        )}

        {/* Optimizer Suggestions */}
        {analysisResult && (
          <div>
            <button
              onClick={() => setExpandedSuggestions(v => !v)}
              className="
                flex items-center justify-between w-full
                text-[10px] text-slate-400 uppercase tracking-wider font-semibold
                hover:text-slate-200 transition-colors py-1
              "
            >
              <span className="flex items-center gap-2">
                {expandedSuggestions ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Sparkles size={11} className="text-amber-400" />
                Optimizer Suggestions ({unapplied.length} pending)
              </span>
              {unapplied.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); handleApplyAll(); }}
                  className="
                    flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold
                    bg-amber-600/20 hover:bg-amber-600/40 text-amber-300
                    border border-amber-600/40 transition-colors
                    normal-case tracking-normal
                  "
                >
                  <Zap size={9} />
                  Apply All ({unapplied.length})
                </button>
              )}
            </button>

            {expandedSuggestions && (
              <div className="space-y-2 mt-2">
                {netSuggestions.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4 text-center">
                    <CheckCircle size={18} className="mx-auto text-emerald-500 mb-1" />
                    <p className="text-xs text-slate-400">PDN meets target impedance.</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">No additional caps required for {selectedNet}.</p>
                  </div>
                ) : (
                  netSuggestions.map(s => (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      onApply={handleApplySuggestion}
                      onDismiss={handleDismiss}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Network Model Details */}
        {currentModel && (
          <details open={expandedNetDetails}>
            <summary
              className="
                flex items-center gap-2 cursor-pointer
                text-[10px] text-slate-500 uppercase tracking-wider font-semibold
                hover:text-slate-300 transition-colors list-none
              "
              onClick={() => setExpandedNetDetails(v => !v)}
            >
              <ChevronRight size={12}
                className={expandedNetDetails ? 'rotate-90' : ''} />
              <Cpu size={11} />
              RLC Network Model
            </summary>
            <div className="mt-2 space-y-2 pl-4 border-l border-slate-800 text-[11px] font-mono">
              {/* VRM Model */}
              <div>
                <p className="text-slate-500 text-[9px] uppercase tracking-wider mb-1">
                  VRM / Regulator
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-400">
                  <span>Output R:</span>
                  <span className="text-slate-200">
                    {(currentModel.vrm.outputResistance * 1000).toFixed(1)} mΩ
                  </span>
                  <span>Trace L:</span>
                  <span className="text-slate-200">
                    {(currentModel.vrm.traceInductance * 1e9).toFixed(1)} nH
                  </span>
                  <span>Bulk caps:</span>
                  <span className="text-slate-200">
                    {currentModel.vrm.bulkCapacitors.length}×{' '}
                    {currentModel.vrm.bulkCapacitors.length > 0
                      ? formatCapacitance(currentModel.vrm.bulkCapacitors[0].capacitance)
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Plane Model */}
              <div>
                <p className="text-slate-500 text-[9px] uppercase tracking-wider mb-1">
                  PCB Power Plane
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-400">
                  <span>Area:</span>
                  <span className="text-slate-200">
                    {currentModel.plane.planeAreaMm2.toFixed(0)} mm²
                  </span>
                  <span>Separation:</span>
                  <span className="text-slate-200">
                    {currentModel.plane.separationMm} mm
                  </span>
                  <span>εr:</span>
                  <span className="text-slate-200">
                    {currentModel.plane.dielectricConstant}
                  </span>
                  <span>C_plane:</span>
                  <span className="text-slate-200">
                    {formatCapacitance(currentModel.plane.planeCap)}
                  </span>
                  <span>L_spread:</span>
                  <span className="text-slate-200">
                    {(currentModel.plane.spreadingInductance * 1e9).toFixed(0)} pH
                  </span>
                </div>
              </div>

              {/* Package Model */}
              <div>
                <p className="text-slate-500 text-[9px] uppercase tracking-wider mb-1">
                  IC Package / Die
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-400">
                  <span>Die cap:</span>
                  <span className="text-slate-200">
                    {formatCapacitance(currentModel.packageModel.dieCap)}
                  </span>
                  <span>Pkg L:</span>
                  <span className="text-slate-200">
                    {(currentModel.packageModel.packageInductance * 1e9).toFixed(1)} nH
                  </span>
                  <span>Pkg R:</span>
                  <span className="text-slate-200">
                    {(currentModel.packageModel.packageResistance * 1000).toFixed(0)} mΩ
                  </span>
                </div>
              </div>

              {/* Decoupling Caps */}
              <div>
                <p className="text-slate-500 text-[9px] uppercase tracking-wider mb-1">
                  Decoupling Caps ({currentModel.decouplingCaps.length})
                </p>
                {currentModel.decouplingCaps.length === 0 ? (
                  <p className="text-slate-600 text-[10px]">
                    None detected on this net — optimizer will recommend placements.
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {currentModel.decouplingCaps.slice(0, 5).map(c => (
                      <div key={c.id} className="flex items-center gap-3 text-slate-400">
                        <span className="text-slate-200">{formatCapacitance(c.capacitance)}</span>
                        <span className="text-slate-600">
                          ESR {(c.esr * 1000).toFixed(0)} mΩ
                        </span>
                        <span className="text-slate-600">
                          ESL {(c.esl * 1e9).toFixed(1)} nH
                        </span>
                      </div>
                    ))}
                    {currentModel.decouplingCaps.length > 5 && (
                      <p className="text-slate-600 text-[10px]">
                        +{currentModel.decouplingCaps.length - 5} more…
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </details>
        )}

        {/* Timestamp */}
        {analysisResult && (
          <p className="text-[9px] text-slate-700 font-mono text-center pb-1">
            Last analyzed: {new Date(analysisResult.analyzedAt).toLocaleTimeString()}
            {' · '}
            {analysisResult.frequencySweep.length} pts
            {' · '}
            {Object.keys(analysisResult.nets).length} nets
          </p>
        )}
      </div>
    </div>
  );
};

export default PDNAnalyzer;
