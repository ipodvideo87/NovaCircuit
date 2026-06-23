// ─────────────────────────────────────────────────────────────────────────────
// NovaCircuit PCB Type Definitions
// Single source of truth for all EDA data structures
// ─────────────────────────────────────────────────────────────────────────────

// ── Layer Model ──────────────────────────────────────────────────────────────

/** Canonical layer identifiers for 4L, 6L, and 8L stackups */
export type LayerId =
  | 'F.Cu'   // Layer 1  – Top copper
  | 'In1.Cu' // Layer 2  – Inner 1 (4L/6L/8L)
  | 'In2.Cu' // Layer 3  – Inner 2 (4L/6L/8L)
  | 'In3.Cu' // Layer 4  – Inner 3 (6L/8L)
  | 'In4.Cu' // Layer 5  – Inner 4 (6L/8L)
  | 'In5.Cu' // Layer 6  – Inner 5 (8L)
  | 'In6.Cu' // Layer 7  – Inner 6 (8L)
  | 'B.Cu';  // Layer N  – Bottom copper

/** Supported PCB stackup presets */
export type StackupPreset = '4L' | '6L' | '8L';

/** Ordered layer stacks for each stackup preset */
export const STACKUP_LAYERS: Record<StackupPreset, LayerId[]> = {
  '4L': ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'],
  '6L': ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu'],
  '8L': ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'In5.Cu', 'In6.Cu', 'B.Cu'],
};

/** Human-readable display names for layers */
export const LAYER_DISPLAY_NAMES: Record<LayerId, string> = {
  'F.Cu':   'Top Copper (L1)',
  'In1.Cu': 'Inner 1 (L2)',
  'In2.Cu': 'Inner 2 (L3)',
  'In3.Cu': 'Inner 3 (L4)',
  'In4.Cu': 'Inner 4 (L5)',
  'In5.Cu': 'Inner 5 (L6)',
  'In6.Cu': 'Inner 6 (L7)',
  'B.Cu':   'Bottom Copper (LN)',
};

/** Nominal copper layer colors for cross-section rendering */
export const LAYER_COLORS: Record<LayerId, string> = {
  'F.Cu':   '#f59e0b', // amber – top
  'In1.Cu': '#60a5fa', // blue
  'In2.Cu': '#34d399', // emerald
  'In3.Cu': '#a78bfa', // violet
  'In4.Cu': '#f87171', // red
  'In5.Cu': '#fb923c', // orange
  'In6.Cu': '#38bdf8', // sky
  'B.Cu':   '#facc15', // yellow – bottom
};

// ── Via Model ─────────────────────────────────────────────────────────────────

/**
 * Via type classification per IPC-6012 / IPC-2315:
 *   through    – spans all copper layers (L1 → LN), mechanically drilled
 *   blind      – starts at an outer layer, terminates at an inner layer
 *   buried     – starts and ends on inner layers (not visible from outside)
 *   micro      – laser-drilled, ≤ 0.15 mm drill, max one-layer span (IPC-2315 §3)
 */
export type ViaType = 'through' | 'blind' | 'buried' | 'micro';

/**
 * IPC-6012 aspect ratio limits:
 *   Standard through/blind/buried vias:  depth / drill ≤ 10 : 1
 *   Micro-vias:                          depth / drill ≤  1 : 1
 */
export const VIA_ASPECT_RATIO_LIMITS: Record<ViaType, number> = {
  through: 10,
  blind:   10,
  buried:  10,
  micro:    1,
};

/** Maximum drill diameter for micro-vias per IPC-2315 */
export const MICRO_VIA_MAX_DRILL_MM = 0.15;

/** Minimum drill diameters by via type (mm) */
export const VIA_MIN_DRILL_MM: Record<ViaType, number> = {
  through:  0.20,
  blind:    0.15,
  buried:   0.15,
  micro:    0.05,
};

/** Default annular ring widths by via type (mm) */
export const VIA_DEFAULT_ANNULAR_MM: Record<ViaType, number> = {
  through:  0.125,
  blind:    0.100,
  buried:   0.100,
  micro:    0.075,
};

