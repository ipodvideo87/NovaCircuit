import { ProjectGraph, PCBComponent, Net, Point, AIAction, PinType, NetType } from '../types';

/**
 * Catalog entry for standardized components.
 */
export interface CatalogComponent {
  partNumber: string;
  partType: string;
  footprint: string;
  pins: { name: string; type: PinType }[];
  properties: Record<string, string | number>;
  recommendedDecouplingUf?: number[];
  inputVoltageLimitRange?: [number, number]; // [Min, Max] Volts
  outputVoltageRating?: number; // Volts
  maxCurrentRatingAmps?: number; // Amps
}

/**
 * Structured engineering intent extracted from natural language prompts.
 */
export interface DesiredIntentGoals {
  systemRole: string;
  powerSourceVoltagev: number;
  intermediateRailsV: number[];
  mcuRequired: boolean;
  requiredPeripherals: ("UART" | "SPI" | "I2C" | "RESET_SW")[];
  lowNoiseFiltering: boolean;
}

/**
 * Synthesis audit trace reporting health and component choices.
 */
export interface SchematicSynthesisReport {
  synthesisId: string;
  intentSummary: string;
  chosenPowerRegulatorPart?: string;
  decouplingCapCount: number;
  totalNetsSynthesized: number;
  warnings: string[];
  ercValid: boolean;
}

/**
 * Component Catalog Database storing physical component characteristics.
 */
export const COMPONENT_INTELLIGENCE_DB: Record<string, CatalogComponent> = {
  "ESP32-WROOM-32E": {
    partNumber: "ESP32-WROOM-32E",
    partType: "MCU",
    footprint: "ESP32-MODULE",
    pins: [
      { name: "3V3", type: "power_in" },
      { name: "EN", type: "input" }, // Reset/Enable
      { name: "IO34", type: "input" },
      { name: "IO35", type: "input" },
      { name: "TXD0", type: "output" },
      { name: "RXD0", type: "input" },
      { name: "IO21", type: "bidirectional" }, // SDA
      { name: "IO22", type: "bidirectional" }, // SCL
      { name: "GND", type: "ground" }
    ],
    properties: { MCU_Core: "Xtensa 双核", Value: "ESP32" }
  },
  "AP2112K-3.3TRG1": {
    partNumber: "AP2112K-3.3TRG1",
    partType: "LDO Regulator",
    footprint: "SOT-23-5",
    pins: [
      { name: "VIN", type: "power_in" },
      { name: "GND", type: "ground" },
      { name: "EN", type: "input" },
      { name: "BYP", type: "passive" },
      { name: "VOUT", type: "power_out" }
    ],
    properties: { Output_Voltage: 3.3, Value: "3.3V LDO", Max_Current: "0.6A" },
    inputVoltageLimitRange: [3.8, 6.0],
    outputVoltageRating: 3.3,
    maxCurrentRatingAmps: 0.6
  },
  "MP1584EN": {
    partNumber: "MP1584EN",
    partType: "Step-Down Switcher",
    footprint: "SOIC-8-EP",
    pins: [
      { name: "SW", type: "power_out" },
      { name: "EN", type: "input" },
      { name: "COMP", type: "passive" },
      { name: "FB", type: "input" },
      { name: "GND", type: "ground" },
      { name: "VIN", type: "power_in" },
      { name: "BST", type: "passive" },
      { name: "FREQ", type: "passive" }
    ],
    properties: { Recommended_Frequency: "1.5MHz", Output_Voltage: "Adjustable", Value: "Buck Regulator" },
    inputVoltageLimitRange: [4.5, 28.0],
    maxCurrentRatingAmps: 3.0
  },
  "CAP-10UF-0805": {
    partNumber: "CAP-10UF-0805",
    partType: "Capacitor",
    footprint: "0805",
    pins: [
      { name: "1", type: "passive" },
      { name: "2", type: "passive" }
    ],
    properties: { Value: "10uF", Voltage: "16V", Tolerance: "10%" }
  },
  "CAP-0.1UF-0603": {
    partNumber: "CAP-0.1UF-0603",
    partType: "Capacitor",
    footprint: "0603",
    pins: [
      { name: "1", type: "passive" },
      { name: "2", type: "passive" }
    ],
    properties: { Value: "0.1uF", Voltage: "25V", Tolerance: "10%" }
  },
  "RES-10K-0603": {
    partNumber: "RES-10K-0603",
    partType: "Resistor",
    footprint: "0603",
    pins: [
      { name: "1", type: "passive" },
      { name: "2", type: "passive" }
    ],
    properties: { Value: "10k", Power: "1/10W", Tolerance: "1%" }
  },
  "SW-TACT-PTS645": {
    partNumber: "SW-TACT-PTS645",
    partType: "Switch",
    footprint: "SW_4PIN",
    pins: [
      { name: "1", type: "passive" },
      { name: "2", type: "passive" }
    ],
    properties: { Value: "Tactile Switch" }
  }
};

