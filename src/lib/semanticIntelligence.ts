import { ProjectGraph, PCBComponent, Net } from '../types';

/**
 * High-level classification of an electrical component based on topology and parameters.
 */
export type ComponentFunctionalRole = 
  | "decoupling_capacitor"
  | "pull_up_resistor"
  | "pull_down_resistor"
  | "linear_regulator"
  | "buck_converter"
  | "series_termination"
  | "microcontroller"
  | "esd_protection"
  | "level_shifter"
  | "generic_passive"
  | "generic_active";

/**
 * Represents electrical metadata inferred from physical parameters.
 */
export interface ComponentSemanticDescriptor {
  componentId: string;
  designator: string;
  functionalRole: ComponentFunctionalRole;
  targetPowerDomain?: string; // e.g. "3V3" or "5V"
  associatedNets: string[];   // Net IDs or names connected directly
  criticalFrequencyHz?: number; // For clock oscillators or switching nodes
  maxCurrentAmps?: number;
}

/**
 * Isolated Power Domain representation inside a ProjectGraph.
 */
export interface PowerDomainNode {
  domainId: string;        // e.g., "PWR_3V3"
  nominalVoltage: number;  // 3.3V
  sourceComponentId: string; // Regulator/Converter generating this domain
  loadComponentIds: string[];
  groundIndexId: string;   // Associated return GND net
}

/**
 * Semantic flow connection linking source drivers to electrical sinks.
 */
export interface SignalPathSegment {
  sourcePin: string;       // e.g. "U1.GPIO1"
  sinkPins: string[];      // e.g. ["U2.IN", "U3.EN"]
  signalCategory: "high_speed_clock" | "analog_rf" | "power_rail" | "ground_return" | "low_speed_digital" | "reset_line";
  impedanceTargetOhms?: number;
}

/**
 * Compilation segment sent as context package for LLM models.
 */
export interface SemanticProjectDigest {
  componentsCount: number;
  semanticDescriptors: ComponentSemanticDescriptor[];
  powerDomains: PowerDomainNode[];
  signalPaths: SignalPathSegment[];
  topologyHeuristicsWarnings: string[];
}

/**
 * Production-grade Electrical Engineering Semantic Intelligence Engine.
 * Analyzes schematics and physical boards to provide semantic, topological reasoning.
 */
export class EngineeringSemanticRuntime {
  private descriptors: Map<string, ComponentSemanticDescriptor> = new Map();
  private powerDomains: PowerDomainNode[] = [];
  private signalPaths: SignalPathSegment[] = [];

  constructor() {}

