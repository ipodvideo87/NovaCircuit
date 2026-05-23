import { PCBBoard } from './board';

// Helper to pad strings for formatting
function padString(str: string, len: number, padLeft = false): string {
  if (str.length >= len) return str.substring(0, len);
  const diff = len - str.length;
  const padding = " ".repeat(diff);
  return padLeft ? padding + str : str + padding;
}

// 1. Gerber RS-274X Generator (compliant dec format: decimals 2:4)
export function generateGerberRS274X(board: PCBBoard, layer: "F.Cu" | "B.Cu" | "F.Silkscreen" | "B.Silkscreen" | "Edge.Cuts"): string {
  let g = "";
  // Header
  g += `%FSLAX24Y24*% \r\n`; // Absolute coordinates, 2 integer and 4 decimal digits
  g += `%MOIN*% \r\n`;      // Measurement Unit: Inches
  g += `%IPDEC*% \r\n`;     // Positive image polarities
  g += `%LPD*% \r\n`;       // Layer Polarity: Dark
  
  // Custom Apertures definitions
  if (layer === "Edge.Cuts") {
    g += `%ADD10C,0.0100*% \r\n`; // Circular aperture with diameter 0.010 inches
    g += `D10* \r\n`;
  } else {
    g += `%ADD10C,0.0100*% \r\n`; // Aperture 10: Trace circular draw
    g += `%ADD11C,0.0400*% \r\n`; // Aperture 11: Via/circular pad flash
    g += `%ADD12R,0.0600X0.0400*% \r\n`; // Aperture 12: SMD Rectangular pad flash
    g += `D10* \r\n`;
  }

  // Linear interpolation mode, moves/draws
  g += `G01* \r\n`;

  const formatCoord = (val: number): string => {
    // Gerber numbers are formatted in 2:4 decimal format. Unit is Inches!
    // So 1mm = 0.0393701 Inches. Let's convert Board coords to Inches first.
    const inVal = val * 0.0393701;
    // We add an offset to avoid negative coordinate limitations of some simple gerber parsers
    const shifted = inVal + 5.0000; 
    const intPart = Math.floor(shifted).toString().padStart(2, "0");
    const decPart = Math.floor((shifted % 1) * 10000).toString().padEnd(4, "0").substring(0, 4);
    return `X${intPart}${decPart}Y`;
  };

  const formatCoordY = (val: number): string => {
    const inVal = val * 0.0393701;
    const shifted = inVal + 5.0000;
    const intPart = Math.floor(shifted).toString().padStart(2, "0");
    const decPart = Math.floor((shifted % 1) * 10000).toString().padEnd(4, "0").substring(0, 4);
    return `${intPart}${decPart}`;
  };

  // Plot Board outline
  if (layer === "Edge.Cuts") {
    const pts = board.outline.points;
    if (pts.length > 0) {
      g += `${formatCoord(pts[0].x)}${formatCoordY(pts[0].y)}D02* \r\n`; // move
      for (let i = 1; i < pts.length; i++) {
        g += `${formatCoord(pts[i].x)}${formatCoordY(pts[i].y)}D01* \r\n`; // draw
      }
      // Close loop
      g += `${formatCoord(pts[0].x)}${formatCoordY(pts[0].y)}D01* \r\n`;
    }
  }

  // Plot Trace geometry
  if (layer === "F.Cu" || layer === "B.Cu") {
    g += `D10* \r\n`; // select drawing aperture
    board.traces.forEach(t => {
      if (t.layer === layer) {
        g += `${formatCoord(t.startX)}${formatCoordY(t.startY)}D02* \r\n`; // move
        g += `${formatCoord(t.endX)}${formatCoordY(t.endY)}D01* \r\n`;   // draw
      }
    });

    // Flash SMD and Through Hole pads matching the copper layer
    board.components.forEach(comp => {
      const matchCompLayer = comp.layer === layer;
      comp.pads.forEach((pad: any) => {
        const isSmd = pad.type === "smd";
        const matchesSmd = isSmd && matchCompLayer;
        const matchesTht = !isSmd; // Through hole pads are on F.Cu AND B.Cu always
        
        if (matchesSmd) {
          g += `D12* \r\n`; // select Rectangular aperture
          g += `${formatCoord(pad.x)}${formatCoordY(pad.y)}D03* \r\n`; // flash
        } else if (matchesTht) {
          g += `D11* \r\n`; // select Circular aperture
          g += `${formatCoord(pad.x)}${formatCoordY(pad.y)}D03* \r\n`; // flash
        }
      });
    });
  }

  // Plot Silkscreen geometry (Outline boxes + RefDes Text drawing)
  if (layer === "F.Silkscreen" || layer === "B.Silkscreen") {
    const isTop = layer === "F.Silkscreen";
    g += `D10* \r\n`;
    board.components.forEach(comp => {
      const compTop = comp.layer === "F.Cu" || comp.layer === "F.Silkscreen";
      if (compTop === isTop) {
        // Draw outline box (approximate square based on 4-6 units width)
        const size = 5.0; // mm
        const left = comp.x - size;
        const right = comp.x + size;
        const top = comp.y - size;
        const bottom = comp.y + size;
        
        g += `${formatCoord(left)}${formatCoordY(top)}D02* \r\n`;
        g += `${formatCoord(right)}${formatCoordY(top)}D01* \r\n`;
        g += `${formatCoord(right)}${formatCoordY(bottom)}D01* \r\n`;
        g += `${formatCoord(left)}${formatCoordY(bottom)}D01* \r\n`;
        g += `${formatCoord(left)}${formatCoordY(top)}D01* \r\n`;
      }
    });
  }

  g += "M02* \r\n"; // End of File
  return g;
}

