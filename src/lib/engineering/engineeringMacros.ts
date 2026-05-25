import { AIAction, ProjectGraph } from '../../types';
import { BoardLayer } from '../board';

/**
 * Registry of deterministic, parameterizable engineering macro templates.
 * 
 * Each macro expands high-level user structural intentions into transaction-safe action pipelines.
 */
export class EngineeringMacros {

  /**
   * Expands ESP32 subsystem block: Microcontroller, flash storage, crystals, LDO regulator, and RF.
   */
  public static expandESP32Subsystem(x: number, y: number): AIAction[] {
    const actions: AIAction[] = [];

    // Place main microcontroller SoC MCU
    actions.push({
      name: 'create_component',
      args: {
        id: 'U1_ESP32',
        designator: 'U1',
        partType: 'ESP32-S3-WROOM',
        footprint: 'QFN-56_7x7mm_P0.4mm',
        position: { x, y },
        boardPosition: { x, y },
        layer: 'F.Cu',
        properties: { value: 'ESP32-S3', temp: '85C', voltage: '3.3V' }
      }
    });

    // Place decoupled bypass capacitors
    actions.push({
      name: 'create_component',
      args: {
        id: 'C1_DEC',
        designator: 'C1',
        partType: 'Capacitor',
        footprint: '0402',
        position: { x: x - 12, y: y + 8 },
        boardPosition: { x: x - 12, y: y + 8 },
        layer: 'F.Cu',
        properties: { value: '100nF', rating: '16V' }
      }
    });

    actions.push({
      name: 'create_component',
      args: {
        id: 'C2_DEC',
        designator: 'C2',
        partType: 'Capacitor',
        footprint: '0603',
        position: { x: x - 12, y: y + 12 },
        boardPosition: { x: x - 12, y: y + 12 },
        layer: 'F.Cu',
        properties: { value: '10uF', rating: '10V' }
      }
    });

    // Place LDO 3.3V Step down Regulator
    actions.push({
      name: 'create_component',
      args: {
        id: 'U2_REG',
        designator: 'U2',
        partType: 'AP2112K-3.3',
        footprint: 'SOT-23-5',
        position: { x: x - 25, y: y + 10 },
        boardPosition: { x: x - 25, y: y + 10 },
        layer: 'F.Cu',
        properties: { value: '3.3V Regulator' }
      }
    });

    // Net connections: Establish Power rails & link 3.3V output to processor
    actions.push({
      name: 'add_connection',
      args: {
        from: 'U2.5', // AP2112 VOUT pin
        to: 'U1.3'   // ESP32 VDD Pin3
      }
    });

    actions.push({
      name: 'add_connection',
      args: {
        from: 'C1.1',
        to: 'U1.3'
      }
    });

    // High speed Clock Oscillator
    actions.push({
      name: 'create_component',
      args: {
        id: 'Y1_OSC',
        designator: 'Y1',
        partType: 'Crystal_SMD',
        footprint: 'SMD-3225_4Pin',
        position: { x: x + 15, y: y - 10 },
        boardPosition: { x: x + 15, y: y - 10 },
        layer: 'F.Cu',
        properties: { value: '40MHz', tolerance: '10ppm' }
      }
    });

    // Link Crystal Oscillator to ESP32 XTAL pins
    actions.push({
      name: 'add_connection',
      args: {
        from: 'Y1.1',
        to: 'U1.5' // XTAL_P
      }
    });

    actions.push({
      name: 'add_connection',
      args: {
        from: 'Y1.3',
        to: 'U1.6' // XTAL_N
      }
    });

    // Add copper RF clearance keepout directly below antenna patch area
    actions.push({
      name: 'add_copper_pour',
      args: {
        id: 'RF_KEEPOUT_ZONE',
        x: x + 30,
        y: y + 15,
        width: 15,
        height: 15,
        layers: ['F.Cu', 'B.Cu'] as BoardLayer[],
        restrictions: ['trace', 'copper', 'via', 'component']
      }
    });

    return actions;
  }

