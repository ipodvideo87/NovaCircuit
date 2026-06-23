/**
 * PDN (Power Distribution Network) Impedance Analyzer
 *
 * Models the PDN as a parallel combination of RLC ladder networks:
 *   VRM output impedance → Bulk capacitors → PCB plane cap → MLCC decoupling caps → Package+Die cap
 *
 * Each branch is a series RLC: Z_branch(f) = R + j(2πfL) + 1/(j2πfC)
 * The total PDN impedance at each node is computed by combining branches in parallel.
 *
 * Frequency sweep: 1 kHz → 1 GHz, log-spaced (200 points by default).
 * Target impedance: Z_target = ΔV/ΔI (flat), rolling off at –20 dB/dec beyond knee freq.
 * Optimizer: gradient-descent over cap count/value to minimise ∫|Z-Ztarget|² df.
 */

import type {
  PCBBoard,
  PCBComponent,
  PDNCapacitor,
  PDNImpedancePoint,
  PDNNetModel,
  PDNOptimizerSuggestion,
  PDNPlaneModel,
  PDNPackageModel,
  PDNTargetLine,
  PDNTargetSpec,
  PDNVRMModel,
  PDNAnalysisResult,
  PDNSweepConfig,
} from '../types/pcb';

// ─── Constants ───────────────────────────────────────────────────────────────

const EPSILON_0 = 8.854187817e-12; // F/m

// Standard MLCC cap values available (Farads)
const DEFAULT_CAP_CANDIDATES: number[] = [
  1e-12, 10e-12, 100e-12,
  1e-9, 4.7e-9, 10e-9, 47e-9, 100e-9,
  1e-6, 2.2e-6, 4.7e-6, 10e-6, 22e-6, 47e-6, 100e-6,
  220e-6, 470e-6, 1000e-6,
];

// Package size → typical ESL in Henries
const PACKAGE_ESL: Record<string, number> = {
  '0201': 0.3e-9,
  '0402': 0.5e-9,
  '0603': 0.8e-9,
  '0805': 1.2e-9,
  '1206': 1.8e-9,
};

// Default ESR model: ESR ≈ 0.01 Ω for ceramic, varies with value
function estimateESR(capacitance: number): number {
  // Ceramic caps: ESR ~ 10 mΩ for 100 nF, scales inversely with C
  if (capacitance >= 1e-6) return 0.005 + 0.002 * (capacitance / 1e-6);
  if (capacitance >= 100e-9) return 0.015;
  if (capacitance >= 10e-9) return 0.05;
  return 0.1;
}

function estimateESL(capacitance: number): number {
  // 0402 default for decoupling MLCCs placed near ICs
  if (capacitance >= 10e-6) return PACKAGE_ESL['0805'];
  if (capacitance >= 1e-6) return PACKAGE_ESL['0603'];
  if (capacitance >= 100e-9) return PACKAGE_ESL['0402'];
  return PACKAGE_ESL['0201'];
}

// ─── Frequency Sweep Utilities ───────────────────────────────────────────────

export function buildFrequencySweep(config: Partial<PDNSweepConfig> = {}): number[] {
  const fStart = config.fStart ?? 1e3;
  const fStop = config.fStop ?? 1e9;
  const n = config.nPoints ?? 200;
  const logStart = Math.log10(fStart);
  const logStop = Math.log10(fStop);
  return Array.from({ length: n }, (_, i) =>
    Math.pow(10, logStart + (i / (n - 1)) * (logStop - logStart))
  );
}

// ─── Complex Arithmetic ──────────────────────────────────────────────────────

interface Complex {
  re: number;
  im: number;
}

function cadd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

function cmul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cdiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) return { re: Infinity, im: 0 };
  return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
}

function cmag(c: Complex): number {
  return Math.sqrt(c.re * c.re + c.im * c.im);
}

function cinv(c: Complex): Complex {
  return cdiv({ re: 1, im: 0 }, c);
}

/**
 * Series RLC impedance at angular frequency ω:
 *   Z = R + jωL + 1/(jωC)
 */
function zSeriesRLC(R: number, L: number, C: number, omega: number): Complex {
  const jOmegaL = { re: 0, im: omega * L };
  const jOmegaC = { re: 0, im: omega * C };
  // 1/(jωC)
  const invCap = cinv(jOmegaC);
  return cadd({ re: R, im: 0 }, cadd(jOmegaL, invCap));
}

