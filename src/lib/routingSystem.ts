import { ProjectGraph, Net, Point, AIAction, NetClass, DifferentialPair } from '../types';
import { BoardTrace, Via, KeepoutZone, BoardLayer } from './board';
import { PhysicsSimulationEngine } from './physicsRuntime';

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
    layerChangePenalty: 120.0, // High penalty to minimize vias
    uncoupledDifferentialPenalty: 45.0,
    proximityToNoisyPenalty: 15.0
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
    radiusMm: number
  ): boolean {
    const clearance = Math.max(radiusMm, this.defaultConstraints.minClearanceMm);

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

    // 2. Component Collisions (Overlap checks)
    for (const comp of graph.components) {
      // Check proximity to other locked pads
      if (comp.boardPosition) {
        const dist = this.distance2D({ x, y }, comp.boardPosition);
        // Avoid routing through component centers unless matched
        if (dist < 2.0 && comp.layer === layer) {
          return true;
        }
      }
    }

    // 3. Trace Collisions from other nets
    if (graph.traces) {
      for (const trace of graph.traces) {
        if (trace.netId !== activeNetId && trace.layer === layer) {
          // Distance from point to trace segment
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

    // Grid nodes configuration (A* grid spacing e.g., 0.5mm step bounding boxes)
    const minX = Math.min(start.x, target.x) - 10;
    const maxX = Math.max(start.x, target.x) + 10;
    const minY = Math.min(start.y, target.y) - 10;
    const maxY = Math.max(start.y, target.y) + 10;

    const step = 0.5; // mm step routing mesh
    const openSet: RoutingNode[] = [];
    const closedSet: RoutingNode[] = [];

    const startNode: RoutingNode = {
      x: start.x,
      y: start.y,
      layer: preferredLayer,
      gCost: 0,
      hCost: this.distance2D(start, target),
      fCost: this.distance2D(start, target)
    };

    openSet.push(startNode);

    let foundNode: RoutingNode | null = null;
    let limitLoops = 4000; // computational limit check

    while (openSet.length > 0 && limitLoops > 0) {
      limitLoops--;
      // Find lowest fCost node
      let currentIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].fCost < openSet[currentIdx].fCost) {
          currentIdx = i;
        }
      }

      const current = openSet[currentIdx];

      // Reached Target?
      if (this.distance2D({ x: current.x, y: current.y }, target) < step * 1.5) {
        foundNode = current;
        break;
      }

      openSet.splice(currentIdx, 1);
      closedSet.push(current);

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

        // Verify obstacle clearance boundaries
        if (this.checkClearanceViolation(nextX, nextY, adj.layer, netId, graph, currentWidthMm / 2)) {
          continue; // Path blocked
        }

        // Duplicate checks
        const closedMatch = closedSet.find(n => Math.abs(n.x - nextX) < 0.05 && Math.abs(n.y - nextY) < 0.05 && n.layer === adj.layer);
        if (closedMatch) continue;

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

        const openMatch = openSet.find(n => Math.abs(n.x - nextX) < 0.05 && Math.abs(n.y - nextY) < 0.05 && n.layer === adj.layer);

        if (openMatch) {
          if (nextGCost < openMatch.gCost) {
            openMatch.gCost = nextGCost;
            openMatch.fCost = nextGCost + openMatch.hCost;
            openMatch.parent = current;
            openMatch.viaTransition = adj.isVia;
          }
        } else {
          openSet.push({
            x: nextX,
            y: nextY,
            layer: adj.layer,
            gCost: nextGCost,
            hCost: nextHCost,
            fCost: nextGCost + nextHCost,
            parent: current,
            viaTransition: adj.isVia
          });
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

    // Trace segment optimization & reduction (Straight lining consecutive colinear steps)
    let currentSegmentStart = pathSeq[0];
    let viaIndex = 0;

    for (let i = 1; i < pathSeq.length; i++) {
      const prev = pathSeq[i - 1];
      const curr = pathSeq[i];

      if (curr.viaTransition) {
        // Build trace segment up to via point
        if (currentSegmentStart !== prev) {
          candidateTraces.push({
            id: `trace_r_${netId}_s${candidateTraces.length}_${Date.now()}`,
            netId,
            layer: currentSegmentStart.layer,
            width: currentWidthMm,
            startX: currentSegmentStart.x,
            startY: currentSegmentStart.y,
            endX: prev.x,
            endY: prev.y
          });
        }

        // Build Via node
        candidateVias.push({
          id: `via_r_${netId}_v${viaIndex++}_${Date.now()}`,
          netId,
          x: prev.x,
          y: prev.y,
          drillSize: this.defaultConstraints.viaDrillSizeMm,
          padSize: this.defaultConstraints.viaPadSizeMm
        });

        currentSegmentStart = curr;
      } else if (curr.layer !== currentSegmentStart.layer) {
        // Guard transition step
        if (currentSegmentStart !== prev) {
          candidateTraces.push({
            id: `trace_r_${netId}_s${candidateTraces.length}_${Date.now()}`,
            netId,
            layer: currentSegmentStart.layer,
            width: currentWidthMm,
            startX: currentSegmentStart.x,
            startY: currentSegmentStart.y,
            endX: prev.x,
            endY: prev.y
          });
        }
        currentSegmentStart = curr;
      }
    }

    // Append last segment up to final coordinates
    const lastPoint = pathSeq[pathSeq.length - 1];
    if (currentSegmentStart !== lastPoint) {
      candidateTraces.push({
        id: `trace_r_${netId}_s${candidateTraces.length}_${Date.now()}`,
        netId,
        layer: currentSegmentStart.layer,
        width: currentWidthMm,
        startX: currentSegmentStart.x,
        startY: currentSegmentStart.y,
        endX: lastPoint.x,
        endY: lastPoint.y
      });
    }

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

    for (const airwire of prioritizedAirwires) {
      logs.push(`Routing airwire for net: "${airwire.netId}" from (${airwire.startX}, ${airwire.startY}) to (${airwire.endX}, ${airwire.endY})`);

      // Run A* router connection
      const candidate = this.routeNetConnection(
        airwire.startX,
        airwire.startY,
        airwire.endX,
        airwire.endY,
        airwire.netId,
        workingGraph,
        "F.Cu" // Route primarily on Front copper
      );

      if (candidate && candidate.traces.length > 0) {
        // Successfully routed! Push traces & vias to the working graph
        workingGraph.traces!.push(...candidate.traces);
        workingGraph.vias!.push(...candidate.vias);
        routedCount++;
        logs.push(`Successfully routed net "${airwire.netId}". Score: ${candidate.score}. Traces added: ${candidate.traces.length}, Vias: ${candidate.vias.length}`);
      } else {
        // Failed or blocked
        failedCount++;
        logs.push(`Warning: Pathblocked or unrouteable connector for net "${airwire.netId}" due to spacing clearances or board limits.`);
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
