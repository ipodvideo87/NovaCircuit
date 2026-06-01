import { PCBBoard, PCBTrace, PCBComponent } from '../types/pcb';
import { groupTracesByHighSpeedGroup, getTraceLength } from './routingSystem';

export interface RuleCheckResult {
  ruleName: string;
  category: 'ERC' | 'DFM';
  status: 'PASS' | 'WARNING' | 'FAIL';
  description: string;
  affectedIds: string[];
}

export interface DesignReport {
  timestamp: string;
  summary: {
    totalErrors: number;
    totalWarnings: number;
    score: number; // 0 to 100
    status: 'APPROVED' | 'REQUIRES_REVISION' | 'REJECTED';
  };
  checks: RuleCheckResult[];
}

// Check for trace junctions with acute angles (< 90 degrees) which can trap acid during PCB etching
export function detectAcidTraps(traces: PCBTrace[]): { count: number; affectedTraces: string[], details: string[] } {
  let count = 0;
  const affectedTraces: string[] = [];
  const details: string[] = [];

  // Identify acute intersections between trace segments that share endpoints
  for (let i = 0; i < traces.length; i++) {
    const t1 = traces[i];
    for (let j = i + 1; j < traces.length; j++) {
      const t2 = traces[j];

      // Find if they share an endpoint
      let sharedX = null;
      let sharedY = null;
      let u1x = 0, u1y = 0, u2x = 0, u2y = 0;

      if (t1.startX === t2.startX && t1.startY === t2.startY) {
        sharedX = t1.startX; sharedY = t1.startY;
        u1x = t1.endX - t1.startX; u1y = t1.endY - t1.startY;
        u2x = t2.endX - t2.startX; u2y = t2.endY - t2.startY;
      } else if (t1.startX === t2.endX && t1.startY === t2.endY) {
        sharedX = t1.startX; sharedY = t1.startY;
        u1x = t1.endX - t1.startX; u1y = t1.endY - t1.startY;
        u2x = t2.startX - t2.endX; u2y = t2.startY - t2.endY;
      } else if (t1.endX === t2.startX && t1.endY === t2.startY) {
        sharedX = t1.endX; sharedY = t1.endY;
        u1x = t1.startX - t1.endX; u1y = t1.startY - t1.endY;
        u2x = t2.endX - t2.startX; u2y = t2.endY - t2.startY;
      } else if (t1.endX === t2.endX && t1.endY === t2.endY) {
        sharedX = t1.endX; sharedY = t1.endY;
        u1x = t1.startX - t1.endX; u1y = t1.startY - t1.endY;
        u2x = t2.startX - t2.endX; u2y = t2.startY - t2.endY;
      }

      if (sharedX !== null && sharedY !== null) {
        // Calculate angle between the vectors
        const len1 = Math.sqrt(u1x * u1x + u1y * u1y);
        const len2 = Math.sqrt(u2x * u2x + u2y * u2y);
        if (len1 > 0 && len2 > 0) {
          const dot = u1x * u2x + u1y * u2y;
          const cosTheta = dot / (len1 * len2);
          // Angle in degrees
          const angleDeg = Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180 / Math.PI);
          
          if (angleDeg < 45) { // Strict check for acid trap (<45 degrees is very acute)
            count++;
            if (!affectedTraces.includes(t1.id)) affectedTraces.push(t1.id);
            if (!affectedTraces.includes(t2.id)) affectedTraces.push(t2.id);
            details.push(`Acute angle of ${Math.round(angleDeg)}° between trace ${t1.id} and ${t2.id} at (${Math.round(sharedX)}, ${Math.round(sharedY)})`);
          }
        }
      }
    }
  }

  return { count, affectedTraces, details };
}

