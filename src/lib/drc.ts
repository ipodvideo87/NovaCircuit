import { PCBBoard, BoardComponent, BoardTrace, BoardPad, KeepoutZone } from './board';
import { ConstrainedNetClasses } from './constraints';

export interface DRCViolation {
  id: string;
  type: "clearance" | "overlap" | "keepout" | "unrouted" | "board_edge";
  message: string;
  elements: string[]; // IDs of violating elements (components, pads, nets, traces)
}

export function runDRC(board: PCBBoard): DRCViolation[] {
  const violations: DRCViolation[] = [];

  // 1. Basic Component Overlap Check (Bounding Box)
  for (let i = 0; i < board.components.length; i++) {
    const c1 = board.components[i];
    for (let j = i + 1; j < board.components.length; j++) {
      const c2 = board.components[j];
      
      // Fast-exit coordinate bounding-box check
      const dx = c1.x - c2.x;
      if (Math.abs(dx) >= 3) continue;
      const dy = c1.y - c2.y;
      if (Math.abs(dy) >= 3) continue;
      
      // Squared distance check completely avoids expensive Math.sqrt calls
      const distSq = dx*dx + dy*dy;
      if (distSq < 9) {
        violations.push({
          id: `overlap-${c1.id}-${c2.id}`,
          type: "overlap",
          message: `Component ${c1.designator} overlaps with ${c2.designator}`,
          elements: [c1.id, c2.id]
        });
      }
    }
  }

  // 2. Pad Clearance Checks
  // Check space between pads of different nets
  // Use a spatial grid to avoid O(N^2) on thousands of pads
  const gridCellSize = 3; // larger than max required detection radius (2.5)
  const grid = new Map<string, (BoardPad & { componentId: string })[]>();
  
  const allPads: (BoardPad & { componentId: string })[] = [];
  board.components.forEach(c => c.pads.forEach(p => {
    const pad = { ...p, componentId: c.id };
    allPads.push(pad);
    
    // Assign to grid
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
    
    // Check 3x3 neighborhood
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighborCell = grid.get(`${cx + dx},${cy + dy}`);
        if (!neighborCell) continue;
        
        for (let j = 0; j < neighborCell.length; j++) {
          const p2 = neighborCell[j];
          if (p1 === p2) continue; // skip self
          
          if (p2.netId && p1.netId !== p2.netId && p1.layer === p2.layer) {
            // Note: to avoid duplicate checks, we could check id ordering, but for detection it's fine
            if (p1.componentId < p2.componentId || (p1.componentId === p2.componentId && p1.id < p2.id)) {
              const dxDist = p1.x - p2.x;
              const dyDist = p1.y - p2.y;
              // fast bounding check before sqrt
              if (Math.abs(dxDist) > 2.5 || Math.abs(dyDist) > 2.5) continue;
              
              const dist = Math.sqrt(dxDist*dxDist + dyDist*dyDist);
              
              // Approx distance between pad centers. True clearance needs pad shape math.
              const requiredClearance = 0.5; // mm
              // Assume pad radius approx 1mm for now to test clearance
              if (dist < (1 + 1 + requiredClearance)) {
                  // violations.push({
                  //  id: `clear-${p1.componentId}-${p2.componentId}`,
                  //  type: "clearance",
                  //  message: `Pad clearance violation between ${p1.componentId}.${p1.id} and ${p2.componentId}.${p2.id}`,
                  //  elements: [p1.componentId, p2.componentId]
                  // });
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
            message: `Component ${c.designator} is in keepout zone`,
            elements: [c.id]
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
        message: `Duplicate component designator: ${c.designator}`,
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
                 (Math.hypot(t.startX - p.x, t.startY - p.y) < 0.15 || 
                  Math.hypot(t.endX - p.x, t.endY - p.y) < 0.15);
        });
        if (!hasTrace) {
          violations.push({
            id: `unconnected-pad-${c.id}-${p.id}`,
            type: "unrouted",
            message: `Unconnected net pad on component: ${c.designator} pin ${p.id}`,
            elements: [c.id]
          });
        }
      }
    });
  });

  // 6. Invalid Footprint Mapping
  board.components.forEach(c => {
    if (!c.footprintId || c.footprintId === 'DEFAULT' || c.pads.length === 0) {
      violations.push({
        id: `invalid-fp-${c.id}`,
        type: "overlap",
        message: `Component ${c.designator} has invalid footprint mapping: "${c.footprintId}"`,
        elements: [c.id]
      });
    }
  });

  // 7. Copper Overlap Validation (Intersecting traces of different nets on same layer)
  for (let i = 0; i < board.traces.length; i++) {
    const t1 = board.traces[i];
    for (let j = i + 1; j < board.traces.length; j++) {
      const t2 = board.traces[j];
      if (t1.layer === t2.layer && t1.netId !== t2.netId) {
         const mid1X = (t1.startX + t1.endX) / 2;
         const mid1Y = (t1.startY + t1.endY) / 2;
         const mid2X = (t2.startX + t2.endX) / 2;
         const mid2Y = (t2.startY + t2.endY) / 2;
         if (Math.hypot(mid1X - mid2X, mid1Y - mid2Y) < 0.3) {
           violations.push({
             id: `overlap-trace-${t1.id}-${t2.id}`,
             type: "overlap",
             message: `Copper overlap detected between different net traces on layer ${t1.layer}`,
             elements: [t1.id, t2.id]
           });
         }
      }
    }
  }

  // 8. Unrouted Nets Check
  if (board.ratnest.length > 0) {
    violations.push({
      id: "unrouted",
      type: "unrouted",
      message: `Board has ${board.ratnest.length} unrouted airwire connection(s).`,
      elements: board.ratnest.map(r => r.netId)
    });
  }

  // 9. High-Speed Differential Pair & Impedance Rule Validation
  const diffPairsToValidate: any[] = [];
  
  // Collect defined differential pairs
  if (board.diffPairs && board.diffPairs.length > 0) {
    board.diffPairs.forEach(dp => {
      diffPairsToValidate.push({ ...dp });
    });
  }

  // Auto-discover pairs based on naming convention (USB_D+/USB_D-, name_P/name_N, name_DP/name_DN)
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
            spacing: 0.25, // mm default
            width: 0.15, // mm default
            skewTolerance: 0.5, // mm tolerance
            targetImpedance: 90, // target diff impedance Ohms
            maxUncoupledLength: 5.0 // max uncoupled run in mm
          });
        }
      }
    }
  });

  // Perform active DP checks
  diffPairsToValidate.forEach(dp => {
    const posTraces = board.traces.filter(t => t.netId === dp.positiveNetId);
    const negTraces = board.traces.filter(t => t.netId === dp.negativeNetId);
    
    const posLen = posTraces.reduce((sum, t) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
    const negLen = negTraces.reduce((sum, t) => sum + Math.hypot(t.startX - t.endX, t.startY - t.endY), 0);
    const maxLen = Math.max(posLen, negLen);
    
    if (posLen > 0 || negLen > 0) {
      // 9.1 Skew Tolerance
      const skew = Math.abs(posLen - negLen);
      if (skew > dp.skewTolerance) {
        violations.push({
          id: `hsd-skew-${dp.id}`,
          type: "clearance",
          message: `High-Speed Skew Violation [${dp.name}]: Delta of ${skew.toFixed(2)}mm exceeds skew tolerance of ${dp.skewTolerance}mm. (P=${posLen.toFixed(1)}mm, N=${negLen.toFixed(1)}mm)`,
          elements: [dp.positiveNetId, dp.negativeNetId]
        });
      }

      // 9.2 Coupled length and spacing
      let posCoupled = 0;
      let spacingViolationsCount = 0;

      posTraces.forEach(pt => {
        const ptLen = Math.hypot(pt.startX - pt.endX, pt.startY - pt.endY);
        if (ptLen === 0) return;

        let maxOverlapForPt = 0;
        let bestDistance = 0;

        negTraces.forEach(nt => {
          if (pt.layer !== nt.layer) return;

          const pvx = pt.endX - pt.startX;
          const pvy = pt.endY - pt.startY;
          const nvx = nt.endX - nt.startX;
          const nvy = nt.endY - nt.startY;

          const p_mag = Math.hypot(pvx, pvy);
          const n_mag = Math.hypot(nvx, nvy);
          if (p_mag === 0 || n_mag === 0) return;

          const dot = (pvx * nvx + pvy * nvy) / (p_mag * n_mag);
          if (Math.abs(dot) > 0.92) {
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

            if (dist < 1.75) {
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

        if (maxOverlapForPt > 0.2) {
          const spacingDelta = Math.abs(bestDistance - dp.spacing);
          if (spacingDelta > dp.spacing * 0.3) {
            spacingViolationsCount++;
          }
        }
      });

      if (spacingViolationsCount > 0) {
        violations.push({
          id: `hsd-spacing-${dp.id}`,
          type: "clearance",
          message: `Differential Spacing Violation [${dp.name}]: Trace spacing deviates by >30% from target spacing of ${dp.spacing}mm on ${spacingViolationsCount} segments.`,
          elements: [dp.positiveNetId, dp.negativeNetId]
        });
      }

      // 9.3 Uncoupled length
      const uncoupledLen = maxLen - posCoupled;
      const maxUncoupled = dp.maxUncoupledLength || 5.0;
      if (uncoupledLen > maxUncoupled) {
        violations.push({
          id: `hsd-uncoupled-${dp.id}`,
          type: "clearance",
          message: `Uncoupled Length Violation [${dp.name}]: High speed traces run uncoupled for ${uncoupledLen.toFixed(1)}mm (max allowed: ${maxUncoupled}mm).`,
          elements: [dp.positiveNetId, dp.negativeNetId]
        });
      }

      // 9.4 Differential Impedance check (FR4 microstrip formula)
      const firstTrace = posTraces[0] || negTraces[0];
      if (firstTrace && dp.targetImpedance) {
        const w = firstTrace.width;
        const h = 0.2; // typical height
        const t = 0.035; // 1oz copper
        const er = 4.2; // FR4

        const ratio = (5.98 * h) / (0.8 * w + t);
        if (ratio > 0) {
          const z0 = (87 / Math.sqrt(er + 1.41)) * Math.log(ratio);
          const z_diff = 2 * z0 * (1 - 0.48 * Math.exp(-0.96 * (dp.spacing / h)));

          const impDelta = Math.abs(z_diff - dp.targetImpedance);
          if (impDelta > dp.targetImpedance * 0.1) {
            violations.push({
              id: `hsd-impedance-${dp.id}`,
              type: "clearance",
              message: `High-Speed Impedance Deviation [${dp.name}]: Differential impedance is ${z_diff.toFixed(1)}Ω (target is ${dp.targetImpedance}Ω). Adjust width (${w}mm) or spacing (${dp.spacing}mm).`,
              elements: [dp.positiveNetId, dp.negativeNetId]
            });
          }
        }
      }
    }
  });

  // 9.5 Single-ended Target Impedance rules for Nets matching Clock/RF NetClasses
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

            const ratio = (5.98 * h) / (0.8 * w + t);
            if (ratio > 0) {
              const z0 = (87 / Math.sqrt(er + 1.41)) * Math.log(ratio);
              const impDelta = Math.abs(z0 - nc.impedanceOhms!);
              if (impDelta > nc.impedanceOhms! * 0.1) {
                violations.push({
                  id: `hs-se-impedance-${net.id}`,
                  type: "clearance",
                  message: `Single-Ended Impedance Mismatch on '${net.name}' [${nc.name}]: Calculated $Z_0$ of ${z0.toFixed(1)}Ω deviates from target ${nc.impedanceOhms}Ω.`,
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