// 2. Excellon Drill Generator
export function generateExcellonDrill(board: PCBBoard): string {
  let d = "";
  // Header
  d += "M48 \r\n";
  d += "METRIC,LZ \r\n"; // Metric millimeters, Lead zero suppression
  d += "T01C0.8 \r\n";    // Tool 1 definition: 0.8mm Tool
  d += "% \r\n";
  d += "G90 \r\n";       // Absolute coordinate system
  d += "T01 \r\n";       // Select Tool 1
  
  // Print all Via & Component through-hole locations
  const formatExcellonCoord = (val: number): string => {
    // Pad coordinates to 3-integer 3-decimal fixed mm
    const shifted = val + 50.0; // Offset alignment
    const intPart = Math.floor(shifted).toString().padStart(3, "0");
    const decPart = Math.floor((shifted % 1) * 1000).toString().padEnd(3, "0").substring(0, 3);
    return `${intPart}${decPart}`;
  };

  // Collect active vias
  board.vias.forEach(v => {
    d += `X${formatExcellonCoord(v.x)}Y${formatExcellonCoord(v.y)} \r\n`;
  });

  // Collect through-hole pads from component footprints
  board.components.forEach(c => {
    c.pads.forEach((pad: any) => {
       if (pad.type === "tht") {
         d += `X${formatExcellonCoord(pad.x)}Y${formatExcellonCoord(pad.y)} \r\n`;
       }
    });
  });

  d += "M30 \r\n"; // End of Program
  return d;
}

// 3. IPC-D-356 Netlist Generator
export function generateIPCD356Netlist(board: PCBBoard): string {
  let ip = "";
  ip += "C  IPC-D-356 NETLIST FILE GENERATOR \r\n";
  ip += "C  CREATED BY SHIELD SYSTEM \r\n";
  ip += "PARAM  METRIC \r\n";

  // Build record lines
  // Columns format matches IPC standard record structure (Type 311/317/327 pin descriptors)
  board.nets.forEach(net => {
     net.pads.forEach(p => {
       const comp = board.components.find(c => c.id === p.componentId);
       const pad = comp?.pads.find(pd => pd.id === p.padId);
       if (comp && pad) {
         const recordType = "311"; // Standard single-sided test point
         const netName = padString(net.name, 14);
         const refDes = padString(comp.designator, 8);
         const pinNum = padString(pad.id, 4);
         
         const xCoord = Math.floor((pad.x + 50) * 100).toString().padStart(7, "0"); // decimillimeters
         const yCoord = Math.floor((pad.y + 50) * 100).toString().padStart(7, "0");
         
         ip += `${recordType}${netName}   ${refDes}${pinNum}P  ${xCoord}${yCoord}  S1 \r\n`;
       }
     });
  });

  ip += "999 \r\n"; // End of File
  return ip;
}

