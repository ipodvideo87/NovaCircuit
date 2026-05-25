import { BoardLayer } from '../board';

export interface ActionSchema<T> {
  validate: (args: any) => { success: boolean; error?: string; value?: T };
}

// 1. MOVE_COMPONENT
export interface MoveComponentArgs {
  designator: string;
  x: number;
  y: number;
  rotation?: number;
  layer?: BoardLayer;
}

export const moveComponentSchema: ActionSchema<MoveComponentArgs> = {
  validate: (args) => {
    if (!args || typeof args !== 'object') {
      return { success: false, error: 'Arguments must be an object' };
    }
    const { designator, x, y, rotation, layer } = args;
    if (typeof designator !== 'string' || !designator.trim()) {
      return { success: false, error: "Missing or invalid 'designator' (string required)" };
    }
    if (typeof x !== 'number' || isNaN(x)) {
      return { success: false, error: "Missing or invalid 'x' position (number required)" };
    }
    if (typeof y !== 'number' || isNaN(y)) {
      return { success: false, error: "Missing or invalid 'y' position (number required)" };
    }
    if (rotation !== undefined && (typeof rotation !== 'number' || isNaN(rotation))) {
      return { success: false, error: "Invalid 'rotation' (number required)" };
    }
    if (layer !== undefined && layer !== 'F.Cu' && layer !== 'B.Cu' && layer !== 'F.Silkscreen' && layer !== 'B.Silkscreen' && layer !== 'Edge.Cuts') {
      return { success: false, error: `Invalid layer '` + layer + `'. Must be a valid PCB layer` };
    }
    return {
      success: true,
      value: { designator, x, y, rotation, layer }
    };
  }
};

// 2. CREATE_TRACE
export interface CreateTraceArgs {
  netId: string;
  layer: BoardLayer;
  width: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  id?: string;
}

export const createTraceSchema: ActionSchema<CreateTraceArgs> = {
  validate: (args) => {
    if (!args || typeof args !== 'object') {
      return { success: false, error: 'Arguments must be an object' };
    }
    const { netId, layer, width, startX, startY, endX, endY, id } = args;
    if (typeof netId !== 'string' || !netId.trim()) {
      return { success: false, error: "Missing or invalid 'netId' (string required)" };
    }
    if (layer !== 'F.Cu' && layer !== 'B.Cu' && layer !== 'F.Silkscreen' && layer !== 'B.Silkscreen' && layer !== 'Edge.Cuts') {
      return { success: false, error: "Missing or invalid 'layer' (valid BoardLayer required)" };
    }
    if (typeof width !== 'number' || isNaN(width) || width <= 0) {
      return { success: false, error: "Missing or invalid 'width' (positive number required)" };
    }
    if (typeof startX !== 'number' || isNaN(startX)) {
      return { success: false, error: "Missing or invalid 'startX' (number required)" };
    }
    if (typeof startY !== 'number' || isNaN(startY)) {
      return { success: false, error: "Missing or invalid 'startY' (number required)" };
    }
    if (typeof endX !== 'number' || isNaN(endX)) {
      return { success: false, error: "Missing or invalid 'endX' (number required)" };
    }
    if (typeof endY !== 'number' || isNaN(endY)) {
      return { success: false, error: "Missing or invalid 'endY' (number required)" };
    }
    return {
      success: true,
      value: { netId, layer, width, startX, startY, endX, endY, id }
    };
  }
};

// 3. CREATE_VIA
export interface CreateViaArgs {
  netId: string;
  x: number;
  y: number;
  drillSize: number;
  padSize: number;
  id?: string;
}

export const createViaSchema: ActionSchema<CreateViaArgs> = {
  validate: (args) => {
    if (!args || typeof args !== 'object') {
      return { success: false, error: 'Arguments must be an object' };
    }
    const { netId, x, y, drillSize, padSize, id } = args;
    if (typeof netId !== 'string' || !netId.trim()) {
      return { success: false, error: "Missing or invalid 'netId' (string required)" };
    }
    if (typeof x !== 'number' || isNaN(x)) {
      return { success: false, error: "Missing or invalid 'x' position (number required)" };
    }
    if (typeof y !== 'number' || isNaN(y)) {
      return { success: false, error: "Missing or invalid 'y' position (number required)" };
    }
    if (typeof drillSize !== 'number' || isNaN(drillSize) || drillSize <= 0) {
      return { success: false, error: "Missing or invalid 'drillSize' (positive number required)" };
    }
    if (typeof padSize !== 'number' || isNaN(padSize) || padSize <= 0) {
      return { success: false, error: "Missing or invalid 'padSize' (positive number required)" };
    }
    if (padSize < drillSize) {
      return { success: false, error: "'padSize' must be greater than or equal to 'drillSize'" };
    }
    return {
      success: true,
      value: { netId, x, y, drillSize, padSize, id }
    };
  }
};

