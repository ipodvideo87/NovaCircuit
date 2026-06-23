// ─────────────────────────────────────────────────────────────────────────────
// NovaCircuit Routing System
//
// Manhattan trace router with:
//   • IPC-2141 controlled-impedance trace width calculation (microstrip)
//   • Net-class-aware via type selection (blind / buried / micro)
//   • Automatic layer transition via insertion using viaManager
// ─────────────────────────────────────────────────────────────────────────────

import {
  LayerId,
  PCBTrace,
  PCBVia,
  PCBStackup,
  NetClass,
  DEFAULT_NET_CLASSES,
  DEFAULT_STACKUPS,
  STACKUP_LAYERS,
  StackupPreset,
} from '../types/pcb';
import {
  selectViaForTransition,
  getDefaultStackup,
  getStackupLayers,
} from './viaManager';

// ── IPC-2141A Microstrip Impedance Solver ─────────────────────────────────────

export interface MicrostripParams {
  /** Dielectric constant of substrate (εr) */
  er: number;
  /** Dielectric (prepreg) height in mm */
  heightMm: number;
  /** Copper trace width in mm */
  widthMm: number;
  /** Copper thickness in mm */
  thicknessMm: number;
}

export interface ImpedanceResult {
  impedanceOhm: number;
  effectiveEr: number;
  /** Propagation delay in ps/mm */
  propagationDelayPsPerMm: number;
}

/**
 * IPC-2141A closed-form microstrip impedance formula.
 * Valid for w/h ratios from 0.1 to 2.0 (typical PCB trace geometries).
 *
 * Z₀ = (87 / √(εr + 1.41)) × ln(5.98h / (0.8w + t))
 *
 * where h = dielectric height, w = trace width, t = copper thickness.
 */
export function calcMicrostripImpedance(p: MicrostripParams): ImpedanceResult {
  const { er, heightMm: h, widthMm: w, thicknessMm: t } = p;
  const wEff = w + t * (1 + Math.log(4 * Math.E * w / t)) / Math.PI;
  const z0 = (87 / Math.sqrt(er + 1.41)) * Math.log(5.98 * h / (0.8 * wEff + t));
  const eEff = (er + 1) / 2 + (er - 1) / 2 / Math.sqrt(1 + 12 * h / w);
  const tpd = (1 / 0.2998) * Math.sqrt(eEff); // ps/mm (speed of light = 0.2998 mm/ps)
  return { impedanceOhm: z0, effectiveEr: eEff, propagationDelayPsPerMm: tpd };
}

/**
 * Iteratively solves for the trace width (mm) that achieves `targetOhm`
 * impedance on a given microstrip stackup layer, using Newton-Raphson.
 *
 * @param targetOhm      Desired impedance in Ω
 * @param er             Substrate dielectric constant
 * @param heightMm       Dielectric height in mm
 * @param thicknessMm    Copper thickness in mm
 * @param tolerance      Convergence tolerance in Ω (default 0.1)
 * @returns              Solved trace width in mm
 */
export function solveTraceWidthForImpedance(
  targetOhm: number,
  er: number,
  heightMm: number,
  thicknessMm: number,
  tolerance = 0.1
): number {
  let w = 0.2; // initial guess (mm)
  for (let i = 0; i < 100; i++) {
    const { impedanceOhm: z } = calcMicrostripImpedance({
      er, heightMm, widthMm: w, thicknessMm,
    });
    const delta = z - targetOhm;
    if (Math.abs(delta) < tolerance) break;
    // Numerical derivative dZ/dw ≈ (Z(w+δ) - Z(w)) / δ
    const dw = w * 1e-4;
    const { impedanceOhm: z2 } = calcMicrostripImpedance({
      er, heightMm, widthMm: w + dw, thicknessMm,
    });
    const dzdw = (z2 - z) / dw;
    if (Math.abs(dzdw) < 1e-12) break;
    w -= delta / dzdw;
    w = Math.max(0.05, w); // clamp to manufacturable minimum
  }
  return Math.round(w * 10000) / 10000; // round to 0.1 µm
}

// ── Net Class Helpers ─────────────────────────────────────────────────────────

/** Maps known net IDs to a net class name using naming conventions. */
export function resolveNetClass(netId: string): string {
  if (/^(vcc|vbus|vbat|pwr|3v3|5v)/.test(netId)) return 'Power';
  if (/^(usb-dp|usb-dn|usb-cc)/.test(netId)) return 'USB-Diff';
  if (/^(rf|wifi|ant|rf-ant)/.test(netId)) return 'RF';
  if (/^(ddr|lvds|pcie|sgmii|serdes)/.test(netId)) return 'High-Speed';
  return 'Default';
}

export function getNetClass(netId: string): NetClass {
  const name = resolveNetClass(netId);
  return DEFAULT_NET_CLASSES[name] ?? DEFAULT_NET_CLASSES['Default'];
}

// ── Route Segment Types ────────────────────────────────────────────────────────

export interface RouteSegment {
  trace: PCBTrace;
}

