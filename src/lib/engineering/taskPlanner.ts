import { ProjectGraph } from '../../types';
import { TaskGraph, TaskNode } from './taskGraph';
import { EngineeringMacros } from './engineeringMacros';

export interface PlanningContext {
  graph: ProjectGraph;
  preferredCenter?: { x: number; y: number };
}

export class TaskPlanner {

  /**
   * Decomposes high level structural descriptions into deterministic multi-stage dependency DAG task graphs.
   */
  public planEngineeringGoal(goal: string, context: PlanningContext): TaskGraph {
    const graph = new TaskGraph();
    const gLower = goal.toLowerCase();
    
    // Choose coordinate center points
    const px = context.preferredCenter?.x ?? 150;
    const py = context.preferredCenter?.y ?? 150;

    // 1. ESP32 Subsystem Planning Strategy
    if (gLower.includes('esp32') || gLower.includes('mcu subsystem') || gLower.includes('esp-wroom')) {
      // Step A: Deploy processor and LDO voltage regulative stage
      graph.addNode({
        id: 'esp32_root_place',
        name: 'Deploy ESP32 SoC Core & Power Inputs',
        description: 'Instantiate and arrange ESP32 processor blocks alongside voltage regulation logic.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandESP32Subsystem(px, py).filter(a => a.name === 'create_component' && (a.args.id.includes('REG') || a.args.id.includes('DEC') || a.args.id.includes('ESP')))
      });

      // Step B: Set oscillator frequency timing networks
      graph.addNode({
        id: 'esp32_timing_crystal',
        name: 'Timing Crystal Tuning & Grid Routing',
        description: 'Place 40MHz reference clocks and establish low parasitic connection traces.',
        status: 'pending',
        dependencies: ['esp32_root_place'],
        actions: EngineeringMacros.expandESP32Subsystem(px, py).filter(a => a.name === 'create_component' && a.args.id.includes('OSC'))
      });

      // Step C: Link critical power rails & connections
      graph.addNode({
        id: 'esp32_wiring',
        name: 'Inter-Block Schematic Wire Integrity',
        description: 'Perform pin-by-pin trace connections between regulator and ESP32 power pins.',
        status: 'pending',
        dependencies: ['esp32_timing_crystal'],
        actions: EngineeringMacros.expandESP32Subsystem(px, py).filter(a => a.name === 'add_connection')
      });

      // Step D: Shield and clear RF Antenna Keepout bounds
      graph.addNode({
        id: 'esp32_rf_keepout',
        name: 'Antenna Impedance Keepout Placement',
        description: 'Establish copper-free RF signal path zones below antenna patch pins.',
        status: 'pending',
        dependencies: ['esp32_wiring'],
        actions: EngineeringMacros.expandESP32Subsystem(px, py).filter(a => a.name === 'add_copper_pour')
      });
    }

    // 2. Buck Converter Power Stage Strategy
    else if (gLower.includes('buck') || gLower.includes('converter') || gLower.includes('regulator stage')) {
      graph.addNode({
        id: 'buck_ic_layout',
        name: 'Instantiate Buck Switching chip & Catch Diodes',
        description: 'Mount high frequency switcher control chip and matching barrier diode closely.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandBuckConverter(px, py).filter(a => a.name === 'create_component' && (a.args.id.includes('BUCK') || a.args.id.includes('SCHOTTKY')))
      });

      graph.addNode({
        id: 'buck_choke_filter',
        name: 'Inject Power Inductor & Bulk Reservoirs',
        description: 'Assemble energy reservoirs using shielded inductors and bypass bulk capacitors.',
        status: 'pending',
        dependencies: ['buck_ic_layout'],
        actions: EngineeringMacros.expandBuckConverter(px, py).filter(a => a.name === 'create_component' && (a.args.id.includes('IND') || a.args.id.includes('IN') || a.args.id.includes('OUT')))
      });

      graph.addNode({
        id: 'buck_copper_pours',
        name: 'Heavy Power Polygon Overlays',
        description: 'Lay out wide high conductance low impedance copper trace pours across high current paths.',
        status: 'pending',
        dependencies: ['buck_choke_filter'],
        actions: EngineeringMacros.expandBuckConverter(px, py).filter(a => a.name === 'add_copper_pour')
      });
    }

    // 3. USB Differential Pair Routing Strategy
    else if (gLower.includes('usb-c pd') || gLower.includes('usb pd') || gLower.includes('power delivery')) {
      graph.addNode({
        id: 'usbc_pd_connector',
        name: 'Deploy USB-C Receptacle Replicated Ports',
        description: 'Position 16-pin tactile USB-C receptacle connector and static TVS protection arrays.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandUSBCPD(px, py).filter(a => a.name === 'create_component' && (a.args.id.includes('USBC') || a.args.id.includes('TVS')))
      });

      graph.addNode({
        id: 'usbc_pd_phy_ic',
        name: 'Active FUSB302 PD PHY Controller Mount',
        description: 'Mount tiny active FUSB302 controller PHY chip near receptacle pin branches.',
        status: 'pending',
        dependencies: ['usbc_pd_connector'],
        actions: EngineeringMacros.expandUSBCPD(px, py).filter(a => a.name === 'create_component' && a.args.id.includes('CTRL'))
      });

      graph.addNode({
        id: 'usbc_pd_wiring',
        name: 'CC1/CC2 Negotiation Signal Links',
        description: 'Symmetrically link Configuration Channel (CC) inputs directly to negotiating controller CC ports.',
        status: 'pending',
        dependencies: ['usbc_pd_phy_ic'],
        actions: EngineeringMacros.expandUSBCPD(px, py).filter(a => a.name === 'add_connection')
      });
    }

    else if (gLower.includes('usb') || gLower.includes('differential pair') || gLower.includes('diff pair')) {
      graph.addNode({
        id: 'diff_pair_route',
        name: 'Tightly Coupled Parallel Diff-Pair Routing',
        description: 'Route two symmetric length-matched impedance controlled parallel lines.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandUSBDifferentialPair(px, py, px + 50, py + 30)
      });
    }

    else if (gLower.includes('clock distribution') || gLower.includes('si5338') || gLower.includes('clock buf')) {
      graph.addNode({
        id: 'clock_dist_ic',
        name: 'Deploy Clock Buffer IC Tree Controller',
        description: 'Deploy Si5338 clock distributor and output series impedance termination resistors.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandClockDistribution(px, py).filter(a => a.name === 'create_component')
      });

      graph.addNode({
        id: 'clock_dist_wiring',
        name: 'Series Termination Tree Connections',
        description: 'Symmetrically link Si5338 clock output terminals directly into output damping passives.',
        status: 'pending',
        dependencies: ['clock_dist_ic'],
        actions: EngineeringMacros.expandClockDistribution(px, py).filter(a => a.name === 'add_connection')
      });
    }

    else if (gLower.includes('shielding') || gLower.includes('faraday') || gLower.includes('shield cage')) {
      graph.addNode({
        id: 'emi_shield_cage',
        name: 'Faraday Ground Protection Guard Pour',
        description: 'Construct solid guard frame grounding pours surrounding delicate signal zones.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandEMIShielding(px, py, 35, 30).filter(a => a.name === 'add_copper_pour')
      });

      graph.addNode({
        id: 'emi_shield_stitching',
        name: 'Perimeter Grounding Fence Stitch Vias',
        description: 'Embed standard stitching vias on boundary rails to capture high-frequency EMI leak loops.',
        status: 'pending',
        dependencies: ['emi_shield_cage'],
        actions: EngineeringMacros.expandEMIShielding(px, py, 35, 30).filter(a => a.name === 'add_via_stitching')
      });
    }

    // 4. Power Distribution Network Optimization Strategy
    else if (gLower.includes('optimize power') || gLower.includes('pdn') || gLower.includes('distribution network')) {
      graph.addNode({
        id: 'gnd_plane_solid',
        name: 'Solid Bottom Copper Plane Ground Pour',
        description: 'Saturate entire board bottom copper zone with continuous, low inductance grounding.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandOptimizePDN(px, py).filter(a => a.name === 'add_copper_pour')
      });

      graph.addNode({
        id: 'v_stitching_grid',
        name: 'Conductive Thermal Stitching Matrix',
        description: 'Drill an array of low thermal-drift stitching vias to bypass loop ground currents.',
        status: 'pending',
        dependencies: ['gnd_plane_solid'],
        actions: EngineeringMacros.expandOptimizePDN(px, py).filter(a => a.name === 'add_via_stitching')
      });
    }

    // 5. Decoupling Network Placement Strategy
    else if (gLower.includes('decoupling') || gLower.includes('bypass cap')) {
      // Find a component on board to decoupling
      const target = context.graph.components[0]?.designator || 'U1';
      graph.addNode({
        id: 'decouple_placement',
        name: `Distribute Local Bypass Capacitors closely to ${target}`,
        description: `Optimize high speed decoupling loop inductance by clamping capacitors right on target.`,
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandDecouplingNetwork(target, 3, context.graph)
      });
    }

    // 6. Motor Driver Stage Strategy
    else if (gLower.includes('motor') || gLower.includes('h-bridge') || gLower.includes('driver stage')) {
      graph.addNode({
        id: 'motor_power_ic',
        name: 'H-Bridge Output Controller Assembly',
        description: 'Place H-Bridge IC and solid heavy load terminal blocks.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandMotorDriverStage(px, py).filter(a => a.name === 'create_component' && (a.args.id.includes('MOTOR') || a.args.id.includes('CONN')))
      });

      graph.addNode({
        id: 'flyback_loop_diodes',
        name: 'Protection Catch Freewheeling Diodes',
        description: 'Deploy clamp diodes to absorb voltage spike flyback back-EMFs from motor windings.',
        status: 'pending',
        dependencies: ['motor_power_ic'],
        actions: EngineeringMacros.expandMotorDriverStage(px, py).filter(a => a.name === 'create_component' && a.args.id.includes('CLAMP'))
      });
    }

    // 7. Sensor Interface Generation Strategy
    else if (gLower.includes('sensor') || gLower.includes('analog') || gLower.includes('low-pass')) {
      graph.addNode({
        id: 'opamp2_frontend',
        name: 'Analog Operational Amplification Hub',
        description: 'Place dual instrumentation class operational amplifier IC to buffer source signals.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandSensorInterface(px, py).filter(a => a.name === 'create_component' && a.args.id.includes('OPAMP'))
      });

      graph.addNode({
        id: 'sensor_rc_filter',
        name: 'Analog Lowpass RC Signal Shaper',
        description: 'Embed first-order resistors and capacitor filters to eliminate high-frequency noise.',
        status: 'pending',
        dependencies: ['opamp2_frontend'],
        actions: EngineeringMacros.expandSensorInterface(px, py).filter(a => a.name === 'create_component' && (a.args.id.includes('RES') || a.args.id.includes('CAP')))
      });

      graph.addNode({
        id: 'opamp_sensor_wiring',
        name: 'Filter to Amplifier Node Wire Map',
        description: 'Route wires from the passive conditioning filter stage directly back into OpAmp input pins.',
        status: 'pending',
        dependencies: ['sensor_rc_filter'],
        actions: EngineeringMacros.expandSensorInterface(px, py).filter(a => a.name === 'add_connection')
      });
    }

    // 8. Thermal Improvement & Dissipation Strategy
    else if (gLower.includes('thermal') || gLower.includes('cooling') || gLower.includes('heat sink')) {
      graph.addNode({
        id: 'thermal_v_stitching',
        name: 'Heat Extraction Stitching Via Forest',
        description: 'Construct a dense thermal via grid directly below load components to spread heats.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandThermalPerformance(px, py)
      });
    }

    // 9. EMI Clock Noise Shielding Strategy
    else if (gLower.includes('emi') || gLower.includes('shield') || gLower.includes('clock line')) {
      graph.addNode({
        id: 'clock_termination',
        name: 'Deploy Series Impedance Load Resistor',
        description: 'Mount series source resistors close to clock oscillators to minimize line reflections.',
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandClockEMIPad(px, py).filter(a => a.name === 'create_component')
      });

      graph.addNode({
        id: 'clock_guard_pours',
        name: 'Faraday Guard Copper Shield Cage',
        description: 'Construct safety fence shielding guardrings flanking clocks to ground radiated noise.',
        status: 'pending',
        dependencies: ['clock_termination'],
        actions: EngineeringMacros.expandClockEMIPad(px, py).filter(a => a.name === 'add_copper_pour')
      });
    }

    // 10. Auto-place Processor Support / Passives Strategy
    else if (gLower.includes('auto-place') || gLower.includes('place mcu') || gLower.includes('mcu support')) {
      const target = context.graph.components[0]?.designator || 'U1';
      graph.addNode({
        id: 'mcu_pullup_cluster',
        name: `Coordinate Cluster Pullup Resistor next to CPU ${target}`,
        description: `Group Reset timers and reference crystals close to targeted MCU pins.`,
        status: 'pending',
        dependencies: [],
        actions: EngineeringMacros.expandMcuAutoPlace(target, context.graph)
      });
    }

    // Fallback General Purpose Modular Actions Slicer Strategy
    else {
      graph.addNode({
        id: 'generic_placement',
        name: 'Modular Component Placement & Integrity',
        description: 'Place and align board components at targeted coordinate margins.',
        status: 'pending',
        dependencies: [],
        actions: [
          {
            name: 'create_component',
            args: {
              id: 'GEN_COMP',
              designator: 'U_GEN',
              partType: 'Generic IC',
              footprint: 'SOIC-8',
              position: { x: px, y: py },
              boardPosition: { x: px, y: py },
              layer: 'F.Cu',
              properties: { value: 'Standard Model', rating: '3.3V' }
            }
          }
        ]
      });
    }

    return graph;
  }
}
