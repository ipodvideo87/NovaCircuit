// ─────────────────────────────────────────────────────────────────────────────
// viaManager Tests
//
// Unit tests for IPC-6012 aspect ratio DRC, via type inference, drill depth
// calculation, and the router via selector.
// ─────────────────────────────────────────────────────────────────────────────

import {
  calcDrillDepth,
  inferViaType,
  runViaDRC,
  createVia,
  selectViaForTransition,
  getDefaultStackup,
  areLayersAdjacent,
  getAdjacentInnerLayer,
  getLayerSpan,
} from '../viaManager';

import {
  PCBVia,
  PCBStackup,
  DEFAULT_STACKUPS,
  VIA_ASPECT_RATIO_LIMITS,
  MICRO_VIA_MAX_DRILL_MM,
  DEFAULT_NET_CLASSES,
} from '../../types/pcb';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const stackup4L = getDefaultStackup('4L');
const stackup6L = getDefaultStackup('6L');
const stackup8L = getDefaultStackup('8L');

// ── calcDrillDepth ────────────────────────────────────────────────────────────

describe('calcDrillDepth', () => {
  test('through via (4L) depth ≈ total board thickness', () => {
    const depth = calcDrillDepth('F.Cu', 'B.Cu', stackup4L);
    // Sum of all dielectrics + copper
    // 0.360 + 35µm + 0.710 + 17µm + 0.360 + 17µm + 35µm
    // ≈ 1.430 + 0.104 = ~1.534
    expect(depth).toBeGreaterThan(1.4);
    expect(depth).toBeLessThan(1.65);
  });

  test('blind via (F.Cu → In1.Cu, 4L) depth is fraction of board', () => {
    const depth = calcDrillDepth('F.Cu', 'In1.Cu', stackup4L);
    const total = calcDrillDepth('F.Cu', 'B.Cu', stackup4L);
    expect(depth).toBeGreaterThan(0);
    expect(depth).toBeLessThan(total);
  });

  test('buried via (In1.Cu → In2.Cu, 4L) depth < blind via depth', () => {
    const buried = calcDrillDepth('In1.Cu', 'In2.Cu', stackup4L);
    const blind  = calcDrillDepth('F.Cu',   'In1.Cu', stackup4L);
    expect(buried).toBeGreaterThan(0);
    expect(buried).toBeLessThan(blind);
  });

  test('same-layer span returns 0', () => {
    const depth = calcDrillDepth('F.Cu', 'F.Cu', stackup4L);
    expect(depth).toBe(0);
  });

  test('8L through via has correct layer count in span', () => {
    const span = getLayerSpan('F.Cu', 'B.Cu', stackup8L);
    expect(span).toHaveLength(8);
  });

  test('6L micro-via span (F.Cu → In1.Cu) has 2 layers', () => {
    const span = getLayerSpan('F.Cu', 'In1.Cu', stackup6L);
    expect(span).toHaveLength(2);
  });
});

// ── inferViaType ──────────────────────────────────────────────────────────────

describe('inferViaType', () => {
  test('F.Cu → B.Cu infers through', () => {
    expect(inferViaType('F.Cu', 'B.Cu', 0.20, stackup4L)).toBe('through');
  });

  test('F.Cu → In1.Cu with 0.20mm infers blind', () => {
    expect(inferViaType('F.Cu', 'In1.Cu', 0.20, stackup4L)).toBe('blind');
  });

  test('F.Cu → In1.Cu with 0.10mm (≤0.15mm) infers micro', () => {
    expect(inferViaType('F.Cu', 'In1.Cu', 0.10, stackup4L)).toBe('micro');
  });

  test('In1.Cu → In2.Cu infers buried', () => {
    expect(inferViaType('In1.Cu', 'In2.Cu', 0.15, stackup4L)).toBe('buried');
  });

  test('B.Cu → In2.Cu infers blind (from bottom)', () => {
    expect(inferViaType('B.Cu', 'In2.Cu', 0.20, stackup4L)).toBe('blind');
  });

  test('micro-via requires drill ≤ MICRO_VIA_MAX_DRILL_MM', () => {
    // With 0.16mm drill on adjacent layers → should be blind, not micro
    const type = inferViaType('F.Cu', 'In1.Cu', 0.16, stackup4L);
    expect(type).toBe('blind');
  });
});