/**
 * Production-grade AI schematic synthesis engine.
 * Generates verified, clean, logical circuit designs matching intent.
 */
export class SchematicSynthesisRuntime {
  /**
   * Translates unstructured user text blocks into clean schematic specifications rules.
   */
  public parseEngineeringIntent(prompt: string): DesiredIntentGoals {
    const text = prompt.toUpperCase();
    
    // Fallback defaults
    let mcu = false;
    let powerVolt = 5.0;
    const intermediateRails: number[] = [];
    const peripherals: ("UART" | "SPI" | "I2C" | "RESET_SW")[] = [];

    if (text.includes("ESP32") || text.includes("MCU") || text.includes("CONTROLLER") || text.includes("PROCESSOR")) {
      mcu = true;
    }
    if (text.includes("12V")) {
      powerVolt = 12.0;
    } else if (text.includes("5V")) {
      powerVolt = 5.0;
    }
    if (text.includes("3.3") || text.includes("3V3")) {
      intermediateRails.push(3.3);
    }
    if (text.includes("UART") || text.includes("SERIAL") || text.includes("TX")) {
      peripherals.push("UART");
    }
    if (text.includes("I2C") || text.includes("SDA")) {
      peripherals.push("I2C");
    }
    if (text.includes("SPI") || text.includes("MISO")) {
      peripherals.push("SPI");
    }
    if (text.includes("RESET") || text.includes("BUTTON") || text.includes("SWITCH")) {
      peripherals.push("RESET_SW");
    }

    return {
      systemRole: mcu ? "Embedded MCU System Controller" : "Power Regulation Distribution Block",
      powerSourceVoltagev: powerVolt,
      intermediateRailsV: intermediateRails.length > 0 ? intermediateRails : [3.3],
      mcuRequired: mcu,
      requiredPeripherals: peripherals,
      lowNoiseFiltering: text.includes("LOW NOISE") || text.includes("CLEAN") || text.includes("PDN")
    };
  }

