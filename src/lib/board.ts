import { ProjectGraph, NetClass, DifferentialPair } from '../types';
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
  netClasses?: NetClass[];
  diffPairs?: DifferentialPair[];
}

const padDerivationCache = new Map<string, { hash: string, pads: BoardPad[] }>();

// Synthesize a generic dual-row / grid footprint from a component's logical pins
// when no library footprint exists. Guarantees every part has real, routable pads.
function synthesizePads(
  pins: { name: string }[],
  bx: number,
  by: number,
  rotation: number,
  layer: BoardLayer,
  padToNetMap: Map<string, string>,
  compId: string
): BoardPad[] {
  const n = pins.length;
  if (n === 0) return [];

  const rad = rotation * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const place = (lx: number, ly: number) => ({ x: bx + (lx * cos - ly * sin), y: by + (lx * sin + ly * cos) });

  let local: { id: string; lx: number; ly: number }[] = [];

  if (n <= 2) {
    // Passive-style: two pads on a horizontal axis
    const pitch = 2.0;
    pins.forEach((p, i) => local.push({ id: p.name, lx: (i === 0 ? -pitch / 2 : pitch / 2), ly: 0 }));
    if (n === 1) local = [{ id: pins[0].name, lx: 0, ly: 0 }];
  } else if (n <= 16) {
    // Dual-row IC (SOIC/QFN-edge style): left column top→bottom, right column bottom→top
    const pitch = 1.27;
    const rows = Math.ceil(n / 2);
    const colX = Math.max(2.5, rows * pitch * 0.35);
    pins.forEach((p, i) => {
      if (i < rows) {
        local.push({ id: p.name, lx: -colX, ly: (i - (rows - 1) / 2) * pitch });
      } else {
        const j = i - rows;
        const rightRows = n - rows;
        local.push({ id: p.name, lx: colX, ly: ((rightRows - 1) / 2 - j) * pitch });
      }
    });
  } else {
    // Quad/grid (QFP/BGA-style): wrap pins around 4 edges
    const perSide = Math.ceil(n / 4);
    const pitch = 0.8;
    const half = (perSide - 1) / 2 * pitch;
    const ext = half + 1.5;
    pins.forEach((p, i) => {
      const side = Math.floor(i / perSide);
      const idx = i % perSide;
      const off = (idx - (perSide - 1) / 2) * pitch;
      if (side === 0) local.push({ id: p.name, lx: -ext, ly: off });
      else if (side === 1) local.push({ id: p.name, lx: off, ly: ext });
      else if (side === 2) local.push({ id: p.name, lx: ext, ly: -off });
      else local.push({ id: p.name, lx: -off, ly: -ext });
    });
  }

  return local.map(lp => {
    const pos = place(lp.lx, lp.ly);
    return {
      id: lp.id,
      x: pos.x,
      y: pos.y,
      width: n <= 2 ? 0.9 : 0.6,
      height: n <= 2 ? 1.3 : 1.4,
      layer,
      shape: "rect" as const,
      type: "smd" as const,
      netId: padToNetMap.get(`${compId}:${lp.id}`)
    };
  });
}

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
    ratnest: [],
    netClasses: graph.netClasses ? [...graph.netClasses] : [],
    diffPairs: graph.diffPairs ? [...graph.diffPairs] : []
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
       // Map each footprint pad to an effective net key. The AI connects nets by
       // PIN NAME, so we bind footprint pad geometry to the component's pin names
       // positionally (pad[i] -> pins[i].name). Extra footprint pads (thermal EP,
       // USB shield, unused pins) keep their own id. This preserves accurate
       // physical geometry while keeping net/routing resolution correct.
       const compPins = comp.pins || [];
       const padKey = (i: number): string => {
         const pin = compPins[i] as any;
         return (pin && pin.name != null) ? String(pin.name) : fpDef.pads[i].id;
       };

       const padsLen = fpDef.pads.length;
       // Any logical pins beyond the footprint's pad count (e.g. names appended by
       // connect_net) get synthesized pads below, so routing is never silently lost.
       const leftoverPins = compPins.slice(padsLen).map((p: any) => ({ name: String(p?.name) }));

       let compNetIds = '';
       for (let i = 0; i < padsLen; i++) {
         compNetIds += (padToNetMap.get(`${comp.id}:${padKey(i)}`) || 'none') + ',';
       }
       leftoverPins.forEach(p => { compNetIds += (padToNetMap.get(`${comp.id}:${p.name}`) || 'none') + ','; });
       const pinSig = compPins.map((p: any) => p?.name ?? '').join('|');
       const hash = `${bx}:${by}:${rotation}:${layer}:${comp.footprint}:${pinSig}:${compNetIds}`;
       
       const cached = padDerivationCache.get(comp.id);
       if (cached && cached.hash === hash) {
         pads = cached.pads;
       } else {
         const rad = rotation * Math.PI / 180;
         const cos = Math.cos(rad);
         const sin = Math.sin(rad);

         pads = fpDef.pads.map((p, i) => {
           // Transform pad center
           const px = bx + (p.x * cos - p.y * sin);
           const py = by + (p.x * sin + p.y * cos);
           const key = padKey(i);

           return {
             id: key,
             x: px,
             y: py,
             width: p.width,
             height: p.height,
             layer: layer, // Assuming pad matches component side for SMD
             shape: p.shape,
             type: p.type,
             netId: padToNetMap.get(`${comp.id}:${key}`)
           };
         });

         if (leftoverPins.length > 0) {
           const offsetY = (fpDef.dimensions?.height || 4) / 2 + 2;
           pads = pads.concat(synthesizePads(leftoverPins, bx, by + offsetY, rotation, layer, padToNetMap, comp.id));
         }
         
         padDerivationCache.set(comp.id, { hash, pads: pads.map(p => ({ ...p })) });
       }
    } else {
       // No library footprint: synthesize routable pads from the component's logical pins
       const pinList = (comp.pins || []).map(p => ({ name: (p as any).name }));
       let compNetIds = '';
       for (let i = 0; i < pinList.length; i++) {
         compNetIds += (padToNetMap.get(`${comp.id}:${pinList[i].name}`) || 'none');
         if (i < pinList.length - 1) compNetIds += ',';
       }
       const pinSig = pinList.map(p => p.name).join('|');
       const hash = `SYN:${bx}:${by}:${rotation}:${layer}:${pinSig}:${compNetIds}`;
       const cached = padDerivationCache.get(comp.id);
       if (cached && cached.hash === hash) {
         pads = cached.pads;
       } else {
         pads = synthesizePads(pinList, bx, by, rotation, layer, padToNetMap, comp.id);
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
