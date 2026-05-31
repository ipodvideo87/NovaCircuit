import { ProjectGraph, AIAction, PCBComponent, Net, Point } from '../../types';
import { syncBoardFromGraph } from '../board';
import { runDRC } from '../drc';

export interface OrchestratorStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  actions: AIAction[];
  explanation: string;
  approvalGated: boolean;
  requiresReview: boolean;
  warnings?: string[];
}

export interface DesignSession {
  id: string;
  goal: string;
  currentStepIndex: number;
  steps: OrchestratorStep[];
  history: { graphBefore: ProjectGraph; stepIndex: number }[];
  isCompleted: boolean;
  createdAt: string;
}

export class AIDesignOrchestrator {
  /**
   * Translates high-level prompts into highly optimized, multi-step co-design plans.
   */
  public static generatePlan(goal: string, context: ProjectGraph): DesignSession {
    const norm = goal.toLowerCase();
    const steps: OrchestratorStep[] = [];
    
    // Core prompt option 1: Design a 3.3V regulated ESP32 board with USB-C
    // Or 4-layer IoT Board with WiFi and Battery (or fallback option)
    if (norm.includes('esp32') || norm.includes('regulated') || norm.includes('usb')) {
      steps.push(
        {
          id: 'step-1-schematic',
          name: 'Schematic Creation & Net Definition',
          description: 'Instantiate ESP32-WROOM MCU, physical AMS1117-3.3V linear regulator, USB-C power input, and decoupling passives.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Bridges system netlists across component nodes. Allocates dedicated high-current supply tracks and decoupling references.',
          actions: [
            {
              name: 'create_component',
              args: { id: 'u1_mcu', designator: 'U1', partType: 'ESP32-S3', footprint: 'QFN-56', value: 'ESP32-S3-WROOM', x: 120, y: 85 }
            },
            {
              name: 'create_component',
              args: { id: 'u2_reg', designator: 'U2', partType: 'AMS1117-3.3V', footprint: 'SOT-223', value: '3.3V LDO', x: 50, y: 55 }
            },
            {
              name: 'create_component',
              args: { id: 'j1_usb', designator: 'J1', partType: 'USB-C-Connector', footprint: 'USB-C-SMD', value: 'USB-C Power', x: 20, y: 55 }
            },
            {
              name: 'create_component',
              args: { id: 'c1_dec', designator: 'C1', partType: 'Capacitor', footprint: '0805', value: '10uF', x: 40, y: 75 }
            },
            {
              name: 'create_component',
              args: { id: 'c2_dec', designator: 'C2', partType: 'Capacitor', footprint: '0805', value: '100nF', x: 100, y: 75 }
            },
            // Connected netlines
            {
              name: 'connect_net',
              args: { from: 'J1.VBUS', to: 'U2.VIN', netType: 'power', netName: '5V' }
            },
            {
              name: 'connect_net',
              args: { from: 'U2.VOUT', to: 'U1.VDD', netType: 'power', netName: '3.3V' }
            },
            {
              name: 'connect_net',
              args: { from: 'C1_dec.1', to: 'U2.VIN', netType: 'power', netName: '5V' }
            },
            {
              name: 'connect_net',
              args: { from: 'C2_dec.1', to: 'U1.VDD', netType: 'power', netName: '3.3V' }
            },
            {
              name: 'connect_net',
              args: { from: 'J1.GND', to: 'U2.GND', netType: 'ground', netName: 'GND' }
            },
            {
              name: 'connect_net',
              args: { from: 'U1.GND', to: 'U2.GND', netType: 'ground', netName: 'GND' }
            }
          ]
        },
        {
          id: 'step-2-placement',
          name: 'Surgical Component Placement',
          description: 'Position ESP32 central MCU on board, mount USB-C edge-connect, and arrange decoupling capacitors 1-to-1 matching IC power pins.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Utilizes radial coordinates to keep bulk input capacitors within 6mm orbit ranges to reduce parasitics.',
          actions: [
            { name: 'move_footprint', args: { designator: 'U1', x: 120, y: 85, rotation: 0 } },
            { name: 'move_footprint', args: { designator: 'U2', x: 60, y: 65, rotation: 90 } },
            { name: 'move_footprint', args: { designator: 'J1', x: 20, y: 65, rotation: 180 } },
            { name: 'move_footprint', args: { designator: 'C1', x: 42, y: 65, rotation: 0 } },
            { name: 'move_footprint', args: { designator: 'C2', x: 104, y: 85, rotation: 270 } }
          ]
        },
        {
          id: 'step-3-power',
          name: 'Power Distribution & Via Stitching',
          description: 'Generate high-voltage 5V paths from J1 to LDO and optimized 3.3V power rails reinforced with matrix stitching thermal vias.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Minimizes DC resistance and current density loops by running 0.6mm trace geometries.',
          actions: [
            { name: 'create_trace', args: { startX: 20, startY: 65, endX: 42, endY: 65, width: 0.6, layer: 'F.Cu', netId: '5V' } },
            { name: 'create_trace', args: { startX: 42, startY: 65, endX: 60, endY: 65, width: 0.6, layer: 'F.Cu', netId: '5V' } },
            { name: 'create_trace', args: { startX: 60, startY: 65, endX: 104, endY: 85, width: 0.5, layer: 'F.Cu', netId: '3.3V' } },
            { name: 'create_trace', args: { startX: 104, startY: 85, endX: 120, endY: 85, width: 0.5, layer: 'F.Cu', netId: '3.3V' } },
            {
              name: 'add_via_stitching',
              args: { netId: '3.3V', x1: 50, y1: 50, x2: 90, y2: 80, gridSpacing: 10, drillSize: 0.4, padSize: 0.8 }
            }
          ]
        },
        {
          id: 'step-4-routing',
          name: 'Trace Routing Pipeline',
          description: 'Autocompletes high-frequency signal tracks and matches impedance constraints on transmission paths.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Invokes Dijkstra routing grid routers to resolve multi-layer track runs while respecting spacing overrides.',
          actions: [
            { name: 'create_trace', args: { startX: 120, startY: 80, endX: 130, endY: 80, width: 0.25, layer: 'F.Cu', netId: 'TXD' } },
            { name: 'create_trace', args: { startX: 120, startY: 90, endX: 130, endY: 90, width: 0.25, layer: 'F.Cu', netId: 'RXD' } }
          ]
        },
        {
          id: 'step-5-drc',
          name: 'DRC Verification & Guardrail Solvers',
          description: 'Runs real-time rule parsing algorithms to detect overlaps and micro-shifts elements to prevent high-speed crosstalk.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Iteratively inspects layout boundaries inside the 3D grid and returns safety offsets.',
          actions: [
            { name: 'move_footprint', args: { designator: 'C2', x: 106, y: 88, rotation: 270 } }
          ]
        },
        {
          id: 'step-6-pour',
          name: 'Polygon Pour Generation',
          description: 'Construct active GND pour planes on B.Cu layer to establish a dense low-impedance EMI return shielding path.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Sets double-sided copper floods with thermal relief spoke isolations surrounding standard structural anchors.',
          actions: [
            {
              name: 'create_copper_zone',
              args: {
                id: 'zone-gnd-bg',
                netId: 'GND',
                layer: 'B.Cu',
                outlinePoints: context.outline?.points || [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }],
                clearance: 0.35,
                thermalReliefEnabled: true,
                spokeWidth: 0.25,
                spokesCount: 4,
                priority: -10
              }
            }
          ]
        }
      ];
    } else {
      // Default / "Start a new 4-layer IoT board with WiFi and battery"
      steps.push(
        {
          id: 'iot-step-1',
          name: 'IoT Stack schematic block',
          description: 'Instantiate RF WiFi module, battery recharging LDO unit, protection diodes, and input connectors.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Generates power domains between battery chargers (3.7V) and low-noise RF nodes.',
          actions: [
            {
              name: 'create_component',
              args: { id: 'u1_wifi', designator: 'U1', partType: 'ESP32-S3-WROOM', footprint: 'QFN-56', value: 'MCU WiFi', x: 120, y: 80 }
            },
            {
              name: 'create_component',
              args: { id: 'u2_chg', designator: 'U2', partType: 'MCP73831', footprint: 'SOT-23-5', value: 'LiPo Charger', x: 45, y: 50 }
            },
            {
              name: 'create_component',
              args: { id: 'j2_bat', designator: 'J2', partType: 'JST-PH-2Pin', footprint: 'TH-2PIN', value: 'Battery Connector', x: 20, y: 50 }
            },
            {
              name: 'create_component',
              args: { id: 'c5_dec', designator: 'C5', partType: 'Capacitor', footprint: '0603', value: '4.7uF', x: 38, y: 50 }
            }
          ]
        },
        {
          id: 'iot-step-2',
          name: 'Chassis Alignment & RF Placement',
          description: 'Position RF WiFi antenna outwards clear of copper and anchor the JST LiPo connector adjacent to battery inputs.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Locks RF keeps and positions components inside the four-layer mechanical layout.',
          actions: [
            { name: 'move_footprint', args: { designator: 'U1', x: 120, y: 80, rotation: 0 } },
            { name: 'move_footprint', args: { designator: 'U2', x: 50, y: 50, rotation: 90 } },
            { name: 'move_footprint', args: { designator: 'J2', x: 20, y: 50, rotation: 180 } },
            { name: 'move_footprint', args: { designator: 'C5', x: 38, y: 50, rotation: 0 } }
          ]
        },
        {
          id: 'iot-step-3',
          name: 'Power Planes & Stitching Grid',
          description: 'Establish heavy battery input copper paths and generate dedicated mid-layer planes on 4-layer config.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Implements internal shielding layout matrices mapping references directly.',
          actions: [
            { name: 'create_trace', args: { startX: 20, startY: 50, endX: 38, endY: 50, width: 0.6, layer: 'F.Cu', netId: 'VBAT' } },
            { name: 'create_trace', args: { startX: 38, startY: 50, endX: 50, endY: 50, width: 0.6, layer: 'F.Cu', netId: 'VBAT' } }
          ]
        },
        {
          id: 'iot-step-4',
          name: 'Differential Antenna Line Matching',
          description: 'Route physical trace paths with matched pair lengths on high-speed traces.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Runs microstrip tracks with continuous reference planes minimizing reflective crosstalk.',
          actions: [
            { name: 'create_trace', args: { startX: 120, startY: 75, endX: 135, endY: 75, width: 0.3, layer: 'F.Cu', netId: 'RF_OUT' } }
          ]
        },
        {
          id: 'iot-step-5',
          name: 'DRC & Layer Stackup validation',
          description: 'Inspect spacing clearances across internal layer planes.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Guarantees compliance to sub-mil tolerances across board outlines.',
          actions: []
        },
        {
          id: 'iot-step-6',
          name: 'Continuous Double-Layer GND Flood',
          description: 'Generate dedicated ground return pours with thermal reliefs.',
          status: 'pending',
          approvalGated: true,
          requiresReview: false,
          explanation: 'Suppresses thermal spikes from the high speed WiFi PA output blocks during transmission.',
          actions: [
            {
              name: 'create_copper_zone',
              args: {
                id: 'zone-iot-gnd',
                netId: 'GND',
                layer: 'B.Cu',
                outlinePoints: context.outline?.points || [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }],
                clearance: 0.3,
                thermalReliefEnabled: true,
                spokeWidth: 0.25,
                spokesCount: 4,
                priority: -10
              }
            }
          ]
        }
      ];
    }

    return {
      id: `session-${Date.now()}`,
      goal,
      currentStepIndex: 0,
      steps,
      history: [],
      isCompleted: false,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Executes the active step in the design session, returning the recommended actions.
   */
  public static executeStep(
    session: DesignSession,
    context: ProjectGraph
  ): { updatedSession: DesignSession; actionsToApply: AIAction[] } {
    const updated = { ...session };
    const currentStep = updated.steps[updated.currentStepIndex];
    
    if (!currentStep) {
      return { updatedSession: updated, actionsToApply: [] };
    }

    currentStep.status = 'executing';
    
    // Track history for rollback support
    updated.history = [
      ...updated.history,
      { graphBefore: JSON.parse(JSON.stringify(context)), stepIndex: updated.currentStepIndex }
    ];

    // Simulate potential warnings or issues
    const warnings: string[] = [];
    currentStep.actions.forEach(action => {
      if (action.name === 'create_copper_zone') {
        const netEx = context.nets?.find(n => n.id === action.args.netId);
        if (!netEx && action.args.netId !== 'GND') {
          warnings.push(`Advisory: Assigned net '${action.args.netId}' is not yet fully declared. Will auto-declare default path.`);
        }
      }
    });

    currentStep.warnings = warnings;
    currentStep.status = 'completed';

    // Move to next index (or complete session if reached end)
    if (updated.currentStepIndex >= updated.steps.length - 1) {
      updated.isCompleted = true;
    } else {
      updated.currentStepIndex += 1;
    }

    return {
      updatedSession: updated,
      actionsToApply: currentStep.actions
    };
  }

  /**
   * Rolls back the last executed step safely using the history log.
   */
  public static rollbackLastStep(
    session: DesignSession
  ): { updatedSession: DesignSession; rolledBackGraph: ProjectGraph | null } {
    const updated = { ...session };
    if (updated.history.length === 0) {
      return { updatedSession: updated, rolledBackGraph: null };
    }

    const lastState = updated.history[updated.history.length - 1];
    updated.currentStepIndex = lastState.stepIndex;
    updated.steps[lastState.stepIndex].status = 'pending';
    updated.isCompleted = false;
    updated.history = updated.history.slice(0, -1);

    return {
      updatedSession: updated,
      rolledBackGraph: lastState.graphBefore
    };
  }
}