/**
 * Parallel combination of N complex impedances.
 */
function zParallel(impedances: Complex[]): Complex {
  // 1/Z_total = Σ 1/Z_i
  const admittanceSum = impedances.reduce(
    (acc, z) => cadd(acc, cinv(z)),
    { re: 0, im: 0 }
  );
  return cinv(admittanceSum);
}

// ─── PDN Network Model Builder ────────────────────────────────────────────────

/**
 * Detect the power nets in the board that have at least one active IC (MCU, LDO, etc.)
 * drawing from them, or are named as known power rails.
 */
export function detectPowerNets(board: PCBBoard): string[] {
  const powerNetPatterns = [
    /^vcc/i, /^vdd/i, /^3\.3v/i, /^5v/i, /^1\.8v/i, /^1\.2v/i, /^12v/i, /^vbus/i,
  ];
  const seen = new Set<string>();
  board.traces.forEach(t => {
    if (powerNetPatterns.some(p => p.test(t.netId))) {
      seen.add(t.netId);
    }
  });
  // Always include canonical nets if any trace exists on the board
  if (board.traces.length > 0) {
    ['vcc-3.3v', 'vcc-5v'].forEach(n => {
      if (board.traces.some(t => t.netId === n)) seen.add(n);
    });
  }
  // De-duplicate and return sorted
  const nets = Array.from(seen).sort();
  return nets.length > 0 ? nets : ['vcc-3.3v'];
}

/**
 * Identify capacitors on the board that belong to a given power net.
 * Capacitors are components with type CAPACITOR whose nearest trace carries the net.
 */
export function findDecouplingCaps(
  board: PCBBoard,
  netId: string
): PDNCapacitor[] {
  const caps: PDNCapacitor[] = [];

  // Find all CAPACITOR components
  const capComponents = board.components.filter(
    c => c.type === 'CAPACITOR' || c.type === 'CAP'
  );

  // For each cap component, check if any trace within 100 canvas-units belongs to the net
  capComponents.forEach(comp => {
    const nearbyTrace = board.traces.find(t => {
      if (t.netId !== netId) return false;
      // Distance from component to trace midpoint
      const mx = (t.startX + t.endX) / 2;
      const my = (t.startY + t.endY) / 2;
      const dx = comp.x - mx;
      const dy = comp.y - my;
      return Math.sqrt(dx * dx + dy * dy) < 150;
    });
    if (nearbyTrace) {
      // Infer capacitance from name hints or assign a default (100 nF is most common)
      const cap = inferCapacitanceFromComponent(comp);
      caps.push({
        id: comp.id,
        capacitance: cap,
        esr: estimateESR(cap),
        esl: estimateESL(cap),
        netId,
        x: comp.x,
        y: comp.y,
      });
    }
  });

  // If no caps found, still return an empty list (optimizer will add virtual ones)
  return caps;
}

function inferCapacitanceFromComponent(comp: PCBComponent): number {
  const name = comp.name.toLowerCase();
  // Parse common notations: 100n, 10u, 0.1u, 100nF, 10uF
  const match = name.match(/([\d.]+)\s*(p|n|u|µ|m)f?/i);
  if (match) {
    const val = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'p') return val * 1e-12;
    if (unit === 'n') return val * 1e-9;
    if (unit === 'u' || unit === 'µ') return val * 1e-6;
    if (unit === 'm') return val * 1e-3;
  }
  // Default: 100 nF MLCC decoupling
  return 100e-9;
}

/**
 * Build the plane capacitance model from board geometry heuristics.
 * For a 4-layer FR-4 board: inner layers are 0.1 mm apart (≈ standard prepreg).
 */
function buildPlaneModel(board: PCBBoard): PDNPlaneModel {
  // Estimate board area from component spread
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  board.components.forEach(c => {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  });
  if (!isFinite(minX)) { minX = 0; maxX = 100; minY = 0; maxY = 80; }
  const widthMm = Math.max((maxX - minX) / 10, 50); // canvas units ÷ 10 → mm
  const heightMm = Math.max((maxY - minY) / 10, 40);
  const areaMm2 = widthMm * heightMm;
  const areaM2 = areaMm2 * 1e-6;

  const separationMm = 0.1;    // 100 µm prepreg
  const separationM = separationMm * 1e-3;
  const er = 4.3;               // FR-4

  // C = ε0 · εr · A / d
  const planeCap = (EPSILON_0 * er * areaM2) / separationM;

  return {
    planeAreaMm2: areaMm2,
    separationMm,
    dielectricConstant: er,
    planeCap,
    spreadingInductance: 0.2e-9,  // 200 pH typical for solid plane
  };
}