  /**
   * Topologically analyzes the project graph to infer electrical roles and signals.
   */
  public analyzeGraphSemantics(graph: ProjectGraph): SemanticProjectDigest {
    this.descriptors.clear();
    this.powerDomains = [];
    this.signalPaths = [];
    const warnings: string[] = [];

    const allComponents = [
      ...graph.components,
      ...(graph.sheets?.flatMap(s => s.components) || [])
    ];

    const allNets = [
      ...graph.nets,
      ...(graph.sheets?.flatMap(s => s.nets) || [])
    ];

    // 1. Identify Component Roles through Heuristic Parameter Parsing
    allComponents.forEach(comp => {
      const role = this.inferFunctionalRole(comp, allNets);
      const associatedNets = allNets
        .filter(n => n.connections.some(c => c.componentId === comp.id))
        .map(n => n.name);

      let targetRegDomain: string | undefined = undefined;
      if (role === "linear_regulator" || role === "buck_converter") {
        targetRegDomain = associatedNets.find(n => n.includes("3V3") || n.includes("3.3V") || n.includes("5V")) || "VCC";
      }

      this.descriptors.set(comp.id, {
        componentId: comp.id,
        designator: comp.designator,
        functionalRole: role,
        targetPowerDomain: targetRegDomain,
        associatedNets,
        maxCurrentAmps: role === "buck_converter" ? 2.5 : 0.5
      });
    });

    // 2. Classify Power Domains
    const sourceRegulators = Array.from(this.descriptors.values()).filter(
      d => d.functionalRole === "linear_regulator" || d.functionalRole === "buck_converter"
    );

    sourceRegulators.forEach((reg, index) => {
      const outputNet = reg.associatedNets.find(n => n.includes("VCC") || n.includes("3V3") || n.includes("5V")) || "VCC";
      const groundNet = reg.associatedNets.find(n => n.toLowerCase().includes("gnd") || n.toLowerCase().includes("ground")) || "GND";
      
      const loads = allComponents
        .filter(c => c.id !== reg.componentId && allNets.some(n => n.name === outputNet && n.connections.some(p => p.componentId === c.id)))
        .map(c => c.id);

      this.powerDomains.push({
        domainId: `pwr_domain_${index}_${outputNet}`,
        nominalVoltage: outputNet.includes("3V3") ? 3.3 : outputNet.includes("5V") ? 5.0 : 1.2,
        sourceComponentId: reg.componentId,
        loadComponentIds: loads,
        groundIndexId: groundNet
      });
    });

    // 3. Topology Heuristics: Verify decoupling capacitor presence
    const digitalICs = Array.from(this.descriptors.values()).filter(d => d.functionalRole === "microcontroller");
    digitalICs.forEach(ic => {
      const icNets = ic.associatedNets;
      const powerNet = icNets.find(n => n.includes("VCC") || n.includes("3V3") || n.includes("5V"));
      const gndNet = icNets.find(n => n.toLowerCase().includes("gnd"));

      if (powerNet && gndNet) {
        // Find if there is a decoupling capacitor bridging these nets
        const caps = Array.from(this.descriptors.values()).filter(c => c.functionalRole === "decoupling_capacitor");
        const hasDecoupling = caps.some(cap => cap.associatedNets.includes(powerNet) && cap.associatedNets.includes(gndNet));

        if (!hasDecoupling) {
          warnings.push(`Topological Warning: Digital Processor (${ic.designator}) lacks nearby decoupling capacitors on power domain (${powerNet}). This is a signal-integrity liability.`);
        }
      }
    });

    // 4. Derive high-speed signal flow routes (differential pairs & clocks)
    allNets.forEach(net => {
      if (net.netClass === "DIFFERENTIAL" || net.name.includes("_P") || net.name.includes("_N")) {
        this.signalPaths.push({
          sourcePin: net.connections[0] ? `${net.connections[0].componentId}.${net.connections[0].pinName}` : "unbound",
          sinkPins: net.connections.slice(1).map(c => `${c.componentId}.${c.pinName}`),
          signalCategory: "high_speed_clock",
          impedanceTargetOhms: 90
        });
      }
    });

    return {
      componentsCount: allComponents.length,
      semanticDescriptors: Array.from(this.descriptors.values()),
      powerDomains: this.powerDomains,
      signalPaths: this.signalPaths,
      topologyHeuristicsWarnings: warnings
    };
  }

  /**
   * Internal heuristic matcher to infer electrical component function based on pins, name and value.
   */
  private inferFunctionalRole(comp: PCBComponent, nets: Net[]): ComponentFunctionalRole {
    const partLower = comp.partType.toLowerCase();
    const desLower = comp.designator.toLowerCase();
    
    // Check Microcontrollers
    if (partLower.includes("mcu") || partLower.includes("esp32") || partLower.includes("stm32") || desLower.startsWith("u")) {
      const pinCount = comp.pins.length;
      if (pinCount > 8) {
        return "microcontroller";
      }
    }

    // Check Resistors / Capacitors
    if (partLower.includes("resistor") || desLower.startsWith("r")) {
      // Check for pullups/pulldowns: one pin on Power or GND, one pin on general IO interface
      const isPullUp = nets.some(n => 
        (n.name.includes("VCC") || n.name.includes("3V3") || n.name.includes("5V")) &&
        n.connections.some(c => c.componentId === comp.id)
      );
      const isPullDown = nets.some(n => 
        (n.name.toLowerCase().includes("gnd") || n.name.toLowerCase().includes("ground")) &&
        n.connections.some(c => c.componentId === comp.id)
      );

      if (isPullUp) return "pull_up_resistor";
      if (isPullDown) return "pull_down_resistor";
      return "generic_passive";
    }

    if (partLower.includes("capacitor") || desLower.startsWith("c")) {
      // If bridging a high voltage rail and ground - highly likely decoupling
      const touchesPower = nets.some(n => 
        (n.name.includes("VCC") || n.name.includes("3V3") || n.name.includes("5V")) &&
        n.connections.some(c => c.componentId === comp.id)
      );
      const touchesGnd = nets.some(n => 
        (n.name.toLowerCase().includes("gnd") || n.name.toLowerCase().includes("ground")) &&
        n.connections.some(c => c.componentId === comp.id)
      );

      if (touchesPower && touchesGnd) {
        return "decoupling_capacitor";
      }
      return "generic_passive";
    }

    // Check Regulators/Converters
    if (partLower.includes("regulator") || desLower.startsWith("reg") || desLower.startsWith("wr")) {
      return "linear_regulator";
    }
    if (partLower.includes("buck") || partLower.includes("converter") || partLower.includes("dc-dc")) {
      return "buck_converter";
    }

    return "generic_active";
  }
}
