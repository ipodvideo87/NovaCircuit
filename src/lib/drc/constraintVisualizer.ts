import { PCBBoard, BoardComponent, BoardTrace, BoardPad, KeepoutZone, Via } from '../board';
import { DRCViolation } from '../drc';
import { resolveNetConstraints } from '../constraints';

export interface ClearanceRegion {
  id: string;
  type: 'pad-pad' | 'trace-trace' | 'pad-trace' | 'via-via' | 'via-pad' | 'via-trace';
  x: number;
  y: number;
  radius: number;
  severity: 'warning' | 'error';
  layer: string;
  elements: string[];
  message: string;
}

export interface KeepoutOverlay {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isViolated: boolean;
  layers: string[];
  restrictions: string[];
}

export interface AcidTrapViolation {
  id: string;
  x: number;
  y: number;
  layer: string;
  netId: string;
  angleDeg: number;
  traceIds: string[];
  message: string;
}

export interface AnnularRingViolation {
  id: string;
  x: number;
  y: number;
  viaId: string;
  ringWidth: number;
  requiredWidth: number;
  message: string;
}

export interface BoardEdgeProximity {
  id: string;
  x: number;
  y: number;
  distance: number;
  requiredDistance: number;
  layer: string;
  elementId: string;
  message: string;
}

export interface ConstraintOverlayData {
  clearanceRegions: ClearanceRegion[];
  keepouts: KeepoutOverlay[];
  acidTraps: AcidTrapViolation[];
  annularRings: AnnularRingViolation[];
  edgeProximities: BoardEdgeProximity[];
  violations: DRCViolation[];
}

/**
 * Calculates clearance regions, keepouts, and manufacturing issues.
 * Supports an optional changedArea bounding box for high-speed incremental calculations.
 */
export class ConstraintVisualizer {
  