  /**
   * Expands Buck Converter switching power supply stage: Switch IC, low-loss inductor, and input/output bulk capacitors.
   */
  public static expandBuckConverter(x: number, y: number): AIAction[] {
    const actions: AIAction[] = [];

    // Buck Controller IC
    actions.push({
      name: 'create_component',
      args: {
        id: 'U3_BUCK',
        designator: 'U3',
        partType: 'MP1584',
        footprint: 'SOIC-8',
        position: { x, y },
        boardPosition: { x, y },
        layer: 'F.Cu',
        properties: { value: '3.0A Buck' }
      }
    });

    // Inductor
    actions.push({
      name: 'create_component',
      args: {
        id: 'L1_IND',
        designator: 'L1',
        partType: 'Inductor_Shielded',
        footprint: 'Inductor_6x6mm',
        position: { x: x + 12, y: y },
        boardPosition: { x: x + 12, y: y },
        layer: 'F.Cu',
        properties: { value: '4.7uH', current: '3.6A' }
      }
    });

    // Input Filter bulk Cap
    actions.push({
      name: 'create_component',
      args: {
        id: 'C3_IN',
        designator: 'C3',
        partType: 'Cap_Elec',
        footprint: 'Cap_SMD_6.3x5.4mm',
        position: { x: x - 15, y: y - 8 },
        boardPosition: { x: x - 15, y: y - 8 },
        layer: 'F.Cu',
        properties: { value: '22uF', rating: '50V' }
      }
    });

    // Output Filter block Cap
    actions.push({
      name: 'create_component',
      args: {
        id: 'C4_OUT',
        designator: 'C4',
        partType: 'Cap_Ceramic',
        footprint: '0805',
        position: { x: x + 25, y: y - 8 },
        boardPosition: { x: x + 25, y: y - 8 },
        layer: 'F.Cu',
        properties: { value: '47uF', rating: '16V' }
      }
    });

    // Loop Schottky Diode representing power catch
    actions.push({
      name: 'create_component',
      args: {
        id: 'D1_SCHOTTKY',
        designator: 'D1',
        partType: 'SS34_Diode',
        footprint: 'SMA',
        position: { x: x + 6, y: y + 12 },
        boardPosition: { x: x + 6, y: y + 12 },
        layer: 'F.Cu',
        properties: { value: 'SS34 Schottky' }
      }
    });

    // Bridge power connections
    actions.push({
      name: 'add_connection',
      args: {
        from: 'U3.1', // SW Out
        to: 'L1.1'   // Inductor In
      }
    });

    actions.push({
      name: 'add_connection',
      args: {
        from: 'L1.2',
        to: 'C4_OUT.1'
      }
    });

    // Large high current power copper zones overlaying buck stage for low impedance cooling
    actions.push({
      name: 'add_copper_pour',
      args: {
        id: 'BUCK_SW_NODE_POUR',
        x: x + 6,
        y: y + 2,
        width: 10,
        height: 10,
        layers: ['F.Cu'] as BoardLayer[],
        restrictions: ['component']
      }
    });

    return actions;
  }

  /**
   * Expands high fidelity USB-C Power Delivery (PD) hardware block.
   * Renders a 16-pin USB-C receptacle connector, TVS protection diodes, and an active FUSB302 PD PHY controller.
   */
  public static expandUSBCPD(x: number, y: number): AIAction[] {
    const actions: AIAction[] = [];

    // 1. USB-C 16-pin connector
    actions.push({
      name: 'create_component',
      args: {
        id: 'J_USBC',
        designator: 'J2',
        partType: 'USB_C_Receptacle_16Pin',
        footprint: 'USB_C_Receptacle_H_16Pin',
        position: { x, y },
        boardPosition: { x, y },
        layer: 'F.Cu',
        properties: { value: 'USB-C 16P', power: '100W Max' }
      }
    });

    // 2. Active PD Controller PHY IC (FUSB302)
    actions.push({
      name: 'create_component',
      args: {
        id: 'U_PD_CTRL',
        designator: 'U6',
        partType: 'FUSB302BMPX',
        footprint: 'WQFN-14_2.5x2.5mm_P0.5mm',
        position: { x: x + 25, y: y + 8 },
        boardPosition: { x: x + 25, y: y + 8 },
        layer: 'F.Cu',
        properties: { value: 'FUSB302 PD Ctrl', voltage: '1.8V-5V' }
      }
    });

    // 3. Transient Voltage Suppressor (TVS) ESD Protection Diode Array
    actions.push({
      name: 'create_component',
      args: {
        id: 'D_TVS',
        designator: 'D2',
        partType: 'USBLC6-2SC6',
        footprint: 'SOT-23-6',
        position: { x: x + 12, y: y - 8 },
        boardPosition: { x: x + 12, y: y - 8 },
        layer: 'F.Cu',
        properties: { value: 'USBLC6 TVS ESD' }
      }
    });

    // Connect USB-C CC1 / CC2 lines directly to FUSB302 CC pins to enable negotiation
    actions.push({
      name: 'add_connection',
      args: {
        from: 'J2.A5', // J2 USB-C CC1
        to: 'U6.1'    // U6 FUSB302 CC1
      }
    });

    actions.push({
      name: 'add_connection',
      args: {
        from: 'J2.B5', // J2 USB-C CC2
        to: 'U6.2'    // U6 FUSB302 CC2
      }
    });

    // Route VBUS power input through ESD diode array
    actions.push({
      name: 'add_connection',
      args: {
        from: 'J2.A9', // VBUS
        to: 'D2.1'    // ESD input
      }
    });

    return actions;
  }

