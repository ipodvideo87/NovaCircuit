// ─────────────────────────────────────────────────────────────────────────────
// NovaCircuit Via Manager
//
// Encapsulates all logic related to via creation, IPC-6012 aspect ratio DRC,
// and automatic via-type selection for the Manhattan router.
// ─────────────────────────────────────────────────────────────────────────────

import {
  LayerId,
  StackupPreset,
  ViaType,
  PCBVia,
  PCBStackup,
  NetClass,
  ViaDRCResult,
  ViaDRCViolation,
  STACKUP_LAYERS,
  DEFAULT_STACKUPS,
  DEFAULT_NET_CLASSES,
  VIA_ASPECT_RATIO_LIMITS,
  MICRO_VIA_MAX_DRILL_MM,
  VIA_MIN_DRILL_MM,
  VIA_DEFAULT_ANNULAR_MM,
} from '../types/pcb';

// ── Layer Utilities ────────────────────────────────────────────────────────────

/**
 * Returns the zero-based index of a layer within a given stackup.
 * Returns -1 when the layer is not part of the stackup.
 */
export function getLayerIndex(layerId: LayerId, stackup: PCBStackup): number {
  return stackup.layers.findIndex((l) => l.layerId === layerId);
}

/**
 * Returns the ordered list of layer IDs that lie between `fromLayer` and
 * `toLayer` (inclusive) within the given stackup.
 */
export function getLayerSpan(
  fromLayer: LayerId,
  toLayer: LayerId,
  stackup: PCBStackup
): LayerId[] {
  const fromIdx = getLayerIndex(fromLayer, stackup);
  const toIdx   = getLayerIndex(toLayer,   stackup);
  if (fromIdx === -1 || toIdx === -1) return [];
  const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  return stackup.layers.slice(lo, hi + 1).map((l) => l.layerId);
}

/**
 * Calculates the physical drill depth (mm) for a via spanning `fromLayer`
 * to `toLayer` in the given stackup.
 *
 * Depth = sum of:
 *   • dielectricThicknessMm for each layer except the last in span
 *   • Half the copper thickness of the start and end layers (top surface
 *     to bottom surface of the pad copper)
 */
export function calcDrillDepth(
  fromLayer: LayerId,
  toLayer: LayerId,
  stackup: PCBStackup
): number {
  const span = getLayerSpan(fromLayer, toLayer, stackup);
  if (span.length < 2) return 0;

  let depth = 0;
  for (let i = 0; i < span.length - 1; i++) {
    const spec = stackup.layers.find((l) => l.layerId === span[i])!;
    depth += spec.dielectricThicknessMm;
    // Add copper contributions between dielectric boundaries
    depth += spec.copperThicknessMicron / 1000;
  }
  // Add final layer's copper thickness
  const lastSpec = stackup.layers.find(
    (l) => l.layerId === span[span.length - 1]
  )!;
  depth += lastSpec.copperThicknessMicron / 1000;
  return depth;
}

// ── Via Type Validation ────────────────────────────────────────────────────────

/**
 * Infers the correct via type from the layer span.
 *
 * Rules:
 *   through  → spans from F.Cu to B.Cu in a stackup
 *   micro    → exactly one layer transition; drill ≤ MICRO_VIA_MAX_DRILL_MM
 *   blind    → starts or ends at F.Cu or B.Cu but doesn't span the full board
 *   buried   → both layers are inner layers
 */
export function inferViaType(
  fromLayer: LayerId,
  toLayer: LayerId,
  drillDiameter: number,
  stackup: PCBStackup
): ViaType {
  const layers = stackup.layers.map((l) => l.layerId);
  const outerLayers = new Set<LayerId>([layers[0], layers[layers.length - 1]]);

  const fromIdx = getLayerIndex(fromLayer, stackup);
  const toIdx   = getLayerIndex(toLayer,   stackup);
  const span    = Math.abs(fromIdx - toIdx);

  if (
    outerLayers.has(fromLayer) &&
    outerLayers.has(toLayer) &&
    fromLayer !== toLayer
  ) {
    return 'through';
  }

  if (
    span === 1 &&
    drillDiameter <= MICRO_VIA_MAX_DRILL_MM
  ) {
    return 'micro';
  }

  if (outerLayers.has(fromLayer) || outerLayers.has(toLayer)) {
    return 'blind';
  }

  return 'buried';
}

/**
 * Validates a via type claim against the actual layer span.
 * Returns null on success, or an error message string on failure.
 */
