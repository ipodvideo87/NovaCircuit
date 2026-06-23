/**
 * Routing System
 *
 * Provides:
 *  - Manhattan (orthogonal) trace router
 *  - IPC-2141 controlled-impedance trace width calculator
 *    for microstrip (FR-4 and PTFE/Rogers) substrates
 */

import type { PCBTrace } from '../types/pcb';

// ─── IPC-2141 Microstrip Impedance Calculator ─────────────────────────────────

export interface SubstrateParams {
  /** Dielectric constant (FR-4 ≈ 4.3, Rogers RO4003 ≈ 3.55, PTFE ≈ 2.1) */
  er: number;
  /** Dielectric thickness in mm (height above ground plane) */
  h: number;
  /** Copper thickness in mm (1 oz ≈ 0.035 mm) */
  t: number;
}

export const SUBSTRATES: Record<string, SubstrateParams> = {
  'FR-4':          { er: 4.3,  h: 0.2,   t: 0.035 },
  'Rogers RO4003': { er: 3.55, h: 0.2,   t: 0.035 },
  'PTFE':          { er: 2.1,  h: 0.254, t: 0.035 },
};

/**
 * IPC-2141A closed-form microstrip impedance (Wheeler 1977 approximation).
 *
 * Z0 = (87 / sqrt(er + 1.41)) * ln(5.98 * h / (0.8 * w + t))
 *
 * Valid for w/h < 3.3 (narrow traces). For wider traces a slightly different
 * formula applies but this is accurate to within 1–2% for typical PCB work.
 */
export function microstripImpedance(
  traceWidthMm: number,
  substrate: SubstrateParams,
): number {
  const { er, h, t } = substrate;
  const w = traceWidthMm;
  if (w <= 0 || h <= 0) return Infinity;

  const numerator = 87;
  const denominator = Math.sqrt(er + 1.41);
  const argument = (5.98 * h) / (0.8 * w + t);
  if (argument <= 1) return 0;
  return (numerator / denominator) * Math.log(argument);
}

/**
 * Solve for trace width given a target impedance using bisection.
 *
 * @param targetOhms  Target impedance (e.g. 50, 90, 100)
 * @param substrate   PCB substrate parameters
 * @param tolerance   Convergence tolerance in Ω (default 0.1)
 * @returns Trace width in mm
 */
export function solveTraceWidthForImpedance(
  targetOhms: number,
  substrate: SubstrateParams,
  tolerance = 0.1,
): number {
  let wLow = 0.01;    // 10 µm — minimum manufacturable
  let wHigh = 10.0;   // 10 mm — unreasonably wide

  // Check that target is achievable
  const zAtLow  = microstripImpedance(wLow,  substrate);
  const zAtHigh = microstripImpedance(wHigh, substrate);
  if (targetOhms > zAtLow)  return wLow;
  if (targetOhms < zAtHigh) return wHigh;

  for (let i = 0; i < 60; i++) {
    const wMid = (wLow + wHigh) / 2;
    const zMid = microstripImpedance(wMid, substrate);
    if (Math.abs(zMid - targetOhms) < tolerance) return wMid;
    if (zMid > targetOhms) {
      wLow = wMid;   // Impedance decreases with width → widen
    } else {
      wHigh = wMid;
    }
  }
  return (wLow + wHigh) / 2;
}

/**
 * Compute propagation delay for a microstrip trace.
 *
 * t_pd = (1/c) * sqrt(0.475 * er + 0.67)   [ns/m]
 * c = 3e8 m/s
 *
 * @param er  Effective dielectric constant
 * @returns   Propagation delay in ps/mm
 */
export function propagationDelay(er: number): number {
  const c = 3e11;  // mm/s
  const erEff = 0.475 * er + 0.67;
  return (1 / c) * Math.sqrt(erEff) * 1e12;  // ps/mm
}

// ─── Manhattan Router ─────────────────────────────────────────────────────────

export interface RouteRequest {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  netId: string;
  width: number;
}

/**
 * Simple L-shaped Manhattan router.
 * Routes first horizontally then vertically (can be toggled).
 *
 * Returns one or two trace segments.
 */
export function routeManhattan(req: RouteRequest): PCBTrace[] {
  const { id, startX, startY, endX, endY, netId, width } = req;

  if (startX === endX || startY === endY) {
    // Already aligned — single straight segment
    return [{
      id,
      startX, startY,
      endX, endY,
      width,
      netId,
    }];
  }

  // Two-segment L-route: horizontal then vertical
  const corner = { x: endX, y: startY };
  return [
    { id: `${id}-h`, startX, startY, endX: corner.x, endY: corner.y, width, netId },
    { id: `${id}-v`, startX: corner.x, startY: corner.y, endX, endY, width, netId },
  ];
}

/**
 * Auto-route a set of ratsnest connections using Manhattan routing.
 * Returns an array of new traces to commit.
 */
export function autoRoute(
  ratsnest: { id: string; startX: number; startY: number; endX: number; endY: number; netId: string }[],
  traceWidth = 0.25,
): PCBTrace[] {
  return ratsnest.flatMap((rn, i) =>
    routeManhattan({
      id: `auto-${i}`,
      startX: rn.startX,
      startY: rn.startY,
      endX: rn.endX,
      endY: rn.endY,
      netId: rn.netId,
      width: traceWidth,
    })
  );
}
