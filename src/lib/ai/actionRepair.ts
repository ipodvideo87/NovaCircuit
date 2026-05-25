import { AIAction } from '../../types';
import { BoardLayer } from '../board';

export interface RepairDiagnostic {
  field: string;
  issue: string;
  appliedSeverity: 'repaired' | 'rejected' | 'warning';
  message: string;
}

export interface RepairResult {
  action: AIAction | null; // Null if it is a general conversational/message action
  isConversational: boolean;
  diagnostics: RepairDiagnostic[];
}

/**
 * Highly fault-tolerant transaction repair, coercion, and normalizer.
 */
export function repairAndNormalizeAction(rawAction: any): RepairResult {
  const diagnostics: RepairDiagnostic[] = [];
  
  if (!rawAction || typeof rawAction !== 'object') {
    return {
      action: null,
      isConversational: true,
      diagnostics: [{ field: 'root', issue: 'invalid_json', appliedSeverity: 'warning', message: 'Input action was empty or non-object.' }]
    };
  }

  // 1. Normalize Action Type Name
  let name = rawAction.name || rawAction.action || rawAction.type || '';
  if (typeof name !== 'string') {
    name = String(name);
  }
  name = name.trim();
  const originalName = name;

  // Classify and redirect conversational actions
  if (
    !name || 
    name.toLowerCase() === 'message' || 
    name.toLowerCase() === 'chat' || 
    name.toLowerCase() === 'propose_reply' ||
    name.toLowerCase() === 'reply'
  ) {
    return {
      action: null,
      isConversational: true,
      diagnostics: [{
        field: 'name',
        issue: 'conversational_output',
        appliedSeverity: 'repaired',
        message: `Conversational action '${originalName}' filtered and diverted to text channel.`
      }]
    };
  }

  // Convert to standard lower case snake_case representation
  let normName = name.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');

  // Normalize exact uppercase specifications to standard lower snake_case
  if (normName !== originalName) {
    diagnostics.push({
      field: 'name',
      issue: 'case_mismatch',
      appliedSeverity: 'repaired',
      message: `Alias '${originalName}' normalized and mapped into '${normName}' standard casing.`
    });
  }

  // Normalize args/params
  let args = rawAction.args || rawAction.params || {};
  if (typeof args !== 'object' || args === null) {
    args = {};
  } else {
    // Clone to avoid state mutations
    args = JSON.parse(JSON.stringify(args));
  }

  // 2. Repair Common Malformed Coordinates and Properties
  const repairedArgs: Record<string, any> = {};
  
  // Keep trace of missing values we repair
  for (const k of Object.keys(args)) {
    const val = args[k];

    // Auto-coerce strings to numbers for positions, width, sizing properties
    const numberFields = [
      'x', 'y', 'rotation', 'width', 'height', 'drillsize', 'padsize',
      'startx', 'starty', 'endx', 'endy', 'spacing', 'drillSize', 'padSize',
      'startX', 'startY', 'endX', 'endY', 'x1', 'y1', 'x2', 'y2', 'gridSpacing', 'newWidth'
    ];

    let normKey = k;
    // Map coordinate variations: start_x/startx -> startX
    if (k.toLowerCase() === 'start_x' || k.toLowerCase() === 'startx') normKey = 'startX';
    else if (k.toLowerCase() === 'start_y' || k.toLowerCase() === 'starty') normKey = 'startY';
    else if (k.toLowerCase() === 'end_x' || k.toLowerCase() === 'endx') normKey = 'endX';
    else if (k.toLowerCase() === 'end_y' || k.toLowerCase() === 'endy') normKey = 'endY';
    else if (k.toLowerCase() === 'new_width' || k.toLowerCase() === 'newwidth') normKey = 'newWidth';
    else if (k.toLowerCase() === 'drill_size' || k.toLowerCase() === 'drillsize') normKey = 'drillSize';
    else if (k.toLowerCase() === 'pad_size' || k.toLowerCase() === 'padsize') normKey = 'padSize';
    else if (k.toLowerCase() === 'grid_spacing' || k.toLowerCase() === 'gridspacing') normKey = 'gridSpacing';

    if (normKey !== k) {
      diagnostics.push({
        field: k,
        issue: 'property_alias',
        appliedSeverity: 'repaired',
        message: `Property key '${k}' was repaired to standard representation '${normKey}'.`
      });
    }

    if (numberFields.includes(normKey) && typeof val === 'string') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) {
        repairedArgs[normKey] = parsed;
        diagnostics.push({
          field: normKey,
          issue: 'type_coercion',
          appliedSeverity: 'repaired',
          message: `Coerced property '${normKey}' value "${val}" (string) into number ${parsed}.`
        });
      } else {
        repairedArgs[normKey] = val;
      }
    } else {
      repairedArgs[normKey] = val;
    }
  }

  // Handle nested point representations e.g., start: {x, y} and end: {x: y}
  if (args.start && typeof args.start === 'object') {
    if (typeof args.start.x === 'number') {
      repairedArgs.startX = args.start.x;
      diagnostics.push({ field: 'startX', issue: 'flatten_position', appliedSeverity: 'repaired', message: 'Flattened start.x coordinates into flat startX' });
    }
    if (typeof args.start.y === 'number') {
      repairedArgs.startY = args.start.y;
      diagnostics.push({ field: 'startY', issue: 'flatten_position', appliedSeverity: 'repaired', message: 'Flattened start.y coordinates into flat startY' });
    }
  }
  if (args.end && typeof args.end === 'object') {
    if (typeof args.end.x === 'number') {
      repairedArgs.endX = args.end.x;
      diagnostics.push({ field: 'endX', issue: 'flatten_position', appliedSeverity: 'repaired', message: 'Flattened end.x coordinates into flat endX' });
    }
    if (typeof args.end.y === 'number') {
      repairedArgs.endY = args.end.y;
      diagnostics.push({ field: 'endY', issue: 'flatten_position', appliedSeverity: 'repaired', message: 'Flattened end.y coordinates into flat endY' });
    }
  }
  if (args.position && typeof args.position === 'object') {
    if (typeof args.position.x === 'number') {
      repairedArgs.x = args.position.x;
      diagnostics.push({ field: 'x', issue: 'flatten_position', appliedSeverity: 'repaired', message: 'Flattened position.x coordinate to x' });
    }
    if (typeof args.position.y === 'number') {
      repairedArgs.y = args.position.y;
      diagnostics.push({ field: 'y', issue: 'flatten_position', appliedSeverity: 'repaired', message: 'Flattened position.y coordinate to y' });
    }
  }

  // Coerce Board layers
  if (repairedArgs.layer && typeof repairedArgs.layer === 'string') {
    const layerLower = repairedArgs.layer.toLowerCase();
    let finalLayer: BoardLayer | null = null;
    
    if (layerLower === 'top' || layerLower === 'f_cu' || layerLower === 'f-cu' || layerLower === 'f.cu' || layerLower === 'toplayer') {
      finalLayer = 'F.Cu';
    } else if (layerLower === 'bottom' || layerLower === 'b_cu' || layerLower === 'b-cu' || layerLower === 'b.cu' || layerLower === 'bottomlayer') {
      finalLayer = 'B.Cu';
    } else if (layerLower === 'silkscreen_top' || layerLower === 'f_silkscreen' || layerLower === 'f.silkscreen') {
      finalLayer = 'F.Silkscreen';
    } else if (layerLower === 'silkscreen_bottom' || layerLower === 'b_silkscreen' || layerLower === 'b.silkscreen') {
      finalLayer = 'B.Silkscreen';
    } else if (layerLower === 'edge' || layerLower === 'edge_cuts' || layerLower === 'edge.cuts') {
      finalLayer = 'Edge.Cuts';
    }

    if (finalLayer && finalLayer !== repairedArgs.layer) {
      diagnostics.push({
        field: 'layer',
        issue: 'layer_normalization',
        appliedSeverity: 'repaired',
        message: `Layer string "${repairedArgs.layer}" normalized into standards BoardLayer "${finalLayer}".`
      });
      repairedArgs.layer = finalLayer;
    }
  }

  // Auto-generate missing unique object ids where needed
  if ((normName === 'create_trace' || normName === 'create_via') && !repairedArgs.id) {
    const generatedId = `${normName === 'create_trace' ? 'tr' : 'via'}-${Math.random().toString(36).slice(2, 8)}`;
    repairedArgs.id = generatedId;
    diagnostics.push({
      field: 'id',
      issue: 'id_missing',
      appliedSeverity: 'repaired',
      message: `Generated missing element identifier '${generatedId}'.`
    });
  }

  // Reject actions that have absolute missing components we cannot coerce
  const validationError = checkIrreparableFaults(normName, repairedArgs);
  if (validationError) {
    diagnostics.push({
      field: 'validation',
      issue: 'irreparable_schema_fault',
      appliedSeverity: 'rejected',
      message: validationError
    });
    return {
      action: {
        name: normName,
        args: repairedArgs,
        reasoning: rawAction.reasoning
      },
      isConversational: false,
      diagnostics
    };
  }

  return {
    action: {
      name: normName,
      args: repairedArgs,
      reasoning: rawAction.reasoning
    },
    isConversational: false,
    diagnostics
  };
}

/**
 * Checks for missing required dependencies which cannot be resolved via auto-coercion.
 */
function checkIrreparableFaults(name: string, args: Record<string, any>): string | null {
  if (name === 'move_component') {
    if (!args.designator) return "Missing required parameter 'designator'.";
    if (args.x === undefined || isNaN(args.x)) return "Missing required coordinate 'x'.";
    if (args.y === undefined || isNaN(args.y)) return "Missing required coordinate 'y'.";
  } else if (name === 'create_trace') {
    if (!args.layer) return "Missing required parameter 'layer'.";
    if (args.width === undefined || isNaN(args.width)) return "Missing required parameter 'width'.";
    if (args.startX === undefined || args.startY === undefined || args.endX === undefined || args.endY === undefined) {
      return "Missing end-point coordinate fields (startX/startY/endX/endY).";
    }
  } else if (name === 'create_via') {
    if (args.x === undefined || args.y === undefined) return "Missing coordinate fields (x/y).";
    if (args.drillSize === undefined || args.padSize === undefined) return "Missing drillSize or padSize fields.";
  } else if (name === 'add_connection' || name === 'connect_net') {
    if (!args.from || !args.to) return "Missing route endpoints 'from' or 'to'.";
  }
  return null;
}