/**
 * Build the VRM model with heuristic bulk capacitor banks.
 */
function buildVRMModel(board: PCBBoard, netId: string): PDNVRMModel {
  // Identify components that act as VRM/LDO output on this net
  const ldoComponents = board.components.filter(
    c => c.type === 'LDO' || c.type === 'VOLTAGE_REG' || c.type === 'IC'
  );

  // Find large electrolytic / tantalum caps near the VRM (> 10 µF)
  const bulkCaps: PDNCapacitor[] = [];
  const capComponents = board.components.filter(
    c => c.type === 'CAPACITOR' || c.type === 'CAP'
  );

  if (ldoComponents.length > 0) {
    const refComp = ldoComponents[0];
    capComponents.forEach(comp => {
      const dx = comp.x - refComp.x;
      const dy = comp.y - refComp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 300) {
        const cap = inferCapacitanceFromComponent(comp);
        if (cap >= 10e-6) {
          bulkCaps.push({
            id: comp.id,
            capacitance: cap,
            esr: estimateESR(cap) + 0.02,  // Electrolytic has higher ESR
            esl: 5e-9,                       // Electrolytic ESL ≈ 5 nH
            netId,
            x: comp.x,
            y: comp.y,
          });
        }
      }
    });
  }

  // Default bulk: 47 µF electrolytic if none found
  if (bulkCaps.length === 0) {
    bulkCaps.push({
      id: 'virtual-bulk-1',
      capacitance: 47e-6,
      esr: 0.05,
      esl: 5e-9,
      netId,
      x: 0,
      y: 0,
    });
  }

  return {
    outputResistance: 0.010,   // 10 mΩ VRM output impedance
    traceInductance: 2e-9,    // 2 nH trace from VRM to first cap
    bulkCapacitors: bulkCaps,
  };
}

/**
 * Build the IC package+die model heuristic.
 * Modern MCUs: ~50 nF die cap, ~1 nH package inductance.
 */
function buildPackageModel(board: PCBBoard): PDNPackageModel {
  const mcuCount = board.components.filter(c => c.type === 'MCU' || c.type === 'IC').length;
  return {
    dieCap: Math.max(10e-9, mcuCount * 50e-9),
    packageInductance: 1e-9,
    packageResistance: 0.002,
  };
}

// ─── Impedance Sweep ─────────────────────────────────────────────────────────

/**
 * Compute the PDN impedance at a single frequency.
 *
 * Network topology (parallel branches viewed from IC pads):
 *
 *   [VRM]──[bulkCaps]──┐
 *   [planeCap]──────────┤  (all in parallel at the PDN node)
 *   [decouplingCaps]───┤
 *   [packageCap]────────┘
 *
 * VRM branch is a series R_vrm + L_trace in series with parallel(bulkCaps).
 * Each branch is a series RLC.
 */
function computePDNImpedance(
  vrm: PDNVRMModel,
  plane: PDNPlaneModel,
  pkg: PDNPackageModel,
  decouplingCaps: PDNCapacitor[],
  omega: number
): Complex {
  // ── VRM Branch ──
  // Bulk capacitors in parallel
  const bulkParallel = vrm.bulkCapacitors.length > 0
    ? zParallel(vrm.bulkCapacitors.map(c => zSeriesRLC(c.esr, c.esl, c.capacitance, omega)))
    : { re: 1e6, im: 0 }; // Open if none

  // VRM series: R_vrm + jωL_trace + Z_bulkParallel
  const vrmBranch: Complex = {
    re: vrm.outputResistance + bulkParallel.re,
    im: omega * vrm.traceInductance + bulkParallel.im,
  };

  // ── Plane Branch ──
  const planeBranch = zSeriesRLC(0.001, plane.spreadingInductance, plane.planeCap, omega);

  // ── Decoupling Cap Branches ──
  const decoupBranches = decouplingCaps.map(c =>
    zSeriesRLC(c.esr, c.esl, c.capacitance, omega)
  );

  // ── Package + Die Branch ──
  const pkgBranch = zSeriesRLC(pkg.packageResistance, pkg.packageInductance, pkg.dieCap, omega);

  // ── Total: all branches in parallel ──
  const allBranches = [vrmBranch, planeBranch, pkgBranch, ...decoupBranches];
  return zParallel(allBranches);
}

