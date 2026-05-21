import { SymbolDefinition } from './symbols';
import { ComponentMetadata } from '../types';

export interface FootprintPad {
  id: string; // e.g. "1", "2"
  x: number;
  y: number;
  width: number;
  height: number;
  shape: "rect" | "circle" | "oval" | "polygon";
  type: "tht" | "smd" | "npth";
}

export interface FootprintDefinition {
  id: string;
  name: string;
  pads: FootprintPad[];
  mountType: "SMT" | "THT";
  dimensions: { width: number; height: number };
  pinPitch?: number;
  hasThermalPad?: boolean;
}

export interface LibraryComponent {
  partNumber: string;
  category: "Resistor" | "Capacitor" | "IC" | "Connector" | "Inductor" | "Diode" | "Transistor" | "Other";
  symbolId: string;
  footprints: string[]; // List of compatible footprint IDs
  defaultFootprint: string;
  metadata: ComponentMetadata & {
    manufacturer?: string;
    description?: string;
  };
  pinMapping: Record<string, string>; // Maps logical symbol pin ID to physical pad number, e.g. { "VCC": "8" }
}

export class ComponentLibrary {
  private symbols = new Map<string, SymbolDefinition>();
  private footprints = new Map<string, FootprintDefinition>();
  private components = new Map<string, LibraryComponent>();

  registerSymbol(sym: SymbolDefinition) {
    this.symbols.set(sym.id, sym);
  }

  registerFootprint(fp: FootprintDefinition) {
    this.footprints.set(fp.id, fp);
  }

  registerComponent(comp: LibraryComponent) {
    this.components.set(comp.partNumber, comp);
  }

  getSymbol(id: string): SymbolDefinition | undefined {
    return this.symbols.get(id);
  }

  getFootprint(id: string): FootprintDefinition | undefined {
    return this.footprints.get(id);
  }

  getComponent(partNumber: string): LibraryComponent | undefined {
    return this.components.get(partNumber);
  }

  searchComponents(query: string, category?: string): LibraryComponent[] {
    const results: LibraryComponent[] = [];
    for (const comp of this.components.values()) {
      if (category && comp.category !== category) continue;
      if (query && !comp.partNumber.toLowerCase().includes(query.toLowerCase()) && !comp.metadata.description?.toLowerCase().includes(query.toLowerCase())) continue;
      results.push(comp);
    }
    return results;
  }
}

export const GlobalLibrary = new ComponentLibrary();

// --- Seed the Library with deterministic examples ---

// Standard 2-pin passive symbol
GlobalLibrary.registerSymbol({
  id: "SYM_RESISTOR",
  name: "Resistor",
  defaultPrefix: "R",
  units: [{
    id: "A",
    width: 60,
    height: 20,
    graphics: [
      { type: "rect", x: -20, y: -10, width: 40, height: 20, className: "stroke-current fill-transparent" }
    ],
    pins: [
      { id: "1", name: "1", type: "passive", x: -40, y: 0, direction: "Right", length: 20 },
      { id: "2", name: "2", type: "passive", x: 40, y: 0, direction: "Left", length: 20 }
    ]
  }]
});

GlobalLibrary.registerSymbol({
  id: "SYM_CAPACITOR",
  name: "Capacitor",
  defaultPrefix: "C",
  units: [{
    id: "A",
    width: 40,
    height: 40,
    graphics: [
      { type: "line", x: -10, y: -20, width: 0, height: 40, className: "stroke-current" },
      { type: "line", x: 10, y: -20, width: 0, height: 40, className: "stroke-current" }
    ],
    pins: [
      { id: "1", name: "1", type: "passive", x: -30, y: 0, direction: "Right", length: 20 },
      { id: "2", name: "2", type: "passive", x: 30, y: 0, direction: "Left", length: 20 }
    ]
  }]
});

// MP1584 Buck Converter
GlobalLibrary.registerSymbol({
  id: "SYM_MP1584",
  name: "MP1584",
  defaultPrefix: "U",
  units: [{
    id: "A",
    width: 100,
    height: 120,
    graphics: [
      { type: "rect", x: -50, y: -60, width: 100, height: 120, className: "stroke-current fill-[#1a1a1a]" }
    ],
    pins: [
      { id: "1", name: "SW", type: "power_out", x: 70, y: -40, direction: "Left", length: 20 },
      { id: "2", name: "EN", type: "input", x: -70, y: -20, direction: "Right", length: 20 },
      { id: "3", name: "COMP", type: "analog", x: 70, y: 0, direction: "Left", length: 20 },
      { id: "4", name: "FB", type: "input", x: 70, y: 20, direction: "Left", length: 20 },
      { id: "5", name: "GND", type: "power_in", x: 0, y: 80, direction: "Up", length: 20 },
      { id: "6", name: "FREQ", type: "input", x: -70, y: 20, direction: "Right", length: 20 },
      { id: "7", name: "VIN", type: "power_in", x: -70, y: -40, direction: "Right", length: 20 },
      { id: "8", name: "BST", type: "analog", x: 70, y: 40, direction: "Left", length: 20 }
    ]
  }]
});

// Seed Footprints
GlobalLibrary.registerFootprint({
  id: "FP_0805",
  name: "0805",
  mountType: "SMT",
  dimensions: { width: 2.0, height: 1.25 },
  pads: [
    { id: "1", x: -0.9, y: 0, width: 0.9, height: 1.3, shape: "rect", type: "smd" },
    { id: "2", x: 0.9, y: 0, width: 0.9, height: 1.3, shape: "rect", type: "smd" }
  ]
});

// Seed Components
GlobalLibrary.registerComponent({
  partNumber: "RES-10K-0805",
  category: "Resistor",
  symbolId: "SYM_RESISTOR",
  footprints: ["FP_0805"],
  defaultFootprint: "FP_0805",
  metadata: { description: "10k Ohm 1% 1/8W 0805", tolerance: 1, packageType: "0805" },
  pinMapping: { "1": "1", "2": "2" }
});

GlobalLibrary.registerComponent({
  partNumber: "CAP-0.1uF-0805",
  category: "Capacitor",
  symbolId: "SYM_CAPACITOR",
  footprints: ["FP_0805"],
  defaultFootprint: "FP_0805",
  metadata: { description: "0.1uF 50V 0805", voltageRating: 50, packageType: "0805" },
  pinMapping: { "1": "1", "2": "2" }
});

GlobalLibrary.registerComponent({
  partNumber: "MP1584EN",
  category: "IC",
  symbolId: "SYM_MP1584",
  footprints: ["FP_SOIC8E"],
  defaultFootprint: "FP_SOIC8E",
  metadata: { description: "3A, 1.5MHz, 28V Step-Down Converter", currentRating: 3, voltageRating: 28, packageType: "SOIC-8E" },
  pinMapping: { "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8" }
});
