export enum ConstraintType {
  NETCLASS = "NETCLASS",
  IMPEDANCE = "IMPEDANCE",
  DIFF_PAIR = "DIFF_PAIR",
  SKEW_MATCH = "SKEW_MATCH",
  CLEARANCE = "CLEARANCE",
  CREEPAGE = "CREEPAGE",
  THERMAL = "THERMAL",
  EMI_REGION = "EMI_REGION",
  KEEPOUT = "KEEPOUT",
  PLACEMENT_REGION = "PLACEMENT_REGION",
  MANUFACTURING = "MANUFACTURING",
  VIA_RESTRICTION = "VIA_RESTRICTION",
  LAYER_RESTRICTION = "LAYER_RESTRICTION",
  CURRENT_REQMNT = "CURRENT_REQMNT",
  RETURN_PATH = "RETURN_PATH",
  RF_ISOLATION = "RF_ISOLATION",
  AI_INTENT = "AI_INTENT",
  OPTIMIZATION_WEIGHT = "OPTIMIZATION_WEIGHT"
}

export enum ConstraintScope {
  GLOBAL = "GLOBAL",
  NETCLASS = "NETCLASS",
  NET = "NET",
  DIFFERENTIAL_PAIR = "DIFFERENTIAL_PAIR",
  COMPONENT = "COMPONENT",
  LAYER = "LAYER",
  REGION = "REGION"
}

export enum ConstraintSource {
  USER = "USER",
  AI = "AI",
  PHYSICS = "PHYSICS",
  MANUFACTURER = "MANUFACTURER",
  SYSTEM = "SYSTEM"
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  layers: string[];
}

export interface EngineeringConstraint {
  id: string;
  type: ConstraintType;
  scope: ConstraintScope;
  target: string; // e.g. "GND", "POWER", "U1", "F.Cu" or blank for global
  parameters: Record<string, any>; // minWidth, minSpacing, maxSkew, etc.
  priority: number; // 0 to 100 where higher wins
  source: ConstraintSource;
  isLocked: boolean;
  description?: string;
  boundingBox?: BoundingBox; // For region-bound rules
  createdAt: number;
}

export interface PhysicalConstraintBounds {
  minWidth: number;
  preferredWidth: number;
  maxWidth: number;
  minSpacing: number; // Clearance
  allowedLayers: string[];
  viaDrillSize: number;
  viaPadSize: number;
  impedanceOhms?: number;
  skewTolerance?: number;
  maxUncoupledLength?: number;
  currentRatingAmps?: number;
  thermalRelief?: "direct" | "relief" | "none";
  isEmiSensitive?: boolean;
}

// Built-in industrial manufacturing constraints (e.g. standard JLCPCB/PCBWay capabilities)
export const StandardManufacturingLimits = {
  minTraceWidth: 0.127,     // 5 mil
  minTraceClearance: 0.127, // 5 mil
  minDrillSize: 0.200,      // 8 mil
  minAnnularRing: 0.150,    // 6 mil
  minViaSize: 0.450,       // 18 mil outer pad
  minCopperToEdge: 0.300,   // 12 mil space to board outline border
};
