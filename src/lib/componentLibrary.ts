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

// ============================================================================
// GLOBAL FOOTPRINT LIBRARY
// A deterministic, industry-standard set of footprints covering common package
// families. Every part the AI generates resolves to one of these via
// resolveFootprintForPart(); parts that don't match still synthesize routable
// pads (see board.ts synthesizePads), so coverage is universal.
// ============================================================================

// --- Pad geometry helpers (dimensions in mm) ---
function twoPad(spacing: number, padW: number, padH: number): FootprintPad[] {
  return [
    { id: "1", x: -spacing / 2, y: 0, width: padW, height: padH, shape: "rect", type: "smd" },
    { id: "2", x: spacing / 2, y: 0, width: padW, height: padH, shape: "rect", type: "smd" }
  ];
}

// Dual-row SMD (SOIC/TSSOP/SOT): pins 1..n/2 down left col, then up right col
function dualRow(n: number, pitch: number, rowSpacing: number, padW: number, padH: number): FootprintPad[] {
  const pads: FootprintPad[] = [];
  const perCol = n / 2;
  const y0 = -((perCol - 1) / 2) * pitch;
  for (let i = 0; i < perCol; i++) {
    pads.push({ id: `${i + 1}`, x: -rowSpacing / 2, y: y0 + i * pitch, width: padW, height: padH, shape: "rect", type: "smd" });
  }
  for (let i = 0; i < perCol; i++) {
    pads.push({ id: `${perCol + i + 1}`, x: rowSpacing / 2, y: -(y0 + i * pitch), width: padW, height: padH, shape: "rect", type: "smd" });
  }
  return pads;
}

// Quad flat (QFN/QFP): pins wrap counter-clockwise starting bottom-left
function quad(perSide: number, pitch: number, bodyHalf: number, padW: number, padH: number): FootprintPad[] {
  const pads: FootprintPad[] = [];
  let n = 1;
  const start = -((perSide - 1) / 2) * pitch;
  for (let i = 0; i < perSide; i++) pads.push({ id: `${n++}`, x: -bodyHalf, y: -(start + i * pitch), width: padH, height: padW, shape: "rect", type: "smd" });
  for (let i = 0; i < perSide; i++) pads.push({ id: `${n++}`, x: start + i * pitch, y: bodyHalf, width: padW, height: padH, shape: "rect", type: "smd" });
  for (let i = 0; i < perSide; i++) pads.push({ id: `${n++}`, x: bodyHalf, y: start + i * pitch, width: padH, height: padW, shape: "rect", type: "smd" });
  for (let i = 0; i < perSide; i++) pads.push({ id: `${n++}`, x: -(start + i * pitch), y: -bodyHalf, width: padW, height: padH, shape: "rect", type: "smd" });
  return pads;
}

// THT inline header: n pads on `pitch` spacing in a row
function inlineHeader(n: number, pitch: number, drill: number, pad: number): FootprintPad[] {
  const pads: FootprintPad[] = [];
  const x0 = -((n - 1) / 2) * pitch;
  for (let i = 0; i < n; i++) {
    pads.push({ id: `${i + 1}`, x: x0 + i * pitch, y: 0, width: pad, height: pad, shape: i === 0 ? "rect" : "circle", type: "tht" });
  }
  return pads;
}

