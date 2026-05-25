import { AIAction, ProjectGraph, PCBComponent, Net, ComponentPin } from '../types';
import { deepCloneGraph } from './transaction';
import { GlobalLibrary } from './componentLibrary';

export interface ActionValidationResult {
  updatedGraph: ProjectGraph;
  errors: string[];
  validActions: AIAction[];
}

function processPins(pins: any[] | undefined) {
  if (!pins || !Array.isArray(pins)) return undefined;
  return pins.map(p => {
    if (typeof p === 'string') return { name: p, type: 'passive' as any };
    return { name: p.name || 'UNNAMED', type: p.type || 'passive' };
  });
}

/**
 * INVARIANT: This function and all its helpers MUST remain strictly pure.
 * 
 * 1. No side effects: Do not use console.log, console.warn, or any UI updates.
 * 2. No external state: Do not read from or mutate React state, refs, or history.
 * 3. Deterministic: Use no randomness (Math.random) or time-based logic (Date.now).
 * 4. Immutable output: Always return a new updated graph, errors list, and validActions list.
 * 
 * All logging, state mutations, and UI updates MUST be handled by processQueue in the caller.
 */
export function validateAndApplyActions(actions: AIAction[], project: ProjectGraph): ActionValidationResult {
  // Deep clone graph to apply actions in a simulated environment
  const updatedGraph = deepCloneGraph(project);
  
  const errors: string[] = [];
  const validActions: AIAction[] = [];

  for (const action of actions) {
    try {
      applyAction(action, updatedGraph);
      validActions.push(action);
    } catch (error: any) {
      errors.push(`'${action.name}' rejected: ${error.message}`);
    }
  }

  return { updatedGraph, errors, validActions };
}

