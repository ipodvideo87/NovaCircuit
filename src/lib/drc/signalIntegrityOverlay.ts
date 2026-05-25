import { PCBBoard, BoardTrace, BoardPad, Via } from '../board';
import { resolveNetConstraints } from '../constraints';

export interface SkewHighlight {
  x: number;
  y: number;
  skewMm: number;
  allowedSkewMm: number;
  netName: string;
  associatedTraceIds: string[];
}

export interface ImpedanceMismatch {
  x: number;
  y: number;
  traceId: string;
  measuredImpedance: number;
  targetImpedance: number;
  percentageDeviation: number;
  layer: string;
  message: string;
}

export interface ReturnPathGap {
  x: number;
  y: number;
  traceId: string;
  netName: string;
  gapType: 'split-plane-crossing' | 'underlying-void' | 'reference-loss';
  dangerLevel: 'low' | 'medium' | 'high';
  message: string;
}

export interface EMIRiskPoint {
  x: number;
  y: number;
  traceId: string;
  factor: number; // EMI risk rating 0-10
  riskType: 'sharp-bend' | 'uncoupled-stub' | 'unterminated-branch';
  message: string;
}

export interface SignalIntegrityData {
  skews: SkewHighlight[];
  impedanceMismatches: ImpedanceMismatch[];
  returnPathGaps: ReturnPathGap[];
  emiRisks: EMIRiskPoint[];
}

export class SignalIntegrityOverlayAnalyzer {
  private erSubstrate = 4.2; // FR4 permittivity
  private baseDielectricHeight = 0.2; // mm (~8mil prepreg isolation)

