import { NetClass, DifferentialPair } from '../types';

export type BoardLayer = 
  | "F.Cu" 
  | "B.Cu" 
  | "F.Silkscreen" 
  | "B.Silkscreen" 
  | "Edge.Cuts"
  | "F.Mask"
  | "B.Mask"
  | "F.Paste"
  | "B.Paste";

export type PadShape = "rect" | "circle" | "oval" | "polygon" | "roundrect";
export type PadType = "smd" | "tht" | "npth";

export interface BoardPad {
  id: string;          // Logical pin name, e.g. "1", "GND"
  x: number;           // Absolute board center-X (mm)
  y: number;           // Absolute board center-Y (mm)
  width: number;       // Dimension (mm)
  height: number;      // Dimension (mm)
  layer: BoardLayer;   // Primary layer of the copper pad
  shape: PadShape;
  type: PadType;
  netId?: string;      // Assigned logical net connection ID
  netName?: string;    // Decoded net name for overlay display
  clearance?: number;  // Spacing clearance override (mm)
}

export interface BoardComponent {
  id: string;          // Coordinated Schematic symbol reference UUID
  designator: string;  // e.g. "U1", "R2", "C15"
  footprintId: string; // Key of footprint in GlobalLibrary
  x: number;           // Centroid X on canvas (mm)
  y: number;           // Centroid Y on canvas (mm)
  rotation: number;    // Clockwise angle of rotation (0 - 360 deg)
  layer: BoardLayer;   // Custom side placement: Top (F.Cu) or Bottom (B.Cu)
  isLocked: boolean;   // Lock position against automatic layout optimizations
  pads: BoardPad[];
}

export interface BoardTrace {
  id: string;
  netId: string;
  layer: BoardLayer;
  width: number;       // Current routing track width (mm)
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  impedanceOhms?: number; // Precalculated differential/single-ended track impedance
  lengthMm?: number;      // Actual physical wire length of this subsegment
}

export interface Via {
  id: string;
  netId: string;
  x: number;
  y: number;
  drillSize: number;   // Internal hole drill diameter (mm), default 0.3mm
  padSize: number;     // Outside circular copper annular ring diameter (mm), default 0.6mm
}

export type KeepoutRestriction = "trace" | "copper" | "via" | "component" | "pour";

export interface KeepoutZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layers: BoardLayer[];
  restrictions: KeepoutRestriction[];
}

export interface BoardOutline {
  points: { x: number; y: number }[]; // Ordered closed polygon vertices defining edge cuts boundary
  thickness?: number;                 // Layer draw width, default 0.15mm
}

export interface RatnestLine {
  id: string;
  netId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  lengthEstimate?: number; // Manhattan distance or Euler straight line distance for metric heuristics
}

export interface BoardNet {
  id: string;
  name: string;
  pads: { componentId: string; padId: string }[];
  netClassId?: string; // Assigned routing rule parameters from NetClass definitions
  isHighSpeed?: boolean;
}

export interface PolygonPourZone {
  id: string;
  netId: string;               // Assigned net to fill, e.g. "GND"
  layer: BoardLayer;           // e.g. "F.Cu" or "B.Cu"
  outlinePoints: { x: number; y: number }[]; // Boundary polygon enclosing the pour area
  clearance: number;           // Isolation clearance around other tracks & pads (mm), default 0.3mm
  minThickness: number;        // Minimum copper width trace during polygon processing (mm), default 0.2mm
  thermalReliefEnabled: boolean; // True to generate thermal spokes on interconnecting pads
  spokeWidth: number;          // Width of the thermal relief connection spoke (mm)
  spokesCount?: number;        // Spokes layout geometry (usually 4 in standard orthogonal cross pattern)
  priority?: number;           // Priority ordering value (e.g. GND pour under signal planes)
}

export interface PCBBoard {
  components: BoardComponent[];
  nets: BoardNet[];
  traces: BoardTrace[];
  vias: Via[];
  keepouts: KeepoutZone[];
  outline: BoardOutline;
  ratnest: RatnestLine[];
  netClasses?: NetClass[];
  diffPairs?: DifferentialPair[];
  polygonPours?: PolygonPourZone[]; // Core polygon zones list
}