export interface RouteResult {
  segments: RouteSegment[];
  vias: PCBVia[];
  totalLengthMm: number;
}

// ── Manhattan Router ──────────────────────────────────────────────────────────

let _traceIdCounter = 10000;
function nextTraceId(): string {
  return `rt-${_traceIdCounter++}`;
}

/**
 * Routes a net connection using an L-shaped (2-segment) Manhattan path.
 *
 * Layer transition rules:
 *   • If `sourceLayer === targetLayer`  → single-layer route, no via
 *   • If layers differ                  → insert a via at the bend point,
 *     chosen by `selectViaForTransition` with net-class constraints
 *
 * @param x1, y1        Start coordinate (mm)
 * @param x2, y2        End coordinate (mm)
 * @param netId         Net identifier
 * @param sourceLayer   Layer at start point
 * @param targetLayer   Layer at end point
 * @param stackup       Active board stackup
 * @param traceWidth    Explicit trace width (mm); 0 = auto from net class
 */
export function routeSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  netId: string,
  sourceLayer: LayerId,
  targetLayer: LayerId,
  stackup: PCBStackup,
  traceWidth = 0
): RouteResult {
  const netClass = getNetClass(netId);
  const width = traceWidth > 0
    ? traceWidth
    : netClass.minTraceWidth;

  const segments: RouteSegment[] = [];
  const vias: PCBVia[] = [];

  if (sourceLayer === targetLayer) {
    // ── Single-layer L-route ─────────────────────────────────────────────────
    // Horizontal segment
    if (Math.abs(x1 - x2) > 0.001) {
      segments.push({
        trace: {
          id: nextTraceId(),
          startX: x1, startY: y1,
          endX: x2,   endY: y1,
          width, netId, layer: sourceLayer,
        },
      });
    }
    // Vertical segment
    if (Math.abs(y1 - y2) > 0.001) {
      segments.push({
        trace: {
          id: nextTraceId(),
          startX: x2, startY: y1,
          endX: x2,   endY: y2,
          width, netId, layer: sourceLayer,
        },
      });
    }
  } else {
    // ── Cross-layer route: place via at bend point ───────────────────────────
    const bendX = x2;
    const bendY = y1;

    // Horizontal segment on source layer
    if (Math.abs(x1 - bendX) > 0.001) {
      segments.push({
        trace: {
          id: nextTraceId(),
          startX: x1,    startY: y1,
          endX: bendX, endY: y1,
          width, netId, layer: sourceLayer,
        },
      });
    }

    // Via at bend
    const via = selectViaForTransition(
      bendX, bendY,
      sourceLayer, targetLayer,
      netId, stackup, netClass
    );
    vias.push(via);

    // Vertical segment on target layer
    if (Math.abs(bendY - y2) > 0.001) {
      segments.push({
        trace: {
          id: nextTraceId(),
          startX: bendX, startY: bendY,
          endX: bendX,   endY: y2,
          width, netId, layer: targetLayer,
        },
      });
    }
  }

  const totalLengthMm = segments.reduce((sum, s) => {
    const dx = s.trace.endX - s.trace.startX;
    const dy = s.trace.endY - s.trace.startY;
    return sum + Math.sqrt(dx * dx + dy * dy);
  }, 0);

  return { segments, vias, totalLengthMm };
}

// ── Controlled-Impedance Route ─────────────────────────────────────────────────

/**
 * Routes a controlled-impedance trace on a specific layer.
 * Automatically solves the trace width to achieve `targetImpedanceOhm`
 * using the IPC-2141A microstrip formula and the stackup dielectric parameters.
 *
 * @param x1, y1               Start coordinate
 * @param x2, y2               End coordinate
 * @param netId                Net identifier
 * @param layer                Target copper layer
 * @param targetImpedanceOhm   Desired impedance (e.g. 50, 90, 100)
 * @param stackup              Active board stackup
 */
export function routeControlledImpedance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  netId: string,
  layer: LayerId,
  targetImpedanceOhm: number,
  stackup: PCBStackup
): RouteResult {
  // Find the stackup layer spec to get dielectric parameters
  const layerIdx  = stackup.layers.findIndex((l) => l.layerId === layer);
  const spec      = stackup.layers[layerIdx];
  const nextSpec  = stackup.layers[layerIdx + 1]; // dielectric below trace
  const dielectric = nextSpec ?? spec;

  const er     = dielectric.dielectricConstant;
  const h      = dielectric.dielectricThicknessMm;
  const tCu    = spec.copperThicknessMicron / 1000; // µm → mm

  const width = solveTraceWidthForImpedance(targetImpedanceOhm, er, h, tCu);

  return routeSegment(x1, y1, x2, y2, netId, layer, layer, stackup, width);
}

// ── Stackup Layer Accessor (convenience re-export) ────────────────────────────

export function getLayerOrder(preset: StackupPreset): LayerId[] {
  return STACKUP_LAYERS[preset];
}

export function getStackupForPreset(preset: StackupPreset): PCBStackup {
  return getDefaultStackup(preset);
}