export function validateViaTypeConsistency(
  via: PCBVia,
  stackup: PCBStackup
): string | null {
  const inferred = inferViaType(
    via.fromLayer,
    via.toLayer,
    via.drillDiameter,
    stackup
  );
  if (inferred !== via.viaType) {
    return (
      `Via ${via.id}: declared type '${via.viaType}' does not match ` +
      `inferred type '${inferred}' for layer span ` +
      `${via.fromLayer}→${via.toLayer} ` +
      `(drill ${via.drillDiameter.toFixed(3)} mm)`
    );
  }
  if (via.viaType === 'micro') {
    const span = getLayerSpan(via.fromLayer, via.toLayer, stackup);
    if (span.length !== 2) {
      return (
        `Via ${via.id}: micro-via must span exactly one layer transition ` +
        `(got ${span.length - 1} transitions)`
      );
    }
    if (via.drillDiameter > MICRO_VIA_MAX_DRILL_MM) {
      return (
        `Via ${via.id}: micro-via drill ${via.drillDiameter.toFixed(3)} mm ` +
        `exceeds IPC-2315 maximum ${MICRO_VIA_MAX_DRILL_MM} mm`
      );
    }
  }
  return null;
}

// ── IPC-6012 Aspect Ratio DRC ──────────────────────────────────────────────────

/**
 * Runs IPC-6012 aspect ratio DRC on all vias in the board.
 *
 * IPC-6012 §3.3 aspect ratio limits:
 *   Standard (through/blind/buried):  depth / drill ≤ 10 : 1
 *   Micro-vias (IPC-2315 §3):         depth / drill ≤  1 : 1
 *
 * Additional checks:
 *   • Minimum drill diameter per via type
 *   • Minimum annular ring (padDiameter ≥ drillDiameter + 2 × minAnnular)
 *   • Via type consistency with layer span
 *   • Layer availability in chosen stackup
 */
export function runViaDRC(
  vias: PCBVia[],
  stackup: PCBStackup
): ViaDRCResult {
  const violations: ViaDRCViolation[] = [];
  let passCount = 0;

  for (const via of vias) {
    let viaHasViolation = false;

    // ── Layer availability check ─────────────────────────────────────────────
    const availableLayers = new Set(stackup.layers.map((l) => l.layerId));
    if (!availableLayers.has(via.fromLayer)) {
      violations.push({
        viaId: via.id,
        rule: 'LAYER_NOT_IN_STACKUP',
        message: `Via ${via.id}: layer '${via.fromLayer}' does not exist in ${stackup.preset} stackup`,
        severity: 'error',
        actualValue: getLayerIndex(via.fromLayer, stackup),
        limitValue: 0,
      });
      viaHasViolation = true;
    }
    if (!availableLayers.has(via.toLayer)) {
      violations.push({
        viaId: via.id,
        rule: 'LAYER_NOT_IN_STACKUP',
        message: `Via ${via.id}: layer '${via.toLayer}' does not exist in ${stackup.preset} stackup`,
        severity: 'error',
        actualValue: getLayerIndex(via.toLayer, stackup),
        limitValue: 0,
      });
      viaHasViolation = true;
    }

    // ── Via type consistency ─────────────────────────────────────────────────
    const typeError = validateViaTypeConsistency(via, stackup);
    if (typeError) {
      violations.push({
        viaId: via.id,
        rule: 'VIA_TYPE_MISMATCH',
        message: typeError,
        severity: 'error',
        actualValue: 0,
        limitValue: 0,
      });
      viaHasViolation = true;
    }

    // ── Minimum drill diameter ───────────────────────────────────────────────
    const minDrill = VIA_MIN_DRILL_MM[via.viaType];
    if (via.drillDiameter < minDrill) {
      violations.push({
        viaId: via.id,
        rule: 'MIN_DRILL_DIAMETER',
        message:
          `Via ${via.id} (${via.viaType}): drill ${via.drillDiameter.toFixed(3)} mm ` +
          `< minimum ${minDrill.toFixed(3)} mm`,
        severity: 'error',
        actualValue: via.drillDiameter,
        limitValue: minDrill,
      });
      viaHasViolation = true;
    }

    // ── Annular ring ─────────────────────────────────────────────────────────
    const minAnnular = VIA_DEFAULT_ANNULAR_MM[via.viaType];
    const actualAnnular = (via.padDiameter - via.drillDiameter) / 2;
    if (actualAnnular < minAnnular) {
      const severity = actualAnnular < minAnnular * 0.5 ? 'error' : 'warning';
      violations.push({
        viaId: via.id,
        rule: 'ANNULAR_RING',
        message:
          `Via ${via.id} (${via.viaType}): annular ring ${(actualAnnular * 1000).toFixed(0)} µm ` +
          `< minimum ${(minAnnular * 1000).toFixed(0)} µm`,
        severity,
        actualValue: actualAnnular,
        limitValue: minAnnular,
      });
      viaHasViolation = true;
    }

    // ── Aspect ratio (IPC-6012 §3.3 / IPC-2315 §3) ──────────────────────────
    const depth   = calcDrillDepth(via.fromLayer, via.toLayer, stackup);
    const arLimit = VIA_ASPECT_RATIO_LIMITS[via.viaType];
    const arActual = via.drillDiameter > 0 ? depth / via.drillDiameter : Infinity;

    if (arActual > arLimit) {
      violations.push({
        viaId: via.id,
        rule: 'ASPECT_RATIO',
        message:
          `Via ${via.id} (${via.viaType}): aspect ratio ${arActual.toFixed(2)}:1 ` +
          `exceeds IPC-6012 limit of ${arLimit}:1 ` +
          `(depth ${depth.toFixed(3)} mm ÷ drill ${via.drillDiameter.toFixed(3)} mm)`,
        severity: 'error',
        actualValue: arActual,
        limitValue: arLimit,
      });
      viaHasViolation = true;
    } else if (arActual > arLimit * 0.85) {
      // Warn when within 15% of the limit
      violations.push({
        viaId: via.id,
        rule: 'ASPECT_RATIO_WARNING',
        message:
          `Via ${via.id} (${via.viaType}): aspect ratio ${arActual.toFixed(2)}:1 ` +
          `is within 15% of IPC-6012 limit ${arLimit}:1`,
        severity: 'warning',
        actualValue: arActual,
        limitValue: arLimit,
      });
      viaHasViolation = true;
    }

    if (!viaHasViolation) passCount++;
  }

  const errorCount   = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  return {
    status: errorCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass',
    violations,
    errorCount,
    warningCount,
    passCount,
    totalVias: vias.length,
  };
}