/**
 * A placed via on the PCB.
 *
 * `fromLayer` and `toLayer` define the drill span.  The layer pair must be
 * consistent with the chosen `viaType`:
 *   through  → fromLayer === 'F.Cu'  && toLayer === 'B.Cu'
 *   blind    → fromLayer ∈ {'F.Cu','B.Cu'} and toLayer is inner (or vice-versa)
 *   buried   → both fromLayer and toLayer are inner layers
 *   micro    → adjacent layer pair only (|layerIndex(to) - layerIndex(from)| === 1)
 */
export interface PCBVia {
  id: string;
  x: number;
  y: number;
  /** Drill hole diameter in mm */
  drillDiameter: number;
  /** Finished pad diameter (copper annular ring) in mm */
  padDiameter: number;
  viaType: ViaType;
  fromLayer: LayerId;
  toLayer: LayerId;
  netId: string;
  /** Computed drill depth in mm – derived from stackup during DRC */
  drillDepth?: number;
}

// ── Via DRC Result ────────────────────────────────────────────────────────────

export type ViaDRCStatus = 'pass' | 'fail' | 'warning';

export interface ViaDRCViolation {
  viaId: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
  /** Actual computed value that triggered the violation */
  actualValue: number;
  /** Limit that was exceeded */
  limitValue: number;
}

export interface ViaDRCResult {
  status: ViaDRCStatus;
  violations: ViaDRCViolation[];
  /** Summary counts for UI badges */
  errorCount: number;
  warningCount: number;
  passCount: number;
  /** Total vias checked */
  totalVias: number;
}

// ── Stackup Physical Model ────────────────────────────────────────────────────

export interface StackupLayerSpec {
  layerId: LayerId;
  /** Copper thickness in µm (typically 17 µm = 0.5 oz, 35 µm = 1 oz) */
  copperThicknessMicron: number;
  /** Dielectric prepreg/core thickness in mm between this and next layer */
  dielectricThicknessMm: number;
  /** Dielectric constant (εr) of the substrate */
  dielectricConstant: number;
  /** Loss tangent of the substrate */
  lossTangent: number;
}

/**
 * Full PCB stackup definition.  Drives via depth calculations and
 * impedance solver inputs.
 */
export interface PCBStackup {
  preset: StackupPreset;
  /** Total board thickness in mm (IPC-6012 nominal: 1.6 mm for 4L) */
  totalThicknessMm: number;
  layers: StackupLayerSpec[];
}

/** Pre-built stackup presets (FR-4, standard PCB house constraints) */
export const DEFAULT_STACKUPS: Record<StackupPreset, PCBStackup> = {
  '4L': {
    preset: '4L',
    totalThicknessMm: 1.6,
    layers: [
      { layerId: 'F.Cu',   copperThicknessMicron: 35, dielectricThicknessMm: 0.360, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In1.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.710, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In2.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.360, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'B.Cu',   copperThicknessMicron: 35, dielectricThicknessMm: 0,     dielectricConstant: 4.4, lossTangent: 0.020 },
    ],
  },
  '6L': {
    preset: '6L',
    totalThicknessMm: 1.6,
    layers: [
      { layerId: 'F.Cu',   copperThicknessMicron: 35, dielectricThicknessMm: 0.200, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In1.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.200, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In2.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.400, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In3.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.200, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In4.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.200, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'B.Cu',   copperThicknessMicron: 35, dielectricThicknessMm: 0,     dielectricConstant: 4.4, lossTangent: 0.020 },
    ],
  },
  '8L': {
    preset: '8L',
    totalThicknessMm: 1.6,
    layers: [
      { layerId: 'F.Cu',   copperThicknessMicron: 35, dielectricThicknessMm: 0.120, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In1.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.120, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In2.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.300, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In3.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.120, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In4.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.300, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In5.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.120, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'In6.Cu', copperThicknessMicron: 17, dielectricThicknessMm: 0.120, dielectricConstant: 4.4, lossTangent: 0.020 },
      { layerId: 'B.Cu',   copperThicknessMicron: 35, dielectricThicknessMm: 0,     dielectricConstant: 4.4, lossTangent: 0.020 },
    ],
  },
};