  /**
   * Generates a 1-to-4 Clock Distribution tree with a PLL-stabilized buffer IC (e.g., Si5338).
   */
  public static expandClockDistribution(x: number, y: number): AIAction[] {
    const actions: AIAction[] = [];

    // Clock distribution buffer IC
    actions.push({
      name: 'create_component',
      args: {
        id: 'U_CLK_DIST',
        designator: 'U7',
        partType: 'Si5338A-B-GM',
        footprint: 'QFN-24_4x4mm_P0.5mm',
        position: { x, y },
        boardPosition: { x, y },
        layer: 'F.Cu',
        properties: { value: 'Si5338 1:4 Clock Buffer' }
      }
    });

    // Output series source damping resistors (match impedance to target traces)
    for (let i = 1; i <= 4; i++) {
      const offset = (i - 2.5) * 8;
      actions.push({
        name: 'create_component',
        args: {
          id: `R_CLK_SERIES_${i}`,
          designator: `R_DAMP_${i}`,
          partType: 'Resistors_SMD',
          footprint: '0402',
          position: { x: x + 18, y: y + offset },
          boardPosition: { x: x + 18, y: y + offset },
          layer: 'F.Cu',
          properties: { value: '22 Ohm' }
        }
      });
      
      // Connect clock output to damping resistor
      actions.push({
        name: 'add_connection',
        args: {
          from: `U7.CLK_OUT_${i}`,
          to: `R_DAMP_${i}.1`
        }
      });
    }

    return actions;
  }

  /**
   * Places localized, high-potential shielding guard paths and Faraday ground cages.
   */
  public static expandEMIShielding(x: number, y: number, width: number, height: number): AIAction[] {
    const actions: AIAction[] = [];

    // Shielding copper pour bounding core zones
    actions.push({
      name: 'add_copper_pour',
      args: {
        id: 'SHIELD_FARADAY_ZONE',
        x,
        y,
        width,
        height,
        layers: ['F.Cu', 'B.Cu'] as BoardLayer[],
        restrictions: ['trace']
      }
    });

    // Perimeter stitching via cluster referencing GND
    actions.push({
      name: 'add_via_stitching',
      args: {
        netId: 'GND',
        x1: x - width / 2,
        y1: y - height / 2,
        x2: x + width / 2,
        y2: y + height / 2,
        gridSpacing: 4.5,
        drillSize: 0.3,
        padSize: 0.6
      }
    });

    return actions;
  }

  /**
   * Generates parallel length-matched traces representing USB high-speed routing.
   */
  public static expandUSBDifferentialPair(startX: number, startY: number, endX: number, endY: number): AIAction[] {
    return [{
      name: 'route_differential_pair',
      args: {
        positiveNetId: 'USB_D_P',
        negativeNetId: 'USB_D_N',
        startX,
        startY,
        endX,
        endY,
        spacing: 0.25,
        width: 0.18,
        layer: 'F.Cu' as BoardLayer
      }
    }];
  }