/**
 * Run the full frequency sweep for a PDN net model.
 */
export function sweepPDNImpedance(
  model: Omit<PDNNetModel, 'impedanceCurve' | 'targetLine'>,
  frequencies: number[]
): PDNImpedancePoint[] {
  return frequencies.map(f => {
    const omega = 2 * Math.PI * f;
    const z = computePDNImpedance(
      model.vrm,
      model.plane,
      model.packageModel,
      model.decouplingCaps,
      omega
    );
    return {
      frequency: f,
      impedanceMag: cmag(z),
      impedanceRe: z.re,
      impedanceIm: z.im,
    };
  });
}

// ─── Target Impedance Line ────────────────────────────────────────────────────

/**
 * Compute the IPC-PDN target impedance spec:
 *   Z_target = ΔV / ΔI          (flat from DC to knee freq)
 *   Beyond knee: falls at –20 dB/decade (capacitive load)
 *
 *   Knee frequency = slewRate / (2π · maxCurrentStep)
 */
export function buildTargetLine(spec: PDNTargetSpec, frequencies: number[]): PDNTargetLine {
  const zTarget = spec.maxDeltaV / spec.maxCurrentStep;
  // Knee frequency: fknee = (1/2π) · (dI/dt) / ΔI
  const kneeFrequency = spec.slewRate / (2 * Math.PI * spec.maxCurrentStep);

  const points: PDNImpedancePoint[] = frequencies.map(f => {
    let impedanceMag: number;
    if (f <= kneeFrequency) {
      impedanceMag = zTarget;
    } else {
      // –20 dB/decade roll-off
      impedanceMag = zTarget * (kneeFrequency / f);
    }
    return { frequency: f, impedanceMag, impedanceRe: impedanceMag, impedanceIm: 0 };
  });

  return { zTarget, kneeFrequency, points };
}

// ─── Default Target Specs per Net ────────────────────────────────────────────

const NET_TARGET_SPECS: Record<string, Partial<PDNTargetSpec>> = {
  'vcc-3.3v': {
    maxDeltaV: 0.033,      // 1% of 3.3 V
    maxCurrentStep: 0.5,   // 500 mA transient
    slewRate: 1e9,         // 1 A/µs
    supplyVoltage: 3.3,
    iccQ: 0.1,
  },
  'vcc-5v': {
    maxDeltaV: 0.05,       // 1% of 5 V
    maxCurrentStep: 1.0,
    slewRate: 2e9,
    supplyVoltage: 5.0,
    iccQ: 0.2,
  },
  'vbus': {
    maxDeltaV: 0.1,
    maxCurrentStep: 2.0,
    slewRate: 5e9,
    supplyVoltage: 5.0,
    iccQ: 0.5,
  },
};

function defaultTargetSpec(netId: string): PDNTargetSpec {
  const override = NET_TARGET_SPECS[netId] ?? {};
  return {
    netId,
    maxDeltaV: override.maxDeltaV ?? 0.05,
    maxCurrentStep: override.maxCurrentStep ?? 0.5,
    slewRate: override.slewRate ?? 1e9,
    supplyVoltage: override.supplyVoltage ?? 3.3,
    iccQ: override.iccQ ?? 0.1,
  };
}

// ─── Gradient-Descent Optimizer ──────────────────────────────────────────────

/**
 * Objective function: mean-squared error of log10(|Z|/Z_target) over frequency.
 * Violations (|Z| > Z_target) are penalised 3× more than headroom.
 */
function computeObjective(
  impedanceCurve: PDNImpedancePoint[],
  targetLine: PDNTargetLine
): number {
  let mse = 0;
  for (let i = 0; i < impedanceCurve.length; i++) {
    const measured = impedanceCurve[i].impedanceMag;
    const target = targetLine.points[i].impedanceMag;
    const ratio = Math.log10(Math.max(measured, 1e-6) / Math.max(target, 1e-6));
    // Penalise violations (ratio > 0) more heavily
    mse += ratio > 0 ? ratio * ratio * 3 : ratio * ratio;
  }
  return mse / impedanceCurve.length;
}

