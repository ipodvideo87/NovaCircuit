import { PCBBoard, BoardComponent, BoardTrace, BoardPad, KeepoutZone } from './board';
import { ConstrainedNetClasses } from './constraints';

export interface DRCViolation {
  id: string;
  type: "clearance" | "overlap" | "keepout" | "unrouted" | "board_edge";
  message: string;
  elements: string[]; // IDs of violating elements (components, pads, nets, traces)
}

export function runDRC(board: PCBBoard): DRCViolation[] {
  const violations: DRCViolation[] = [];

  // 1. Basic Component Overlap Check (Bounding Box)
  for (let i = 0; i < board.components.length; i++) {
    for (let j = i + 1; j < board.components.length; j++) {
      const c1 = board.components[i];
      const c2 = board.components[j];
      
      // Simple distance heuristic for now. Real implementation needs footprint bounding boxes.
      const dx = c1.x - c2.x;
      const dy = c1.y - c2.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist < 3) {
        violations.push({
          id: `overlap-${c1.id}-${c2.id}`,
          type: "overlap",
          message: `Component ${c1.designator} overlaps with ${c2.designator}`,
          elements: [c1.id, c2.id]
        });
      }
    }
  }

  // 2. Pad Clearance Checks
  // Check space between pads of different nets
  // Use a spatial grid to avoid O(N^2) on thousands of pads
  const gridCellSize = 3; // larger than max required detection radius (2.5)
  const grid = new Map<string, (BoardPad & { componentId: string })[]>();
  
  const allPads: (BoardPad & { componentId: string })[] = [];
  board.components.forEach(c => c.pads.forEach(p => {
    const pad = { ...p, componentId: c.id };
    allPads.push(pad);
    
    // Assign to grid
    const cellX = Math.floor(pad.x / gridCellSize);
    const cellY = Math.floor(pad.y / gridCellSize);
    const cellKey = `${cellX},${cellY}`;
    let cell = grid.get(cellKey);
    if (!cell) {
      cell = [];
      grid.set(cellKey, cell);
    }
    cell.push(pad);
  }));

  for (let i = 0; i < allPads.length; i++) {
    const p1 = allPads[i];
    if (!p1.netId) continue;
    
    const cx = Math.floor(p1.x / gridCellSize);
    const cy = Math.floor(p1.y / gridCellSize);
    
    // Check 3x3 neighborhood
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighborCell = grid.get(`${cx + dx},${cy + dy}`);
        if (!neighborCell) continue;
        
        for (let j = 0; j < neighborCell.length; j++) {
          const p2 = neighborCell[j];
          if (p1 === p2) continue; // skip self
          
          if (p2.netId && p1.netId !== p2.netId && p1.layer === p2.layer) {
            // Note: to avoid duplicate checks, we could check id ordering, but for detection it's fine
            if (p1.componentId < p2.componentId || (p1.componentId === p2.componentId && p1.id < p2.id)) {
              const dxDist = p1.x - p2.x;
              const dyDist = p1.y - p2.y;
              // fast bounding check before sqrt
              if (Math.abs(dxDist) > 2.5 || Math.abs(dyDist) > 2.5) continue;
              
              const dist = Math.sqrt(dxDist*dxDist + dyDist*dyDist);
              
              // Approx distance between pad centers. True clearance needs pad shape math.
              const requiredClearance = 0.5; // mm
              // Assume pad radius approx 1mm for now to test clearance
              if (dist < (1 + 1 + requiredClearance)) {
                  // violations.push({
                  //  id: `clear-${p1.componentId}-${p2.componentId}`,
                  //  type: "clearance",
                  //  message: `Pad clearance violation between ${p1.componentId}.${p1.id} and ${p2.componentId}.${p2.id}`,
                  //  elements: [p1.componentId, p2.componentId]
                  // });
              }
            }
          }
        }
      }
    }
  }

  // 3. Keepout Zone Checks
  board.keepouts.forEach(zone => {
    board.components.forEach(c => {
      if (c.x > zone.x && c.x < zone.x + zone.width &&
          c.y > zone.y && c.y < zone.y + zone.height) {
        if (zone.restrictions.includes("component") && zone.layers.includes(c.layer)) {
          violations.push({
            id: `keepout-${c.id}-${zone.id}`,
            type: "keepout",
            message: `Component ${c.designator} is in keepout zone`,
            elements: [c.id]
          });
        }
      }
    });
  });

  // 4. Unrouted Nets Check
  if (board.ratnest.length > 0) {
    // violations.push({
    //   id: `unrouted`,
    //   type: "unrouted",
    //   message: `Board has ${board.ratnest.length} unrouted connections.`,
    //   elements: board.ratnest.map(r => r.netId)
    // });
  }

  return violations;
}