  /**
   * Enhances primary board grounding by sweeping power zones and optimizing loops.
   */
  public static expandOptimizePDN(x: number, y: number): AIAction[] {
    const actions: AIAction[] = [];
    
    // Create large primary ground solid cover on bottom copper layer
    actions.push({
      name: 'add_copper_pour',
      args: {
        id: 'PRIMARY_GND_SOLID_PLANE',
        x,
        y,
        width: 120,
        height: 120,
        layers: ['B.Cu'] as BoardLayer[],
        restrictions: []
      }
    });

    // Add high conductance multiple stitching vias adjacent to critical IC blocks
    actions.push({
      name: 'add_via_stitching',
      args: {
        netId: 'GND',
        x1: x - 40,
        y1: y - 40,
        x2: x + 40,
        y2: y + 40,
        gridSpacing: 10,
        drillSize: 0.3,
        padSize: 0.6
      }
    });

    return actions;
  }

  /**
   * Distributes high speed bypass decoupling capacitor clusters to mitigate rail sag.
   */
  public static expandDecouplingNetwork(targetCompDesignator: string, count: number, graph: ProjectGraph): AIAction[] {
    const actions: AIAction[] = [];
    
    // Find target IC position to align bypass caps closely to supply pins
    const comp = graph.components.find(c => c.designator === targetCompDesignator);
    if (!comp) return [];

    const basePos = comp.boardPosition || comp.position;
    
    for (let i = 0; i < count; i++) {
      const offsetX = 8 + i * 5;
      const des = `C_BYP_${targetCompDesignator}_${i}`;
      
      actions.push({
        name: 'create_component',
        args: {
          id: des + '_CAP',
          designator: `C_BYPASS_${targetCompDesignator}_${i}`,
          partType: 'Capacitor',
          footprint: '0402',
          position: { x: basePos.x - offsetX, y: basePos.y + 6 },
          boardPosition: { x: basePos.x - offsetX, y: basePos.y + 6 },
          layer: 'F.Cu',
          properties: { value: '100nF' }
        }
      });

      // Connect caps to power nets
      actions.push({
        name: 'add_connection',
        args: {
          from: `${targetCompDesignator}.1`, // Arbitrary assumed power pin VCC
          to: `C_BYPASS_${targetCompDesignator}_${i}.1`
        }
      });
    }

    return actions;
  }

  /**
   * Places dual high power H-Bridge motor controller outputs.
   */
  public static expandMotorDriverStage(x: number, y: number): AIAction[] {
    const actions: AIAction[] = [];

    // Controller IC
    actions.push({
      name: 'create_component',
      args: {
        id: 'U4_MOTOR',
        designator: 'U4',
        partType: 'L298HN',
        footprint: 'Multiwatt15',
        position: { x, y },
        boardPosition: { x, y },
        layer: 'F.Cu',
        properties: { value: 'Dual H-Bridge Driver' }
      }
    });

    // Terminal Screw Block Out
    actions.push({
      name: 'create_component',
      args: {
        id: 'J1_CONN',
        designator: 'J1',
        partType: 'Screw_Terminal_01x02',
        footprint: 'TerminalBlock_Contact_2.54mm_2Pin',
        position: { x: x + 25, y },
        boardPosition: { x: x + 25, y },
        layer: 'F.Cu',
        properties: { value: 'Motor Connection' }
      }
    });

    // High speed recovery protection clamp freewheeling flyback diodes
    for (let i = 1; i <= 4; i++) {
      actions.push({
        name: 'create_component',
        args: {
          id: `D_C${i}_DIODE`,
          designator: `D_CLAMP_${i}`,
          partType: '1N4007',
          footprint: 'SOD-123',
          position: { x: x + 15, y: y - 15 + (i * 6) },
          boardPosition: { x: x + 15, y: y - 15 + (i * 6) },
          layer: 'F.Cu',
          properties: { value: 'Flyback Diode' }
        }
      });
    }

    return actions;
  }

