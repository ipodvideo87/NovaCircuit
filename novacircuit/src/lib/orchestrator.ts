/**
 * Orchestrator — Bridge logic between routing, netlist, and state
 *
 * Coordinates:
 *  - Ratsnest generation from netlist connectivity
 *  - Auto-route requests
 *  - DRC checks
 */

import type { PCBBoard, PCBComponent, PCBRatsnest, PCBTrace } from '../types/pcb';
import { getPinsForType, getLogicalNetForPin } from './core/netlist';
import { autoRoute, solveTraceWidthForImpedance, SUBSTRATES } from './routingSystem';

// ─── Ratsnest Generator ───────────────────────────────────────────────────────

interface PinWithNet {
  compId: string;
  pinName: string;
  netId: string;
  worldX: number;
  worldY: number;
}

/**
 * Generate ratsnest airwires for all unrouted same-net pin pairs.
 * Uses minimum spanning tree (nearest-neighbour) to minimise airwire crossings.
 */
export function generateRatsnest(board: PCBBoard): PCBRatsnest[] {
  // Collect all pin world-positions with their logical net
  const pinsByNet = new Map<string, PinWithNet[]>();

  board.components.forEach(comp => {
    const pins = getPinsForType(comp.type);
    pins.forEach(pin => {
      const netId = getLogicalNetForPin(comp.id, comp.name, comp.type, pin.name);
      const worldX = comp.x + pin.x;
      const worldY = comp.y + pin.y;
      if (!pinsByNet.has(netId)) pinsByNet.set(netId, []);
      pinsByNet.get(netId)!.push({ compId: comp.id, pinName: pin.name, netId, worldX, worldY });
    });
  });

  // Build set of already-routed endpoints (approximate: trace start/end ± 5 units)
  const routedEndpoints = new Set<string>();
  board.traces.forEach(t => {
    routedEndpoints.add(`${Math.round(t.startX / 5)},${Math.round(t.startY / 5)},${t.netId}`);
    routedEndpoints.add(`${Math.round(t.endX / 5)},${Math.round(t.endY / 5)},${t.netId}`);
  });

  const ratsnest: PCBRatsnest[] = [];
  let rnId = 0;

  pinsByNet.forEach((pins, netId) => {
    if (pins.length < 2) return;

    // Nearest-neighbour: connect each pin to its closest unconnected same-net pin
    const connected = new Set<number>([0]);
    const unconnected = new Set<number>(pins.map((_, i) => i).slice(1));

    while (unconnected.size > 0) {
      let bestDist = Infinity;
      let bestFrom = -1;
      let bestTo = -1;

      connected.forEach(ci => {
        unconnected.forEach(ui => {
          const dx = pins[ci].worldX - pins[ui].worldX;
          const dy = pins[ci].worldY - pins[ui].worldY;
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            bestFrom = ci;
            bestTo = ui;
          }
        });
      });

      if (bestFrom === -1) break;

      const from = pins[bestFrom];
      const to = pins[bestTo];

      // Skip if already routed (check both directions)
      const fromKey = `${Math.round(from.worldX / 5)},${Math.round(from.worldY / 5)},${netId}`;
      const toKey   = `${Math.round(to.worldX / 5)},${Math.round(to.worldY / 5)},${netId}`;
      const isRouted = routedEndpoints.has(fromKey) && routedEndpoints.has(toKey);

      if (!isRouted) {
        ratsnest.push({
          id: `rn-${rnId++}`,
          startX: from.worldX,
          startY: from.worldY,
          endX: to.worldX,
          endY: to.worldY,
          netId,
        });
      }

      connected.add(bestTo);
      unconnected.delete(bestTo);
    }
  });

  return ratsnest;
}

// ─── DRC Checks ──────────────────────────────────────────────────────────────

export interface DRCViolation {
  id: string;
  type: 'CLEARANCE' | 'ACID_TRAP' | 'ANNULAR_RING' | 'UNROUTED' | 'MIN_WIDTH';
  severity: 'error' | 'warning';
  message: string;
  x?: number;
  y?: number;
}

/**
 * Run Design Rule Checks on the board.
 */
export function runDRC(board: PCBBoard): DRCViolation[] {
  const violations: DRCViolation[] = [];
  let id = 0;

  // Unrouted nets
  if (board.ratnest.length > 0) {
    violations.push({
      id: `drc-${id++}`,
      type: 'UNROUTED',
      severity: 'warning',
      message: `${board.ratnest.length} unrouted connection(s) in ratsnest`,
    });
  }

  // Minimum trace width check (IPC-2221: 0.1 mm minimum)
  board.traces.forEach(trace => {
    if (trace.width < 0.1) {
      violations.push({
        id: `drc-${id++}`,
        type: 'MIN_WIDTH',
        severity: 'error',
        message: `Trace ${trace.id} width ${trace.width.toFixed(3)} mm below 0.1 mm minimum`,
        x: (trace.startX + trace.endX) / 2,
        y: (trace.startY + trace.endY) / 2,
      });
    }
  });

  // Acid trap detection: very short perpendicular segments forming acute angles
  for (let i = 0; i < board.traces.length - 1; i++) {
    const t1 = board.traces[i];
    const t2 = board.traces[i + 1];
    if (t1.netId !== t2.netId) continue;

    const angle1 = Math.atan2(t1.endY - t1.startY, t1.endX - t1.startX);
    const angle2 = Math.atan2(t2.endY - t2.startY, t2.endX - t2.startX);
    const angleDiff = Math.abs(angle1 - angle2) * (180 / Math.PI);
    if (angleDiff > 0 && angleDiff < 45) {
      violations.push({
        id: `drc-${id++}`,
        type: 'ACID_TRAP',
        severity: 'warning',
        message: `Potential acid trap at trace junction (${angleDiff.toFixed(0)}° angle)`,
        x: t1.endX,
        y: t1.endY,
      });
    }
  }

  return violations;
}

// ─── Full Route Pass ──────────────────────────────────────────────────────────

/**
 * Complete orchestrator action: generate ratsnest + auto-route + DRC.
 * Returns updated board and DRC report.
 */
export function runFullRoutingPass(
  board: PCBBoard,
  substrateKey = 'FR-4',
): { board: PCBBoard; drcViolations: DRCViolation[] } {
  const substrate = SUBSTRATES[substrateKey] ?? SUBSTRATES['FR-4'];

  // 1. Generate current ratsnest
  const ratnest = generateRatsnest(board);

  // 2. Auto-route all unrouted connections
  const newTraces = autoRoute(ratnest);

  // Assign impedance-correct widths where net implies controlled impedance
  const controlledTraces = newTraces.map(trace => {
    if (/rf|ant/i.test(trace.netId)) {
      return { ...trace, width: solveTraceWidthForImpedance(50, substrate) };
    }
    if (/usb|dp|dn/i.test(trace.netId)) {
      return { ...trace, width: solveTraceWidthForImpedance(90, substrate) };
    }
    return trace;
  });

  const updatedBoard: PCBBoard = {
    ...board,
    traces: [...board.traces, ...controlledTraces],
    ratnest: [], // All routed
  };

  // 3. DRC
  const drcViolations = runDRC(updatedBoard);

  return { board: updatedBoard, drcViolations };
}