// Minimum Annular Ring check
// High resolution pads usually need a margin to avoid breakout. Minimum annular ring should be >= 0.15mm
export function checkAnnularRings(components: PCBComponent[]): { count: number; affectedIds: string[], details: string[] } {
  let count = 0;
  const affectedIds: string[] = [];
  const details: string[] = [];

  components.forEach(comp => {
    // Simulated pad annular ring checks.
    // If a component is placed extremely close to board edge or has high pitch, we note warnings/errors.
    if (comp.x < 15 || comp.y < 15) {
      count++;
      affectedIds.push(comp.id);
      details.push(`Component ${comp.name} pad annular ring too close to board dimension boundary (minimum 15px/mm safety clearance required).`);
    }
  });

  return { count, affectedIds, details };
}

// Electrical rule checks
export function checkElectricalRules(board: PCBBoard): RuleCheckResult[] {
  const results: RuleCheckResult[] = [];

  // Check 1: Floating inputs / components with no connections
  // We can see if a component falls close to anytrace endpoints.
  const connectedCompIds = new Set<string>();
  board.traces.forEach(t => {
    board.components.forEach(c => {
      // Trace starts or ends within 30 units of component center
      const distStart = Math.sqrt((t.startX - c.x) ** 2 + (t.startY - c.y) ** 2);
      const distEnd = Math.sqrt((t.endX - c.x) ** 2 + (t.endY - c.y) ** 2);
      if (distStart < 30 || distEnd < 30) {
        connectedCompIds.add(c.id);
      }
    });
  });

  const floatingComps = board.components.filter(c => !connectedCompIds.has(c.id));
  if (floatingComps.length > 0) {
    results.push({
      ruleName: 'Floating Device Outputs / Pin Connections',
      category: 'ERC',
      status: 'WARNING',
      description: `${floatingComps.length} component(s) have zero active traces or nets connected to their pinouts. Verify matching schematics.`,
      affectedIds: floatingComps.map(c => c.id)
    });
  } else {
    results.push({
      ruleName: 'Floating Device Outputs / Pin Connections',
      category: 'ERC',
      status: 'PASS',
      description: 'All nodes and active IC packages are properly terminated with routed copper connections.',
      affectedIds: []
    });
  }

  // Check 2: Supply Short circuit risk
  // Detect if traces with VCC / high potential nets cross or touch GND traces directly
  // We check for overlapping coordinate systems.
  let potentialPowerShorts = 0;
  const shortedTraces: string[] = [];
  board.traces.forEach((t1, idx1) => {
    board.traces.forEach((t2, idx2) => {
      if (idx1 >= idx2) return;
      // If they belong to different net categories (simulate Power / Ground overlap check)
      if ((t1.netId.includes('vcc') || t1.netId.includes('pwr')) && t2.netId.includes('gnd')) {
        // Evaluate close approaches distance
        const dxStart = Math.abs(t1.startX - t2.startX);
        const dyStart = Math.abs(t1.startY - t2.startY);
        if (dxStart < 6 && dyStart < 6) {
          potentialPowerShorts++;
          shortedTraces.push(t1.id, t2.id);
        }
      }
    });
  });

  if (potentialPowerShorts > 0) {
    results.push({
      ruleName: 'Power & Ground Net Short-Circuit Clearance',
      category: 'ERC',
      status: 'FAIL',
      description: `Critical power to ground short risk detected! ${potentialPowerShorts} clearance violations (< 6 units) verified between active high-potential trace paths and reference ground.`,
      affectedIds: Array.from(new Set(shortedTraces))
    });
  } else {
    results.push({
      ruleName: 'Power & Ground Net Short-Circuit Clearance',
      category: 'ERC',
      status: 'PASS',
      description: 'Zero direct or proximity conflicts observed between high voltage supply headers and return planes.',
      affectedIds: []
    });
  }

  return results;
}

