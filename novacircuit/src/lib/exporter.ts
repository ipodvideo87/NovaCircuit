// ─────────────────────────────────────────────────────────────────────────────
// NovaCircuit Exporter
//
// Generates:
//   • Gerber RS-274X files (copper layers + drill file with via apertures)
//   • NC Drill file (Excellon format) — includes blind/buried/micro drill layers
//   • Bill of Materials (CSV)
//   • Pick-and-Place CSV
//
// Packages everything into a ZIP download via jszip.
// ─────────────────────────────────────────────────────────────────────────────

import JSZip from 'jszip';
import {
  PCBBoard,
  PCBVia,
  PCBTrace,
  ViaType,
  LayerId,
  LAYER_DISPLAY_NAMES,
} from '../types/pcb';
import {
  calcDrillDepth,
  getLayerSpan,
} from './viaManager';

// ── Gerber Utilities ──────────────────────────────────────────────────────────

const GERBER_UNITS_MM = `%MOMM*%\n%FSLAX36Y36*%\n`;

function gerberHeader(layerName: string): string {
  return [
    `G04 NovaCircuit EDA — ${layerName}*`,
    `G04 Generated: ${new Date().toISOString()}*`,
    GERBER_UNITS_MM,
    `%LPD*%`,
    '',
  ].join('\n');
}

function gerberFooter(): string {
  return 'M02*\n';
}

/** Format a coordinate as Gerber X/Y integer (6 decimal places implied) */
function gc(mm: number): string {
  return Math.round(mm * 1e6).toString();
}

/** Aperture definition for a circular pad */
function circleAperture(id: number, diameterMm: number): string {
  return `%ADD${id}C,${diameterMm.toFixed(6)}*%`;
}

/** Aperture definition for a trace segment */
function traceAperture(id: number, widthMm: number): string {
  return `%ADD${id}C,${widthMm.toFixed(6)}*%`;
}

// ── Copper Layer Gerber ───────────────────────────────────────────────────────

function generateCopperLayer(
  layer: LayerId,
  traces: PCBTrace[],
  vias: PCBVia[]
): string {
  const layerTraces = traces.filter((t) => (t.layer ?? 'F.Cu') === layer);
  // Vias that span this layer
  const layerVias = vias.filter((v) => {
    const span = getLayerSpan(v.fromLayer, v.toLayer,
      // Minimal stackup for span calculation – use index order
      { preset: '8L', totalThicknessMm: 1.6, layers: [] } as never
    );
    // Simpler: a via appears on a layer if it spans through it
    // Use layer name ordering as proxy
    return true; // All vias render on top copper for simplicity; full impl filters by span
  }).filter((v) => {
    // Only render via pads on the layers it terminates at
    return v.fromLayer === layer || v.toLayer === layer;
  });

  const lines: string[] = [gerberHeader(LAYER_DISPLAY_NAMES[layer])];

  // ── Aperture definitions ────────────────────────────────────────────────
  const traceWidths = [...new Set(layerTraces.map((t) => t.width))];
  const viaPads     = [...new Set(layerVias.map((v)  => v.padDiameter))];

  const apertureMap = new Map<string, number>();
  let   dCode = 10;

  for (const w of traceWidths) {
    const key = `T${w}`;
    apertureMap.set(key, dCode);
    lines.push(traceAperture(dCode++, w));
  }
  for (const d of viaPads) {
    const key = `V${d}`;
    if (!apertureMap.has(key)) {
      apertureMap.set(key, dCode);
      lines.push(circleAperture(dCode++, d));
    }
  }
  lines.push('');

  // ── Trace segments ──────────────────────────────────────────────────────
  let lastAp = -1;
  for (const t of layerTraces) {
    const ap = apertureMap.get(`T${t.width}`)!;
    if (ap !== lastAp) {
      lines.push(`D${ap}*`);
      lastAp = ap;
    }
    lines.push(`X${gc(t.startX)}Y${gc(t.startY)}D02*`); // move
    lines.push(`X${gc(t.endX)}Y${gc(t.endY)}D01*`);     // draw
  }

  // ── Via flash pads ──────────────────────────────────────────────────────
  for (const v of layerVias) {
    const ap = apertureMap.get(`V${v.padDiameter}`)!;
    if (ap !== lastAp) {
      lines.push(`D${ap}*`);
      lastAp = ap;
    }
    lines.push(`X${gc(v.x)}Y${gc(v.y)}D03*`); // flash
  }

  lines.push(gerberFooter());
  return lines.join('\n');
}

// ── NC Drill (Excellon) ───────────────────────────────────────────────────────

/**
 * Generates an Excellon drill file.
 * Via types are encoded into separate tool comments so PCB fab can identify
 * blind/buried/micro drill programs.
 */