  /**
   * Scans the active board databases to locate potential high-speed digital board failures.
   */
  public analyzeSignalIntegrity(board: PCBBoard): SignalIntegrityData {
    const skews: SkewHighlight[] = [];
    const impedanceMismatches: ImpedanceMismatch[] = [];
    const returnPathGaps: ReturnPathGap[] = [];
    const emiRisks: EMIRiskPoint[] = [];

    // Map traces to search nets
    const netTracesMap = new Map<string, BoardTrace[]>();
    board.traces.forEach(t => {
      let b = netTracesMap.get(t.netId);
      if (!b) {
        b = [];
        netTracesMap.set(t.netId, b);
      }
      b.push(t);
    });

    // 1. DIFFERENTIAL PAIR SKEW TRACKING
    const diffPairs = board.diffPairs || [];
    
    // Auto-detect diff pairs is done similarly to runDRC
    const allDiffPairs: any[] = [...diffPairs];
    board.nets.forEach(net1 => {
      let isPositive = false;
      let baseName = "";
      if (net1.name.endsWith("+") || net1.name.endsWith("_P")) {
        isPositive = true;
        baseName = net1.name.endsWith("+") ? net1.name.slice(0, -1) : net1.name.slice(0, -2);
      }

      if (isPositive && baseName) {
        const potentialNegs = [baseName + "-", baseName + "_N"];
        const net2 = board.nets.find(n => potentialNegs.includes(n.name));
        if (net2) {
          const exists = allDiffPairs.some(dp => 
            (dp.positiveNetId === net1.id && dp.negativeNetId === net2.id) ||
            (dp.positiveNetId === net2.id && dp.negativeNetId === net1.id)
          );
          if (!exists) {
            allDiffPairs.push({
              id: `auto-dp-${baseName}`,
              name: baseName,
              positiveNetId: net1.id,
              negativeNetId: net2.id,
              spacing: 0.25,
              width: 0.15,
              skewTolerance: 0.5,
              targetImpedance: 90
            });
          }
        }
      }
    });

    // Check skews along pairs
    allDiffPairs.forEach(dp => {
      const pTraces = netTracesMap.get(dp.positiveNetId) || [];
      const nTraces = netTracesMap.get(dp.negativeNetId) || [];

      if (pTraces.length === 0 || nTraces.length === 0) return;

      const pLen = pTraces.reduce((sum, t) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
      const nLen = nTraces.reduce((sum, t) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);

      const skewMm = Math.abs(pLen - nLen);
      const tolerance = dp.skewTolerance || 0.5;

      if (skewMm > tolerance) {
        // Pinpoint divergence midpoint (where trace paths start branching apart)
        const sampleTrace = pTraces[pTraces.length - 1] || nTraces[nTraces.length - 1];
        skews.push({
          x: (sampleTrace.startX + sampleTrace.endX) / 2,
          y: (sampleTrace.startY + sampleTrace.endY) / 2,
          skewMm,
          allowedSkewMm: tolerance,
          netName: dp.name,
          associatedTraceIds: [...pTraces.map(t => t.id), ...nTraces.map(t => t.id)]
        });
      }
    });

    // 2. IMPEDANCE MISMATCH ON SINGLE ENDED NETS AND PAIRS
    board.traces.forEach(t => {
      const rules = resolveNetConstraints(board, t.netId);
      const targetZ = rules.impedanceOhms || 50; // standard microstrip single-ended default
      const netName = board.nets.find(n => n.id === t.netId)?.name || t.netId;

      // Microstrip formula models:
      // Z0 = (87 / sqrt(Er + 1.41)) * ln(5.98 * H / (0.8 * W + T))
      const W = t.width;
      const H = this.baseDielectricHeight;
      const T = 0.035; // Standard 1oz copper
      const denominator = 0.8 * W + T;

      if (denominator > 0) {
        const ratio = (5.98 * H) / denominator;
        if (ratio > 1) {
          const z0 = (87 / Math.sqrt(this.erSubstrate + 1.41)) * Math.log(ratio);
          const deviation = Math.abs(z0 - targetZ) / targetZ;

          if (deviation > 0.12) { // Allow 12% characteristic tolerances
            impedanceMismatches.push({
              x: (t.startX + t.endX) / 2,
              y: (t.startY + t.endY) / 2,
              traceId: t.id,
              measuredImpedance: z0,
              targetImpedance: targetZ,
              percentageDeviation: deviation * 100,
              layer: t.layer,
              message: `Impedance Mismatch: Net '${netName}' is ${z0.toFixed(1)}Ω vs target ${targetZ}Ω (deviation: ${(deviation * 100).toFixed(1)}%). Segments width is too narrow or wide.`
            });
          }
        }
      }
    });

    // 3. RETURN-PATH PLANE GAP CROSSINGS
    // A return path crossing happens when high speed traces traverse crossing slots or split-plane regions
    // We can simulate split gaps by checking if traces intersect Keepout Restricted zones with 'copper' / split-boundary markings
    board.traces.forEach(t => {
      // High-speed check triggers loop-area warning constraints
      const netName = board.nets.find(n => n.id === t.netId)?.name || t.netId;
      const isHighSpeed = netName.toUpperCase().includes('USB') || 
                          netName.toUpperCase().includes('SPI') || 
                          netName.toUpperCase().includes('CLK') || 
                          netName.toUpperCase().includes('DDB') ||
                          netName.toUpperCase().includes('D_P') ||
                          netName.toUpperCase().includes('D_N') ||
                          netName.toUpperCase().includes('DIFF');

      if (!isHighSpeed) return;

      board.keepouts.forEach(zone => {
        // Check if trace crosses the boundaries of a keepout restrictions zone
        const crossesZone = this.lineIntersectsRect(
          t.startX, t.startY, t.endX, t.endY,
          zone.x, zone.y, zone.width, zone.height
        );

        if (crossesZone && zone.restrictions.includes('copper')) {
          returnPathGaps.push({
            x: (t.startX + t.endX) / 2,
            y: (t.startY + t.endY) / 2,
            traceId: t.id,
            netName,
            gapType: 'split-plane-crossing',
            dangerLevel: 'high',
            message: `EMC Alert: High-speed Net '${netName}' crosses reference plane slot boundaries. Creates major loop return return paths, inducing electromagnetic radiation (EMI) risks.`
          });
        }
      });
    });

    // 4. EMI RADIATION RISKS: Sharp Bends and Corners check
    board.traces.forEach(t1 => {
      const connections = board.traces.filter(t2 => t2.id !== t1.id && t2.netId === t1.netId && t2.layer === t1.layer);
      
      connections.forEach(t2 => {
        let connectedPt = null;
        let dx1 = 0, dy1 = 0, dx2 = 0, dy2 = 0;

        if (Math.hypot(t1.startX - t2.startX, t1.startY - t2.startY) < 0.05) {
          connectedPt = { x: t1.startX, y: t1.startY };
          dx1 = t1.endX - t1.startX; dy1 = t1.endY - t1.startY;
          dx2 = t2.endX - t2.startX; dy2 = t2.endY - t2.startY;
        } else if (Math.hypot(t1.startX - t2.endX, t1.startY - t2.endY) < 0.05) {
          connectedPt = { x: t1.startX, y: t1.startY };
          dx1 = t1.endX - t1.startX; dy1 = t1.endY - t1.startY;
          dx2 = t2.startX - t2.endX; dy2 = t2.startY - t2.endY;
        } else if (Math.hypot(t1.endX - t2.startX, t1.endY - t2.startY) < 0.05) {
          connectedPt = { x: t1.endX, y: t1.endY };
          dx1 = t1.startX - t1.endX; dy1 = t1.startY - t1.endY;
          dx2 = t2.endX - t2.startX; dy2 = t2.endY - t2.startY;
        } else if (Math.hypot(t1.endX - t2.endX, t1.endY - t2.endY) < 0.05) {
          connectedPt = { x: t1.endX, y: t1.endY };
          dx1 = t1.startX - t1.endX; dy1 = t1.startY - t1.endY;
          dx2 = t2.startX - t2.endX; dy2 = t2.startY - t2.endY;
        }

        if (connectedPt) {
          const l1 = Math.hypot(dx1, dy1);
          const l2 = Math.hypot(dx2, dy2);

          if (l1 > 0.05 && l2 > 0.05) {
            const cos = (dx1 * dx2 + dy1 * dy2) / (l1 * l2);
            const angleRad = Math.acos(Math.max(-1, Math.min(1, cos)));
            const angleDeg = angleRad * (180 / Math.PI);

            // Bends that are 90 degrees or worse (acute angle of vectors of trace endpoints connected, meaning angle between lines is < 100 degrees)
            if (angleDeg < 95) {
              const netName = board.nets.find(n => n.id === t1.netId)?.name || t1.netId;
              const isHighSpeed = netName.toUpperCase().includes('USB') ||
                                  netName.toUpperCase().includes('CLK') ||
                                  netName.toUpperCase().includes('SPI');

              emiRisks.push({
                x: connectedPt.x,
                y: connectedPt.y,
                traceId: t1.id,
                factor: isHighSpeed ? 8.5 : 4.0,
                riskType: 'sharp-bend',
                message: `EMI Risk: Sharp ${angleDeg.toFixed(0)}° trace bend corner. Signal discontinuities create impedance spikes and high-frequency emissions.`
              });
            }
          }
        }
      });
    });

    return {
      skews,
      impedanceMismatches,
      returnPathGaps,
      emiRisks
    };
  }

  // --- Line-rectangle check helper ---
  private lineIntersectsRect(
    x1: number, y1: number, x2: number, y2: number,
    rx: number, ry: number, rw: number, rh: number
  ): boolean {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    // broad check
    if (maxX < rx || minX > rx + rw || maxY < ry || minY > ry + rh) {
      return false;
    }

    // fine line segments-boundary check logic
    const rectLines = [
      { startX: rx, startY: ry, endX: rx + rw, endY: ry },
      { startX: rx + rw, startY: ry, endX: rx + rw, endY: ry + rh },
      { startX: rx + rw, startY: ry + rh, endX: rx, endY: ry + rh },
      { startX: rx, startY: ry + rh, endX: rx, endY: ry }
    ];

    return rectLines.some(rl => {
      const denom = (y2 - y1) * (rl.endX - rl.startX) - (x2 - x1) * (rl.endY - rl.startY);
      if (denom === 0) return false; // Parallel lines

      const ua = ((x2 - x1) * (rl.startY - y1) - (y2 - y1) * (rl.startX - x1)) / denom;
      const ub = ((rl.endX - rl.startX) * (rl.startY - y1) - (rl.endY - rl.startY) * (rl.startX - x1)) / denom;

      return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
    });
  }
}