  /**
   * High-fidelity circuit topology synthesis generator.
   */
  public synthesizeSchematic(intent: DesiredIntentGoals): { graph: ProjectGraph; actions: AIAction[]; report: SchematicSynthesisReport } {
    const graph: ProjectGraph = {
      components: [],
      nets: []
    };
    const actions: AIAction[] = [];
    const warnings: string[] = [];

    let currentX = 10;
    let currentY = 10;
    const spacingX = 40;

    // Helper utility to instantiate component safely
    const instantiateComponent = (catalogKey: string, designator: string, x: number, y: number): PCBComponent => {
      const template = COMPONENT_INTELLIGENCE_DB[catalogKey];
      if (!template) {
        throw new Error(`Catalog key [${catalogKey}] does not exist in component database.`);
      }
      const comp: PCBComponent = {
        id: `comp_${designator.toLowerCase()}_${Date.now()}`,
        designator,
        partType: template.partType,
        partNumber: template.partNumber,
        footprint: template.footprint,
        position: { x, y },
        pins: JSON.parse(JSON.stringify(template.pins)),
        properties: JSON.parse(JSON.stringify(template.properties)),
        metadata: {
          voltageRating: template.outputVoltageRating,
          currentRating: template.maxCurrentRatingAmps,
          packageType: template.footprint
        }
      };
      graph.components.push(comp);

      actions.push({
        name: "create_component",
        args: {
          id: comp.id,
          designator,
          partType: comp.partType,
          footprint: comp.footprint,
          x,
          y,
          properties: comp.properties
        },
        reasoning: `Instantiating catalog component ${comp.partNumber} [${designator}] at coordinates (${x}, ${y}).`
      });

      return comp;
    };

    // Helper utility to route nets safely using semantic names
    const connectPinsSemantic = (netName: string, pins: { comp: PCBComponent; pinName: string }[], netClass: "POWER" | "GROUND" | "SIGNAL" = "SIGNAL") => {
      let existingNet = graph.nets.find(n => n.name === netName);
      if (!existingNet) {
        existingNet = {
          id: `net_${netName.replace(/[^A-Za-z0-9]/g, "_").toLowerCase()}_${Date.now()}`,
          name: netName,
          netClass,
          type: netClass === "POWER" ? "power" : (netClass === "GROUND" ? "ground" : "signal"),
          connections: []
        };
        graph.nets.push(existingNet);
      }

      pins.forEach(p => {
        // Double-check pin exists
        const checkPin = p.comp.pins.some(pi => pi.name === p.pinName);
        if (!checkPin) {
          warnings.push(`ERC Warning: Target Pin [${p.pinName}] not declared on component ${p.comp.designator}. Adding pin to footprint to preserve integrity.`);
          p.comp.pins.push({ name: p.pinName, type: "passive" });
        }

        existingNet!.connections.push({
          componentId: p.comp.id,
          pinName: p.pinName
        });

        actions.push({
          name: "connect_pin_net",
          args: {
            componentId: p.comp.id,
            pinName: p.pinName,
            netId: existingNet!.id,
            netName
          },
          reasoning: `Wiring pin ${p.comp.designator}.${p.pinName} in circuit node [${netName}].`
        });
      });
    };

    // --- 1. Regulator Selection & Power Synthesis Architecture ---
    let mainOutputComp: PCBComponent | null = null;
    let chosenRegulator = "";

    // Input Voltage rails configurations
    const rawPowerV = intent.powerSourceVoltagev;
    const target3V3Required = intent.intermediateRailsV.includes(3.3) || intent.mcuRequired;

    if (target3V3Required) {
      if (rawPowerV <= 6.0) {
        // Low voltage drop - Select LDO regulator
        chosenRegulator = "AP2112K-3.3TRG1";
        mainOutputComp = instantiateComponent(chosenRegulator, "U1", currentX, currentY);
      } else {
        // High voltage step down (12V Input) - Select switching Buck regulator
        chosenRegulator = "MP1584EN";
        mainOutputComp = instantiateComponent(chosenRegulator, "U1", currentX, currentY);
      }
      currentX += spacingX;
    }

    // Connect power source input V_IN node
    const dummyHeader = instantiateComponent("RES-10K-0603", "R_IN", 10, currentY + 15); // Emulates supply connector landing
    if (mainOutputComp) {
      connectPinsSemantic("+V_IN", [
        { comp: dummyHeader, pinName: "1" },
        { comp: mainOutputComp, pinName: "VIN" }
      ], "POWER");

      // Connect Regulator feedback regulator EN (enable) pin to supply to pull active
      connectPinsSemantic("+V_IN", [
        { comp: mainOutputComp, pinName: "EN" }
      ], "POWER");

      // Connect standard ground reference returning node
      connectPinsSemantic("GND", [
        { comp: dummyHeader, pinName: "2" },
        { comp: mainOutputComp, pinName: "GND" }
      ], "GROUND");
    }

    // --- 2. Decoupling Capacitors Synthesis Loop (PDN filtering) ---
    let decouplingCount = 0;
    if (mainOutputComp) {
      // Input decoupling: 10uF ceramic bulk cap
      const cIn = instantiateComponent("CAP-10UF-0805", "C1", mainOutputComp.position.x - 12, mainOutputComp.position.y + 12);
      connectPinsSemantic("+V_IN", [{ comp: cIn, pinName: "1" }], "POWER");
      connectPinsSemantic("GND", [{ comp: cIn, pinName: "2" }], "GROUND");
      decouplingCount++;

      // Output decoupling: 10uF + 0.1uF parallel capacitor combination for noise suppression
      const cOut1 = instantiateComponent("CAP-10UF-0805", "C2", mainOutputComp.position.x + 12, mainOutputComp.position.y + 12);
      connectPinsSemantic("+3V3", [{ comp: cOut1, pinName: "1" }], "POWER");
      connectPinsSemantic("GND", [{ comp: cOut1, pinName: "2" }], "GROUND");
      decouplingCount++;

      if (intent.lowNoiseFiltering) {
        const cOut2 = instantiateComponent("CAP-0.1UF-0603", "C3", mainOutputComp.position.x + 18, mainOutputComp.position.y + 12);
        connectPinsSemantic("+3V3", [{ comp: cOut2, pinName: "1" }], "POWER");
        connectPinsSemantic("GND", [{ comp: cOut2, pinName: "2" }], "GROUND");
        decouplingCount++;
      }

      // VOUT line connection
      const outputPin = chosenRegulator === "MP1584EN" ? "SW" : "VOUT";
      connectPinsSemantic("+3V3", [{ comp: mainOutputComp, pinName: outputPin }], "POWER");
    }

    // --- 3. Microcontroller Embedded Core Integration ---
    let mcuComp: PCBComponent | null = null;
    if (intent.mcuRequired) {
      mcuComp = instantiateComponent("ESP32-WROOM-32E", "U2", currentX, currentY);
      currentX += spacingX;

      // Bind MCU power supplies
      connectPinsSemantic("+3V3", [{ comp: mcuComp, pinName: "3V3" }], "POWER");
      connectPinsSemantic("GND", [{ comp: mcuComp, pinName: "GND" }], "GROUND");

      // Wire local decoupling bypass cap near controller rails
      const cMcu = instantiateComponent("CAP-0.1UF-0603", "C4", mcuComp.position.x - 10, mcuComp.position.y + 15);
      connectPinsSemantic("+3V3", [{ comp: cMcu, pinName: "1" }], "POWER");
      connectPinsSemantic("GND", [{ comp: cMcu, pinName: "2" }], "GROUND");
      decouplingCount++;
    }

    // --- 4. Peripherals, Reset Button and Signal classification ---
    if (mcuComp) {
      if (intent.requiredPeripherals.includes("RESET_SW")) {
        // Synthesise MCU hardware reset line: 10K pull-up and tactile button
        const rRst = instantiateComponent("RES-10K-0603", "R_RST", mcuComp.position.x + 10, mcuComp.position.y - 12);
        const sRst = instantiateComponent("SW-TACT-PTS645", "SW_RST", mcuComp.position.x + 10, mcuComp.position.y - 25);

        connectPinsSemantic("+3V3", [{ comp: rRst, pinName: "1" }], "POWER");
        connectPinsSemantic("MCU_EN_RESET", [
          { comp: rRst, pinName: "2" },
          { comp: sRst, pinName: "1" },
          { comp: mcuComp, pinName: "EN" }
        ], "SIGNAL");

        connectPinsSemantic("GND", [{ comp: sRst, pinName: "2" }], "GROUND");
      }

      if (intent.requiredPeripherals.includes("UART")) {
        // Expose UART tx/rx endpoints via landing resistive testpoints
        const rTx = instantiateComponent("RES-10K-0603", "R_TX", mcuComp.position.x + 15, mcuComp.position.y + 15);
        const rRx = instantiateComponent("RES-10K-0603", "R_RX", mcuComp.position.x + 15, mcuComp.position.y + 25);

        connectPinsSemantic("UART_TX_DIGITAL", [
          { comp: mcuComp, pinName: "TXD0" },
          { comp: rTx, pinName: "1" }
        ], "SIGNAL");

        connectPinsSemantic("UART_RX_DIGITAL", [
          { comp: mcuComp, pinName: "RXD0" },
          { comp: rRx, pinName: "1" }
        ], "SIGNAL");
      }
    }

    // --- 5. Circuit Validation & Electrical Rule Checker (ERC) ---
    const ercReport = this.runERCAnalysis(graph);

    return {
      graph,
      actions,
      report: {
        synthesisId: `sch_synth_${Date.now()}`,
        intentSummary: intent.systemRole,
        chosenPowerRegulatorPart: chosenRegulator || undefined,
        decouplingCapCount: decouplingCount,
        totalNetsSynthesized: graph.nets.length,
        warnings: ercReport.warnings,
        ercValid: ercReport.errorsCount === 0
      }
    };
  }