const FOOTPRINTS: FootprintDefinition[] = [
  // Chip passives (2-pad SMD)
  { id: "FP_0402", name: "0402", mountType: "SMT", dimensions: { width: 1.0, height: 0.5 }, pads: twoPad(0.9, 0.5, 0.6) },
  { id: "FP_0603", name: "0603", mountType: "SMT", dimensions: { width: 1.6, height: 0.8 }, pads: twoPad(1.5, 0.8, 0.95) },
  { id: "FP_1206", name: "1206", mountType: "SMT", dimensions: { width: 3.2, height: 1.6 }, pads: twoPad(2.8, 1.2, 1.8) },
  // LED / diode small outline
  { id: "FP_SOD123", name: "SOD-123", mountType: "SMT", dimensions: { width: 3.7, height: 1.5 }, pads: twoPad(3.0, 1.0, 1.2) },
  { id: "FP_LED0805", name: "LED-0805", mountType: "SMT", dimensions: { width: 2.0, height: 1.25 }, pads: twoPad(1.8, 0.9, 1.3) },
  // Electrolytic / tantalum (radial-ish SMD)
  { id: "FP_CAP_ELEC_6.3", name: "CAP-Elec-6.3mm", mountType: "SMT", dimensions: { width: 6.6, height: 6.6 }, pads: twoPad(5.2, 1.6, 2.4) },
  // Transistors / small ICs
  { id: "FP_SOT23", name: "SOT-23", mountType: "SMT", dimensions: { width: 2.9, height: 1.3 }, pads: [
    { id: "1", x: -0.95, y: 0.95, width: 0.6, height: 0.9, shape: "rect", type: "smd" },
    { id: "2", x: 0.95, y: 0.95, width: 0.6, height: 0.9, shape: "rect", type: "smd" },
    { id: "3", x: 0, y: -0.95, width: 0.6, height: 0.9, shape: "rect", type: "smd" }
  ]},
  { id: "FP_SOT23_5", name: "SOT-23-5", mountType: "SMT", dimensions: { width: 2.9, height: 1.6 }, pads: [
    { id: "1", x: -0.95, y: 0.95, width: 0.6, height: 0.9, shape: "rect", type: "smd" },
    { id: "2", x: 0, y: 0.95, width: 0.6, height: 0.9, shape: "rect", type: "smd" },
    { id: "3", x: 0.95, y: 0.95, width: 0.6, height: 0.9, shape: "rect", type: "smd" },
    { id: "4", x: 0.95, y: -0.95, width: 0.6, height: 0.9, shape: "rect", type: "smd" },
    { id: "5", x: -0.95, y: -0.95, width: 0.6, height: 0.9, shape: "rect", type: "smd" }
  ]},
  // Power regulator DPAK
  { id: "FP_TO252", name: "TO-252 (DPAK)", mountType: "SMT", dimensions: { width: 6.5, height: 6.1 }, pads: [
    { id: "1", x: -2.3, y: 2.4, width: 1.2, height: 1.6, shape: "rect", type: "smd" },
    { id: "2", x: 0, y: 2.4, width: 1.2, height: 1.6, shape: "rect", type: "smd" },
    { id: "3", x: 2.3, y: 2.4, width: 1.2, height: 1.6, shape: "rect", type: "smd" },
    { id: "4", x: 0, y: -1.6, width: 5.4, height: 6.0, shape: "rect", type: "smd" }
  ], hasThermalPad: true },
  // SOIC family
  { id: "FP_SOIC8", name: "SOIC-8", mountType: "SMT", dimensions: { width: 6.0, height: 5.0 }, pinPitch: 1.27, pads: dualRow(8, 1.27, 5.4, 0.6, 1.55) },
  { id: "FP_SOIC8E", name: "SOIC-8-EP", mountType: "SMT", dimensions: { width: 6.0, height: 5.0 }, pinPitch: 1.27, hasThermalPad: true, pads: [
    ...dualRow(8, 1.27, 5.4, 0.6, 1.55),
    { id: "EP", x: 0, y: 0, width: 2.4, height: 3.0, shape: "rect", type: "smd" }
  ]},
  { id: "FP_SOIC14", name: "SOIC-14", mountType: "SMT", dimensions: { width: 8.65, height: 6.0 }, pinPitch: 1.27, pads: dualRow(14, 1.27, 5.4, 0.6, 1.55) },
  { id: "FP_SOIC16", name: "SOIC-16", mountType: "SMT", dimensions: { width: 9.9, height: 6.0 }, pinPitch: 1.27, pads: dualRow(16, 1.27, 5.4, 0.6, 1.55) },
  { id: "FP_TSSOP20", name: "TSSOP-20", mountType: "SMT", dimensions: { width: 6.5, height: 6.4 }, pinPitch: 0.65, pads: dualRow(20, 0.65, 5.8, 0.4, 1.5) },
  // QFN / QFP (MCUs, radios)
  { id: "FP_QFN32", name: "QFN-32", mountType: "SMT", dimensions: { width: 5.0, height: 5.0 }, pinPitch: 0.5, hasThermalPad: true, pads: quad(8, 0.5, 2.45, 0.3, 0.75) },
  { id: "FP_QFN48", name: "QFN-48", mountType: "SMT", dimensions: { width: 7.0, height: 7.0 }, pinPitch: 0.5, hasThermalPad: true, pads: quad(12, 0.5, 3.45, 0.3, 0.75) },
  { id: "FP_LQFP48", name: "LQFP-48", mountType: "SMT", dimensions: { width: 9.0, height: 9.0 }, pinPitch: 0.5, pads: quad(12, 0.5, 4.4, 0.3, 1.4) },
  { id: "FP_LQFP64", name: "LQFP-64", mountType: "SMT", dimensions: { width: 12.0, height: 12.0 }, pinPitch: 0.5, pads: quad(16, 0.5, 5.9, 0.3, 1.4) },
  // RF / module (castellated, e.g. ESP32-WROOM)
  { id: "FP_MODULE_WROOM", name: "Module-WROOM-38", mountType: "SMT", dimensions: { width: 18.0, height: 25.5 }, pinPitch: 1.27, pads: (() => {
    const pads: FootprintPad[] = [];
    let n = 1;
    const sideY0 = -((15 - 1) / 2) * 1.5;
    for (let i = 0; i < 15; i++) pads.push({ id: `${n++}`, x: -8.0, y: sideY0 + i * 1.5, width: 1.5, height: 0.9, shape: "rect", type: "smd" });
    const botX0 = -((8 - 1) / 2) * 1.5;
    for (let i = 0; i < 8; i++) pads.push({ id: `${n++}`, x: botX0 + i * 1.5, y: 11.5, width: 0.9, height: 1.5, shape: "rect", type: "smd" });
    for (let i = 0; i < 15; i++) pads.push({ id: `${n++}`, x: 8.0, y: -(sideY0 + i * 1.5), width: 1.5, height: 0.9, shape: "rect", type: "smd" });
    return pads;
  })() },
  // Connectors
  { id: "FP_USB_C_16", name: "USB-C-Receptacle", mountType: "SMT", dimensions: { width: 9.0, height: 7.5 }, pads: (() => {
    const pads: FootprintPad[] = [];
    const names = ["GND","VBUS","SBU2","CC2","DN2","DP2","DP1","DN1","CC1","SBU1","VBUS2","GND2"];
    const x0 = -((names.length - 1) / 2) * 0.5;
    names.forEach((nm, i) => pads.push({ id: nm, x: x0 + i * 0.5, y: 2.0, width: 0.3, height: 1.2, shape: "rect", type: "smd" }));
    pads.push({ id: "SH1", x: -4.3, y: -1.5, width: 1.5, height: 2.0, shape: "rect", type: "tht" });
    pads.push({ id: "SH2", x: 4.3, y: -1.5, width: 1.5, height: 2.0, shape: "rect", type: "tht" });
    return pads;
  })() },
  { id: "FP_HDR_2x1", name: "Header-2x1-2.54", mountType: "THT", dimensions: { width: 5.08, height: 2.54 }, pinPitch: 2.54, pads: inlineHeader(2, 2.54, 1.0, 1.7) },
  { id: "FP_HDR_4x1", name: "Header-4x1-2.54", mountType: "THT", dimensions: { width: 10.16, height: 2.54 }, pinPitch: 2.54, pads: inlineHeader(4, 2.54, 1.0, 1.7) },
  // Crystals
  { id: "FP_CRYSTAL_SMD", name: "Crystal-3225", mountType: "SMT", dimensions: { width: 3.2, height: 2.5 }, pads: twoPad(2.2, 1.2, 2.4) },
  // Battery / 2-terminal power
  { id: "FP_BAT_2T", name: "Battery-2T", mountType: "THT", dimensions: { width: 10.0, height: 5.0 }, pinPitch: 5.0, pads: inlineHeader(2, 5.0, 1.2, 2.2) }
];

