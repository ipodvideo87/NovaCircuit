import { PCBBoard, BoardComponent, BoardTrace, BoardPad, KeepoutZone, Via } from './board';
import { ConstrainedNetClasses, resolveNetConstraints } from './constraints';

export interface DRCViolation {
  id: string;
  type: "clearance" | "overlap" | "keepout" | "unrouted" | "board_edge";
  message: string;
  elements: string[]; // IDs of violating elements (components, pads, nets, traces)
}

// Exact segment-to-segment distance algorithm
function getDistanceToSegment(p: {x: number, y: number}, s: {startX: number, startY: number, endX: number, endY: number}) {
  const dx = s.endX - s.startX;
  const dy = s.endY - s.startY;
  const l2 = dx*dx + dy*dy;
  if (l2 === 0) return Math.hypot(p.x - s.startX, p.y - s.startY);
  let t = ((p.x - s.startX) * dx + (p.y - s.startY) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (s.startX + t * dx), p.y - (s.startY + t * dy));
}

function segmentToSegmentDistance(s1: any, s2: any): number {
  const d1 = getDistanceToSegment({ x: s1.startX, y: s1.startY }, s2);
  const d2 = getDistanceToSegment({ x: s1.endX, y: s1.endY }, s2);
  const d3 = getDistanceToSegment({ x: s2.startX, y: s2.startY }, s1);
  const d4 = getDistanceToSegment({ x: s2.endX, y: s2.endY }, s1);
  return Math.min(d1, d2, d3, d4);
}