/**
 * Find the frequency index with the worst Z violation above target.
 */
function findWorstViolationIndex(
  curve: PDNImpedancePoint[],
  targetLine: PDNTargetLine
): number {
  let worstIdx = 0;
  let worstExcess = -Infinity;
  for (let i = 0; i < curve.length; i++) {
    const excess = curve[i].impedanceMag - targetLine.points[i].impedanceMag;
    if (excess > worstExcess) {
      worstExcess = excess;
      worstIdx = i;
    }
  }
  return worstIdx;
}

/**
 * Run gradient-descent optimizer to recommend decoupling capacitors.
 *
 * Strategy:
 *  1. Evaluate current objective score.
 *  2. For each candidate cap value, simulate adding one cap at the ideal proxy location
 *     (nearest IC on the net).
 *  3. Accept the candidate that produces the greatest objective reduction.
 *  4. Repeat for up to `maxIterations` rounds or until objective < threshold.
 */
export function runPDNOptimizer(
  model: PDNNetModel,
  board: PCBBoard,
  frequencies: number[],
  config: Partial<PDNSweepConfig> = {}
): PDNOptimizerSuggestion[] {
  const maxIterations = config.optimizerIterations ?? 8;
  const capCandidates = config.capValueCandidates ?? DEFAULT_CAP_CANDIDATES;
  const suggestions: PDNOptimizerSuggestion[] = [];

  // Find nearest IC for proximity placement
  const icComponents = board.components.filter(
    c => c.type === 'MCU' || c.type === 'IC' || c.type === 'LDO' || c.type === 'OP-AMP' || c.type === 'ADC'
  );

  // Working set of decoupling caps (starts with current real caps)
  let workingCaps: PDNCapacitor[] = [...model.decouplingCaps];
  let currentCurve = sweepPDNImpedance(
    { ...model, decouplingCaps: workingCaps },
    frequencies
  );
  let currentObjective = computeObjective(currentCurve, model.targetLine);

  const objectiveThreshold = 0.01; // Stop when average log-error < 0.01

  for (let iter = 0; iter < maxIterations; iter++) {
    if (currentObjective < objectiveThreshold) break;

    // Find worst violation frequency
    const worstIdx = findWorstViolationIndex(currentCurve, model.targetLine);
    const worstFrequency = frequencies[worstIdx];

    // Try each cap value candidate
    let bestDelta = 0;
    let bestCap: PDNCapacitor | null = null;
    let bestCurve: PDNImpedancePoint[] | null = null;

    for (const capValue of capCandidates) {
      // Choose placement: near the worst-affected IC or board center
      const nearIC = icComponents.length > 0
        ? icComponents[Math.floor(Math.random() * icComponents.length)]
        : null;
      const placeX = nearIC ? nearIC.x + (Math.random() - 0.5) * 20 : 50;
      const placeY = nearIC ? nearIC.y + (Math.random() - 0.5) * 20 : 50;

      const trialCap: PDNCapacitor = {
        id: `opt-cap-${iter}-${capValue.toExponential(2)}`,
        capacitance: capValue,
        esr: estimateESR(capValue),
        esl: estimateESL(capValue),
        netId: model.netId,
        x: placeX,
        y: placeY,
        virtual: true,
      };

      const trialCaps = [...workingCaps, trialCap];
      const trialCurve = sweepPDNImpedance(
        { ...model, decouplingCaps: trialCaps },
        frequencies
      );
      const trialObjective = computeObjective(trialCurve, model.targetLine);
      const delta = currentObjective - trialObjective;

      if (delta > bestDelta) {
        bestDelta = delta;
        bestCap = trialCap;
        bestCurve = trialCurve;
      }
    }

    if (bestCap === null || bestDelta < 1e-6) break; // No improvement possible

    // Accept best candidate
    workingCaps = [...workingCaps, bestCap];
    currentCurve = bestCurve!;
    currentObjective -= bestDelta;

    const improvementPct = Math.min(99, (bestDelta / (currentObjective + bestDelta)) * 100);
    const nearIC = icComponents.length > 0
      ? icComponents.reduce((closest, ic) => {
          const d1 = Math.hypot(ic.x - bestCap!.x, ic.y - bestCap!.y);
          const d2 = Math.hypot(closest.x - bestCap!.x, closest.y - bestCap!.y);
          return d1 < d2 ? ic : closest;
        })
      : null;

    suggestions.push({
      id: `suggestion-${iter}`,
      type: 'ADD_CAP',
      netId: model.netId,
      description: buildSuggestionDescription(bestCap, nearIC?.name ?? null, worstFrequency),
      cap: bestCap,
      nearComponentId: nearIC?.id,
      estimatedImprovementPct: Math.round(improvementPct * 10) / 10,
      worstViolationHz: worstFrequency,
      applied: false,
    });
  }

  return suggestions;
}

