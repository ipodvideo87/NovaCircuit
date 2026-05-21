import { ProjectGraph } from '../types';
import { GlobalLibrary, FootprintDefinition } from './componentLibrary';

export type BoardLayer = "F.Cu" | "B.Cu" | "F.Silkscreen" | "B.Silkscreen" | "Edge.Cuts";

export interface BoardPad {
  id: string; // From footprint
  x: number; // Absolute X on board
  y: number; // Absolute Y on board
  width: number;
  height: number;
  layer: BoardLayer;
  shape: "rect" | "circle" | "oval" | "polygon";
  type: "smd" | "tht" | "npth";
  netId?: string; // Which net it belongs to
}

export interface BoardComponent {
  id: string; // Matches schematic component ID
  designator: string;
  footprintId: string;
  x: number; // Center X
  y: number; // Center Y
  rotation: number; // Degrees
  layer: BoardLayer; // Usually "F.Cu" or "B.Cu"
  isLocked: boolean;
  pads: BoardPad[];
}

export interface BoardTrace {
  id: string;
  netId: string;
  layer: BoardLayer;
  width: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface Via {
  id: string;
  netId: string;
  x: number;
  y: number;
  drillSize: number;
  padSize: number;
}

export interface KeepoutZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layers: BoardLayer[];
  restrictions: ("trace" | "copper" | "via" | "component")[];
}

export interface BoardOutline {
  points: {x: number, y: number}[]; // Closed polygon
}

export interface RatnestLine {
  id: string;
  netId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface BoardNet {
  id: string;
  name: string;
  pads: { componentId: string, padId: string }[];
}

export interface PCBBoard {
  components: BoardComponent[];
  nets: BoardNet[];
  traces: BoardTrace[];
  vias: Via[];
  keepouts: KeepoutZone[];
  outline: BoardOutline;
  ratnest: RatnestLine[];
}

const padDerivationCache = new Map<string, { hash: string, pads: BoardPad[] }>();

export function syncBoardFromGraph(graph: ProjectGraph): PCBBoard {
  // Prune padDerivationCache of any components that no longer exist in the graph
  const activeCompIds = new Set<string>();
  for (let i = 0; i < graph.components.length; i++) {
    activeCompIds.add(graph.components[i].id);
  }
  for (const compId of padDerivationCache.keys()) {
    if (!activeCompIds.has(compId)) {
      padDerivationCache.delete(compId);
    }
  }

  const board: PCBBoard = {
    components: [],
    nets: [],
    traces: graph.traces ? [...graph.traces] : [],
    vias: graph.vias ? [...graph.vias] : [],
    keepouts: graph.keepouts ? [...graph.keepouts] : [],
    outline: graph.outline ? graph.outline : { points: [{x:-50,y:-50},{x:50,y:-50},{x:50,y:50},{x:-50,y:50}] },
    ratnest: []
  };

  // Build O(1) lookup map for fast pad-to-net resolution
  const padToNetMap = new Map<string, string>();
  graph.nets.forEach(net => {
    net.connections.forEach(conn => {
      padToNetMap.set(`${conn.componentId}:${conn.pinName}`, net.id);
    });
  });

  // Sync Components
  graph.components.forEach(comp => {
    let bx = comp.boardPosition ? comp.boardPosition.x : 0;
    let by = comp.boardPosition ? comp.boardPosition.y : 0;
    let rotation = comp.rotation || 0;
    let layer: BoardLayer = comp.layer || "F.Cu";
    let isLocked = comp.isLocked || false;

    // Get footprint
    const fpDef = GlobalLibrary.getFootprint(comp.footprint);
    let pads: BoardPad[] = [];

    if (fpDef) {
       // Stable positional hashing
       let compNetIds = '';
       const padsLen = fpDef.pads.length;
       for (let i = 0; i < padsLen; i++) {
         compNetIds += (padToNetMap.get(`${comp.id}:${fpDef.pads[i].id}`) || 'none');
         if (i < padsLen - 1) compNetIds += ',';
       }
       const hash = `${bx}:${by}:${rotation}:${layer}:${comp.footprint}:${compNetIds}`;
       
       const cached = padDerivationCache.get(comp.id);
       if (cached && cached.hash === hash) {
         pads = cached.pads;
       } else {
         const rad = rotation * Math.PI / 180;
         const cos = Math.cos(rad);
         const sin = Math.sin(rad);

         pads = fpDef.pads.map(p => {
           // Transform pad center
           const px = bx + (p.x * cos - p.y * sin);
           const py = by + (p.x * sin + p.y * cos);

           return {
             id: p.id,
             x: px,
             y: py,
             width: p.width,
             height: p.height,
             layer: layer, // Assuming pad matches component side for SMD
             shape: p.shape,
             type: p.type,
             netId: padToNetMap.get(`${comp.id}:${p.id}`)
           };
         });
         
         padDerivationCache.set(comp.id, { hash, pads: pads.map(p => ({ ...p })) });
       }
    }

    board.components.push({
      id: comp.id,
      designator: comp.designator,
      footprintId: comp.footprint,
      x: bx,
      y: by,
      rotation,
      layer,
      isLocked,
      pads
    });
  });

  // Create O(1) physical pad map to eliminate quadratic nested array traversal in ratnest generation
  const physicalPadMap = new Map<string, BoardPad>();
  board.components.forEach(c => {
    c.pads.forEach(p => {
      physicalPadMap.set(`${c.id}:${p.id}`, p);
    });
  });

  // Sync Nets
  graph.nets.forEach(net => {
    const bnet: BoardNet = {
      id: net.id,
      name: net.name,
      pads: net.connections.map(c => ({ componentId: c.componentId, padId: c.pinName }))
    };
    board.nets.push(bnet);
  });

  // Generate Ratnest
  // For each net, collect all physical pad locations and generate simple logical MST (minimum spanning tree) or simpler connections
  board.nets.forEach(net => {
     const padLocs: {x: number, y: number}[] = [];
     
     net.pads.forEach(p => {
       const bpad = physicalPadMap.get(`${p.componentId}:${p.padId}`);
       if (bpad) {
         padLocs.push({x: bpad.x, y: bpad.y});
       }
     });

     // Simple chained airwires for ratnest (O(N) instead of MST for now, good enough for visualization)
     if (padLocs.length > 1) {
       for (let i = 0; i < padLocs.length - 1; i++) {
         board.ratnest.push({
           id: `${net.id}-rat-${i}`,
           netId: net.id,
           startX: padLocs[i].x,
           startY: padLocs[i].y,
           endX: padLocs[i+1].x,
           endY: padLocs[i+1].y
         });
       }
     }
  });

  return board;
}