FOOTPRINTS.forEach(fp => GlobalLibrary.registerFootprint(fp));

// Map a generated component's partType (and pin count) to a sensible footprint.
// Returns a footprint id known to exist in the library, or null to let board.ts
// synthesize pads from the component's logical pins.
export function resolveFootprintForPart(partType: string | undefined, pinCount: number): string | null {
  const t = (partType || "").toUpperCase();

  const has = (...keys: string[]) => keys.some(k => t.includes(k));

  // Passives
  if (has("RESISTOR", "RES")) return "FP_0603";
  if (has("CAPACITOR")) return pinCount > 2 ? "FP_SOIC8" : (t.includes("ELEC") || t.includes("TANT") ? "FP_CAP_ELEC_6.3" : "FP_0603");
  if (has("INDUCTOR", "FERRITE", "FUSE")) return "FP_1206";
  if (has("CRYSTAL", "OSCILLATOR", "XTAL")) return "FP_CRYSTAL_SMD";
  if (has("LED")) return "FP_LED0805";
  if (has("DIODE", "ZENER", "SCHOTTKY")) return "FP_SOD123";
  if (has("TRANSISTOR", "MOSFET", "BJT", "NPN", "PNP", "FET")) return "FP_SOT23";

  // Power
  if (has("BATTERY", "LIPO", "CELL")) return "FP_BAT_2T";
  if (has("LDO", "REGULATOR")) return pinCount <= 5 ? "FP_SOT23_5" : "FP_SOIC8E";
  if (has("BUCK", "BOOST", "CONVERTER", "CHARGER", "PMIC", "FUEL")) return pinCount > 16 ? "FP_QFN48" : (pinCount > 8 ? "FP_SOIC16" : "FP_SOIC8E");

  // Connectors
  if (has("USB_C", "USB-C", "USBC")) return "FP_USB_C_16";
  if (has("HEADER_4", "HDR_4", "4PIN")) return "FP_HDR_4x1";
  if (has("HEADER", "HDR", "2PIN", "BUTTON", "SWITCH", "RELAY", "JST", "CONNECTOR")) return "FP_HDR_2x1";

  // ICs / MCUs / radios — choose by pin count
  if (has("ESP32", "WROOM", "WROVER", "MODULE")) return "FP_MODULE_WROOM";
  if (has("STM32", "MCU", "MICROCONTROLLER", "PROCESSOR", "FPGA", "ESP", "RP2040", "ATMEGA", "PIC")) {
    if (pinCount > 48) return "FP_LQFP64";
    if (pinCount > 32) return "FP_LQFP48";
    return "FP_QFN32";
  }
  if (has("CC1101", "NRF", "RADIO", "RF", "TRANSCEIVER", "ST25R", "NFC", "PN532")) return "FP_QFN32";
  if (has("OPAMP", "OP_AMP", "AMPLIFIER", "COMPARATOR")) return pinCount <= 5 ? "FP_SOT23_5" : "FP_SOIC8";
  if (has("SENSOR", "ADC", "DAC", "EEPROM", "FLASH", "RTC", "IC")) return pinCount > 8 ? "FP_SOIC14" : "FP_SOIC8";

  // Generic IC fallback by pin count
  if (pinCount > 48) return "FP_LQFP64";
  if (pinCount > 32) return "FP_LQFP48";
  if (pinCount > 20) return "FP_QFN32";
  if (pinCount > 16) return "FP_TSSOP20";
  if (pinCount > 8) return "FP_SOIC16";
  if (pinCount > 3) return "FP_SOIC8";

  return null;
}