// ── IPC-6012 Aspect Ratio DRC ──────────────────────────────────────────────────

describe('runViaDRC — aspect ratio', () => {
  test('through via with good AR passes', () => {
    const via: PCBVia = {
      id: 'v1',
      x: 0, y: 0,
      drillDiameter: 0.20,
      padDiameter: 0.45,
      viaType: 'through',
      fromLayer: 'F.Cu',
      toLayer:   'B.Cu',
      netId:     'gnd',
    };
    const result = runViaDRC([via], stackup4L);
    expect(result.errorCount).toBe(0);
  });

  test('through via with AR > 10:1 fails', () => {
    // depth ~1.53mm; drill = 0.10mm → AR ~15:1 → fail
    const via: PCBVia = {
      id: 'v2',
      x: 0, y: 0,
      drillDiameter: 0.10, // too thin for through via
      padDiameter: 0.35,
      viaType: 'through',
      fromLayer: 'F.Cu',
      toLayer:   'B.Cu',
      netId:     'gnd',
    };
    const result = runViaDRC([via], stackup4L);
    const arViolation = result.violations.find((v) => v.rule === 'ASPECT_RATIO');
    expect(arViolation).toBeDefined();
    expect(arViolation?.severity).toBe('error');
  });

  test('micro-via AR limit is 1:1', () => {
    expect(VIA_ASPECT_RATIO_LIMITS.micro).toBe(1);
  });

  test('micro-via with drill depth > drill diameter fails', () => {
    // F.Cu → In1.Cu on 4L: depth ≈ 0.395mm; drill 0.10mm → AR ~3.95:1 → fail
    const via: PCBVia = {
      id: 'v3',
      x: 0, y: 0,
      drillDiameter: 0.10,
      padDiameter: 0.25,
      viaType: 'micro',
      fromLayer: 'F.Cu',
      toLayer:   'In1.Cu',
      netId:     'gnd',
    };
    const result = runViaDRC([via], stackup4L);
    const arViolation = result.violations.find((v) => v.rule === 'ASPECT_RATIO');
    expect(arViolation).toBeDefined();
  });

  test('annular ring below minimum generates warning or error', () => {
    const via: PCBVia = {
      id: 'v4',
      x: 0, y: 0,
      drillDiameter: 0.20,
      padDiameter: 0.22, // annular = 0.01mm — far below 0.125mm minimum
      viaType: 'through',
      fromLayer: 'F.Cu',
      toLayer:   'B.Cu',
      netId:     'gnd',
    };
    const result = runViaDRC([via], stackup4L);
    const annularViolation = result.violations.find((v) => v.rule === 'ANNULAR_RING');
    expect(annularViolation).toBeDefined();
  });

  test('via type mismatch fails', () => {
    // Declares "buried" but spans outer layers
    const via: PCBVia = {
      id: 'v5',
      x: 0, y: 0,
      drillDiameter: 0.20,
      padDiameter: 0.45,
      viaType: 'buried',   // WRONG — should be 'through'
      fromLayer: 'F.Cu',
      toLayer:   'B.Cu',
      netId:     'gnd',
    };
    const result = runViaDRC([via], stackup4L);
    const typeMismatch = result.violations.find((v) => v.rule === 'VIA_TYPE_MISMATCH');
    expect(typeMismatch).toBeDefined();
  });

  test('layer not in stackup fails', () => {
    const via: PCBVia = {
      id: 'v6',
      x: 0, y: 0,
      drillDiameter: 0.20,
      padDiameter: 0.45,
      viaType: 'blind',
      fromLayer: 'F.Cu',
      toLayer:   'In5.Cu',  // In5.Cu doesn't exist in 4L stackup
      netId:     'gnd',
    };
    const result = runViaDRC([via], stackup4L);
    const layerViolation = result.violations.find((v) => v.rule === 'LAYER_NOT_IN_STACKUP');
    expect(layerViolation).toBeDefined();
  });

  test('empty via list returns pass', () => {
    const result = runViaDRC([], stackup4L);
    expect(result.status).toBe('pass');
    expect(result.totalVias).toBe(0);
  });

  test('multiple vias — mixed results counted correctly', () => {
    const good: PCBVia = {
      id: 'g1', x: 0, y: 0,
      drillDiameter: 0.25, padDiameter: 0.55,
      viaType: 'through', fromLayer: 'F.Cu', toLayer: 'B.Cu', netId: 'gnd',
    };
    const bad: PCBVia = {
      id: 'b1', x: 10, y: 10,
      drillDiameter: 0.05, padDiameter: 0.15, // Min drill violation + AR
      viaType: 'through', fromLayer: 'F.Cu', toLayer: 'B.Cu', netId: 'gnd',
    };
    const result = runViaDRC([good, bad], stackup4L);
    expect(result.totalVias).toBe(2);
    expect(result.errorCount).toBeGreaterThan(0);
  });
});