// ── Net Class Model ───────────────────────────────────────────────────────────

/**
 * Net class — groups nets with shared routing constraints.
 * The router uses these to select the appropriate via type.
 */
export interface NetClass {
  name: string;
  /** Minimum trace width (mm) */
  minTraceWidth: number;
  /** Minimum copper-to-copper clearance (mm) */
  clearance: number;
  /** Preferred via type for auto-routing transitions */
  preferredViaType: ViaType;
  /** Override drill diameter; 0 = use type default */
  viaDrillOverrideMm: number;
  /** Matched-length tolerance in mm (for serpentine tuning) */
  lengthToleranceMm: number;
}

/** Built-in net class presets */
export const DEFAULT_NET_CLASSES: Record<string, NetClass> = {
  Default: {
    name: 'Default',
    minTraceWidth: 0.15,
    clearance: 0.15,
    preferredViaType: 'through',
    viaDrillOverrideMm: 0,
    lengthToleranceMm: 0.5,
  },
  Power: {
    name: 'Power',
    minTraceWidth: 0.40,
    clearance: 0.20,
    preferredViaType: 'through',
    viaDrillOverrideMm: 0.30,
    lengthToleranceMm: 2.0,
  },
  'High-Speed': {
    name: 'High-Speed',
    minTraceWidth: 0.10,
    clearance: 0.10,
    preferredViaType: 'micro',
    viaDrillOverrideMm: 0.10,
    lengthToleranceMm: 0.1,
  },
  'USB-Diff': {
    name: 'USB-Diff',
    minTraceWidth: 0.18,
    clearance: 0.20,
    preferredViaType: 'blind',
    viaDrillOverrideMm: 0.15,
    lengthToleranceMm: 0.05,
  },
  RF: {
    name: 'RF',
    minTraceWidth: 0.32,
    clearance: 0.30,
    preferredViaType: 'blind',
    viaDrillOverrideMm: 0.15,
    lengthToleranceMm: 0.02,
  },
};

// ── Core PCB Entities ─────────────────────────────────────────────────────────

export interface PCBComponent {
  id: string;
  x: number;
  y: number;
  rotation: number;
  name: string;
  type: string;
  /** Optional net class assignment */
  netClass?: string;
}

export interface PCBTrace {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  netId: string;
  /** Copper layer this trace segment lives on (default 'F.Cu') */
  layer?: LayerId;
  /** Net class assignment for routing constraints */
  netClass?: string;
}

export interface PCBRatsnest {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  netId: string;
}

// ── Board ─────────────────────────────────────────────────────────────────────

export interface PCBBoard {
  components: PCBComponent[];
  traces: PCBTrace[];
  ratnest: PCBRatsnest[];
  /** All placed vias */
  vias?: PCBVia[];
  /** Active stackup – defaults to 4L FR-4 if omitted */
  stackup?: PCBStackup;
  /** Net class map (netId → NetClass name) */
  netClasses?: Record<string, string>;
}

// ── PDN Analysis Types ────────────────────────────────────────────────────────

export interface PDNImpedancePoint {
  frequency: number;  // Hz
  impedance: number;  // Ohms
}

export interface PDNResonance {
  frequency: number;  // Hz
  impedance: number;  // Ohms
  type: 'resonance' | 'anti-resonance';
}

export interface DecouplingCapacitor {
  componentId: string;
  capacitance: number; // Farads
  esr: number;         // Equivalent Series Resistance, Ohms
  esl: number;         // Equivalent Series Inductance, Henries
  netId: string;
  mountingInductance?: number;
}

export interface DecouplingRecommendation {
  netId: string;
  suggestedValue: number;   // Farads
  suggestedCount: number;
  reason: string;
  frequencyRange: [number, number]; // Hz
}

export interface PDNAnalysisResult {
  netId: string;
  impedanceCurve: PDNImpedancePoint[];
  targetImpedance: number;  // Ohms
  resonances: PDNResonance[];
  recommendations: DecouplingRecommendation[];
  passesTarget: boolean;
}