function buildSuggestionDescription(
  cap: PDNCapacitor,
  nearName: string | null,
  worstHz: number
): string {
  const capStr = formatCapacitance(cap.capacitance);
  const freqStr = formatFrequency(worstHz);
  const proximity = nearName ? ` near ${nearName}` : ' on power rail';
  return `Add ${capStr} MLCC (ESR ${(cap.esr * 1000).toFixed(0)} mΩ, ESL ${(cap.esl * 1e9).toFixed(1)} nH)${proximity} — targets |Z| violation at ${freqStr}`;
}

function formatCapacitance(c: number): string {
  if (c >= 1e-3) return `${(c * 1e3).toFixed(0)} mF`;
  if (c >= 1e-6) return `${(c * 1e6).toFixed(c >= 10e-6 ? 0 : 1)} µF`;
  if (c >= 1e-9) return `${(c * 1e9).toFixed(c >= 10e-9 ? 0 : 1)} nF`;
  return `${(c * 1e12).toFixed(0)} pF`;
}

function formatFrequency(f: number): string {
  if (f >= 1e9) return `${(f / 1e9).toFixed(2)} GHz`;
  if (f >= 1e6) return `${(f / 1e6).toFixed(1)} MHz`;
  if (f >= 1e3) return `${(f / 1e3).toFixed(1)} kHz`;
  return `${f.toFixed(0)} Hz`;
}

// ─── Public API: Full Analysis Run ───────────────────────────────────────────

/**
 * Run a complete PDN analysis on the board for all detected power nets.
 */
export function runPDNAnalysis(
  board: PCBBoard,
  config: Partial<PDNSweepConfig> = {}
): PDNAnalysisResult {
  const frequencies = buildFrequencySweep(config);
  const netIds = detectPowerNets(board);
  const nets: Record<string, PDNNetModel> = {};
  const allSuggestions: PDNOptimizerSuggestion[] = [];

  for (const netId of netIds) {
    const decouplingCaps = findDecouplingCaps(board, netId);
    const plane = buildPlaneModel(board);
    const packageModel = buildPackageModel(board);
    const vrm = buildVRMModel(board, netId);
    const targetSpec = defaultTargetSpec(netId);
    const targetLine = buildTargetLine(targetSpec, frequencies);

    const partialModel = {
      netId,
      vrm,
      plane,
      packageModel,
      decouplingCaps,
      targetSpec,
      targetLine,
    };

    const impedanceCurve = sweepPDNImpedance(partialModel, frequencies);

    const fullModel: PDNNetModel = {
      ...partialModel,
      impedanceCurve,
    };

    nets[netId] = fullModel;

    // Run optimizer for this net
    const suggestions = runPDNOptimizer(fullModel, board, frequencies, config);
    allSuggestions.push(...suggestions);
  }

  return {
    nets,
    suggestions: allSuggestions,
    analyzedAt: Date.now(),
    frequencySweep: frequencies,
  };
}

// ─── Suggestion → PCBComponent Conversion ────────────────────────────────────

/**
 * Convert an optimizer suggestion into a PCBComponent to be committed
 * as a transaction to the Zustand store.
 */
export function suggestionToComponent(
  suggestion: PDNOptimizerSuggestion,
  existingIds: Set<string>
): PCBComponent {
  let baseId = `C-PDN-${suggestion.netId}-${suggestion.id}`;
  // Ensure uniqueness
  while (existingIds.has(baseId)) baseId += '_';
  return {
    id: baseId,
    x: suggestion.cap.x,
    y: suggestion.cap.y,
    rotation: 0,
    name: `${formatCapacitance(suggestion.cap.capacitance)} PDN`,
    type: 'CAPACITOR',
  };
}

// Re-export helpers for use in components
export { formatCapacitance, formatFrequency };