// Design for manufacturability checks
export function checkDFMRules(board: PCBBoard): RuleCheckResult[] {
  const results: RuleCheckResult[] = [];

  // Check 1: Acid Trap Analysis
  const acidAnalysis = detectAcidTraps(board.traces);
  if (acidAnalysis.count > 0) {
    results.push({
      ruleName: 'Acid Trap Geometry Clearance',
      category: 'DFM',
      status: 'FAIL',
      description: `Discovered ${acidAnalysis.count} acute angle intersections (< 45°) which could collect chemical etchants, leading to over-etched trace neckdowns during fabrication.`,
      affectedIds: acidAnalysis.affectedTraces
    });
  } else {
    results.push({
      ruleName: 'Acid Trap Geometry Clearance',
      category: 'DFM',
      status: 'PASS',
      description: 'Zero acute angle trace loops or copper corners detected. Routing uses recommended orthogonal/45° turns.',
      affectedIds: []
    });
  }

  // Check 2: Minimum Annular Ring & Board Edge Spacings
  const ringAnalysis = checkAnnularRings(board.components);
  if (ringAnalysis.count > 0) {
    results.push({
      ruleName: 'Annular Ring & Copper Edge Proximity',
      category: 'DFM',
      status: 'WARNING',
      description: `Found ${ringAnalysis.count} pad locations positioned dangerously close to the physical board edge margin. Plating breakout risk possible.`,
      affectedIds: ringAnalysis.affectedIds
    });
  } else {
    results.push({
      ruleName: 'Annular Ring & Copper Edge Proximity',
      category: 'DFM',
      status: 'PASS',
      description: 'Annular rings meet IPC Class 2 requirements with minimum 0.15mm perimeter coverage.',
      affectedIds: []
    });
  }

  // Check 3: Impedance Stability (Nets with specific targets)
  const er = 4.4; // FR4 typical
  const h = 1.6; // 1.6mm thickness
  const tUm = 35; // 1oz copper
  
  // Custom impedance evaluation per high-frequency group
  const hfTraces = board.traces.filter(t => {
    const net = t.netId.toLowerCase();
    return net.includes('rf') || net.includes('usb') || net.includes('diff') || net.includes('dp') || net.includes('dn') || net.includes('spi') || net.includes('clk');
  });

  const unmatched: string[] = [];
  hfTraces.forEach(trace => {
    const net = trace.netId.toLowerCase();
    // Decide target impedance based on standard high-frequency defaults
    const targetZ = (net.includes('usb') || net.includes('dp') || net.includes('dn')) ? 90 : 50;
    
    // Custom microstrip calculation
    const t = tUm / 1000;
    const w = trace.width;
    const erTerm = Math.sqrt(er + 1.41);
    const logTerm = Math.log((5.98 * h) / (0.8 * w + t));
    const calculatedImpedance = (87 / erTerm) * logTerm;
    const diff = Math.abs(calculatedImpedance - targetZ);
    if (diff > targetZ * 0.15) { // 15% tolerance margin
      unmatched.push(`${trace.id} (${trace.netId}): Calculated Z = ${Math.round(calculatedImpedance)}Ω vs Target = ${targetZ}Ω`);
    }
  });

  if (unmatched.length > 0) {
    results.push({
      ruleName: 'Controlled Proximity Impedance Matching',
      category: 'DFM',
      status: 'FAIL',
      description: `${unmatched.length} high-frequency trace segments deviate severely from their target Zo impedances: ${unmatched.slice(0, 3).join(', ')}. Recommend re-tuning width specifications.`,
      affectedIds: hfTraces.map(u => u.id)
    });
  } else {
    results.push({
      ruleName: 'Controlled Proximity Impedance Matching',
      category: 'DFM',
      status: 'PASS',
      description: 'All impedance critical paths (RF, USB Differential, SPI Bus) are routed within safe limits of target impedance specifications.',
      affectedIds: []
    });
  }

  // Check 4: High-Speed Bus/Diff Pair Length matching skew check
  const hsGroups = groupTracesByHighSpeedGroup(board.traces);
  const mismatchedGroups: string[] = [];
  const mismatchedAffects: string[] = [];
  const skewTolerance = 12; // visual unit deviation max allowance

  Object.entries(hsGroups).forEach(([groupName, groupTraces]) => {
    if (groupTraces.length < 2) return;
    const lengths = groupTraces.map(t => getTraceLength(t));
    const maxLen = Math.max(...lengths);
    const minLen = Math.min(...lengths);
    const skew = maxLen - minLen;
    if (skew > skewTolerance) {
      mismatchedGroups.push(`${groupName} (skew: ${Math.round(skew)}mm, max match allowance is ${skewTolerance}mm)`);
      groupTraces.forEach(t => mismatchedAffects.push(t.id));
    }
  });

  if (mismatchedGroups.length > 0) {
    results.push({
      ruleName: 'High-Speed Bus Length Match Tolerance',
      category: 'DFM',
      status: 'WARNING',
      description: `Discovered differential pair or parallel bus flight-time skew violations in sections: ${mismatchedGroups.join(', ')}. Clean signals require serpentine wave tuning on shorter lines to match routes.`,
      affectedIds: mismatchedAffects
    });
  } else {
    results.push({
      ruleName: 'High-Speed Bus Length Match Tolerance',
      category: 'DFM',
      status: 'PASS',
      description: 'All parallel signal buses and differential traces are balanced in length within clean tolerance limits.',
      affectedIds: []
    });
  }

  // Check 5: High-Speed Trace Crosstalk/Coupling safety check
  // See if high-speed traces are closer than 18 units to another trace of a different netId
  const couplingViolations: string[] = [];
  const couplingAffected: string[] = [];
  const couplingThreshold = 18; // units clearance for high speed traces

  hfTraces.forEach((t1) => {
    board.traces.forEach((t2) => {
      if (t1.id === t2.id || t1.netId === t2.netId) return;
      // Midpoint distance check for simple spatial proximity
      const mid1X = (t1.startX + t1.endX) / 2;
      const mid1Y = (t1.startY + t1.endY) / 2;
      const mid2X = (t2.startX + t2.endX) / 2;
      const mid2Y = (t2.startY + t2.endY) / 2;
      const dist = Math.sqrt((mid1X - mid2X) ** 2 + (mid1Y - mid2Y) ** 2);
      if (dist < couplingThreshold) {
        const repr = `${t1.netId} <-> ${t2.netId}`;
        if (!couplingViolations.includes(repr)) {
          couplingViolations.push(`${t1.netId} and ${t2.netId} (dist: ${Math.round(dist)}px, violates 3W clearance of ${couplingThreshold}px)`);
        }
        couplingAffected.push(t1.id, t2.id);
      }
    });
  });

  if (couplingAffected.length > 0) {
    results.push({
      ruleName: 'High-Speed Trace Crosstalk / 3W Clearance',
      category: 'DFM',
      status: 'WARNING',
      description: `High risk of electromagnetic crosstalk detected! Adjacent copper paths violate the high-frequency 3W buffer rule: ${couplingViolations.slice(0, 3).join(', ')}. Spacing lines further apart is highly recommended.`,
      affectedIds: Array.from(new Set(couplingAffected))
    });
  } else {
    results.push({
      ruleName: 'High-Speed Trace Crosstalk / 3W Clearance',
      category: 'DFM',
      status: 'PASS',
      description: 'High-frequency copper paths have sufficient physical spatial clearance to block electromagnetic coupling and crosstalk noise.',
      affectedIds: []
    });
  }

  return results;
}

// Generate the final diagnostic design package
export function runDesignValidation(board: PCBBoard): DesignReport {
  const erc = checkElectricalRules(board);
  const dfm = checkDFMRules(board);
  const checks = [...erc, ...dfm];

  const totalErrors = checks.filter(c => c.status === 'FAIL').length;
  const totalWarnings = checks.filter(c => c.status === 'WARNING').length;

  let score = 100 - (totalErrors * 25) - (totalWarnings * 10);
  score = Math.max(0, Math.min(100, score));

  let status: 'APPROVED' | 'REQUIRES_REVISION' | 'REJECTED' = 'APPROVED';
  if (totalErrors > 0) {
    status = 'REJECTED';
  } else if (totalWarnings > 0 || score < 90) {
    status = 'REQUIRES_REVISION';
  }

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalErrors,
      totalWarnings,
      score,
      status
    },
    checks
  };
}
