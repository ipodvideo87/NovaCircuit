import { PCBTrace } from '../types/pcb';

export interface StackupLayer {
  name: string;
  thickness: number; // in mm
  dielectricConstant: number; // Er
  copperThickness: number; // in um (e.g. 35um for 1oz)
}

export interface ImpedanceTarget {
  ohms: 50 | 90 | 100;
  tolerance: number; // e.g. 10 (%)
}

// IPC-2141 Microstrip Impedance Formula:
// Zo = (87 / Math.sqrt(Er + 1.41)) * Math.log(5.98 * H / (0.8 * W + T))
// Where H is dielectric thickness, W is trace width, T is copper thickness.
export function calculateTraceWidthForImpedance(
  targetOhms: number,
  h: number, // dielectric thickness in mm
  er: number, // dielectric constant
  tUm: number // copper thickness in micrometers
): number {
  const t = tUm / 1000; // convert to mm
  
  // We can search for the optimal W (width in mm) by solving the equation
  // Simple bisection search since Zo is strictly decreasing with respect to W
  let lowW = 0.05; // 50um (minimum fabricable)
  let highW = 5.0; // 5mm
  let bestW = 0.25;
  let minDiff = Infinity;

  for (let i = 0; i < 30; i++) {
    const midW = (lowW + highW) / 2;
    // IPC-2141 expression
    const zo = (87 / Math.sqrt(er + 1.41)) * Math.log((5.98 * h) / (0.8 * midW + t));
    const diff = Math.abs(zo - targetOhms);
    if (diff < minDiff) {
      minDiff = diff;
      bestW = midW;
    }
    if (zo < targetOhms) {
      // Zo is too low, we need thinner trace (higher impedance)
      highW = midW;
    } else {
      // Zo is too high, we need wider trace (lower impedance)
      lowW = midW;
    }
  }

  return Math.round(bestW * 1000) / 1000; // round to nearest micrometer
}