// 4. Pick and Place CSV Generator
export function generatePickAndPlaceCSV(board: PCBBoard): string {
  let csv = "Designator,Comment,Footprint,X_mm,Y_mm,Rotation,Layer\n";
  board.components.forEach(c => {
    const layerHex = c.layer === "B.Cu" ? "Bottom" : "Top";
    csv += `${c.designator},"${c.footprintId}","${c.footprintId}",${c.x.toFixed(3)},${c.y.toFixed(3)},${c.rotation || 0},${layerHex}\n`;
  });
  return csv;
}

// 5. BOM (Bill of Materials) CSV Generator
export function generateBOMCSV(board: PCBBoard): string {
  // Group components by footprint & value/metadata
  const groups = new Map<string, { designators: string[]; footprint: string; desc: string }>();
  
  board.components.forEach(c => {
    const key = `${c.footprintId}-${c.designator.replace(/[0-9]/g, "")}`;
    let item = groups.get(key);
    if (!item) {
      item = {
        designators: [],
        footprint: c.footprintId,
        desc: `${c.footprintId} Integrated Module Component`
      };
      groups.set(key, item);
    }
    item.designators.push(c.designator);
  });

  let csv = "RefDes,Quantity,Value/Description,Footprint,Manufacturer,Manufacturer Part Number,Vendor Link\n";
  groups.forEach((v, k) => {
    const sortedDes = v.designators.sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).join(", ");
    csv += `"${sortedDes}",${v.designators.length},"${v.desc}","${v.footprint}","Shield Semiconductor","SHIELD-${v.footprint}","https://shield.tech/parts"\n`;
  });
  return csv;
}

// 6. 3D Mesh Generator for Custom Isometric/SVG 3D Board Renderer
export interface ComponentGeometry3D {
  name: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotation: number;
  color: string;
}

export function generate3DViewerMesh(board: PCBBoard): { components3D: ComponentGeometry3D[], boardWidth: number, boardHeight: number } {
  // Generates physical 3D rectangular cuboids representation for component packages
  const components3D: ComponentGeometry3D[] = board.components.map(c => {
     let color = "#374151"; // dark gray standard
     let width = 6;
     let height = 6;
     let depth = 3;
     
     if (c.footprintId.includes("0805")) {
        color = "#b91c1c"; // Resistor/Smd Red package shape
        width = 4;
        height = 2;
        depth = 1.5;
     } else if (c.footprintId.includes("SOIC") || c.footprintId.includes("TSSOP")) {
        color = "#111827"; // Black IC plastic chip shape
        width = 10;
        height = 8;
        depth = 2.5;
     } else if (c.footprintId.includes("DO") || c.footprintId.includes("SOD")) {
        color = "#047857"; // Green diode package shape
        width = 6;
        height = 3;
        depth = 2.5;
     } else if (c.footprintId.includes("XTAL")) {
        color = "#9ca3af"; // Silver quartz package shape
        width = 8;
        height = 5;
        depth = 4;
     }

     return {
        name: c.designator,
        x: c.x,
        y: c.y,
        z: c.layer === "B.Cu" ? -depth / 2 : depth / 2, // Placement depth matching top/bottom copper layers
        width,
        height,
        depth,
        rotation: c.rotation,
        color
     };
  });

  return {
    components3D,
    boardWidth: 100,
    boardHeight: 100
  };
}