  /**
   * Static rule checker asserting electrical rule ERC violations.
   */
  public runERCAnalysis(graph: ProjectGraph): { errorsCount: number; warnings: string[]; reports: string[] } {
    const warnings: string[] = [];
    const reports: string[] = [];
    let errors = 0;

    // Rule 1: Assert Ground exists
    const hasGnd = graph.nets.some(n => n.name === "GND");
    if (!hasGnd) {
      errors++;
      warnings.push("ERC Error: No dedicated reference GROUND node (GND) identified.");
    }

    // Rule 2: Assert decoupling caps contain active ground pin reference
    const caps = graph.components.filter(c => c.partType === "Capacitor");
    caps.forEach(c => {
      // Find nets containing this cap
      const associatedNets = graph.nets.filter(n => n.connections.some(conn => conn.componentId === c.id));
      const hasGndPin = associatedNets.some(n => n.name === "GND");
      const hasPowerPin = associatedNets.some(n => n.name.includes("+V_IN") || n.name.includes("+3V3"));

      if (associatedNets.length < 2) {
        errors++;
        warnings.push(`ERC Error: Disconnected decoupling capacitor ${c.designator}. Requires 2 node pins connected.`);
      } else if (hasPowerPin && !hasGndPin) {
        warnings.push(`ERC Warning: Regulator filtering decoupling capacitor ${c.designator} is connected to supply rail but lacks return GND reference connection.`);
      }
    });

    // Rule 3: Single power output source driver verification
    graph.nets.forEach(net => {
      if (net.netClass === "POWER") {
        const drivers = net.connections.filter(conn => {
          const comp = graph.components.find(c => c.id === conn.componentId);
          if (!comp) return false;
          const pinDef = comp.pins.find(p => p.name === conn.pinName);
          return pinDef?.type === "power_out";
        });

        if (drivers.length > 1) {
          errors++;
          warnings.push(`ERC Critical: Contention identified on power rail [${net.name}]. Multiple active power drivers detected: [${drivers.map(d => d.componentId).join(", ")}].`);
        }
      }
    });

    return {
      errorsCount: errors,
      warnings,
      reports
    };
  }
}
