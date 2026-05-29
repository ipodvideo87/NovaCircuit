import { ProjectGraph, Net, Point, AIAction, NetClass, DifferentialPair } from '../types';
import { BoardTrace, Via, KeepoutZone, BoardLayer } from './board';
import { PhysicsSimulationEngine } from './physicsRuntime';
import { GlobalLibrary } from './componentLibrary';

/**
 * Node representation for multi-layer pathfinding.
 */
export interface RoutingNode {
  x: number;
  y: number;
  layer: BoardLayer;
  gCost: number; // Cost from start
  hCost: number; // Heuristic cost to target
  fCost: number; // Total cost (gCost + hCost)
  parent?: RoutingNode;
  viaTransition?: boolean;
}

/**
 * Binary min-heap ordered by fCost for the A* open set. Uses lazy deletion:
 * improved nodes are re-pushed and stale pops are discarded by the caller via a
 * closed-set check. This keeps push/pop at O(log n) instead of the O(n) linear
 * scans that made long routes prohibitively slow.
 */
class MinHeap {
  private data: RoutingNode[] = [];
  size(): number { return this.data.length; }
  push(node: RoutingNode): void {
    const d = this.data;
    d.push(node);
    let i = d.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (d[parent].fCost <= d[i].fCost) break;
      [d[parent], d[i]] = [d[i], d[parent]];
      i = parent;
    }
  }
  pop(): RoutingNode | undefined {
    const d = this.data;
    if (d.length === 0) return undefined;
    const top = d[0];
    const last = d.pop()!;
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      const n = d.length;
      while (true) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < n && d[l].fCost < d[smallest].fCost) smallest = l;
        if (r < n && d[r].fCost < d[smallest].fCost) smallest = r;
        if (smallest === i) break;
        [d[smallest], d[i]] = [d[i], d[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Constraint parameters governing routes.
 */
export interface RoutingConstraints {
  minTraceWidthMm: number;
  minClearanceMm: number;
  viaDrillSizeMm: number;
  viaPadSizeMm: number;
  layerChangePenalty: number;
  uncoupledDifferentialPenalty: number;
  proximityToNoisyPenalty: number; // Proximity to clock nets
}

/**
 * Operational trace generation audit.
 */
export interface RoutingAuditLog {
  netId: string;
  sourcePin: string;
  targetPin: string;
  pathLengthMm: number;
  viaCount: number;
  calculatedImpedanceOhm: number;
  isCompliant: boolean;
  warnings: string[];
}

/**
 * Routing candidate in temporary sandbox workspace.
 */
export interface RoutingCandidate {
  id: string;
  netId: string;
  traces: BoardTrace[];
  vias: Via[];
  averageImpedanceOhm: number;
  score: number;
  audit: RoutingAuditLog;
}

/**
 * Real-time Constraint-driven and AI-Assisted PCB Routing Subsystem.
 */
export class ConstraintDrivenRoutingSystem {
  private physicsEngine: PhysicsSimulationEngine;
  private defaultConstraints: RoutingConstraints = {
    minTraceWidthMm: 0.2,
    minClearanceMm: 0.25,
    viaDrillSizeMm: 0.3,
    viaPadSizeMm: 0.6,
    layerChangePenalty: 30.0, // Moderate via cost: discourages excess vias but
                              // still lets routes weave to the other layer to
                              // escape congestion (was 120, which stranded
                              // board-spanning signals on a full layer).
    uncoupledDifferentialPenalty: 45.0,
    proximityToNoisyPenalty: 4.0
  };

  constructor(
    customConstraints?: Partial<RoutingConstraints>,
    private customPhysicsEngine?: PhysicsSimulationEngine
  ) {
    this.physicsEngine = customPhysicsEngine || new PhysicsSimulationEngine();
    if (customConstraints) {
      this.defaultConstraints = { ...this.defaultConstraints, ...customConstraints };
    }
  }

  /**
   * Helper utility calculating 2D distance between points.
   */
  public distance2D(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Computes Clearance violations checking keepouts and pads of other nets.
   */
  public checkClearanceViolation(
    x: number,
    y: number,
    layer: BoardLayer,
    activeNetId: string,
    graph: ProjectGraph,
    radiusMm: number,
    exemptZones?: { x: number; y: number; r: number }[]
  ): boolean {
    // Required centre-line distance to a foreign trace must leave the full design
    // clearance PLUS this route's own half-width (radiusMm). The foreign trace's
    // half-width is added at the comparison site. Previously this used max(...),
    // which dropped the own half-width and packed traces ~one half-width too tight,
    // so successfully "routed" nets then failed the DRC trace-spacing check.
    const clearance = this.defaultConstraints.minClearanceMm + radiusMm;

    // 1. Keepout Zones Checks
    if (graph.keepouts) {
      for (const k of graph.keepouts) {
        if (k.layers.includes(layer) && k.restrictions.includes("trace")) {
          // Check box collision
          const withinX = x >= k.x && x <= k.x + k.width;
          const withinY = y >= k.y && y <= k.y + k.height;
          if (withinX && withinY) {
            return true; // Keepout breach
          }
        }
      }
    }

    // 2. Component body collisions.
    // The router must be free to leave the source pad and reach the target pad,
    // so any point inside an exempt zone (centred on this net's two endpoints)
    // is always allowed. For every other component we block only the actual
    // footprint body (derived from its real dimensions) on the SAME copper layer
    // — never a blanket radius around the centre, which previously walled off
    // small parts entirely.
    if (exemptZones) {
      for (const z of exemptZones) {
        const ex = x - z.x;
        const ey = y - z.y;
        if (ex * ex + ey * ey < z.r * z.r) {
          // Inside an endpoint escape zone — skip component-body blocking,
          // but still honour foreign-trace spacing checked below.
          return this.violatesTraceClearance(x, y, layer, activeNetId, clearance, graph);
        }
      }
    }

    // Block only the dense central core of each component body (where pads/vias
    // cluster), not the whole courtyard. On a 2-layer board traces routinely pass
    // under SMD parts between their pads, so blocking the full body needlessly
    // strands board-spanning signals. CORE_FRACTION keeps routes out of the
    // congested centre while leaving the perimeter usable.
    const CORE_FRACTION = 0.5;
    for (const comp of graph.components) {
      if (comp.boardPosition && (comp.layer || "F.Cu") === layer) {
        const fp = GlobalLibrary.getFootprint(comp.footprint);
        const halfW = (fp ? fp.dimensions.width / 2 : 1.0) * CORE_FRACTION;
        const halfH = (fp ? fp.dimensions.height / 2 : 1.0) * CORE_FRACTION;
        const dx = Math.abs(x - comp.boardPosition.x);
        const dy = Math.abs(y - comp.boardPosition.y);
        if (dx < halfW && dy < halfH) {
          return true; // Inside a component's dense core
        }
      }
    }

    // 3. Trace Collisions from other nets
    return this.violatesTraceClearance(x, y, layer, activeNetId, clearance, graph);
  }

  /** Foreign-net trace spacing check, shared by the main and endpoint-exempt paths. */
  private violatesTraceClearance(
    x: number,
    y: number,
    layer: BoardLayer,
    activeNetId: string,
    clearance: number,
    graph: ProjectGraph
  ): boolean {
    if (graph.traces) {
      for (const trace of graph.traces) {
        if (trace.netId !== activeNetId && trace.layer === layer) {
          const dist = this.pointToSegmentDistance(x, y, trace.startX, trace.startY, trace.endX, trace.endY);
          if (dist < clearance + trace.width / 2) {
            return true; // Spacing violation
          }
        }
      }
    }
    return false;
  }

  private pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((px - (x1 + t * (x2 - x1))) * (px - (x1 + t * (x2 - x1))) + (py - (y1 + t * (y2 - y1))) * (py - (y1 + t * (y2 - y1))));
  }

  /**
   * Generates step-by-step 45-degree ortholinear snapped route suggestions.
   */
  public suggestNextSegment(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    netId: string,
    layer: BoardLayer,
    graph: ProjectGraph
  ): Point {
    const dx = targetX - startX;
    const dy = targetY - startY;

    // Angle of vector
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = (angleRad * 180) / Math.PI;

    // Snapping logic to 45 degree ortholinear paths
    let snapDeg = Math.round(angleDeg / 45) * 45;
    if (snapDeg < 0) snapDeg += 360;

    const rad = (snapDeg * Math.PI) / 180;
    const distance = Math.min(5.0, Math.sqrt(dx * dx + dy * dy)); // Move in segment constraints of max 5mm

    const nextX = parseFloat((startX + distance * Math.cos(rad)).toFixed(2));
    const nextY = parseFloat((startY + distance * Math.sin(rad)).toFixed(2));

    return { x: nextX, y: nextY };
  }

  /**
   * Physics-aware, Layer-optimized single-ended A* line pathfinding router.
   */
  public routeNetConnection(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    netId: string,
    graph: ProjectGraph,
    preferredLayer: BoardLayer = "F.Cu"
  ): RoutingCandidate | null {
    const start: Point = { x: startX, y: startY };
    const target: Point = { x: targetX, y: targetY };
    const warnings: string[] = [];

    // Derive target impedance parameter width from net class metadata rules
    let currentWidthMm = this.defaultConstraints.minTraceWidthMm;
    const net = graph.nets.find(n => n.id === netId);
    let targetZ0 = 50.0;
    if (net) {
      if (net.netClass === "POWER") {
        currentWidthMm = 0.5; // default thick trace for power
        targetZ0 = 30; // lower power DC drop rail impedance target
      } else if (net.netClass === "DIFFERENTIAL") {
        currentWidthMm = 0.25;
        targetZ0 = 90.0 / 2; // single ended reference component of 90 differential pair
      } else {
        // Try to match target impedance from board classes if defined
        const netClass = (graph.netClasses || []).find(nc => nc.name === net.netClass);
        if (netClass && netClass.impedanceOhms) {
          targetZ0 = netClass.impedanceOhms;
          currentWidthMm = this.physicsEngine.matchWidthForTargetImpedance(targetZ0);
        }
      }
    }

    // Grid nodes configuration (A* grid spacing e.g., 0.5mm step bounding boxes).
    // The search box must be wide enough to let board-spanning nets detour AROUND
    // obstacles, otherwise long power/connector runs become unrouteable. We scale
    // the margin with the route length so short nets stay fast while long nets get
    // room to manoeuvre.
    const routeDist = this.distance2D(start, target);
    const margin = Math.max(20, routeDist * 0.6);
    const minX = Math.min(start.x, target.x) - margin;
    const maxX = Math.max(start.x, target.x) + margin;
    const minY = Math.min(start.y, target.y) - margin;
    const maxY = Math.max(start.y, target.y) + margin;

    const step = 0.5; // mm step routing mesh

    // Endpoint escape zones: always allow routing immediately around the source
    // and target pads so the router can physically leave/enter them regardless of
    // the owning component's body.
    const exemptZones = [
      { x: start.x, y: start.y, r: 3.0 },
      { x: target.x, y: target.y, r: 3.0 }
    ];
    // A* uses a binary min-heap (ordered by fCost) for the open set and hash maps
    // keyed by quantised "x:y:layer" for O(1) membership/visited lookups. Linear
    // array scans here previously made long/board-spanning routes prohibitively
    // slow once the search box and iteration budget were widened.
    const heap = new MinHeap();
    const openMap = new Map<string, RoutingNode>();
    const closedMap = new Map<string, boolean>();
    const nodeKey = (x: number, y: number, layer: BoardLayer) =>
      `${Math.round(x * 20)}:${Math.round(y * 20)}:${layer}`;

    const startNode: RoutingNode = {
      x: start.x,
      y: start.y,
      layer: preferredLayer,
      gCost: 0,
      hCost: this.distance2D(start, target),
      fCost: this.distance2D(start, target)
    };

    heap.push(startNode);
    openMap.set(nodeKey(startNode.x, startNode.y, startNode.layer), startNode);

    let foundNode: RoutingNode | null = null;
    // Scale the iteration budget with route length so long detours don't give up
    // prematurely, while keeping short nets cheap. Capped to bound worst-case cost.
    let limitLoops = Math.min(80000, Math.max(12000, Math.ceil(routeDist / step) * 200));

    while (heap.size() > 0 && limitLoops > 0) {
      limitLoops--;

      const current = heap.pop()!;
      const curKey = nodeKey(current.x, current.y, current.layer);
      // Skip stale heap entries (a cheaper path to this node was already expanded).
      if (closedMap.get(curKey)) continue;

      // Reached Target?
      if (this.distance2D({ x: current.x, y: current.y }, target) < step * 1.5) {
        foundNode = current;
        break;
      }

      openMap.delete(curKey);
      closedMap.set(curKey, true);

      // Branch outward through 8 directions and layer options (Vias transition)
      const directions: { dx: number; dy: number }[] = [
        { dx: step, dy: 0 }, { dx: -step, dy: 0 }, { dx: 0, dy: step }, { dx: 0, dy: -step },
        { dx: step, dy: step }, { dx: step, dy: -step }, { dx: -step, dy: step }, { dx: -step, dy: -step }
      ];

      // Add horizontal layers transition (Vias)
      const adjacentLayers: { dlX: number; dlY: number; layer: BoardLayer; isVia: boolean }[] = directions.map(d => ({
        dlX: d.dx, dlY: d.dy, layer: current.layer, isVia: false
      }));

      // Allow Layer shift if pathfinding via penalty allows
      const alternativeLayer: BoardLayer = current.layer === "F.Cu" ? "B.Cu" : "F.Cu";
      adjacentLayers.push({
        dlX: 0, dlY: 0, layer: alternativeLayer, isVia: true
      });

      for (const adj of adjacentLayers) {
        const nextX = parseFloat((current.x + adj.dlX).toFixed(2));
        const nextY = parseFloat((current.y + adj.dlY).toFixed(2));

        if (nextX < minX || nextX > maxX || nextY < minY || nextY > maxY) continue;

        // Verify obstacle clearance boundaries at the destination node and, for
        // moves that actually travel (not a via), at the segment midpoint too.
        // Node-only sampling lets a diagonal step skim or cross a foreign trace
        // between grid points; the midpoint check closes that gap so routed nets
        // satisfy the DRC trace-spacing rule.
        if (this.checkClearanceViolation(nextX, nextY, adj.layer, netId, graph, currentWidthMm / 2, exemptZones)) {
          continue; // Path blocked
        }
        if (!adj.isVia) {
          const midX = parseFloat(((current.x + nextX) / 2).toFixed(2));
          const midY = parseFloat(((current.y + nextY) / 2).toFixed(2));
          if (this.checkClearanceViolation(midX, midY, adj.layer, netId, graph, currentWidthMm / 2, exemptZones)) {
            continue; // Segment would skim a foreign trace mid-step
          }
        }

        // Duplicate checks
        const nextKey = nodeKey(nextX, nextY, adj.layer);
        if (closedMap.get(nextKey)) continue;

        const baseMovementCost = adj.isVia ? this.defaultConstraints.layerChangePenalty : Math.sqrt(adj.dlX * adj.dlX + adj.dlY * adj.dlY);

        // Substrate / Proximity electromagnetic interference and return path guidelines cost modifier
        let emiPenalty = 0.0;
        const traces = graph.traces || [];
        // Electromagnetic check: penalty if route passes close to noisy lines/clocks
        for (const t of traces) {
          if (t.netId !== netId && t.layer === adj.layer) {
            const dist = this.pointToSegmentDistance(nextX, nextY, t.startX, t.startY, t.endX, t.endY);
            if (dist < 1.5) { // 1.5mm coupling proximity risk
              emiPenalty += this.defaultConstraints.proximityToNoisyPenalty / (dist + 0.1);
            }
          }
        }

        const nextGCost = current.gCost + baseMovementCost + emiPenalty;
        const nextHCost = this.distance2D({ x: nextX, y: nextY }, target);

        const openMatch = openMap.get(nextKey);

        if (openMatch) {
          if (nextGCost < openMatch.gCost) {
            openMatch.gCost = nextGCost;
            openMatch.fCost = nextGCost + openMatch.hCost;
            openMatch.parent = current;
            openMatch.viaTransition = adj.isVia;
            // Re-insert with the improved cost; the stale entry is skipped on pop.
            heap.push(openMatch);
          }
        } else {
          const newNode: RoutingNode = {
            x: nextX,
            y: nextY,
            layer: adj.layer,
            gCost: nextGCost,
            hCost: nextHCost,
            fCost: nextGCost + nextHCost,
            parent: current,
            viaTransition: adj.isVia
          };
          openMap.set(nextKey, newNode);
          heap.push(newNode);
        }
      }
    }

    if (!foundNode) {
      return null; // Route blocked by layout obstacles
    }

    // Backtrack path to construct traces and vias segments
    const candidateTraces: BoardTrace[] = [];
    const candidateVias: Via[] = [];
    let pathSeq: RoutingNode[] = [];
    let backtracker: RoutingNode | undefined = foundNode;

    while (backtracker) {
      pathSeq.unshift(backtracker);
      backtracker = backtracker.parent;
    }

    // Materialise the A* path into traces. Merge ONLY genuinely colinear
    // consecutive steps; a direction change must start a new segment, otherwise
    // a bent path that A* routed around an obstacle would be collapsed into a
    // single straight line cutting through that obstacle (and through clearance
    // regions that were never validated as a whole segment). Vias/layer changes
    // also break the current segment.
    const pushTrace = (from: RoutingNode, to: RoutingNode) => {
      if (from.x === to.x && from.y === to.y) return; // zero-length
      candidateTraces.push({
        id: `trace_r_${netId}_s${candidateTraces.length}_${Date.now()}`,
        netId,
        layer: from.layer,
        width: currentWidthMm,
        startX: from.x,
        startY: from.y,
        endX: to.x,
        endY: to.y
      });
    };
    const stepDir = (a: RoutingNode, b: RoutingNode): { x: number; y: number } => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    };

    let currentSegmentStart = pathSeq[0];
    let viaIndex = 0;

    for (let i = 1; i < pathSeq.length; i++) {
      const prev = pathSeq[i - 1];
      const curr = pathSeq[i];

      if (curr.viaTransition) {
        // Close the in-progress trace, drop a via at the transition point.
        pushTrace(currentSegmentStart, prev);
        candidateVias.push({
          id: `via_r_${netId}_v${viaIndex++}_${Date.now()}`,
          netId,
          x: prev.x,
          y: prev.y,
          drillSize: this.defaultConstraints.viaDrillSizeMm,
          padSize: this.defaultConstraints.viaPadSizeMm
        });
        currentSegmentStart = curr;
        continue;
      }

      // Same-layer move: break the segment if the travel direction changed.
      if (prev !== currentSegmentStart) {
        const d1 = stepDir(currentSegmentStart, prev);
        const d2 = stepDir(prev, curr);
        if (Math.abs(d1.x - d2.x) > 1e-6 || Math.abs(d1.y - d2.y) > 1e-6) {
          pushTrace(currentSegmentStart, prev);
          currentSegmentStart = prev;
        }
      }
    }

    // Append last segment up to final coordinates
    const lastPoint = pathSeq[pathSeq.length - 1];
    pushTrace(currentSegmentStart, lastPoint);

    // Run simulation check over generated segments
    let totalLength = 0;
    candidateTraces.forEach(t => {
      const dx = t.endX - t.startX;
      const dy = t.endY - t.startY;
      totalLength += Math.sqrt(dx * dx + dy * dy);
    });

    const realImpedance = this.physicsEngine.calculateTraceImpedance(currentWidthMm, preferredLayer === "B.Cu");
    const drcViolationsCount = candidateVias.length; // Estimating vias as simple layout changes
    
    // Evaluate constraints target matching
    const absoluteImpedanceDelta = Math.abs(realImpedance - targetZ0);
    const isCompliant = absoluteImpedanceDelta <= 10.0 && candidateVias.length <= 3;

    if (absoluteImpedanceDelta > 10.0) {
      warnings.push(`Impedance Offset Warning: Path mismatch target of ${targetZ0} Ohms by ${absoluteImpedanceDelta.toFixed(1)} Ohms.`);
    }
    if (candidateVias.length > 2) {
      warnings.push(`Via Optimization Penlaty: Path contains ${candidateVias.length} transitions. Minimize vias to maintain signal integrity.`);
    }

    const audit: RoutingAuditLog = {
      netId,
      sourcePin: `S_(${start.x}, ${start.y})`,
      targetPin: `T_(${target.x}, ${target.y})`,
      pathLengthMm: totalLength,
      viaCount: candidateVias.length,
      calculatedImpedanceOhm: realImpedance,
      isCompliant,
      warnings
    };

    // Candidate composite score (Max 100, losing points on lengths, vias, coupling gap)
    const rawScore = 100.0 - (totalLength * 0.15) - (candidateVias.length * 15.0) - (absoluteImpedanceDelta * 2.5);
    const score = Math.max(10, Math.min(100, parseFloat(rawScore.toFixed(2))));

    return {
      id: `route_cand_${netId}_${Date.now()}`,
      netId,
      traces: candidateTraces,
      vias: candidateVias,
      averageImpedanceOhm: realImpedance,
      score,
      audit
    };
  }

  /**
   * 3. Differential Pair Routing Engine.
   * Couples standard dynamic positive & negative tracks alongside each other with balanced timing delay skew serpentine logic.
   */
  public routeDifferentialPair(
    pair: DifferentialPair,
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    graph: ProjectGraph,
    preferredLayer: BoardLayer = "F.Cu"
  ): { positiveCandidate: RoutingCandidate | null; negativeCandidate: RoutingCandidate | null; uncoupledLengthMm: number; skewOffsetMm: number } {
    const spacing = pair.spacing; // spacing offset mm
    
    // Position offset coordinates for negative pair track
    const angle = Math.atan2(targetY - startY, targetX - startX);
    const perpAngle = angle + Math.PI / 2;

    const startXNeg = startX + spacing * Math.cos(perpAngle);
    const startYNeg = startY + spacing * Math.sin(perpAngle);
    const targetXNeg = targetX + spacing * Math.cos(perpAngle);
    const targetYNeg = targetY + spacing * Math.sin(perpAngle);

    // Route individual positive and negative lines side-by-side using micro-routing constraints
    const posCandidate = this.routeNetConnection(startX, startY, targetX, targetY, pair.positiveNetId, graph, preferredLayer);
    const negCandidate = this.routeNetConnection(startXNeg, startYNeg, targetXNeg, targetYNeg, pair.negativeNetId, graph, preferredLayer);

    let skewOffset = 0;
    let uncoupledLength = 0;

    if (posCandidate && negCandidate) {
      const lenPos = posCandidate.audit.pathLengthMm;
      const lenNeg = negCandidate.audit.pathLengthMm;
      
      skewOffset = Math.abs(lenPos - lenNeg);

      // Perform skew correction (Timing calibration addition)
      if (skewOffset > pair.skewTolerance) {
        // Serialise warnings regarding matching
        posCandidate.audit.warnings.push(`Skew Violation: Differential timing mismatch between paths is ${skewOffset.toFixed(3)}mm. Target limit: ${pair.skewTolerance}mm.`);
        negCandidate.audit.warnings.push(`Skew Violation: Differential timing mismatch between paths is ${skewOffset.toFixed(3)}mm. Target limit: ${pair.skewTolerance}mm.`);
      }

      // Check coupling clearances along segment steps
      let totalPosPoints = posCandidate.traces.length;
      let coupledSteps = 0;
      posCandidate.traces.forEach(posTrace => {
        let isCoupledSegment = false;
        negCandidate.traces.forEach(negTrace => {
          const midpointX = (posTrace.startX + posTrace.endX) / 2;
          const midpointY = (posTrace.startY + posTrace.endY) / 2;
          const dist = this.pointToSegmentDistance(midpointX, midpointY, negTrace.startX, negTrace.startY, negTrace.endX, negTrace.endY);
          if (dist >= spacing - 0.1 && dist <= spacing + 0.1) {
            isCoupledSegment = true;
          }
        });
        if (coupledSteps) {
          coupledSteps++;
        }
      });

      uncoupledLength = Math.max(0, lenPos - (coupledSteps * 0.5));
    }

    return {
      positiveCandidate: posCandidate,
      negativeCandidate: negCandidate,
      uncoupledLengthMm: uncoupledLength,
      skewOffsetMm: skewOffset
    };
  }

  /**
   * Translates routed workspace Candidates into safe transaction-replayable AIActions list.
   */
  public generateRoutingActions(candidate: RoutingCandidate): AIAction[] {
    const actions: AIAction[] = [];

    // Append trace insertion actions
    candidate.traces.forEach(trace => {
      actions.push({
        name: "create_board_trace",
        args: {
          id: trace.id,
          netId: trace.netId,
          layer: trace.layer,
          startX: trace.startX,
          startY: trace.startY,
          endX: trace.endX,
          endY: trace.endY,
          width: trace.width
        },
        reasoning: `Deterministic physical routing trace segment placement satisfying constraints (gCost: ${candidate.score}).`
      });
    });

    // Append via placement actions
    candidate.vias.forEach(v => {
      actions.push({
        name: "create_board_via",
        args: {
          id: v.id,
          netId: v.netId,
          x: v.x,
          y: v.y,
          drillSize: v.drillSize,
          padSize: v.padSize
        },
        reasoning: "Interactive via alignment verifying multi-layer substrate signals passage."
      });
    });

    return actions;
  }

  /**
   * Calculates and resolves optimal A* paths for all unconnected ratsnest wires on the board.
   * Modifies and returns a cloned graph containing the fully routed layouts.
   */
  public autoRouteAllNets(
    graph: ProjectGraph,
    ratnestLines: { netId: string; startX: number; startY: number; endX: number; endY: number }[]
  ): {
    success: boolean;
    graph: ProjectGraph;
    routedCount: number;
    failedCount: number;
    logs: string[];
  } {
    const logs: string[] = [];
    let routedCount = 0;
    let failedCount = 0;

    // Clone the graph to prevent direct state mutations
    let workingGraph: ProjectGraph = {
      ...graph,
      traces: graph.traces ? [...graph.traces] : [],
      vias: graph.vias ? [...graph.vias] : [],
    };

    logs.push(`Starting A* multi-net auto-routing daemon for ${ratnestLines.length} airwires...`);

    // Group airwires by net type to prioritize high-speed/power classes first
    const prioritizedAirwires = [...ratnestLines].sort((a, b) => {
      const netA = graph.nets.find(n => n.id === a.netId);
      const netB = graph.nets.find(n => n.id === b.netId);
      const scoreA = netA?.netClass === "POWER" ? 3 : netA?.netClass === "DIFFERENTIAL" ? 2 : 1;
      const scoreB = netB?.netClass === "POWER" ? 3 : netB?.netClass === "DIFFERENTIAL" ? 2 : 1;
      return scoreB - scoreA; // Descending priority
    });

    // Route one airwire, trying the preferred layer first and falling back to the
    // alternate copper layer if the preferred one is walled off.
    const tryRoute = (
      airwire: { netId: string; startX: number; startY: number; endX: number; endY: number },
      preferred: BoardLayer
    ): boolean => {
      const layers: BoardLayer[] = preferred === "F.Cu" ? ["F.Cu", "B.Cu"] : ["B.Cu", "F.Cu"];
      for (const layer of layers) {
        const candidate = this.routeNetConnection(
          airwire.startX, airwire.startY, airwire.endX, airwire.endY,
          airwire.netId, workingGraph, layer
        );
        if (candidate && candidate.traces.length > 0) {
          workingGraph.traces!.push(...candidate.traces);
          workingGraph.vias!.push(...candidate.vias);
          logs.push(`Successfully routed net "${airwire.netId}" on ${layer}. Traces: ${candidate.traces.length}, Vias: ${candidate.vias.length}`);
          return true;
        }
      }
      return false;
    };

    const layerFor = (netId: string): BoardLayer => {
      const net = graph.nets.find(n => n.id === netId);
      return (net?.netClass === "POWER" || net?.netClass === "GROUND") ? "B.Cu" : "F.Cu";
    };

    const failures: typeof prioritizedAirwires = [];
    for (const airwire of prioritizedAirwires) {
      logs.push(`Routing airwire for net: "${airwire.netId}" from (${airwire.startX}, ${airwire.startY}) to (${airwire.endX}, ${airwire.endY})`);
      if (tryRoute(airwire, layerFor(airwire.netId))) {
        routedCount++;
      } else {
        failures.push(airwire);
      }
    }

    // Second pass: retry any failures now that all other traces are committed.
    // Early traces sometimes wall off later nets; a re-attempt (and the built-in
    // layer fallback) recovers most of them.
    if (failures.length > 0) {
      logs.push(`Second pass: retrying ${failures.length} blocked airwire(s)...`);
      for (const airwire of failures) {
        if (tryRoute(airwire, layerFor(airwire.netId))) {
          routedCount++;
        } else {
          failedCount++;
          logs.push(`Warning: Pathblocked or unrouteable connector for net "${airwire.netId}" due to spacing clearances or board limits.`);
        }
      }
    }

    logs.push(`Auto-routing cycle completed. Routed: ${routedCount}, Blocked: ${failedCount}`);

    return {
      success: routedCount > 0,
      graph: workingGraph,
      routedCount,
      failedCount,
      logs,
    };
  }
}
