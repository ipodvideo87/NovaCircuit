import { ProjectGraph, NetClass, DifferentialPair } from '../types';
import { PCBBoard, BoardTrace, Via } from './board';

// Deterministic constraints layer

// Extended Net classes mapping to minimum spacing and widths.
// This serves as backward compatibility and base configuration.
export const ConstrainedNetClasses: Record<string, { minWidth: number, minSpacing: number }> = {
  "POWER": { minWidth: 0.5, minSpacing: 0.2 },
  "GROUND": { minWidth: 0.5, minSpacing: 0.2 },
  "SIGNAL": { minWidth: 0.2, minSpacing: 0.2 },
  "DIFFERENTIAL": { minWidth: 0.15, minSpacing: 0.2 },
  "CLOCK": { minWidth: 0.15, minSpacing: 0.3 },
  "ANALOG": { minWidth: 0.25, minSpacing: 0.3 },
  "RF": { minWidth: 0.3, minSpacing: 0.4 },
  "HIGH_CURRENT": { minWidth: 1.0, minSpacing: 0.5 },
  "DEFAULT": { minWidth: 0.2, minSpacing: 0.2 }
};

// Default Net Classes that can be bootstrapped in the editor if not defined
export const DefaultNetClasses: NetClass[] = [
  {
    id: "nc-default",
    name: "DEFAULT",
    minWidth: 0.2,
    minSpacing: 0.2,
    viaSize: { drillSize: 0.3, padSize: 0.6 },
    impedanceOhms: 50 // standard microstrip
  },
  {
    id: "nc-power",
    name: "POWER",
    minWidth: 0.5,
    minSpacing: 0.2,
    viaSize: { drillSize: 0.4, padSize: 0.8 },
    impedanceOhms: 20
  },
  {
    id: "nc-ground",
    name: "GROUND",
    minWidth: 0.5,
    minSpacing: 0.2,
    viaSize: { drillSize: 0.4, padSize: 0.8 },
    impedanceOhms: 20
  },
  {
    id: "nc-differential",
    name: "DIFFERENTIAL",
    minWidth: 0.15,
    minSpacing: 0.2,
    viaSize: { drillSize: 0.3, padSize: 0.6 },
    impedanceOhms: 50
  },
  {
    id: "nc-clock",
    name: "CLOCK",
    minWidth: 0.15,
    minSpacing: 0.3,
    viaSize: { drillSize: 0.3, padSize: 0.6 },
    impedanceOhms: 50
  },
  {
    id: "nc-rf",
    name: "RF",
    minWidth: 0.3,
    minSpacing: 0.4,
    viaSize: { drillSize: 0.3, padSize: 0.6 },
    impedanceOhms: 50
  },
  {
    id: "nc-high-current",
    name: "HIGH_CURRENT",
    minWidth: 1.0,
    minSpacing: 0.5,
    viaSize: { drillSize: 0.5, padSize: 1.0 }
  }
];

export interface ResolvedNetConstraints {
  minWidth: number;
  maxWidth: number;
  preferredWidth: number;
  minSpacing: number; // clearance
  viaDrillSize: number;
  viaPadSize: number;
  impedanceOhms?: number;
  allowedLayers: string[];
  lengthTarget?: number;
  lengthTolerance?: number;
  skewTolerance?: number;
}

/**
 * Returns the fully resolved physical Constraints for a specific Net ID.
 * Handles deterministic inheritance:
 * Custom Net Class -> Parent Net Class -> "DEFAULT" -> Global hardcoded fallback.
 */
export function resolveNetConstraints(board: PCBBoard, netId: string | undefined): ResolvedNetConstraints {
  const globalDefaultColors = ["F.Cu", "B.Cu"];
  
  const fallback: ResolvedNetConstraints = {
    minWidth: 0.2,
    maxWidth: 2.0,
    preferredWidth: 0.25,
    minSpacing: 0.2,
    viaDrillSize: 0.3,
    viaPadSize: 0.6,
    allowedLayers: ["F.Cu", "B.Cu"]
  };

  if (!netId) return fallback;

  // 1. Locate the net of the board to get its logical netClass name
  const boardNet = board.nets.find(n => n.id === netId);
  // Support both property "netClass" on graph nets
  const graphNet = (boardNet as any);
  const className = graphNet?.netClass || "DEFAULT";

  // Helper to deep resolve by class name
  const resolveClass = (cName: string): Partial<ResolvedNetConstraints> => {
    const cls = board.netClasses?.find(nc => nc.name === cName || nc.id === cName);
    if (!cls) {
      // Try fallback to standard ConstrainedNetClasses values if no list is inside the board yet
      const fallbackConfig = ConstrainedNetClasses[cName];
      if (fallbackConfig) {
        return {
          minWidth: fallbackConfig.minWidth,
          minSpacing: fallbackConfig.minSpacing,
          preferredWidth: fallbackConfig.minWidth,
          maxWidth: 2.0
        };
      }
      return {};
    }

    const parentId = (cls as any).parentId;
    const parentRules = parentId ? resolveClass(parentId) : {};

    return {
      ...parentRules,
      minWidth: cls.minWidth ?? parentRules.minWidth,
      maxWidth: (cls as any).maxWidth ?? parentRules.maxWidth ?? 2.5,
      preferredWidth: (cls as any).preferredWidth ?? cls.minWidth ?? parentRules.preferredWidth,
      minSpacing: cls.minSpacing ?? parentRules.minSpacing,
      viaDrillSize: cls.viaSize?.drillSize ?? parentRules.viaDrillSize,
      viaPadSize: cls.viaSize?.padSize ?? parentRules.viaPadSize,
      impedanceOhms: cls.impedanceOhms ?? parentRules.impedanceOhms,
      allowedLayers: (cls as any).allowedLayers ?? parentRules.allowedLayers ?? ["F.Cu", "B.Cu"],
      lengthTarget: (cls as any).lengthTarget ?? parentRules.lengthTarget,
      lengthTolerance: (cls as any).lengthTolerance ?? parentRules.lengthTolerance,
      skewTolerance: (cls as any).skewTolerance ?? parentRules.skewTolerance
    };
  };

  const cRules = resolveClass(className);
  const defaultRules = className !== "DEFAULT" ? resolveClass("DEFAULT") : {};

  return {
    minWidth: cRules.minWidth ?? defaultRules.minWidth ?? fallback.minWidth,
    maxWidth: cRules.maxWidth ?? defaultRules.maxWidth ?? fallback.maxWidth,
    preferredWidth: cRules.preferredWidth ?? defaultRules.preferredWidth ?? fallback.preferredWidth,
    minSpacing: cRules.minSpacing ?? defaultRules.minSpacing ?? fallback.minSpacing,
    viaDrillSize: cRules.viaDrillSize ?? defaultRules.viaDrillSize ?? fallback.viaDrillSize,
    viaPadSize: cRules.viaPadSize ?? defaultRules.viaPadSize ?? fallback.viaPadSize,
    impedanceOhms: cRules.impedanceOhms ?? defaultRules.impedanceOhms,
    allowedLayers: cRules.allowedLayers ?? defaultRules.allowedLayers ?? fallback.allowedLayers,
    lengthTarget: cRules.lengthTarget ?? defaultRules.lengthTarget,
    lengthTolerance: cRules.lengthTolerance ?? defaultRules.lengthTolerance,
    skewTolerance: cRules.skewTolerance ?? defaultRules.skewTolerance
  };
}

export function validateConstraints(graph: ProjectGraph): string[] {
  const issues: string[] = [];
  return issues;
}