  /**
   * High fidelity Analog Sensor front-end conditioner with differential filtering.
   */
  public static expandSensorInterface(x: number, y: number): AIAction[] {
    const actions: AIAction[] = [];

    // Instrumentation Operational Amplifier
    actions.push({
      name: 'create_component',
      args: {
        id: 'U5_OPAMP',
        designator: 'U5',
        partType: 'LM358',
        footprint: 'SOIC-8',
        position: { x, y },
        boardPosition: { x, y },
        layer: 'F.Cu',
        properties: { value: 'Low Power OpAmp' }
      }
    });

    // Input resistor filter stage
    actions.push({
      name: 'create_component',
      args: {
        id: 'R1_RES',
        designator: 'R1',
        partType: 'Resistors_SMD',
        footprint: '0603',
        position: { x: x - 15, y: y - 5 },
        boardPosition: { x: x - 15, y: y - 5 },
        layer: 'F.Cu',
        properties: { value: '10k' }
      }
    });

    // Input Capacitor filter stage
    actions.push({
      name: 'create_component',
      args: {
        id: 'C5_CAP',
        designator: 'C5',
        partType: 'Cap_Ceramic',
        footprint: '0603',
        position: { x: x - 15, y: y + 5 },
        boardPosition: { x: x - 15, y: y + 5 },
        layer: 'F.Cu',
        properties: { value: '10nF' }
      }
    });

    // Bridge connections for standard low pass RC filter linked to non-inverting input pin3
    actions.push({
      name: 'add_connection',
      args: {
        from: 'R1.2',
        to: 'U5.3'
      }
    });

    actions.push({
      name: 'add_connection',
      args: {
        from: 'C5.1',
        to: 'U5.3'
      }
    });

    return actions;
  }

  /**
   * Generates localized dense array of heat extraction stitching vias.
   */
  public static expandThermalPerformance(x: number, y: number): AIAction[] {
    return [{
      name: 'add_via_stitching',
      args: {
        netId: 'GND',
        x1: x - 15,
        y1: y - 15,
        x2: x + 15,
        y2: y + 15,
        gridSpacing: 3.5, // Tight spacing layout
        drillSize: 0.35,
        padSize: 0.70
      }
    }];
  }

  /**
   * Encapsulates Clock generators with termination resistors and a noise control Faraday keepout cage.
   */
  public static expandClockEMIPad(x: number, y: number): AIAction[] {
    const actions: AIAction[] = [];

    // Frequency Ref crystal
    actions.push({
      name: 'create_component',
      args: {
        id: 'Y2_CLK',
        designator: 'Y2',
        partType: 'Clock_Gen',
        footprint: 'DFN-10',
        position: { x, y },
        boardPosition: { x, y },
        layer: 'F.Cu',
        properties: { value: '125MHz Pll' }
      }
    });

    // Series source termination resistor (minimizes reflections and overshoot EMI emissions)
    actions.push({
      name: 'create_component',
      args: {
        id: 'R2_TERM',
        designator: 'R2',
        partType: 'Resistors_SMD',
        footprint: '0402',
        position: { x: x + 12, y },
        boardPosition: { x: x + 12, y },
        layer: 'F.Cu',
        properties: { value: '33 Ohm' }
      }
    });

    actions.push({
      name: 'add_connection',
      args: {
        from: 'Y2.1', // Clk Out
        to: 'R2.1'   // Termination input
      }
    });

    // Shielding enclosure keepout perimeter guardring boundary traces
    actions.push({
      name: 'add_copper_pour',
      args: {
        id: 'CLOCK_EMI_GUARD_RING',
        x,
        y,
        width: 30,
        height: 25,
        layers: ['F.Cu', 'B.Cu'] as BoardLayer[],
        restrictions: ['trace'] // Clear standard trace overlays
      }
    });

    return actions;
  }

  /**
   * Clustered passive placement around main Processor logic.
   */
  public static expandMcuAutoPlace(targetMcuDesignator: string, graph: ProjectGraph): AIAction[] {
    const actions: AIAction[] = [];
    const comp = graph.components.find(c => c.designator === targetMcuDesignator);
    if (!comp) return [];

    const basePos = comp.boardPosition || comp.position;

    // Reset pullup resistor place close
    actions.push({
      name: 'create_component',
      args: {
        id: `R_PU_${targetMcuDesignator}_RES`,
        designator: `R_PULLUP_${targetMcuDesignator}`,
        partType: 'Res_PullUp',
        footprint: '0402',
        position: { x: basePos.x - 10, y: basePos.y - 10 },
        boardPosition: { x: basePos.x - 10, y: basePos.y - 10 },
        layer: 'F.Cu',
        properties: { value: '10k' }
      }
    });

    // Reset line wire bridge
    actions.push({
      name: 'add_connection',
      args: {
        from: `R_PULLUP_${targetMcuDesignator}.2`,
        to: `${targetMcuDesignator}.4` // Assuming RST pin on U1 pin4
      }
    });

    return actions;
  }
}
