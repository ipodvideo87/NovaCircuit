/**
 * Exporter — Gerber RS-274X, BOM, and Pick-and-Place CSV generation
 *
 * Bundles all outputs into a ZIP file via jszip.
 */

import JSZip from 'jszip';
import type { PCBBoard, PCBComponent, PCBTrace } from '../types/pcb';

// ─── Gerber RS-274X ───────────────────────────────────────────────────────────

/**
 * Generate a Gerber RS-274X copper layer file for the given traces.
 */
function generateGerberCopperLayer(traces: PCBTrace[], layerName: string): string {
  const lines: string[] = [
    '%FSLAX46Y46*%',
    '%MOMM*%',
    `%LN${layerName}*%`,
    '%ADD10C,0.250000*%',
    'G01*',
    'G75*',
    '%LPD*%',
  ];

  traces.forEach((trace, i) => {
    const aperture = 10 + i;
    const widthMM = trace.width.toFixed(6);
    lines.push(`%ADD${aperture}C,${widthMM}*%`);
  });

  traces.forEach((trace, i) => {
    const aperture = 10 + i;
    const x1 = Math.round(trace.startX * 10000);
    const y1 = Math.round(trace.startY * 10000);
    const x2 = Math.round(trace.endX * 10000);
    const y2 = Math.round(trace.endY * 10000);
    lines.push(
      `D${aperture}*`,
      `X${x1}Y${y1}D02*`,
      `X${x2}Y${y2}D01*`,
    );
  });

  lines.push('M02*');
  return lines.join('\n');
}

/**
 * Generate a Gerber drill file (Excellon format).
 */
function generateDrillFile(components: PCBComponent[]): string {
  const lines: string[] = [
    'M48',
    'FMAT,2',
    'METRIC,LZ,000.000',
    'T1C0.800',
    '%',
    'G90',
    'G05',
    'M72',
    'T1',
  ];

  components.forEach(comp => {
    const x = Math.round(comp.x * 1000) / 1000;
    const y = Math.round(comp.y * 1000) / 1000;
    lines.push(`X${x.toFixed(3)}Y${y.toFixed(3)}`);
  });

  lines.push('T0', 'M30');
  return lines.join('\n');
}

// ─── BOM ─────────────────────────────────────────────────────────────────────

interface BOMEntry {
  refdes: string;
  value: string;
  type: string;
  quantity: number;
  description: string;
}

function generateBOM(components: PCBComponent[]): string {
  const grouped = new Map<string, BOMEntry>();

  components.forEach(comp => {
    const key = `${comp.type}::${comp.name}`;
    if (grouped.has(key)) {
      grouped.get(key)!.quantity += 1;
      grouped.get(key)!.refdes += `, ${comp.id}`;
    } else {
      grouped.set(key, {
        refdes: comp.id,
        value: comp.name,
        type: comp.type,
        quantity: 1,
        description: getComponentDescription(comp.type),
      });
    }
  });

  const header = 'Reference,Value,Type,Quantity,Description\n';
  const rows = Array.from(grouped.values()).map(entry =>
    `"${entry.refdes}","${entry.value}","${entry.type}",${entry.quantity},"${entry.description}"`
  ).join('\n');

  return header + rows;
}

function getComponentDescription(type: string): string {
  const descriptions: Record<string, string> = {
    MCU:         'Microcontroller Unit',
    CONNECTOR:   'PCB Connector',
    LDO:         'Low-Dropout Linear Regulator',
    CAPACITOR:   'Multilayer Ceramic Capacitor',
    RESISTOR:    'Thick Film Resistor',
    OSCILLATOR:  'Crystal Oscillator',
    RF_ANTENNA:  'RF Antenna',
    MOSFET:      'N-Channel Power MOSFET',
    'OP-AMP':    'Operational Amplifier',
    ADC:         'Analog-to-Digital Converter',
    VOLTAGE_REF: 'Precision Voltage Reference',
    IC:          'Integrated Circuit',
  };
  return descriptions[type] ?? 'Electronic Component';
}

// ─── Pick-and-Place CSV ───────────────────────────────────────────────────────

function generatePickAndPlace(components: PCBComponent[]): string {
  const header = 'Ref,Val,Package,PosX,PosY,Rot,Side\n';
  const rows = components.map(comp =>
    `${comp.id},${comp.name},${getPackage(comp.type)},${comp.x.toFixed(3)},${comp.y.toFixed(3)},${comp.rotation},Top`
  ).join('\n');
  return header + rows;
}

function getPackage(type: string): string {
  const packages: Record<string, string> = {
    MCU:         'QFN-48',
    CONNECTOR:   'USB-C',
    LDO:         'SOT-223',
    CAPACITOR:   '0402',
    RESISTOR:    '0402',
    OSCILLATOR:  'SMD-4',
    RF_ANTENNA:  'PCB-ANT',
    MOSFET:      'TO-252',
    'OP-AMP':    'SOIC-8',
    ADC:         'SSOP-28',
    VOLTAGE_REF: 'SOT-23',
    IC:          'SOIC-16',
  };
  return packages[type] ?? 'SMD';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Bundle all export files into a ZIP and trigger browser download.
 */
export async function exportBoard(board: PCBBoard, projectName = 'novacircuit'): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(projectName);
  if (!folder) throw new Error('Failed to create ZIP folder');

  // Gerber files
  const copperTraces = board.traces;
  folder.file(
    `${projectName}-F.Cu.gbr`,
    generateGerberCopperLayer(copperTraces, 'F.Cu')
  );
  folder.file(
    `${projectName}.drl`,
    generateDrillFile(board.components)
  );

  // BOM
  folder.file(`${projectName}-BOM.csv`, generateBOM(board.components));

  // Pick & Place
  folder.file(
    `${projectName}-PnP.csv`,
    generatePickAndPlace(board.components)
  );

  // Board summary JSON
  folder.file(
    `${projectName}-board.json`,
    JSON.stringify(board, null, 2)
  );

  // Generate and download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}-fab.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