function applyAction(action: AIAction, graph: ProjectGraph) {
  switch (action.name) {
    case 'create_component': {
      const typeArg = action.args.type;
      const { partType = typeArg, designator, partNumber, x = 0, y = 0, value } = action.args;
      if (!partType && !partNumber) throw new Error("Missing partType or partNumber");
      if (!designator) throw new Error("Missing designator");
      
      // 1. Prevent duplicate component IDs
      if (graph.components.some(c => c.designator === designator)) {
        throw new Error(`Component ID '${designator}' already exists.`);
      }

      let finalPartType = partType;
      let finalPins = processPins(action.args.pins);
      let footprint = 'DEFAULT';
      
      if (partNumber) {
        const libComp = GlobalLibrary.getComponent(partNumber);
        if (libComp) {
          finalPartType = libComp.category;
          footprint = libComp.defaultFootprint;
          const sym = GlobalLibrary.getSymbol(libComp.symbolId);
          if (sym && sym.units.length > 0) {
             const allPins: any[] = [];
             sym.units.forEach(u => {
               u.pins.forEach(p => {
                 allPins.push({ name: p.name, type: p.type });
               });
             });
             finalPins = allPins;
          }
        }
      }

      if (!finalPins) {
        finalPins = ((finalPartType || '').includes('MCU') || (finalPartType || '').includes('ESP') 
          ? [{name: '3V3', type: 'power_in'}, {name: 'GND', type: 'ground'}, {name: 'IO1', type: 'bidirectional'}, {name: 'IO2', type: 'bidirectional'}] as any[]
          : [{name: '1', type: 'passive'}, {name: '2', type: 'passive'}] as any[]);
      }

      graph.components.push({
        id: designator,
        designator,
        partType: finalPartType || 'Component',
        partNumber: partNumber,
        position: { x, y },
        pins: finalPins,
        footprint: footprint,
        properties: value ? { value } : {}
      });
      break;
    }
    
    case 'connect_net': {
      const { from, to } = action.args;
      if (!from || !to) throw new Error("Missing 'from' or 'to' parameters");
      if (from === to) throw new Error("Cannot connect a pin to itself");
      
      const parsePin = (str: string): ComponentPin => {
        const parts = str.split('.');
        if (parts.length !== 2) throw new Error(`Invalid pin format: ${str}. Expected 'Component.Pin'`);
        return { componentId: parts[0], pinName: parts[1] };
      };
      
      const pinA = parsePin(from);
      const pinB = parsePin(to);
      
      // 2. Prevent connecting nets to non-existent pins/components
      const compA = graph.components.find(c => c.designator === pinA.componentId);
      if (!compA) throw new Error(`Source component '${pinA.componentId}' not found.`);
      if (!(compA.pins || []).some((p: any) => p.name === pinA.pinName)) throw new Error(`Pin '${pinA.pinName}' does not exist on '${compA.designator}'.`);

      const compB = graph.components.find(c => c.designator === pinB.componentId);
      if (!compB) throw new Error(`Target component '${pinB.componentId}' not found.`);
      if (!(compB.pins || []).some((p: any) => p.name === pinB.pinName)) throw new Error(`Pin '${pinB.pinName}' does not exist on '${compB.designator}'.`);
      
      // Generate ID purely based on the new graph state to guarantee determinism
      let netNum = 1;
      while(graph.nets.some(n => n.id === `net-${netNum}`)) netNum++;
      
      // Add net connection
      graph.nets.push({
        id: `net-${netNum}`,
        name: `Net-${pinA.componentId}_${pinA.pinName}`,
        netClass: 'SIGNAL',
        type: action.args.netType || 'signal',
        connections: [pinA, pinB]
      });
      break;
    }

    case 'define_net': {
      const { netName, netClass } = action.args;
      if (netClass === 'POWER') {
        const isPowerName = /^[+V-]/i.test(netName) || /vcc|vdd|gnd|power/i.test(netName);
        if (!isPowerName) {
          throw new Error(`Power net '${netName}' is invalid. Use standard prefixes (+5V, GND, VCC).`);
        }
      }
      break;
    }

    case 'move_component': {
      const { designator, x, y } = action.args;
      if (!designator || x === undefined || y === undefined) throw new Error("Missing fields.");
      const comp = graph.components.find(c => c.designator === designator);
      if (!comp) throw new Error(`Component '${designator}' not found.` );
      comp.position = { x, y };
      break;
    }

    case 'move_footprint': {
      const { designator, x, y, rotation, layer, isLocked } = action.args;
      const comp = graph.components.find(c => c.designator === designator);
      if (!comp) throw new Error(`Component '${designator}' not found.`);
      comp.boardPosition = { x, y };
      if (rotation !== undefined) comp.rotation = rotation;
      if (layer) comp.layer = layer;
      if (isLocked !== undefined) comp.isLocked = isLocked;
      break;
    }
    
    case 'assign_layer': {
      const { designator, layer } = action.args;
      const comp = graph.components.find(c => c.designator === designator);
      if (!comp) throw new Error(`Component '${designator}' not found.`);
      comp.layer = layer as any;
      break;
    }
    
    case 'create_keepout': {
      if (!graph.keepouts) graph.keepouts = [];
      const { id, x, y, width, height, layers, restrictions } = action.args;
      if (graph.keepouts.some(k => k.id === id)) throw new Error(`Keepout ${id} already exists`);
      graph.keepouts.push({
        id, x, y, width, height, layers, restrictions
      });
      break;
    }
    
    case 'delete_component': {
      const { designator } = action.args;
      if (!designator) throw new Error("Missing designator.");
      const idx = graph.components.findIndex(c => c.designator === designator);
      if (idx === -1) throw new Error(`Component '${designator}' not found.`);
      graph.components.splice(idx, 1);
      
      // Clean up nets attached to this component
      graph.nets = graph.nets.filter(n => !n.connections.some(conn => conn.componentId === designator));
      break;
    }

    case 'assign_footprint': {
      const { designator, footprint } = action.args;
      if (!designator || !footprint) throw new Error("Missing designator or footprint.");
      const comp = graph.components.find(c => c.designator === designator);
      if (!comp) throw new Error(`Component '${designator}' not found.`);
      
      if (comp.partNumber) {
        const libComp = GlobalLibrary.getComponent(comp.partNumber);
        if (libComp && !libComp.footprints.includes(footprint)) {
          throw new Error(`Footprint '${footprint}' is not compatible with library part '${comp.partNumber}'. Valid options are: ${libComp.footprints.join(', ')}`);
        }
      }
      
      const fpDef = GlobalLibrary.getFootprint(footprint);
      if (comp.partNumber && !fpDef) {
         throw new Error(`Footprint definition '${footprint}' not found in global library.`);
      }

      comp.footprint = footprint;
      break;
    }

    case 'set_property': {
      const { designator, property, value } = action.args;
      if (!designator || !property || value === undefined) throw new Error("Missing fields.");
      const comp = graph.components.find(c => c.designator === designator);
      if (!comp) throw new Error(`Component '${designator}' not found.`);
      comp.properties[property] = value;
      break;
    }

    case 'add_connection': {
      // Alias key to connect_net for structural integrity
      const { from, to } = action.args;
      if (!from || !to) throw new Error("Missing 'from' or 'to' parameters");
      if (from === to) throw new Error("Cannot connect a pin to itself");
      
      const parsePin = (str: string) => {
        const parts = str.split('.');
        if (parts.length !== 2) throw new Error(`Invalid pin format: ${str}. Expected 'Component.Pin'`);
        return { componentId: parts[0], pinName: parts[1] };
      };
      
      const pinA = parsePin(from);
      const pinB = parsePin(to);
      
      const compA = graph.components.find(c => c.designator === pinA.componentId);
      if (!compA) throw new Error(`Source component '${pinA.componentId}' not found.`);
      const compB = graph.components.find(c => c.designator === pinB.componentId);
      if (!compB) throw new Error(`Target component '${pinB.componentId}' not found.`);
      
      let netNum = 1;
      while(graph.nets.some(n => n.id === `net-${netNum}`)) netNum++;
      
      graph.nets.push({
        id: `net-${netNum}`,
        name: `Net-${pinA.componentId}_${pinA.pinName}`,
        netClass: 'SIGNAL',
        type: action.args.netType || 'signal',
        connections: [pinA, pinB]
      });
      break;
    }

    case 'create_trace': {
      if (!graph.traces) graph.traces = [];
      const { id, netId, layer, width, startX, startY, endX, endY } = action.args;
      
      // Basic design rule check on trace length/coordinates
      if (startX === endX && startY === endY) {
         throw new Error(`Invalid zero-length trace path at [${startX}, ${startY}]`);
      }

      const generatedId = id || `tr-${Math.random().toString(36).slice(2, 8)}`;
      if (graph.traces.some(t => t.id === generatedId)) {
        throw new Error(`Trace ID '${generatedId}' already exists.`);
      }

      graph.traces.push({
        id: generatedId,
        netId,
        layer,
        width,
        startX,
        startY,
        endX,
        endY
      });
      break;
    }

    case 'create_via': {
      if (!graph.vias) graph.vias = [];
      const { id, netId, x, y, drillSize, padSize } = action.args;
      
      const generatedId = id || `via-${Math.random().toString(36).slice(2, 8)}`;
      if (graph.vias.some(v => v.id === generatedId)) {
        throw new Error(`Via ID '${generatedId}' already exists.`);
      }

      graph.vias.push({
        id: generatedId,
        netId,
        x,
        y,
        drillSize,
        padSize
      });
      break;
    }

    case 'delete_trace': {
      if (!graph.traces) graph.traces = [];
      const { traceId } = action.args;
      const index = graph.traces.findIndex(t => t.id === traceId);
      if (index === -1) throw new Error(`Trace with id '${traceId}' not found.`);
      graph.traces.splice(index, 1);
      break;
    }

    case 'update_trace_width': {
      if (!graph.traces) graph.traces = [];
      const { traceId, newWidth } = action.args;
      const trace = graph.traces.find(t => t.id === traceId);
      if (!trace) throw new Error(`Trace with id '${traceId}' not found.`);
      trace.width = newWidth;
      break;
    }

    case 'add_copper_pour': {
      if (!graph.keepouts) graph.keepouts = [];
      const { id, x, y, width, height, layers, restrictions } = action.args;
      if (graph.keepouts.some(k => k.id === id)) {
        throw new Error(`Copper zone/Keepout layout with ID '${id}' already exists.`);
      }
      graph.keepouts.push({
        id, x, y, width, height, layers, restrictions
      });
      break;
    }

    case 'add_via_stitching': {
      if (!graph.vias) graph.vias = [];
      const { netId, x1, y1, x2, y2, gridSpacing, drillSize, padSize } = action.args;
      
      // Calculate a deterministic grid of via stitch insertions
      const startX = Math.min(x1, x2);
      const endX = Math.max(x1, x2);
      const startY = Math.min(y1, y2);
      const endY = Math.max(y1, y2);
      
      let count = 0;
      for (let tx = startX; tx <= endX; tx += gridSpacing) {
        for (let ty = startY; ty <= endY; ty += gridSpacing) {
          const viaId = `via-stitch-${netId}-${tx}-${ty}`;
          if (!graph.vias.some(v => v.id === viaId)) {
            graph.vias.push({
              id: viaId,
              netId,
              x: tx,
              y: ty,
              drillSize,
              padSize
            });
            count++;
          }
        }
      }
      if (count === 0) {
        throw new Error(`Boundary area too small to fit gridSpacing stitch vias.`);
      }
      break;
    }

    case 'route_differential_pair': {
      if (!graph.traces) graph.traces = [];
      const { positiveNetId, negativeNetId, startX, startY, endX, endY, spacing, width, layer } = action.args;
      
      // Route twin traces parallel with spacing offset
      const dx = endX - startX;
      const dy = endY - startY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) throw new Error(`Zero-length differential pair path.`);
      
      // Normal vector
      const nx = -dy / len;
      const ny = dx / len;
      
      // Spacing half offset
      const halfS = spacing / 2;
      
      // Pos trace
      const posX1 = startX + nx * halfS;
      const posY1 = startY + ny * halfS;
      const posX2 = endX + nx * halfS;
      const posY2 = endY + ny * halfS;
      
      // Neg trace
      const negX1 = startX - nx * halfS;
      const negY1 = startY - ny * halfS;
      const negX2 = endX - nx * halfS;
      const negY2 = endY - ny * halfS;

      graph.traces.push({
        id: `tr-diff-p-${positiveNetId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        netId: positiveNetId,
        layer,
        width,
        startX: posX1,
        startY: posY1,
        endX: posX2,
        endY: posY2
      });

      graph.traces.push({
        id: `tr-diff-n-${negativeNetId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        netId: negativeNetId,
        layer,
        width,
        startX: negX1,
        startY: negY1,
        endX: negX2,
        endY: negY2
      });
      break;
    }

    case 'run_erc':
    case 'run_drc':
    case 'run_simulator':
    case 'search_components':
    case 'propose_design_review':
    case 'generate_bom':
    case 'calculate_trace_width':
      // Valid non-mutating informational actions
      break;

    case 'create_subcircuit': {
      const { blockType } = action.args;
      let subNum = 1;
      while(graph.components.some(c => c.id === `U_SUB_${subNum}`)) subNum++;

      // Provide a mock subcircuit setup for validation graph
      graph.components.push(
        { id: `U_SUB_${subNum}`, designator: `U_${blockType}`, partType: blockType, position: { x: 150, y: 150 }, pins: [{name: 'IN', type: 'input'}, {name: 'OUT', type: 'output'}, {name: 'GND', type: 'ground'}] as any[], footprint: 'DIP', properties: {} }
      );
      break;
    }

    // Prevent passing unknown action types
    default:
      throw new Error(`Unknown action type: '${action.name}'`);
  }
}