function generateDrillFile(vias: PCBVia[], boardName = 'novacircuit'): string {
  const lines: string[] = [
    `; Excellon Drill — ${boardName}`,
    `; Generated: ${new Date().toISOString()}`,
    'M48',
    'FMAT,2',
    'METRIC,TZ',
    '',
  ];

  // Group vias by drill diameter + via type (separate drill programs per IPC)
  const drillGroups = new Map<string, PCBVia[]>();
  for (const v of vias) {
    const key = `${v.viaType}:${v.drillDiameter.toFixed(4)}`;
    if (!drillGroups.has(key)) drillGroups.set(key, []);
    drillGroups.get(key)!.push(v);
  }

  let toolNum = 1;
  const toolMap = new Map<string, number>();

  // Tool header
  for (const [key] of drillGroups) {
    const [, dStr] = key.split(':');
    lines.push(`T${String(toolNum).padStart(2, '0')}C${parseFloat(dStr).toFixed(3)}`);
    toolMap.set(key, toolNum++);
  }
  lines.push('M95');
  lines.push('G05'); // Drill mode
  lines.push('');

  // Drill hits
  for (const [key, groupVias] of drillGroups) {
    const [viaType] = key.split(':');
    const tool = toolMap.get(key)!;
    lines.push(`; --- ${viaType.toUpperCase()} VIAS ---`);
    lines.push(`T${String(tool).padStart(2, '0')}`);
    for (const v of groupVias) {
      lines.push(`X${(v.x).toFixed(4)}Y${(v.y).toFixed(4)}`);
    }
    lines.push('');
  }

  lines.push('M30');
  return lines.join('\n');
}

// ── BOM ───────────────────────────────────────────────────────────────────────

function generateBOM(board: PCBBoard): string {
  const header = 'Ref,Value,Type,X,Y,Rotation\n';
  const rows = board.components.map((c) =>
    `${c.id},${c.name},${c.type},${c.x.toFixed(2)},${c.y.toFixed(2)},${c.rotation}`
  );
  return header + rows.join('\n');
}

// ── Pick and Place ────────────────────────────────────────────────────────────

function generatePickAndPlace(board: PCBBoard): string {
  const header = 'Ref,Val,Package,PosX,PosY,Rot,Side\n';
  const rows = board.components.map((c) =>
    `${c.id},${c.name},${c.type},${c.x.toFixed(4)},${c.y.toFixed(4)},${c.rotation},Top`
  );
  return header + rows.join('\n');
}

// ── Via Report ────────────────────────────────────────────────────────────────

function generateViaReport(board: PCBBoard): string {
  const vias = board.vias ?? [];
  const stackup = board.stackup;
  const lines: string[] = [
    `NovaCircuit Via Report`,
    `Generated: ${new Date().toISOString()}`,
    `Stackup: ${stackup?.preset ?? '4L'} · ${stackup?.totalThicknessMm ?? 1.6} mm`,
    `Total vias: ${vias.length}`,
    '',
    'ID,Type,FromLayer,ToLayer,DrillMm,PadMm,DrillDepthMm,AspectRatio,Net',
  ];

  for (const v of vias) {
    const depth = stackup
      ? calcDrillDepth(v.fromLayer, v.toLayer, stackup)
      : 0;
    const ar = v.drillDiameter > 0 ? (depth / v.drillDiameter).toFixed(2) : 'N/A';
    lines.push(
      [
        v.id,
        v.viaType,
        v.fromLayer,
        v.toLayer,
        v.drillDiameter.toFixed(4),
        v.padDiameter.toFixed(4),
        depth.toFixed(4),
        ar,
        v.netId,
      ].join(',')
    );
  }
  return lines.join('\n');
}

// ── Main Export ───────────────────────────────────────────────────────────────

export async function exportBoard(board: PCBBoard): Promise<void> {
  const zip = new JSZip();

  // Copper layers
  const allLayers = board.stackup?.layers.map((l) => l.layerId) ?? ['F.Cu', 'B.Cu'];
  for (const layer of allLayers) {
    const gerber = generateCopperLayer(layer, board.traces, board.vias ?? []);
    const filename = layer.replace('.', '_') + '.gbr';
    zip.file(`gerber/${filename}`, gerber);
  }

  // NC Drill
  if ((board.vias?.length ?? 0) > 0) {
    zip.file('drill/novacircuit.drl', generateDrillFile(board.vias ?? []));
    zip.file('drill/via_report.csv', generateViaReport(board));
  }

  // BOM
  zip.file('bom/novacircuit_bom.csv', generateBOM(board));

  // Pick and place
  zip.file('assembly/novacircuit_pos.csv', generatePickAndPlace(board));

  // Readme
  zip.file('README.txt', [
    'NovaCircuit EDA Layout Suite — Export Package',
    '==============================================',
    '',
    'Files:',
    '  gerber/        RS-274X Gerber copper layers',
    '  drill/         Excellon NC drill + via report',
    '  bom/           Bill of Materials (CSV)',
    '  assembly/      Pick-and-Place coordinates (CSV)',
    '',
    `Stackup: ${board.stackup?.preset ?? '4L'} · ${board.stackup?.totalThicknessMm ?? 1.6} mm FR-4`,
    `Components: ${board.components.length}`,
    `Traces: ${board.traces.length}`,
    `Vias: ${board.vias?.length ?? 0}`,
    '',
    'Via types present:',
    ...(
      Object.entries(
        (board.vias ?? []).reduce((acc, v) => {
          acc[v.viaType] = (acc[v.viaType] ?? 0) + 1;
          return acc;
        }, {} as Record<ViaType, number>)
      ).map(([t, c]) => `  ${t}: ${c}`)
    ),
  ].join('\n'));

  // Download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'novacircuit_export.zip';
  a.click();
  URL.revokeObjectURL(url);
}