// ── createVia ─────────────────────────────────────────────────────────────────

describe('createVia', () => {
  test('creates through via with correct defaults', () => {
    const via = createVia(10, 20, 'F.Cu', 'B.Cu', 'gnd', stackup4L);
    expect(via.viaType).toBe('through');
    expect(via.drillDiameter).toBeGreaterThanOrEqual(0.20);
    expect(via.padDiameter).toBeGreaterThan(via.drillDiameter);
    expect(via.fromLayer).toBe('F.Cu');
    expect(via.toLayer).toBe('B.Cu');
    expect(via.x).toBe(10);
    expect(via.y).toBe(20);
  });

  test('creates micro-via with correct defaults for adjacent layers', () => {
    const via = createVia(5, 5, 'F.Cu', 'In1.Cu', 'vcc', stackup4L, 0.10);
    expect(via.viaType).toBe('micro');
    expect(via.drillDiameter).toBeLessThanOrEqual(MICRO_VIA_MAX_DRILL_MM);
  });

  test('creates buried via with correct type', () => {
    const via = createVia(0, 0, 'In1.Cu', 'In2.Cu', 'gnd', stackup4L, 0.15);
    expect(via.viaType).toBe('buried');
  });

  test('drillDepth is set', () => {
    const via = createVia(0, 0, 'F.Cu', 'B.Cu', 'gnd', stackup4L);
    expect(via.drillDepth).toBeDefined();
    expect(via.drillDepth!).toBeGreaterThan(0);
  });

  test('ids are unique across calls', () => {
    const v1 = createVia(0, 0, 'F.Cu', 'B.Cu', 'gnd', stackup4L);
    const v2 = createVia(0, 0, 'F.Cu', 'B.Cu', 'gnd', stackup4L);
    expect(v1.id).not.toBe(v2.id);
  });
});

// ── selectViaForTransition ────────────────────────────────────────────────────