// 4. ADD_CONNECTION
export interface AddConnectionArgs {
  from: string;
  to: string;
  netType?: string;
}

export const addConnectionSchema: ActionSchema<AddConnectionArgs> = {
  validate: (args) => {
    if (!args || typeof args !== 'object') {
      return { success: false, error: 'Arguments must be an object' };
    }
    const { from, to, netType } = args;
    if (typeof from !== 'string' || !from.includes('.')) {
      return { success: false, error: "Missing or invalid 'from' coordinate (string formatted as 'Comp.Pin' required)" };
    }
    if (typeof to !== 'string' || !to.includes('.')) {
      return { success: false, error: "Missing or invalid 'to' coordinate (string formatted as 'Comp.Pin' required)" };
    }
    return {
      success: true,
      value: { from, to, netType }
    };
  }
};

// 5. DELETE_TRACE
export interface DeleteTraceArgs {
  traceId: string;
}

export const deleteTraceSchema: ActionSchema<DeleteTraceArgs> = {
  validate: (args) => {
    if (!args || typeof args !== 'object') {
      return { success: false, error: 'Arguments must be an object' };
    }
    const { traceId } = args;
    if (typeof traceId !== 'string' || !traceId.trim()) {
      return { success: false, error: "Missing or invalid 'traceId' (string required)" };
    }
    return {
      success: true,
      value: { traceId }
    };
  }
};

// 6. UPDATE_TRACE_WIDTH
export interface UpdateTraceWidthArgs {
  traceId: string;
  newWidth: number;
}

export const updateTraceWidthSchema: ActionSchema<UpdateTraceWidthArgs> = {
  validate: (args) => {
    if (!args || typeof args !== 'object') {
      return { success: false, error: 'Arguments must be an object' };
    }
    const { traceId, newWidth } = args;
    if (typeof traceId !== 'string' || !traceId.trim()) {
      return { success: false, error: "Missing or invalid 'traceId' (string required)" };
    }
    if (typeof newWidth !== 'number' || isNaN(newWidth) || newWidth <= 0) {
      return { success: false, error: "Missing or invalid 'newWidth' (positive number required)" };
    }
    return {
      success: true,
      value: { traceId, newWidth }
    };
  }
};

// 7. ADD_COPPER_POUR
export interface AddCopperPourArgs {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layers: BoardLayer[];
  restrictions: ('trace' | 'copper' | 'via' | 'component')[];
}

export const addCopperPourSchema: ActionSchema<AddCopperPourArgs> = {
  validate: (args) => {
    if (!args || typeof args !== 'object') {
      return { success: false, error: 'Arguments must be an object' };
    }
    const { id, x, y, width, height, layers, restrictions } = args;
    if (typeof id !== 'string' || !id.trim()) {
      return { success: false, error: "Missing or invalid 'id' designation (string required)" };
    }
    if (typeof x !== 'number' || isNaN(x)) {
      return { success: false, error: "Missing or invalid 'x' position (number required)" };
    }
    if (typeof y !== 'number' || isNaN(y)) {
      return { success: false, error: "Missing or invalid 'y' position (number required)" };
    }
    if (typeof width !== 'number' || isNaN(width) || width <= 0) {
      return { success: false, error: "Missing or invalid 'width' (positive number required)" };
    }
    if (typeof height !== 'number' || isNaN(height) || height <= 0) {
      return { success: false, error: "Missing or invalid 'height' (positive number required)" };
    }
    if (!Array.isArray(layers) || layers.some(l => l !== 'F.Cu' && l !== 'B.Cu' && l !== 'F.Silkscreen' && l !== 'B.Silkscreen' && l !== 'Edge.Cuts')) {
      return { success: false, error: "Missing or invalid 'layers' (array of BoardLayer required)" };
    }
    if (!Array.isArray(restrictions) || restrictions.some(r => r !== 'trace' && r !== 'copper' && r !== 'via' && r !== 'component')) {
      return { success: false, error: "Missing or invalid 'restrictions' (array of trace|copper|via|component required)" };
    }
    return {
      success: true,
      value: { id, x, y, width, height, layers, restrictions }
    };
  }
};

// 8. ADD_VIA_STITCHING
export interface AddViaStitchingArgs {
  netId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  gridSpacing: number;
  drillSize: number;
  padSize: number;
}

