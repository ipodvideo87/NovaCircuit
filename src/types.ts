export interface Point {
  x: number;
  y: number;
}

export type PinType =
  | "input"
  | "output"
  | "bidirectional"
  | "power_in"
  | "power_out"
  | "ground"
  | "passive";

export type NetType =
  | "signal"
  | "power"
  | "ground"
  | "clock"
  | "analog"
  | "differential"
  | "rf"
  | "high_current";

// Add Component Metadata
export interface ComponentMetadata {
  voltageRating?: number; // V
  currentRating?: number; // A
  tolerance?: number;     // %
  packageType?: string;   // e.g., "0805", "SOIC-8"
  temperatureRating?: number; // C
}

export interface PinDef {
  name: string;
  type: PinType;
}

export interface PCBComponent {
  id: string;             // Unique identifier
  designator: string;     // e.g., "R1", "U1"
  partType: string;       // e.g., "Resistor", "MP1584"
  partNumber?: string;    // e.g., "RES-10K-0805" indicating library component
  footprint: string;      // e.g., "0805", "SOIC-8"

  // Schematic placement
  position: Point;        // Editor X, Y position

  // Board placement
  boardPosition?: Point;   // PCB X, Y center
  rotation?: number;       // PCB rotation
  layer?: "F.Cu" | "B.Cu"; // PCB layer
  isLocked?: boolean;      // PCB locked

  properties: Record<string, string | number>; // e.g., { value: "10k", tolerance: "1%" }
  metadata?: ComponentMetadata;
  pins: PinDef[];         // List of valid pin definitions
}

// Represents a specific pin on a specific component
export interface ComponentPin {
  componentId: string;
  pinName: string;
}

export interface Net {
  id: string;             // Unique identifier
  name: string;           // e.g., "GND", "+5V", "Net-(R1-Pad1)"
  netClass: "POWER" | "GROUND" | "SIGNAL" | "DIFFERENTIAL" | "DEFAULT";
  type: NetType;
  connections: ComponentPin[]; // Which pins are connected to this net
}

export interface NetClass {
  id: string;
  name: string;
  minWidth: number; // in mm
  minSpacing: number; // in mm
  viaSize?: { drillSize: number; padSize: number };
  impedanceOhms?: number; // target single-ended impedance
}

export interface DifferentialPair {
  id: string;
  name: string; // e.g. "USB_D"
  positiveNetId: string; // e.g. net-USB_DP
  negativeNetId: string; // e.g. net-USB_DN
  spacing: number; // in mm
  width: number; // in mm
  skewTolerance: number; // Max length skew (mm) before violation
  targetImpedance?: number; // Target differential impedance in Ohms
  maxUncoupledLength?: number; // Max length in mm they can run uncoupled
}

import { BoardTrace, Via, KeepoutZone, BoardOutline } from './lib/board';

/**
 * The complete structured Project Graph
 * This is what gets sent to the AI for reasoning.
 */
export interface ProjectGraph {
  components: PCBComponent[];
  nets: Net[];
  traces?: BoardTrace[];
  vias?: Via[];
  keepouts?: KeepoutZone[];
  outline?: BoardOutline;
  netClasses?: NetClass[];
  diffPairs?: DifferentialPair[];
}

/**
 * The structured Action format emitted by the backend parser
 */
export interface AIAction {
  name: string;
  args: Record<string, any>;
  reasoning?: string;
}