// Calculate segment length
export function getTraceLength(trace: PCBTrace): number {
  const dx = trace.endX - trace.startX;
  const dy = trace.endY - trace.startY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Calculates complete impedance & return stats for all traces
export interface TraceAnalysis {
  id: string;
  length: number;
  calculatedWidth: number;
  impedance: number;
  targetImpedance: number;
  isMatched: boolean;
  notes: string;
}

export function analyzeBoardTraces(
  traces: PCBTrace[],
  targetImpedance: number,
  h: number,
  er: number,
  tUm: number
): TraceAnalysis[] {
  return traces.map(trace => {
    const t = tUm / 1000;
    const len = getTraceLength(trace);
    // zo = (87 / Math.sqrt(Er + 1.41)) * Math.log(5.98 * H / (0.8 * W + T))
    const w = trace.width;
    const erTerm = Math.sqrt(er + 1.41);
    const logTerm = Math.log((5.98 * h) / (0.8 * w + t));
    const impedance = (87 / erTerm) * logTerm;
    const diff = Math.abs(impedance - targetImpedance);
    const isMatched = diff <= targetImpedance * 0.1; // 10% tolerance

    let notes = '';
    if (isMatched) {
      notes = 'Impedance Matched';
    } else if (impedance > targetImpedance) {
      notes = `Too narrow (Z = ${Math.round(impedance)}Ω). Increase width to matches target.`;
    } else {
      notes = `Too wide (Z = ${Math.round(impedance)}Ω). Decrease width to matches target.`;
    }

    return {
      id: trace.id,
      length: Math.round(len * 100) / 100,
      calculatedWidth: w,
      impedance: Math.round(impedance * 10) / 10,
      targetImpedance,
      isMatched,
      notes
    };
  });
}

// Generates serpentine point tuning structure for matching a length constraint
// Creates an array of keypoints representing a serpentine wiggly trace
export interface Point2D {
  x: number;
  y: number;
}

export function generateSerpentineTuning(
  start: Point2D,
  end: Point2D,
  targetLength: number,
  amplitude = 15,
  pitch = 8
): Point2D[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const directLen = Math.sqrt(dx * dx + dy * dy);

  if (targetLength <= directLen) {
    return [start, end];
  }

  // Need to insert sine or square wiggles along the route
  // Unit vector along the route
  const ux = dx / directLen;
  const uy = dy / directLen;
  // Perpendicular vector for the wiggles
  const px = -uy;
  const py = ux;

  const points: Point2D[] = [start];
  
  // Calculate how many periods/wiggles we want, or adjust amplitude to fit the length exactly
  // Each wiggle adds approximately path distance
  // Let's create waves. 1 period = 2 * amplitude height + pitch width
  // Total length calculation:
  const marginFraction = 0.1; // Leave 10% on start and end straight
  const startDist = directLen * marginFraction;
  const endDist = directLen * (1 - marginFraction);
  const activeLen = endDist - startDist;

  const numCycles = Math.floor(activeLen / pitch);
  if (numCycles <= 0) {
    return [start, end];
  }

  // Generate points
  for (let i = 0; i <= numCycles * 4; i++) {
    const fraction = i / (numCycles * 4);
    const currDist = startDist + fraction * activeLen;
    const basePoint = {
      x: start.x + currDist * ux,
      y: start.y + currDist * uy
    };

    // Add transverse displacement
    // Sine wave offset to simulate realistic high speed routing
    const angle = (i * Math.PI) / 2;
    const displacement = Math.sin(angle) * amplitude;

    points.push({
      x: basePoint.x + displacement * px,
      y: basePoint.y + displacement * py
    });
  }

  points.push(end);
  return points;
}

// Calculate actual routed physical length (with serpentine)
export function getRoutedTraceLength(
  trace: PCBTrace,
  isTuned: boolean,
  amplitude: number,
  spacing: number
): number {
  const directLen = getTraceLength(trace);
  if (!isTuned) {
    return Math.round(directLen * 100) / 100;
  }
  const start = { x: trace.startX, y: trace.startY };
  const end = { x: trace.endX, y: trace.endY };
  // Approximate target length using the same formulation as TraceRenderer
  const targetLen = directLen + 150 * (amplitude / 15);
  const points = generateSerpentineTuning(start, end, targetLen, amplitude, spacing);
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return Math.round(total * 100) / 100;
}

// Group traces into matched high-speed categories based on naming heuristics
export function groupTracesByHighSpeedGroup(traces: PCBTrace[]): { [groupName: string]: PCBTrace[] } {
  const groups: { [groupName: string]: PCBTrace[] } = {};
  
  traces.forEach((trace) => {
    const net = trace.netId.toLowerCase();
    let matchedGroup: string | null = null;
    
    if (net.includes('usb') || net.includes('diff') || net.includes('dp') || net.includes('dn')) {
      matchedGroup = 'USB Differential Pairs';
    } else if (net.includes('spi') || net.includes('mosi') || net.includes('miso') || net.includes('sck') || net.includes('cs')) {
      matchedGroup = 'SPI Bus';
    } else if (net.includes('rf') || net.includes('wifi') || net.includes('antenna') || net.includes('feed')) {
      matchedGroup = 'RF High-Frequency Path';
    } else if (net.includes('clk') || net.includes('clock') || net.includes('tx') || net.includes('rx')) {
      matchedGroup = 'High-Speed Auxiliary/Clock';
    }
    
    if (matchedGroup) {
      if (!groups[matchedGroup]) {
        groups[matchedGroup] = [];
      }
      groups[matchedGroup].push(trace);
    }
  });
  
  return groups;
}

// Generate guard traces (shielding) for sensitive high speed signals
export function generateGuardTracesForRF(trace: PCBTrace, clearance = 18): PCBTrace[] {
  const dx = trace.endX - trace.startX;
  const dy = trace.endY - trace.startY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [];
  
  // Perpendicular unit vectors
  const px = -dy / len;
  const py = dx / len;
  
  const idPrefix = trace.id.replace('trace-', 'guard-');
  const guardWidth = 0.15; // standard thin shielding width in mm
  
  return [
    {
      id: `${idPrefix}-gnd-l`,
      startX: trace.startX + px * clearance,
      startY: trace.startY + py * clearance,
      endX: trace.endX + px * clearance,
      endY: trace.endY + py * clearance,
      width: guardWidth,
      netId: 'GND (RF Shield)'
    },
    {
      id: `${idPrefix}-gnd-r`,
      startX: trace.startX - px * clearance,
      startY: trace.startY - py * clearance,
      endX: trace.endX - px * clearance,
      endY: trace.endY - py * clearance,
      width: guardWidth,
      netId: 'GND (RF Shield)'
    }
  ];
}