export const addViaStitchingSchema: ActionSchema<AddViaStitchingArgs> = {
  validate: (args) => {
    if (!args || typeof args !== 'object') {
      return { success: false, error: 'Arguments must be an object' };
    }
    const { netId, x1, y1, x2, y2, gridSpacing, drillSize, padSize } = args;
    if (typeof netId !== 'string' || !netId.trim()) {
      return { success: false, error: "Missing or invalid 'netId' (string required)" };
    }
    if (typeof x1 !== 'number' || isNaN(x1)) {
      return { success: false, error: "Missing or invalid 'x1' boundary limit (number required)" };
    }
    if (typeof y1 !== 'number' || isNaN(y1)) {
      return { success: false, error: "Missing or invalid 'y1' boundary limit (number required)" };
    }
    if (typeof x2 !== 'number' || isNaN(x2)) {
      return { success: false, error: "Missing or invalid 'x2' boundary limit (number required)" };
    }
    if (typeof y2 !== 'number' || isNaN(y2)) {
      return { success: false, error: "Missing or invalid 'y2' boundary limit (number required)" };
    }
    if (typeof gridSpacing !== 'number' || isNaN(gridSpacing) || gridSpacing <= 0) {
      return { success: false, error: "Missing or invalid 'gridSpacing' spacing limit (positive number required)" };
    }
    if (typeof drillSize !== 'number' || isNaN(drillSize) || drillSize <= 0) {
      return { success: false, error: "Missing or invalid 'drillSize' (positive number required)" };
    }
    if (typeof padSize !== 'number' || isNaN(padSize) || padSize <= 0) {
      return { success: false, error: "Missing or invalid 'padSize' (positive number required)" };
    }
    return {
      success: true,
      value: { netId, x1, y1, x2, y2, gridSpacing, drillSize, padSize }
    };
  }
};

// 9. ROUTE_DIFFERENTIAL_PAIR
export interface RouteDifferentialPairArgs {
  positiveNetId: string;
  negativeNetId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  spacing: number;
  width: number;
  layer: BoardLayer;
}

export const routeDifferentialPairSchema: ActionSchema<RouteDifferentialPairArgs> = {
  validate: (args) => {
    if (!args || typeof args !== 'object') {
      return { success: false, error: 'Arguments must be an object' };
    }
    const { positiveNetId, negativeNetId, startX, startY, endX, endY, spacing, width, layer } = args;
    if (typeof positiveNetId !== 'string' || !positiveNetId.trim()) {
      return { success: false, error: "Missing or invalid 'positiveNetId' (string required)" };
    }
    if (typeof negativeNetId !== 'string' || !negativeNetId.trim()) {
      return { success: false, error: "Missing or invalid 'negativeNetId' (string required)" };
    }
    if (typeof startX !== 'number' || isNaN(startX)) {
      return { success: false, error: "Missing or invalid 'startX' (number required)" };
    }
    if (typeof startY !== 'number' || isNaN(startY)) {
      return { success: false, error: "Missing or invalid 'startY' (number required)" };
    }
    if (typeof endX !== 'number' || isNaN(endX)) {
      return { success: false, error: "Missing or invalid 'endX' (number required)" };
    }
    if (typeof endY !== 'number' || isNaN(endY)) {
      return { success: false, error: "Missing or invalid 'endY' (number required)" };
    }
    if (typeof spacing !== 'number' || isNaN(spacing) || spacing <= 0) {
      return { success: false, error: "Missing or invalid 'spacing' (positive number required)" };
    }
    if (typeof width !== 'number' || isNaN(width) || width <= 0) {
      return { success: false, error: "Missing or invalid 'width' (positive number required)" };
    }
    if (layer !== 'F.Cu' && layer !== 'B.Cu' && layer !== 'F.Silkscreen' && layer !== 'B.Silkscreen' && layer !== 'Edge.Cuts') {
      return { success: false, error: "Missing or invalid 'layer' (valid BoardLayer required)" };
    }
    return {
      success: true,
      value: { positiveNetId, negativeNetId, startX, startY, endX, endY, spacing, width, layer }
    };
  }
};

// Map of action schemas
export const actionSchemaMap: Record<string, ActionSchema<any>> = {
  // Case insensitive keys or lowercase mappings
  'move_component': moveComponentSchema,
  'create_trace': createTraceSchema,
  'create_via': createViaSchema,
  'add_connection': addConnectionSchema,
  'connect_net': addConnectionSchema, // Fallback alias
  'delete_trace': deleteTraceSchema,
  'update_trace_width': updateTraceWidthSchema,
  'add_copper_pour': addCopperPourSchema,
  'create_keepout': addCopperPourSchema, // Keepout alias
  'add_via_stitching': addViaStitchingSchema,
  'route_differential_pair': routeDifferentialPairSchema
};
