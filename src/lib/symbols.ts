export type PinDirection = "Up" | "Down" | "Left" | "Right";

export interface SymbolGraphic {
  type: "line" | "rect" | "circle" | "polygon" | "text" | "arc";
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  layer?: "Silkscreen" | "Courtyard" | "Document";
  radius?: number;
  points?: {x: number, y: number}[];
  text?: string;
  className?: string; // for styling (e.g., fill, stroke)
}

export interface SymbolPin {
  id: string; // Logical ID, e.g., "1", "2", "VCC"
  name: string; // e.g. "IN", "GND"
  type: "input" | "output" | "bidirectional" | "power_in" | "power_out" | "ground" | "passive" | "analog";
  x: number;
  y: number;
  direction: PinDirection;
  length: number;
  isHidden?: boolean;
}

export interface SymbolUnit {
  id: string; // e.g. "A", "B", "PWR"
  graphics: SymbolGraphic[];
  pins: SymbolPin[];
  width: number;
  height: number;
}

export interface SymbolDefinition {
  id: string;
  name: string;
  units: SymbolUnit[]; // multi-unit gates support
  defaultPrefix: string; // e.g. "U", "R", "C"
}