export function runDRC(board: PCBBoard): DRCViolation[] {
  const violations: DRCViolation[] = [];

  // 1. Basic Component Overlap Check (Bounding Box)
  for (let i = 0; i < board.components.length; i++) {
    const c1 = board.components[i];
    for (let j = i + 1; j < board.components.length; j++) {
      const c2 = board.components[j];
      
      const dx = c1.x - c2.x;
      if (Math.abs(dx) >= 30) continue; // Safe bbox threshold
      const dy = c1.y - c2.y;
      if (Math.abs(dy) >= 30) continue;
      
      const distSq = dx*dx + dy*dy;
      if (distSq < 144) { // overlap threshold square area
        violations.push({
          id: `overlap-${c1.id}-${c2.id}`,
          type: "overlap",
          message: `Component overlap: ${c1.designator} overlaps with ${c2.designator}`,
          elements: [c1.id, c2.id]
        });
      }
    }
  }

  // 2. Pad Clearance Checks (Constraint-aware)
  const gridCellSize = 4;
  const grid = new Map<string, (BoardPad & { componentId: string, designator: string })[]>();
  
  const allPads: (BoardPad & { componentId: string, designator: string })[] = [];
  board.components.forEach(c => c.pads.forEach(p => {
    const pad = { ...p, componentId: c.id, designator: c.designator };
    allPads.push(pad);
    
    const cellX = Math.floor(pad.x / gridCellSize);
    const cellY = Math.floor(pad.y / gridCellSize);
    const cellKey = `${cellX},${cellY}`;
    let cell = grid.get(cellKey);
    if (!cell) {
      cell = [];
      grid.set(cellKey, cell);
    }
    cell.push(pad);
  }));

  for (let i = 0; i < allPads.length; i++) {
    const p1 = allPads[i];
    if (!p1.netId) continue;
    
    const cx = Math.floor(p1.x / gridCellSize);
    const cy = Math.floor(p1.y / gridCellSize);
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighborCell = grid.get(`${cx + dx},${cy + dy}`);
        if (!neighborCell) continue;
        
        for (let j = 0; j < neighborCell.length; j++) {
          const p2 = neighborCell[j];
          if (p1 === p2) continue;
          
          if (p2.netId && p1.netId !== p2.netId && p1.layer === p2.layer) {
            if (p1.componentId < p2.componentId || (p1.componentId === p2.componentId && p1.id < p2.id)) {
              const dxDist = p1.x - p2.x;
              const dyDist = p1.y - p2.y;
              
              const class1 = resolveNetConstraints(board, p1.netId);
              const class2 = resolveNetConstraints(board, p2.netId);
              const requiredClearance = Math.max(class1.minSpacing, class2.minSpacing);
              
              const radSum = (Math.max(p1.width, p1.height) / 2) + (Math.max(p2.width, p2.height) / 2);
              const threshold = radSum + requiredClearance;
              
              if (Math.abs(dxDist) > threshold || Math.abs(dyDist) > threshold) continue;
              
              const dist = Math.sqrt(dxDist*dxDist + dyDist*dyDist);
              const actualClearance = dist - radSum;
              
              if (actualClearance < requiredClearance) {
                const n1 = board.nets.find(n => n.id === p1.netId)?.name || p1.netId;
                const n2 = board.nets.find(n => n.id === p2.netId)?.name || p2.netId;
                violations.push({
                  id: `clearance-pad-${p1.componentId}-${p1.id}-${p2.componentId}-${p2.id}`,
                  type: "clearance",
                  message: `Pad Clearance: ${p1.designator}.${p1.id} (${n1}) to ${p2.designator}.${p2.id} (${n2}) is ${actualClearance.toFixed(2)}mm (required: ${requiredClearance}mm)`,
                  elements: [p1.componentId, p2.componentId]
                });
              }
            }
          }
        }
      }
    }
  }

  // 3. Keepout Zone Checks
  board.keepouts.forEach(zone => {
    board.components.forEach(c => {
      if (c.x > zone.x && c.x < zone.x + zone.width &&
          c.y > zone.y && c.y < zone.y + zone.height) {
        if (zone.restrictions.includes("component") && zone.layers.includes(c.layer)) {
          violations.push({
            id: `keepout-${c.id}-${zone.id}`,
            type: "keepout",
            message: `Keepout Violation: Component ${c.designator} placed within Restricted Keepout Zone`,
            elements: [c.id]
          });
        }
      }
    });

    board.vias.forEach(v => {
      if (v.x > zone.x && v.x < zone.x + zone.width &&
          v.y > zone.y && v.y < zone.y + zone.height) {
        if (zone.restrictions.includes("via")) {
          violations.push({
            id: `keepout-via-${v.id}-${zone.id}`,
            type: "keepout",
            message: `Keepout Violation: Via at (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) resides in a keepout restriction area`,
            elements: [v.id]
          });
        }
      }
    });
  });

  // 4. Duplicate Reference Designator Check
  const seenDesignators = new Set<string>();
  board.components.forEach(c => {
    if (seenDesignators.has(c.designator)) {
      violations.push({
        id: `dup-${c.id}`,
        type: "overlap",
        message: `Duplicate designator detected in board database: "${c.designator}"`,
        elements: [c.id]
      });
    }
    seenDesignators.add(c.designator);
  });

  // 5. Unconnected Pad Detection
  board.components.forEach(c => {
    c.pads.forEach(p => {
      if (p.netId) {
        const hasTrace = board.traces.some(t => {
          return t.netId === p.netId && 
                 (Math.hypot(t.startX - p.x, t.startY - p.y) < 0.25 || 
                  Math.hypot(t.endX - p.x, t.endY - p.y) < 0.25);
        });
        const hasVia = board.vias.some(v => {
          return v.netId === p.netId && Math.hypot(v.x - p.x, v.y - p.y) < 0.3;
        });
        if (!hasTrace && !hasVia && board.ratnest.some(r => r.netId === p.netId)) {
          violations.push({
            id: `unconnected-pad-${c.id}-${p.id}`,
            type: "unrouted",
            message: `Unrouted Pad Connection: Component "${c.designator}" pin "${p.id}" in net "${board.nets.find(n => n.id === p.netId)?.name || p.netId}" remains unrouted`,
            elements: [c.id]
          });
        }
      }
    });
  });

  // 6. Invalid Footprint Mapping Check — only flag components that have no routable pads at all
  board.components.forEach(c => {
    if (c.pads.length === 0) {
      violations.push({
        id: `invalid-fp-${c.id}`,
        type: "overlap",
        message: `Footprint Definition: Component "${c.designator}" has no pads (no pins defined)`,
        elements: [c.id]
      });
    }
  });

  // 7. Copper Overlap Validation (True geometric spacing checks)
  for (let i = 0; i < board.traces.length; i++) {
    const t1 = board.traces[i];
    for (let j = i + 1; j < board.traces.length; j++) {
      const t2 = board.traces[j];
      
      if (t1.layer === t2.layer && t1.netId !== t2.netId) {
        // Broad bounding box check to exclude far-away traces quickly
        const minX1 = Math.min(t1.startX, t1.endX);
        const maxX1 = Math.max(t1.startX, t1.endX);
        const minX2 = Math.min(t2.startX, t2.endX);
        const maxX2 = Math.max(t2.startX, t2.endX);
        
        const c1 = resolveNetConstraints(board, t1.netId);
        const c2 = resolveNetConstraints(board, t2.netId);
        const ruleSp = Math.max(c1.minSpacing, c2.minSpacing);
        const boundingThr = ruleSp + (t1.width + t2.width)/2;

        if (minX1 - maxX2 > boundingThr || minX2 - maxX1 > boundingThr) continue;

        const distance = segmentToSegmentDistance(t1, t2);
        const clearanceGap = distance - (t1.width + t2.width)/2;
        
        if (clearanceGap < ruleSp) {
          const n1 = board.nets.find(n => n.id === t1.netId)?.name || t1.netId;
          const n2 = board.nets.find(n => n.id === t2.netId)?.name || t2.netId;
          violations.push({
            id: `overlap-trace-${t1.id}-${t2.id}`,
            type: "clearance",
            message: `Trace Spacing Conflict: Net '${n1}' segment to net '${n2}' segment gap is ${clearanceGap.toFixed(2)}mm on layer ${t1.layer} (threshold is ${ruleSp}mm)`,
            elements: [t1.id, t2.id]
          });
        }
      }
    }
  }

  // 8. Trace Width Constraints Verification
  board.traces.forEach(t => {
    const rules = resolveNetConstraints(board, t.netId);
    const netName = board.nets.find(n => n.id === t.netId)?.name || t.netId;
    
    if (t.width < rules.minWidth - 0.001) {
      violations.push({
        id: `width-min-${t.id}`,
        type: "clearance",
        message: `Min Trace Width Mismatch: Net '${netName}' segment has width ${t.width.toFixed(2)}mm, below Net Class '${rules.minWidth.toFixed(2)}mm'`,
        elements: [t.id, t.netId]
      });
    }
    
    if (rules.maxWidth && t.width > rules.maxWidth + 0.001) {
      violations.push({
        id: `width-max-${t.id}`,
        type: "clearance",
        message: `Max Trace Width Mismatch: Net '${netName}' segment width of ${t.width.toFixed(2)}mm exceeds Net Class maximum of ${rules.maxWidth.toFixed(2)}mm`,
        elements: [t.id, t.netId]
      });
    }
  });

  // 9. Layer routing constraints verification
  board.traces.forEach(t => {
    const rules = resolveNetConstraints(board, t.netId);
    const netName = board.nets.find(n => n.id === t.netId)?.name || t.netId;
    
    if (rules.allowedLayers && rules.allowedLayers.length > 0) {
      if (!rules.allowedLayers.includes(t.layer)) {
        violations.push({
          id: `layer-restriction-${t.id}`,
          type: "keepout",
          message: `Layer Routing Restriction Violation: Net '${netName}' is placed on layer "${t.layer}" which is banned. Allowed: ${rules.allowedLayers.join(", ")}`,
          elements: [t.id, t.netId]
        });
      }
    }
  });

  // 10. Via physical sizes verification
  board.vias.forEach(v => {
    const rules = resolveNetConstraints(board, v.netId);
    const netName = board.nets.find(n => n.id === v.netId)?.name || v.netId;
    
    if (v.drillSize < rules.viaDrillSize - 0.001 || v.padSize < rules.viaPadSize - 0.001) {
      violations.push({
        id: `via-dims-${v.id}`,
        type: "clearance",
        message: `Via Constraints Violation: Net '${netName}' via is [drill ${v.drillSize}mm / pad ${v.padSize}mm], violating Net Class minima [drill ${rules.viaDrillSize}mm / pad ${rules.viaPadSize}mm]`,
        elements: [v.id, v.netId]
      });
    }
  });

  // 11. Length matching constraints verification
  board.nets.forEach(net => {
    const rules = resolveNetConstraints(board, net.id);
    if (rules.lengthTarget !== undefined && rules.lengthTarget > 0) {
      const netTraces = board.traces.filter(t => t.netId === net.id);
      const totalLen = netTraces.reduce((sum, t) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
      const tolerance = rules.lengthTolerance || 0.5;
      
      if (Math.abs(totalLen - rules.lengthTarget) > tolerance) {
        violations.push({
          id: `net-len-target-${net.id}`,
          type: "unrouted",
          message: `Length Matching: Net '${net.name}' is ${totalLen.toFixed(2)}mm, violating matched target of ${rules.lengthTarget.toFixed(2)}mm (±${tolerance}mm limits: ${ (rules.lengthTarget - tolerance).toFixed(2) }mm to ${ (rules.lengthTarget + tolerance).toFixed(2) }mm)`,
          elements: [net.id]
        });
      }
    }
  });

  // 12. Unrouted Nets Check
  if (board.ratnest.length > 0) {
    violations.push({
      id: "unrouted",
      type: "unrouted",
      message: `Board connectivity state contains ${board.ratnest.length} unrouted connections.`,
      elements: board.ratnest.map(r => r.netId)
    });
  }

  // 13. High-Speed Differential Pair & Impedance Rule Validation
  const diffPairsToValidate: any[] = [];
  
  if (board.diffPairs && board.diffPairs.length > 0) {
    board.diffPairs.forEach(dp => {
      diffPairsToValidate.push({ ...dp });
    });
  }

  board.nets.forEach(net1 => {
    let isPositive = false;
    let baseName = "";
    if (net1.name.endsWith("+")) {
      isPositive = true;
      baseName = net1.name.slice(0, -1);
    } else if (net1.name.endsWith("_P")) {
      isPositive = true;
      baseName = net1.name.slice(0, -2);
    } else if (net1.name.endsWith("DP") && net1.name !== "GND" && net1.name !== "VCC") {
      isPositive = true;
      baseName = net1.name.slice(0, -2);
    }

    if (isPositive && baseName) {
      const possibleNegatives = [baseName + "-", baseName + "_N", baseName + "DN"];
      const net2 = board.nets.find(n => possibleNegatives.includes(n.name));
      if (net2) {
        const exists = diffPairsToValidate.some(dp => 
          (dp.positiveNetId === net1.id && dp.negativeNetId === net2.id) ||
          (dp.positiveNetId === net2.id && dp.negativeNetId === net1.id)
        );
        if (!exists) {
          diffPairsToValidate.push({
            id: `auto-dp-${baseName}`,
            name: baseName,
            positiveNetId: net1.id,
            negativeNetId: net2.id,
            spacing: 0.25,
            width: 0.15,
            skewTolerance: 0.5,
            targetImpedance: 90,
            maxUncoupledLength: 5.0
          });
        }
      }
    }
  });

  diffPairsToValidate.forEach(dp => {
    const posTraces = board.traces.filter(t => t.netId === dp.positiveNetId);
    const negTraces = board.traces.filter(t => t.netId === dp.negativeNetId);
    
    const posLen = posTraces.reduce((sum, t) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
    const negLen = negTraces.reduce((sum, t) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
    const maxLen = Math.max(posLen, negLen);
    
    if (posLen > 0 || negLen > 0) {
      // Skew check
      const skew = Math.abs(posLen - negLen);
      if (skew > dp.skewTolerance) {
        violations.push({
          id: `hsd-skew-${dp.id}`,
          type: "clearance",
          message: `Differential Skew Failure [${dp.name}]: Skew is ${skew.toFixed(2)}mm, exceeding constraint ±${dp.skewTolerance}mm. (D+ = ${posLen.toFixed(1)}mm, D- = ${negLen.toFixed(1)}mm)`,
          elements: [dp.positiveNetId, dp.negativeNetId]
        });
      }

      // Check parallel trace spacing coupling properties
      let posCoupled = 0;
      let spacingBypasses = 0;

      posTraces.forEach(pt => {
        const ptLen = Math.hypot(pt.startX - pt.endX, pt.startY - pt.endY);
        if (ptLen < 0.01) return;

        let maxOverlapForPt = 0;
        let bestDistance = Infinity;

        negTraces.forEach(nt => {
          if (pt.layer !== nt.layer) return;

          const pvx = pt.endX - pt.startX;
          const pvy = pt.endY - pt.startY;
          const nvx = nt.endX - nt.startX;
          const nvy = nt.endY - nt.startY;

          const p_mag = Math.hypot(pvx, pvy);
          const n_mag = Math.hypot(nvx, nvy);
          if (p_mag < 0.01 || n_mag < 0.01) return;

          const dot = (pvx * nvx + pvy * nvy) / (p_mag * n_mag);
          if (Math.abs(dot) > 0.90) {
            const pmx = (pt.startX + pt.endX) / 2;
            const pmy = (pt.startY + pt.endY) / 2;

            const l2 = n_mag * n_mag;
            let t_param = 0;
            if (l2 > 0) {
              t_param = ((pmx - nt.startX) * nvx + (pmy - nt.startY) * nvy) / l2;
              t_param = Math.max(0, Math.min(1, t_param));
            }
            const projx = nt.startX + t_param * nvx;
            const projy = nt.startY + t_param * nvy;
            const dist = Math.hypot(pmx - projx, pmy - projy);

            if (dist < 3.0) {
              bestDistance = dist;
              const proj_st = ((pt.startX - nt.startX) * nvx + (pt.startY - nt.startY) * nvy) / n_mag;
              const proj_et = ((pt.endX - nt.startX) * nvx + (pt.endY - nt.startY) * nvy) / n_mag;
              
              const s_min = Math.min(proj_st, proj_et);
              const s_max = Math.max(proj_st, proj_et);
              
              const lap_start = Math.max(0, s_min);
              const lap_end = Math.min(n_mag, s_max);
              
              if (lap_end > lap_start) {
                const overlap = lap_end - lap_start;
                if (overlap > maxOverlapForPt) {
                   maxOverlapForPt = overlap;
                }
              }
            }
          }
        });

        posCoupled += maxOverlapForPt;

        if (maxOverlapForPt > 0.1) {
          const gapDelta = Math.abs(bestDistance - dp.spacing);
          if (gapDelta > dp.spacing * 0.35) {
            spacingBypasses++;
          }
        }
      });

      if (spacingBypasses > 0) {
        violations.push({
          id: `hsd-spacing-${dp.id}`,
          type: "clearance",
          message: `Coupling Gap Deviation [${dp.name}]: Spacing deviated from target ${dp.spacing}mm by >35% on ${spacingBypasses} segments`,
          elements: [dp.positiveNetId, dp.negativeNetId]
        });
      }

      const uncoupledL = maxLen - posCoupled;
      const uncoupledLimit = dp.maxUncoupledLength || 5.0;
      if (uncoupledL > uncoupledLimit) {
        violations.push({
          id: `hsd-uncoupled-${dp.id}`,
          type: "clearance",
          message: `Uncoupled Length Failure [${dp.name}]: Parallel trace signals run uncoupled for ${uncoupledL.toFixed(1)}mm (maximum allowed: ${uncoupledLimit}mm)`,
          elements: [dp.positiveNetId, dp.negativeNetId]
        });
      }

      // Impedance calculation
      const traceEx = posTraces[0] || negTraces[0];
      if (traceEx && dp.targetImpedance) {
        const w = traceEx.width;
        const h = 0.2;
        const t = 0.035;
        const er = 4.2;

        const r = (5.98 * h) / (0.8 * w + t);
        if (r > 0) {
          const z0 = (87 / Math.sqrt(er + 1.41)) * Math.log(r);
          const z_diff = 2 * z0 * (1 - 0.48 * Math.exp(-0.96 * (dp.spacing / h)));
          
          if (Math.abs(z_diff - dp.targetImpedance) > dp.targetImpedance * 0.12) {
            violations.push({
              id: `hsd-impedance-${dp.id}`,
              type: "clearance",
              message: `Differential Impedance Deviation [${dp.name}]: Calculated is ${z_diff.toFixed(1)}Ω, target is ${dp.targetImpedance}Ω (Width: ${w}mm, Spacing: ${dp.spacing}mm)`,
              elements: [dp.positiveNetId, dp.negativeNetId]
            });
          }
        }
      }
    }
  });

  // Impedance target for Single-ended Nets (e.g. microstrip formulas)
  if (board.netClasses && board.netClasses.length > 0) {
    board.netClasses.forEach(nc => {
      if (nc.impedanceOhms) {
        const targetNets = board.nets.filter(n => (n as any).netClass === nc.name || n.name.toUpperCase().includes(nc.name.toUpperCase()));
        targetNets.forEach(net => {
          const traces = board.traces.filter(t => t.netId === net.id);
          if (traces.length > 0) {
            const w = traces[0].width;
            const h = 0.2;
            const t = 0.035;
            const er = 4.2;

            const r = (5.98 * h) / (0.8 * w + t);
            if (r > 0) {
              const z0 = (87 / Math.sqrt(er + 1.41)) * Math.log(r);
              const diff = Math.abs(z0 - nc.impedanceOhms!);
              
              if (diff > nc.impedanceOhms! * 0.1) {
                violations.push({
                  id: `impedance-se-${net.id}`,
                  type: "clearance",
                  message: `Single-Ended Impedance Mismatch [${nc.name}]: Net '${net.name}' calculated Z₀ is ${z0.toFixed(1)}Ω vs target ${nc.impedanceOhms}Ω`,
                  elements: [net.id]
                });
              }
            }
          }
        });
      }
    });
  }

  return violations;
}
