import { ProjectGraph, AIAction } from '../types';

export interface ValidationResult {
  validActions: AIAction[];
  errors: string[];
}

/**
 * Runs the sequence of AI actions through a simulated ProjectGraph.
 * Invalid actions are dropped or automatically corrected.
 */
export function validateAIActions(actions: AIAction[], initialState: ProjectGraph): ValidationResult {
  const validActions: AIAction[] = [];
  const errors: string[] = [];
  
  // Clone the current state to simulate atomic changes
  const simulatedState: ProjectGraph = {
    components: [...initialState.components],
    nets: [...initialState.nets]
  };

  for (const action of actions) {
    try {
      if (validateAndApply(action, simulatedState)) {
        validActions.push(action);
      }
    } catch (err: any) {
      errors.push(`[${action.name}] Rejected: ${err.message}`);
    }
  }

  return { validActions, errors };
}

function validateAndApply(action: AIAction, state: ProjectGraph): boolean {
  switch (action.name) {
    case 'create_component': {
      const { designator, x, y } = action.args;
      if (!designator) throw new Error("Missing designator.");
      
      // 1. Duplicate Component Prevention
      if (state.components.some(c => c.designator === designator)) {
        throw new Error(`Component ${designator} already exists in the schematic.`);
      }

      // 2. Overlap Prevention (auto-adjust layout coordinates)
      let adjustedX = x || 0;
      let adjustedY = y || 0;
      const MIN_DISTANCE = 100; // Minimum pixel clearance
      let overlap = true;
      let attempts = 0;
      
      while (overlap && attempts < 10) {
        overlap = false;
        for (const comp of state.components) {
          const dx = comp.position.x - adjustedX;
          const dy = comp.position.y - adjustedY;
          if (Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE) {
            adjustedX += MIN_DISTANCE; // Shift right
            adjustedY += MIN_DISTANCE / 2; // Shift down
            overlap = true;
            break;
          }
        }
        attempts++;
      }
      
      // Override the action arguments with corrected coordinates
      action.args.x = adjustedX;
      action.args.y = adjustedY;

      // Apply to simulated state
      state.components.push({
        id: designator,
        designator: designator,
        partType: action.args.partType,
        position: { x: adjustedX, y: adjustedY },
        pins: [],
        footprint: 'DEFAULT',
        properties: {}
      });
      return true;
    }

    case 'connect_net': {
      const { from, to } = action.args;
      if (!from || !to) throw new Error("Missing connection endpoints.");

      const [fromDes] = from.split('.');
      const [toDes] = to.split('.');

      // 3. Dead Connection Prevention (components must exist in graph)
      if (!state.components.some(c => c.designator === fromDes)) {
        throw new Error(`Source component ${fromDes} missing.`);
      }
      if (!state.components.some(c => c.designator === toDes)) {
        throw new Error(`Target component ${toDes} missing.`);
      }
      
      // Ensure from and to are not the exact same pin
      if (from === to) {
        throw new Error("Cannot connect a pin to itself.");
      }
      
      return true;
    }

    case 'define_net': {
      const { netName, netClass } = action.args;
      
      // 4. Power Net Naming Convention Validation
      if (netClass === 'POWER') {
        const isPowerName = /^[+V-]/i.test(netName) || /vcc|vdd|gnd|power/i.test(netName);
        if (!isPowerName) {
          throw new Error(`Power net '${netName}' is invalid. Use standard prefixes (e.g. +5V, GND, VCC).`);
        }
      }
      return true;
    }

    // Default pass-through for informational commands (run_drc, search_components, etc.)
    default:
      return true;
  }
}