  /**
   * Performs an incremental DRC scan of a restricted bounding box to avoid full-board evaluation.
   */
  public scanIncremental(
    board: PCBBoard,
    changedArea?: { minX: number; minY: number; maxX: number; maxY: number }
  ): ConstraintOverlayData {
    const clearanceRegions: ClearanceRegion[] = [];
    const keepouts: KeepoutOverlay[] = [];
    const acidTraps: AcidTrapViolation[] = [];
    const annularRings: AnnularRingViolation[] = [];
    const edgeProximities: BoardEdgeProximity[] = [];
    const incrementalViolations: DRCViolation[] = [];

    // Filter elements based on bounding box
    const inBox = (x: number, y: number, r = 0): boolean => {
      if (!changedArea) return true;
      return (
        x + r >= changedArea.minX &&
        x - r <= changedArea.maxX &&
        y + r >= changedArea.minY &&
        y - r <= changedArea.maxY
      );
    };

    const isTraceInBox = (t: BoardTrace): boolean => {
      if (!changedArea) return true;
      const minX = Math.min(t.startX, t.endX);
      const maxX = Math.max(t.startX, t.endX);
      const minY = Math.min(t.startY, t.endY);
      const maxY = Math.max(t.startY, t.endY);
      return (
        maxX >= changedArea.minX &&
        minX <= changedArea.maxX &&
        maxY >= changedArea.minY &&
        minY <= changedArea.maxY
      );
    };

    // 1. CLEARANCE OVERLAPS (Pads & Traces)
    const pads = board.components.flatMap(c => 
      c.pads.map(p => ({ ...p, componentId: c.id, designator: c.designator }))
    );

    // Pad-to-Pad Spacing clearance violations inside search window
    for (let i = 0; i < pads.length; i++) {
      const p1 = pads[i];
      if (!inBox(p1.x, p1.y, Math.max(p1.width, p1.height))) continue;

      for (let j = i + 1; j < pads.length; j++) {
        const p2 = pads[j];
        if (p1.componentId === p2.componentId && p1.id === p2.id) continue;
        if (p1.netId === p2.netId || p1.layer !== p2.layer) continue;

        const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const radSum = (Math.max(p1.width, p1.height) / 2) + (Math.max(p2.width, p2.height) / 2);
        
        const c1 = resolveNetConstraints(board, p1.netId || '');
        const c2 = resolveNetConstraints(board, p2.netId || '');
        const minSpacing = Math.max(c1.minSpacing, c2.minSpacing);
        const requiredGap = minSpacing + radSum;

        if (distance < requiredGap) {
          const violationId = `clearance-p2p-${p1.componentId}-${p1.id}-${p2.componentId}-${p2.id}`;
          clearanceRegions.push({
            id: violationId,
            type: 'pad-pad',
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2,
            radius: Math.max(requiredGap - distance, 0.4),
            severity: 'error',
            layer: p1.layer,
            elements: [p1.componentId, p2.componentId],
            message: `Clearance Violation: Pad ${p1.designator}.${p1.id} and Pad ${p2.designator}.${p2.id} is ${ (distance - radSum).toFixed(2) }mm (min required ${minSpacing.toFixed(2)}mm)`
          });
        }
      }
    }

    // Trace-to-Trace clearance violations inside search window
    for (let i = 0; i < board.traces.length; i++) {
      const t1 = board.traces[i];
      if (!isTraceInBox(t1)) continue;

      for (let j = i + 1; j < board.traces.length; j++) {
        const t2 = board.traces[j];
        if (t1.netId === t2.netId || t1.layer !== t2.layer) continue;
        if (!isTraceInBox(t2)) continue;

        const dist = this.segmentToSegmentDistance(t1, t2);
        const radSum = (t1.width + t2.width) / 2;
        const c1 = resolveNetConstraints(board, t1.netId);
        const c2 = resolveNetConstraints(board, t2.netId);
        const minSpacing = Math.max(c1.minSpacing, c2.minSpacing);
        const requiredGap = minSpacing + radSum;

        if (dist < requiredGap) {
          const violationId = `clearance-t2t-${t1.id}-${t2.id}`;
          clearanceRegions.push({
            id: violationId,
            type: 'trace-trace',
            x: (t1.startX + t1.endX + t2.startX + t2.endX) / 4,
            y: (t1.startY + t1.endY + t2.startY + t2.endY) / 4,
            radius: Math.max(requiredGap - dist, 0.4),
            severity: 'error',
            layer: t1.layer,
            elements: [t1.id, t2.id],
            message: `Clearance Violation: Traces gap is ${ (dist - radSum).toFixed(2) }mm, less than req ${minSpacing.toFixed(2)}mm`
          });
        }
      }
    }

    // 2. KEEPOUT ZONES checking
    board.keepouts.forEach(zone => {
      let isViolated = false;

      // Component within zone
      board.components.forEach(c => {
        if (!inBox(c.x, c.y)) return;
        if (zone.restrictions.includes('component') && zone.layers.includes(c.layer)) {
          if (c.x >= zone.x && c.x <= zone.x + zone.width &&
              c.y >= zone.y && c.y <= zone.y + zone.height) {
            isViolated = true;
          }
        }
      });

      // Vias within zone
      board.vias.forEach(v => {
        if (!inBox(v.x, v.y, v.padSize/2)) return;
        if (zone.restrictions.includes('via')) {
          if (v.x >= zone.x && v.x <= zone.x + zone.width &&
              v.y >= zone.y && v.y <= zone.y + zone.height) {
            isViolated = true;
          }
        }
      });

      keepouts.push({
        id: zone.id,
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        isViolated,
        layers: zone.layers,
        restrictions: zone.restrictions
      });
    });

    // 3. MANUFACTURABILITY OVERLAY: Acid Traps
    // Acid traps occur when two segments connected to the same net form an angle < 90 degrees (which can trap chemicals)
    const traceMapByNet = new Map<string, BoardTrace[]>();
    board.traces.forEach(t => {
      let bucket = traceMapByNet.get(t.netId);
      if (!bucket) {
        bucket = [];
        traceMapByNet.set(t.netId, bucket);
      }
      bucket.push(t);
    });

    traceMapByNet.forEach((traces, netId) => {
      for (let i = 0; i < traces.length; i++) {
        const t1 = traces[i];
        if (!isTraceInBox(t1)) continue;

        for (let j = i + 1; j < traces.length; j++) {
          const t2 = traces[j];
          if (t1.layer !== t2.layer) continue;

          // Check if they share an endpoint
          let connectedPoint: { x: number; y: number } | null = null;
          let v1x = t1.endX - t1.startX;
          let v1y = t1.endY - t1.startY;
          let v2x = t2.endX - t2.startX;
          let v2y = t2.endY - t2.startY;

          if (Math.hypot(t1.startX - t2.startX, t1.startY - t2.startY) < 0.05) {
            connectedPoint = { x: t1.startX, y: t1.startY };
            // Vector 1 points away from intersection, Vector 2 away
            v1x = t1.endX - t1.startX; v1y = t1.endY - t1.startY;
            v2x = t2.endX - t2.startX; v2y = t2.endY - t2.startY;
          } else if (Math.hypot(t1.startX - t2.endX, t1.startY - t2.endY) < 0.05) {
            connectedPoint = { x: t1.startX, y: t1.startY };
            v1x = t1.endX - t1.startX; v1y = t1.endY - t1.startY;
            v2x = t2.startX - t2.endX; v2y = t2.startY - t2.endY;
          } else if (Math.hypot(t1.endX - t2.startX, t1.endY - t2.startY) < 0.05) {
            connectedPoint = { x: t1.endX, y: t1.endY };
            v1x = t1.startX - t1.endX; v1y = t1.startY - t1.endY;
            v2x = t2.endX - t2.startX; v2y = t2.endY - t2.startY;
          } else if (Math.hypot(t1.endX - t2.endX, t1.endY - t2.endY) < 0.05) {
            connectedPoint = { x: t1.endX, y: t1.endY };
            v1x = t1.startX - t1.endX; v1y = t1.startY - t1.endY;
            v2x = t2.startX - t2.endX; v2y = t2.startY - t2.endY;
          }

          if (connectedPoint) {
            const mag1 = Math.hypot(v1x, v1y);
            const mag2 = Math.hypot(v2x, v2y);
            if (mag1 > 0.1 && mag2 > 0.1) {
              const cosTheta = (v1x * v2x + v1y * v2y) / (mag1 * mag2);
              // Clamp cosTheta for floats safety
              const angleRad = Math.acos(Math.max(-1, Math.min(1, cosTheta)));
              const angleDeg = angleRad * (180 / Math.PI);

              // Standard acid trap angle threshold is acute angle, meaning angleDeg < 90
              if (angleDeg > 0.5 && angleDeg < 70) {
                acidTraps.push({
                  id: `acidtrap-${t1.id}-${t2.id}`,
                  x: connectedPoint.x,
                  y: connectedPoint.y,
                  layer: t1.layer,
                  netId,
                  angleDeg,
                  traceIds: [t1.id, t2.id],
                  message: `DFM Alert: Acid Trap identified. Acute junction of ${angleDeg.toFixed(1)}° (<90° limits) can lead to chemical aggregation.`
                });
              }
            }
          }
        }
      }
    });

    // 4. MANUFACTURABILITY OVERLAY: Annular Ring Checks
    board.vias.forEach(v => {
      if (!inBox(v.x, v.y, v.padSize / 2)) return;

      const ringWidth = (v.padSize - v.drillSize) / 2;
      const minRequiredRing = 0.15; // standard manufacturing limit

      if (ringWidth < minRequiredRing) {
        annularRings.push({
          id: `annular-${v.id}`,
          x: v.x,
          y: v.y,
          viaId: v.id,
          ringWidth,
          requiredWidth: minRequiredRing,
          message: `DFM Alert: Insufficient Annular Ring width of ${ringWidth.toFixed(2)}mm (minimum required is ${minRequiredRing}mm). Mechanical breakage risk.`
        });
      }
    });

    // 5. MANUFACTURABILITY OVERLAY: Board Edge Proximity
    const edgeRequiredDistance = 0.5; // 0.5mm clearance constraint
    if (board.outline && board.outline.points && board.outline.points.length >= 3) {
      const outlinePoints = board.outline.points;

      // Helper to compute distance from point to polygon segments
      const pointToPolygonDistance = (p: { x: number; y: number }): { dist: number; closestX: number; closestY: number } => {
        let minDist = Infinity;
        let cx = 0, cy = 0;
        for (let i = 0; i < outlinePoints.length; i++) {
          const sStart = outlinePoints[i];
          const sEnd = outlinePoints[(i + 1) % outlinePoints.length];
          const s = { startX: sStart.x, startY: sStart.y, endX: sEnd.x, endY: sEnd.y };
          
          const dist = this.getPointToSegmentDistance(p, s);
          if (dist < minDist) {
            minDist = dist;
            // Midpoint approximate closest for coordinate tracking
            cx = (sStart.x + sEnd.x)/2;
            cy = (sStart.y + sEnd.y)/2;
          }
        }
        return { dist: minDist, closestX: cx, closestY: cy };
      };

      // Check board component placements proximity
      board.components.forEach(c => {
        if (!inBox(c.x, c.y)) return;
        const info = pointToPolygonDistance({ x: c.x, y: c.y });
        
        if (info.dist < edgeRequiredDistance) {
          edgeProximities.push({
            id: `edge-comp-${c.id}`,
            x: c.x,
            y: c.y,
            distance: info.dist,
            requiredDistance: edgeRequiredDistance,
            layer: c.layer,
            elementId: c.id,
            message: `DFM Alert: Component ${c.designator} sits ${info.dist.toFixed(2)}mm too close to board edge profile (minimum requested ${edgeRequiredDistance}mm)`
          });
        }
      });

      // Check vias proximity
      board.vias.forEach(v => {
        if (!inBox(v.x, v.y, v.padSize/2)) return;
        const info = pointToPolygonDistance({ x: v.x, y: v.y });
        
        if (info.dist < edgeRequiredDistance) {
          edgeProximities.push({
            id: `edge-via-${v.id}`,
            x: v.x,
            y: v.y,
            distance: info.dist,
            requiredDistance: edgeRequiredDistance,
            layer: "Multi-layer",
            elementId: v.id,
            message: `DFM Alert: Ground / Electrical Via lies ${info.dist.toFixed(2)}mm on outer routing periphery boundaries`
          });
        }
      });
    }

    // Wrap elements into violations schema values
    clearanceRegions.forEach(cr => {
      incrementalViolations.push({
        id: cr.id,
        type: 'clearance',
        message: cr.message,
        elements: cr.elements
      });
    });

    keepouts.filter(k => k.isViolated).forEach(kv => {
      incrementalViolations.push({
        id: `keepout-viol-${kv.id}`,
        type: 'keepout',
        message: `Keepout bounds restricted placement violation inside zone '${kv.id}'`,
        elements: [kv.id]
      });
    });

    acidTraps.forEach(at => {
      incrementalViolations.push({
        id: at.id,
        type: 'overlap',
        message: at.message,
        elements: at.traceIds
      });
    });

    annularRings.forEach(ar => {
      incrementalViolations.push({
        id: ar.id,
        type: 'clearance',
        message: ar.message,
        elements: [ar.viaId]
      });
    });

    return {
      clearanceRegions,
      keepouts,
      acidTraps,
      annularRings,
      edgeProximities,
      violations: incrementalViolations
    };
  }

  // --- Segment-to-segment distance algorithms helpers ---
  private getPointToSegmentDistance(p: { x: number; y: number }, s: { startX: number; startY: number; endX: number; endY: number }) {
    const dx = s.endX - s.startX;
    const dy = s.endY - s.startY;
    const l2 = dx*dx + dy*dy;
    if (l2 === 0) return Math.hypot(p.x - s.startX, p.y - s.startY);
    let t = ((p.x - s.startX) * dx + (p.y - s.startY) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (s.startX + t * dx), p.y - (s.startY + t * dy));
  }

  private segmentToSegmentDistance(s1: BoardTrace, s2: BoardTrace): number {
    const d1 = this.getPointToSegmentDistance({ x: s1.startX, y: s1.startY }, s2);
    const d2 = this.getPointToSegmentDistance({ x: s1.endX, y: s1.endY }, s2);
    const d3 = this.getPointToSegmentDistance({ x: s2.startX, y: s2.startY }, s1);
    const d4 = this.getPointToSegmentDistance({ x: s2.endX, y: s2.endY }, s1);
    return Math.min(d1, d2, d3, d4);
  }
}