// ── Via Factory ────────────────────────────────────────────────────────────────

let _viaIdCounter = 1;
/** Generates a stable incrementing via ID */
export function nextViaId(): string {
  return `via-${_viaIdCounter++}`;
}

/**
 * Creates a PCBVia with auto-computed type and DRC-compliant defaults.
 *
 * @param x             Canvas X coordinate (mm)
 * @param y             Canvas Y coordinate (mm)
 * @param fromLayer     Start layer
 * @param toLayer       End layer
 * @param netId         Net this via connects
 * @param stackup       Active board stackup
 * @param drillOverride Optional drill diameter override (mm)
 */
export function createVia(
  x: number,
  y: number,
  fromLayer: LayerId,
  toLayer: LayerId,
  netId: string,
  stackup: PCBStackup,
  drillOverride?: number
): PCBVia {
  // Determine viaType before choosing drill diameter so micro threshold applies
  // Use a provisional drill to infer type; 0.10 mm is a safe micro candidate
  const provisionalDrill = drillOverride ?? 0.10;
  const viaType = inferViaType(fromLayer, toLayer, provisionalDrill, stackup);

  const drill =
    drillOverride ??
    (viaType === 'micro' ? 0.10
      : viaType === 'blind' || viaType === 'buried' ? 0.15
      : 0.20);

  const pad = drill + 2 * VIA_DEFAULT_ANNULAR_MM[viaType];
  const depth = calcDrillDepth(fromLayer, toLayer, stackup);

  return {
    id: nextViaId(),
    x,
    y,
    drillDiameter: drill,
    padDiameter: pad,
    viaType,
    fromLayer,
    toLayer,
    netId,
    drillDepth: depth,
  };
}

// ── Router Via Selector ────────────────────────────────────────────────────────

/**
 * Selects the most appropriate via type and layer pair for a layer transition
 * in the Manhattan router, based on:
 *   1. Net class `preferredViaType` constraint
 *   2. Stackup layer count (micro-via only valid for adjacent layers in 6L/8L)
 *   3. IPC-6012 aspect ratio feasibility with net class drill override
 *
 * Returns a fully constructed `PCBVia` ready to be committed to the board.
 */
