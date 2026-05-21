import { ProjectGraph, ComponentPin } from '../types';

// Deterministic constraints layer

// Extended Net classes mapping to minimum spacing and widths
// This is metadata foundation, not an autorouter
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

export interface DiffPairSpacing {
  traceWidth: number;
  gap: number;
  coupledLength: number;
}

export interface ImpedanceRule {
  targetOhms: number;
  tolerance: number; // %
}

export interface KeepoutRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  layers: string[];
}

// Expanded constraints
export interface LayerRestriction {
  netClasses: string[];
  allowedLayers: string[];
}

export interface ViaRestriction {
  netClasses: string[];
  allowedViaTypes: ("through_hole" | "blind" | "buried")[];
}

export interface WidthClass {
  netClass: string;
  minWidth: number;
  preferredWidth: number;
  maxWidth: number;
}

export interface ClearanceClass {
  netClassA: string;
  netClassB: string;
  minClearance: number;
}

export interface DesignConstraint {
  id: string;
  type: "minimum_spacing" | "preferred_net_class" | "keepout_region" | "diff_pair_spacing" | "impedance_rule" | "layer_restriction" | "via_restriction" | "width_class" | "clearance_class";
  ruleData: any;
}

export function validateConstraints(graph: ProjectGraph): string[] {
  const issues: string[] = [];
  // Constraints will be evaluated here (spacing, keepouts, etc)
  // For now, this is a placeholder rules engine foundation
  return issues;
}
