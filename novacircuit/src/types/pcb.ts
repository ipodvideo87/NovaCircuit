// ─── Core PCB Entity Types ──────────────────────────────────────────────────

export interface PCBComponent {
  id: string;
  x: number;
  y: number;
  rotation: number;
  name: string;
  type: string;
}

export interface PCBTrace {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  netId: string;
}

export interface PCBRatsnest {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  netId: string;
}

export interface PCBBoard {
  components: PCBComponent[];
  traces: PCBTrace[];
  ratnest: PCBRatsnest[];
}

// ─── PDN Analysis Types ──────────────────────────────────────────────────────

/**
 * A single decoupling capacitor entry in the PDN model.
 * ESR / ESL values are derived from package/dielectric if not specified.
 */
export interface PDNCapacitor {
  /** Unique identifier matching a PCBComponent id, or a virtual optimizer id */
  id: string;
  /** Capacitance in Farads */
  capacitance: number;
  /** Equivalent series resistance in Ohms */
  esr: number;
  /** Equivalent series inductance in Henries */
  esl: number;
  /** Net this capacitor bypasses, e.g. "vcc-3.3v" */
  netId: string;
  /** Canvas X of the capacitor (used for proximity scoring) */
  x: number;
  /** Canvas Y of the capacitor */
  y: number;
  /** True when this cap was inserted by the optimizer (not yet committed) */
  virtual?: boolean;
}

/**
 * A single (frequency, impedance) point on the PDN impedance curve.
 */
export interface PDNImpedancePoint {
  /** Frequency in Hz */
  frequency: number;
  /** Magnitude of impedance in Ohms */
  impedanceMag: number;
  /** Real part (resistance) in Ohms */
  impedanceRe: number;
  /** Imaginary part (reactance) in Ohms */
  impedanceIm: number;
}

/**
 * Target-impedance specification derived from IC load requirements.
 */
export interface PDNTargetSpec {
  /** Net under analysis, e.g. "vcc-3.3v" */
  netId: string;
  /** Maximum allowed voltage ripple in Volts */
  maxDeltaV: number;
  /** Maximum transient current step in Amperes */
  maxCurrentStep: number;
  /** Current slew rate in A/s — used to compute corner frequency */
  slewRate: number;
  /** Supply voltage in Volts */
  supplyVoltage: number;
  /** IC quiescent current draw in Amperes */
  iccQ: number;
}

/**
 * Derived target impedance line: flat Z_target = ΔV / ΔI up to the knee frequency,
 * then falls at –20 dB/dec (capacitive dominated).
 */
export interface PDNTargetLine {
  /** Flat target impedance in Ohms: ΔV / ΔI */
  zTarget: number;
  /** Corner / knee frequency in Hz: slewRate / (2π · maxCurrentStep) */
  kneeFrequency: number;
  /** Per-frequency target points matching the sweep grid */
  points: PDNImpedancePoint[];
}

/**
 * Package-level capacitance that appears as a shunt from the IC die capacitance.
 */
export interface PDNPackageModel {
  /** Die capacitance in Farads — typical 10–100 nF for modern ICs */
  dieCap: number;
  /** Package inductance (bond-wire + ball) in Henries — typical 0.3–2 nH */
  packageInductance: number;
  /** Package resistance in Ohms */
  packageResistance: number;
}

/**
 * PCB plane / power-ground pair capacitance model.
 * Modeled as a shunt capacitor across the PDN.
 */
export interface PDNPlaneModel {
  /** Effective plane area in mm² */
  planeAreaMm2: number;
  /** Plane separation (core thickness) in mm */
  separationMm: number;
  /** Dielectric constant (FR-4 ≈ 4.3) */
  dielectricConstant: number;
  /** Derived plane capacitance in Farads (computed internally) */
  planeCap: number;
  /** Plane spreading inductance in Henries — typical 0.1–1 nH */
  spreadingInductance: number;
}

/**
 * Power delivery interconnect (VRM → PCB plane).
 * Modeled as a series RLC from the VRM output to the first decoupling node.
 */
export interface PDNVRMModel {
  /** VRM output impedance in Ohms — typical 1–20 mΩ */
  outputResistance: number;
  /** PCB trace inductance from VRM to first bulk cap in Henries */
  traceInductance: number;
  /** Bulk capacitor bank: sum of bulk caps */
  bulkCapacitors: PDNCapacitor[];
}

/**
 * Full PDN network model for a single power net.
 */
export interface PDNNetModel {
  netId: string;
  vrm: PDNVRMModel;
  plane: PDNPlaneModel;
  packageModel: PDNPackageModel;
  /** All decoupling capacitors on this net (real + virtual optimizer suggestions) */
  decouplingCaps: PDNCapacitor[];
  /** Computed impedance sweep result */
  impedanceCurve: PDNImpedancePoint[];
  /** Target impedance specification */
  targetSpec: PDNTargetSpec;
  /** Derived target line */
  targetLine: PDNTargetLine;
}

/**
 * A single optimizer suggestion: add or relocate a capacitor.
 */
export interface PDNOptimizerSuggestion {
  id: string;
  type: 'ADD_CAP' | 'RELOCATE_CAP' | 'CHANGE_VALUE';
  /** Target power net */
  netId: string;
  /** Human-readable description */
  description: string;
  /** Suggested capacitor parameters */
  cap: PDNCapacitor;
  /** Associated IC component id for proximity recommendation */
  nearComponentId?: string;
  /** Estimated impedance reduction at peak frequency (%) */
  estimatedImprovementPct: number;
  /** Frequency at which the biggest violation occurs in Hz */
  worstViolationHz: number;
  /** Has this suggestion been committed as a transaction? */
  applied: boolean;
}

/**
 * Result of a full PDN optimizer run.
 */
export interface PDNAnalysisResult {
  /** Map of netId → full PDN model */
  nets: Record<string, PDNNetModel>;
  /** Optimizer suggestions across all nets */
  suggestions: PDNOptimizerSuggestion[];
  /** Timestamp of analysis run */
  analyzedAt: number;
  /** Frequency sweep points (shared x-axis) */
  frequencySweep: number[];
}

/**
 * Configuration for the PDN analyzer frequency sweep.
 */
export interface PDNSweepConfig {
  /** Start frequency in Hz (default 1 kHz) */
  fStart: number;
  /** Stop frequency in Hz (default 1 GHz) */
  fStop: number;
  /** Number of log-spaced points (default 200) */
  nPoints: number;
  /** Gradient-descent optimizer iterations */
  optimizerIterations: number;
  /** Cap value candidates in Farads for optimizer */
  capValueCandidates: number[];
}