export function selectViaForTransition(
  x: number,
  y: number,
  sourceLayer: LayerId,
  targetLayer: LayerId,
  netId: string,
  stackup: PCBStackup,
  netClass?: NetClass
): PCBVia {
  const nc = netClass ?? DEFAULT_NET_CLASSES['Default'];

  // Determine drill diameter from net class or default
  const drillOverride =
    nc.viaDrillOverrideMm > 0 ? nc.viaDrillOverrideMm : undefined;

  const provisionalDrill = drillOverride ?? 0.10;
  const inferredType = inferViaType(
    sourceLayer,
    targetLayer,
    provisionalDrill,
    stackup
  );

  // Honor net class preference where structurally valid
  let chosenType: ViaType = nc.preferredViaType;

  // Validate preference against structural constraints
  const fromIdx = getLayerIndex(sourceLayer, stackup);
  const toIdx   = getLayerIndex(targetLayer,   stackup);
  const span    = Math.abs(fromIdx - toIdx);

  if (chosenType === 'micro' && span !== 1) {
    // Micro-via requires adjacent layers; fall back
    chosenType = inferredType;
  }
  if (
    chosenType === 'through' &&
    !(
      sourceLayer === stackup.layers[0].layerId &&
      targetLayer === stackup.layers[stackup.layers.length - 1].layerId
    )
  ) {
    chosenType = inferredType;
  }

  // Check aspect ratio feasibility; upgrade drill if needed
  const depth = calcDrillDepth(sourceLayer, targetLayer, stackup);
  const arLimit = VIA_ASPECT_RATIO_LIMITS[chosenType];
  let finalDrill = drillOverride ?? VIA_MIN_DRILL_MM[chosenType];

  // Ensure drill satisfies aspect ratio: drill ≥ depth / arLimit
  const minDrillForAR = arLimit > 0 ? depth / arLimit : 0;
  if (finalDrill < minDrillForAR) {
    finalDrill = Math.ceil(minDrillForAR * 1000) / 1000; // round up to µm
  }

  // Cap micro-via drill at IPC-2315 maximum
  if (chosenType === 'micro') {
    finalDrill = Math.min(finalDrill, MICRO_VIA_MAX_DRILL_MM);
    // If we can't satisfy aspect ratio with micro-via constraints, upgrade type
    if (depth / finalDrill > VIA_ASPECT_RATIO_LIMITS.micro) {
      chosenType = inferViaType(sourceLayer, targetLayer, 0.20, stackup);
      finalDrill = Math.ceil((depth / VIA_ASPECT_RATIO_LIMITS[chosenType]) * 1000) / 1000;
      finalDrill = Math.max(finalDrill, VIA_MIN_DRILL_MM[chosenType]);
    }
  }

  const pad = finalDrill + 2 * VIA_DEFAULT_ANNULAR_MM[chosenType];

  return {
    id: nextViaId(),
    x,
    y,
    drillDiameter: finalDrill,
    padDiameter: pad,
    viaType: chosenType,
    fromLayer: sourceLayer,
    toLayer: targetLayer,
    netId,
    drillDepth: depth,
  };
}

// ── Stackup Helpers ────────────────────────────────────────────────────────────

/**
 * Returns the default stackup for a given preset.
 * Always returns a deep-cloned copy to avoid mutation of the constant.
 */
export function getDefaultStackup(preset: StackupPreset): PCBStackup {
  return JSON.parse(JSON.stringify(DEFAULT_STACKUPS[preset])) as PCBStackup;
}

/**
 * Returns the available layer IDs for a stackup.
 */
export function getStackupLayers(stackup: PCBStackup): LayerId[] {
  return stackup.layers.map((l) => l.layerId);
}

/**
 * Returns whether two layers are adjacent in the given stackup.
 */
export function areLayersAdjacent(
  a: LayerId,
  b: LayerId,
  stackup: PCBStackup
): boolean {
  const ai = getLayerIndex(a, stackup);
  const bi = getLayerIndex(b, stackup);
  return ai !== -1 && bi !== -1 && Math.abs(ai - bi) === 1;
}

/**
 * Returns the adjacent inner layer(s) to a given outer layer.
 * Used by the router for blind-via entry-point selection.
 */
export function getAdjacentInnerLayer(
  outerLayer: LayerId,
  stackup: PCBStackup
): LayerId | null {
  const layers = stackup.layers.map((l) => l.layerId);
  const idx = layers.indexOf(outerLayer);
  if (idx === -1) return null;
  if (idx === 0)                return layers[1];
  if (idx === layers.length - 1) return layers[layers.length - 2];
  return null;
}

// ── Summary Utilities ─────────────────────────────────────────────────────────

export interface ViaSummary {
  total: number;
  byType: Record<ViaType, number>;
  drcStatus: ViaDRCResult;
}

/**
 * Produces a via summary for display in the sidebar / status bar.
 */
export function summarizeVias(
  vias: PCBVia[],
  stackup: PCBStackup
): ViaSummary {
  const byType: Record<ViaType, number> = {
    through: 0,
    blind:   0,
    buried:  0,
    micro:   0,
  };
  for (const v of vias) {
    byType[v.viaType] = (byType[v.viaType] ?? 0) + 1;
  }
  return {
    total: vias.length,
    byType,
    drcStatus: runViaDRC(vias, stackup),
  };
}
