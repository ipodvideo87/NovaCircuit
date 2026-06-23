// ─────────────────────────────────────────────────────────────────────────────
// NovaCircuit Orchestrator
//
// Bridge / coordinator between subsystems:
//   • Netlist resolution → routing
//   • Via management (type selection, DRC)
//   • PDN analysis
//   • State management (transaction store)
// ─────────────────────────────────────────────────────────────────────────────

import {
  PCBBoard,
  PCBVia,
  PCBTrace,
  LayerId,
  NetClass,
  ViaType,
  DEFAULT_NET_CLASSES,
  StackupPreset,
} from '../types/pcb';

import {
  routeSegment,
  routeControlledImpedance,
  getNetClass,
  RouteResult,
} from './routingSystem';

import {
  createVia,
  runViaDRC,
  selectViaForTransition,
  getDefaultStackup,
  summarizeVias,
  ViaSummary,
} from './viaManager';

import { analyzePDN } from './pdnAnalyzer';

// ── Board Mutation Helpers ─────────────────────────────────────────────────────

/**
 * Applies a RouteResult to a PCBBoard — adds all trace segments and vias.
 * Returns a new immutable board snapshot.
 */
export function applyRouteResult(
  board: PCBBoard,
  result: RouteResult
): PCBBoard {
  const newTraces = [
    ...board.traces,
    ...result.segments.map((s) => s.trace),
  ];
  const newVias = [...(board.vias ?? []), ...result.vias];
  return { ...board, traces: newTraces, vias: newVias };
}

/**
 * Routes a net between two canvas coordinates and returns an updated board.
 * Automatically:
 *   1. Resolves net class from netId
 *   2. Selects via type based on net class + stackup
 *   3. Inserts via if layer transition is required
 */
export function routeNet(
  board: PCBBoard,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  netId: string,
  sourceLayer: LayerId = 'F.Cu',
  targetLayer: LayerId = 'F.Cu',
  traceWidthOverride = 0
): PCBBoard {
  const stackup = board.stackup ?? getDefaultStackup('4L');
  const result  = routeSegment(
    x1, y1, x2, y2,
    netId,
    sourceLayer, targetLayer,
    stackup,
    traceWidthOverride
  );
  return applyRouteResult(board, result);
}

/**
 * Routes a controlled-impedance trace (no via, single layer).
 */
export function routeImpedanceTrace(
  board: PCBBoard,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  netId: string,
  layer: LayerId,
  targetImpedanceOhm: number
): PCBBoard {
  const stackup = board.stackup ?? getDefaultStackup('4L');
  const result  = routeControlledImpedance(
    x1, y1, x2, y2,
    netId, layer,
    targetImpedanceOhm,
    stackup
  );
  return applyRouteResult(board, result);
}

// ── Via Management ─────────────────────────────────────────────────────────────

/**
 * Places a via at a specific canvas location.
 * Chooses drill diameter and via type automatically from the net class.
 */
export function placeVia(
  board: PCBBoard,
  x: number,
  y: number,
  fromLayer: LayerId,
  toLayer: LayerId,
  netId: string,
  drillOverrideMm?: number
): PCBBoard {
  const stackup  = board.stackup ?? getDefaultStackup('4L');
  const netClass = getNetClass(netId);
  const drill    = drillOverrideMm ?? (
    netClass.viaDrillOverrideMm > 0
      ? netClass.viaDrillOverrideMm
      : undefined
  );
  const via      = createVia(x, y, fromLayer, toLayer, netId, stackup, drill);
  return {
    ...board,
    vias: [...(board.vias ?? []), via],
  };
}

/**
 * Removes a via by id.
 */
export function removeVia(board: PCBBoard, viaId: string): PCBBoard {
  return {
    ...board,
    vias: (board.vias ?? []).filter((v) => v.id !== viaId),
  };
}

/**
 * Updates a via's properties (returns new board snapshot).
 */
export function updateVia(board: PCBBoard, updated: PCBVia): PCBBoard {
  return {
    ...board,
    vias: (board.vias ?? []).map((v) => (v.id === updated.id ? updated : v)),
  };
}

// ── DRC ────────────────────────────────────────────────────────────────────────

/**
 * Runs IPC-6012 via DRC on the board.
 * Returns a summary with violation details and pass/fail status.
 */
export function runBoardViaDRC(board: PCBBoard) {
  const stackup = board.stackup ?? getDefaultStackup('4L');
  return runViaDRC(board.vias ?? [], stackup);
}

/**
 * Returns a via inventory summary (counts by type + DRC status).
 */
export function getBoardViaSummary(board: PCBBoard): ViaSummary {
  const stackup = board.stackup ?? getDefaultStackup('4L');
  return summarizeVias(board.vias ?? [], stackup);
}

// ── Stackup Operations ─────────────────────────────────────────────────────────

/**
 * Switches the board to a different stackup preset.
 * Does not re-route existing traces; callers should trigger re-DRC.
 */
export function applyStackupPreset(board: PCBBoard, preset: StackupPreset): PCBBoard {
  return {
    ...board,
    stackup: getDefaultStackup(preset),
  };
}

// ── PDN Analysis ──────────────────────────────────────────────────────────────

/**
 * Runs PDN impedance analysis on all power nets in the board.
 * Returns an array of per-net analysis results.
 */
export function runPDNAnalysis(board: PCBBoard) {
  return analyzePDN(board);
}

// ── Ratsnest Completion ───────────────────────────────────────────────────────

/**
 * Counts unrouted connections (ratsnest airwires).
 */
export function getUnroutedCount(board: PCBBoard): number {
  return board.ratnest.length;
}

/**
 * Returns nets that have at least one unrouted connection.
 */
export function getUnroutedNets(board: PCBBoard): Set<string> {
  return new Set(board.ratnest.map((r) => r.netId));
}

// ── Board Statistics ──────────────────────────────────────────────────────────

export interface BoardStats {
  componentCount: number;
  traceCount: number;
  viaCount: number;
  unroutedCount: number;
  stackupPreset: StackupPreset;
  viaSummary: ViaSummary;
  netCount: number;
  uniqueNets: string[];
}

export function getBoardStats(board: PCBBoard): BoardStats {
  const allNets = new Set([
    ...board.traces.map((t) => t.netId),
    ...board.ratnest.map((r) => r.netId),
    ...(board.vias ?? []).map((v) => v.netId),
  ]);
  return {
    componentCount: board.components.length,
    traceCount:     board.traces.length,
    viaCount:       board.vias?.length ?? 0,
    unroutedCount:  board.ratnest.length,
    stackupPreset:  board.stackup?.preset ?? '4L',
    viaSummary:     getBoardViaSummary(board),
    netCount:       allNets.size,
    uniqueNets:     [...allNets].sort(),
  };
}