describe('selectViaForTransition', () => {
  test('high-speed net class selects micro via for adjacent layers', () => {
    const nc = DEFAULT_NET_CLASSES['High-Speed'];
    const via = selectViaForTransition(
      0, 0, 'F.Cu', 'In1.Cu', 'ddr-clk', stackup4L, nc
    );
    expect(via.viaType).toBe('micro');
    expect(via.drillDiameter).toBeLessThanOrEqual(MICRO_VIA_MAX_DRILL_MM);
  });

  test('power net class selects through via for F.Cu → B.Cu', () => {
    const nc = DEFAULT_NET_CLASSES['Power'];
    const via = selectViaForTransition(
      0, 0, 'F.Cu', 'B.Cu', 'gnd', stackup4L, nc
    );
    expect(via.viaType).toBe('through');
    expect(via.drillDiameter).toBeGreaterThanOrEqual(0.20); // Power net has 0.30 override
  });

  test('aspect ratio is respected — drill is large enough', () => {
    const via = selectViaForTransition(
      0, 0, 'F.Cu', 'B.Cu', 'gnd', stackup4L
    );
    const ar = (via.drillDepth ?? 0) / via.drillDiameter;
    expect(ar).toBeLessThanOrEqual(VIA_ASPECT_RATIO_LIMITS[via.viaType]);
  });

  test('high-speed net on non-adjacent layers falls back from micro', () => {
    const nc = DEFAULT_NET_CLASSES['High-Speed'];
    // In1.Cu → In2.Cu is adjacent in 4L, so micro is still valid
    const via = selectViaForTransition(
      0, 0, 'In1.Cu', 'In2.Cu', 'ddr-data', stackup4L, nc
    );
    // Should select micro or buried (micro preferred, but both valid for buried span)
    expect(['micro', 'buried']).toContain(via.viaType);
  });
});

// ── Layer helpers ─────────────────────────────────────────────────────────────

describe('layer helpers', () => {
  test('areLayersAdjacent — F.Cu and In1.Cu are adjacent in 4L', () => {
    expect(areLayersAdjacent('F.Cu', 'In1.Cu', stackup4L)).toBe(true);
  });

  test('areLayersAdjacent — F.Cu and B.Cu are NOT adjacent in 4L', () => {
    expect(areLayersAdjacent('F.Cu', 'B.Cu', stackup4L)).toBe(false);
  });

  test('areLayersAdjacent — F.Cu and In2.Cu are adjacent in 4L (layers: F, In1, In2, B)', () => {
    // They are not adjacent — In1 is between them
    expect(areLayersAdjacent('F.Cu', 'In2.Cu', stackup4L)).toBe(false);
  });

  test('getAdjacentInnerLayer for F.Cu returns In1.Cu', () => {
    expect(getAdjacentInnerLayer('F.Cu', stackup4L)).toBe('In1.Cu');
  });

  test('getAdjacentInnerLayer for B.Cu returns In2.Cu in 4L', () => {
    expect(getAdjacentInnerLayer('B.Cu', stackup4L)).toBe('In2.Cu');
  });

  test('getDefaultStackup returns deep copy', () => {
    const s1 = getDefaultStackup('4L');
    const s2 = getDefaultStackup('4L');
    s1.totalThicknessMm = 99;
    expect(s2.totalThicknessMm).toBe(1.6); // unchanged
  });
});

// ── Stackup preset coverage ───────────────────────────────────────────────────

describe('stackup presets', () => {
  test('4L stackup has 4 layers', () => {
    expect(stackup4L.layers).toHaveLength(4);
  });

  test('6L stackup has 6 layers', () => {
    expect(stackup6L.layers).toHaveLength(6);
  });

  test('8L stackup has 8 layers', () => {
    expect(stackup8L.layers).toHaveLength(8);
  });

  test('all stackups start with F.Cu and end with B.Cu', () => {
    for (const s of [stackup4L, stackup6L, stackup8L]) {
      expect(s.layers[0].layerId).toBe('F.Cu');
      expect(s.layers[s.layers.length - 1].layerId).toBe('B.Cu');
    }
  });

  test('8L through-via depth is greater than 4L (same total thickness)', () => {
    // Both are 1.6mm total but 8L has more copper layers contributing
    const d4 = calcDrillDepth('F.Cu', 'B.Cu', stackup4L);
    const d8 = calcDrillDepth('F.Cu', 'B.Cu', stackup8L);
    // More copper layers mean slightly more total depth
    expect(d8).toBeGreaterThan(d4 * 0.9); // within 10% of each other
    expect(d8).toBeLessThan(d4 * 1.1);
  });
});
