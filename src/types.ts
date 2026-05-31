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
  | "passive"
  | "analog"
  | "unspecified";

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
  manufacturer?: string;
  mpn?: string;           // Manufacturer Part Number
  description?: string;
  value?: string;
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
  
  // Hierarchical scope
  hierarchyPath?: string; // Path representation (e.g., "root/SensorBlock/Power")
  parentSheetId?: string; // Direct parent sheet ID
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
  
  // Hierarchical net mapping
  localNetScope?: string;  // Associated sheet ID
  compiledNetId?: string;   // Globals/resolved unique mangled identifier
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

import { BoardTrace, Via, KeepoutZone, BoardOutline, PolygonPourZone } from './lib/board';
export type { BoardTrace, Via, KeepoutZone, BoardOutline, PolygonPourZone };

/**
 * Hierarchical ports that allow wire connections between sheets.
 */
export interface HierarchicalPort {
  id: string;
  name: string; // e.g., "V_IN", "SPI_CLK"
  direction: "input" | "output" | "bidirectional";
  position?: Point;
}

/**
 * Global labels that cross all sheet scopes (e.g., power rails like VCC/GND).
 */
export interface GlobalLabel {
  id: string;
  name: string;
  position?: Point;
}

/**
 * Connects peer sheets together horizontally without strict hierarchy trees.
 */
export interface OffSheetConnector {
  id: string;
  name: string;
  position?: Point;
}

/**
 * Represents a single block placed inside a parent sheet referencing a child sheet layout.
 */
export interface SheetSymbol {
  id: string;
  designator: string; // e.g., "BLOCK1"
  referencedSheetId: string; // The ID of the ProjectSheet it instances
  position: Point;
  ports: HierarchicalPort[]; // Interfacing pins on the block
}

/**
 * Represents an independent sheet in the project DAG.
 */
export interface ProjectSheet {
  id: string;
  name: string; // e.g., "CPU_Core", "PowerDelivery"
  parentSheetId: string | null; // Null-root, otherwise points to parent ID
  components: PCBComponent[];
  nets: Net[];
  sheetSymbols: SheetSymbol[];
  ports: HierarchicalPort[];
  globalLabels: GlobalLabel[];
  offSheetConnectors: OffSheetConnector[];
}

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
  polygonPours?: PolygonPourZone[];
  
  // Multi-sheet and Hierarchy Support
  sheets?: ProjectSheet[];
  activeSheetId?: string; // Currently focused sheet in the viewport
}

/**
 * The structured Action format emitted by the backend parser
 */
export interface AIAction {
  name: string;
  args: Record<string, any>;
  reasoning?: string;
}
