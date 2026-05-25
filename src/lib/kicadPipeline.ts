import { ProjectGraph, PCBComponent, Net, Point, AIAction, ProjectSheet } from '../types';
import { BoardTrace, Via, KeepoutZone, BoardLayer } from './board';

/**
 * Structured S-Expression element for parsing KiCad formats.
 */
export interface SExpr {
  name: string;
  args: (string | SExpr)[];
}

/**
 * Manufacturing specification configuration parameters.
 */
export interface ManufacturingSpecs {
  layerCount: 2 | 4 | 6;
  boardThicknessMm: number; // e.g. 1.6
  copperWeightOz: number;  // e.g. 1.0
  minimumClearanceMm: number;
  surfaceFinish: "HASL_LEAD_FREE" | "ENIG" | "HASL_LEADED" | "OSP";
  solderMaskColor: "green" | "black" | "blue" | "red" | "white";
  silkscreenColor: "white" | "black" | "yellow";
}

/**
 * Log capturing details about conversions and imports.
 */
export interface ImportAuditLog {
  timestamp: string;
  sourceFormat: "KiCad_Sch" | "KiCad_Pcb" | "Symbol_S_Expr" | "Footprint_S_Expr";
  success: boolean;
  componentsLoaded: number;
  netsLoaded: number;
  tracesLoaded: number;
  warnings: string[];
}

/**
 * Raw KiCad syntax tokenize helper.
 */
export function tokenizeSExpr(input: string): string[] {
  const tokens: string[] = [];
  let currentToken = "";
  let insideQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
      currentToken += char;
    } else if (!insideQuotes && (char === '(' || char === ')' || /\s/.test(char))) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = "";
      }
      if (char === '(' || char === ')') {
        tokens.push(char);
      }
    } else {
      currentToken += char;
    }
  }
  if (currentToken) {
    tokens.push(currentToken);
  }
  return tokens;
}

/**
 * High-performance S-Expression recursive list compiled parser.
 */
export function parseSExprTokens(tokens: string[]): SExpr | string {
  let index = 0;

  function parseNode(): SExpr | string {
    if (index >= tokens.length) {
      return "";
    }
    if (tokens[index] !== '(') {
      const val = tokens[index];
      index++;
      // Clean string quotes matching fields
      if (val && val.startsWith('"') && val.endsWith('"')) {
        return val.substring(1, val.length - 1);
      }
      return val || "";
    }

    index++; // skip '('
    const nodeName = tokens[index] || "";
    index++; // skip name

    const args: (string | SExpr)[] = [];
    while (index < tokens.length && tokens[index] !== ')') {
      const res = parseNode();
      if (res !== "") {
        args.push(res);
      }
    }

    if (tokens[index] === ')') {
      index++; // skip ')'
    }

    return { name: nodeName, args };
  }

  const result = parseNode();
  return result;
}

/**
 * KiCad Compatibility & Mechanical/Manufacturing Interoperability Engine.
 */
export class KiCadCompatibilityPipeline {
  constructor(private defaultSpecs?: ManufacturingSpecs) {}

  /**
   * Retrieves default manufacturing parameters if none are configured.
   */
  public getManufacturingSpecs(): ManufacturingSpecs {
    return this.defaultSpecs || {
      layerCount: 2,
      boardThicknessMm: 1.6,
      copperWeightOz: 1.0,
      minimumClearanceMm: 0.15,
      surfaceFinish: "ENIG",
      solderMaskColor: "green",
      silkscreenColor: "white"
    };
  }

  /**
   * Translates hierarchical sub-sheets into a unified flat ProjectGraph.
   */
  public flattenHierarchicalSheets(sheets: ProjectSheet[]): ProjectGraph {
    const flatGraph: ProjectGraph = {
      components: [],
      nets: []
    };

    sheets.forEach(sheet => {
      // Import sheet-level components
      sheet.components.forEach(comp => {
        flatGraph.components.push({
          ...comp,
          hierarchyPath: comp.hierarchyPath || sheet.name,
          parentSheetId: sheet.id
        });
      });

      // Map netlist connections checking sheet-level ports
      sheet.nets.forEach(net => {
        let matchedNet = flatGraph.nets.find(n => n.name === net.name);
        if (!matchedNet) {
          matchedNet = {
            id: `net_${net.name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`,
            name: net.name,
            netClass: net.netClass,
            type: net.type,
            connections: []
          };
          flatGraph.nets.push(matchedNet);
        }

        net.connections.forEach(conn => {
          matchedNet!.connections.push({
            componentId: conn.componentId,
            pinName: conn.pinName
          });
        });
      });
    });

    return flatGraph;
  }

  /**
   * Parses a KiCad schematic file (.kicad_sch representation) to build the logical netlist.
   */
  public parseKiCadSchematic(sExprContent: string): { graph: ProjectGraph; actions: AIAction[]; audit: ImportAuditLog } {
    const tokens = tokenizeSExpr(sExprContent);
    const rootNode = parseSExprTokens(tokens);
    const actions: AIAction[] = [];
    const warnings: string[] = [];

    const graph: ProjectGraph = {
      components: [],
      nets: []
    };

    if (typeof rootNode === "string" || rootNode.name !== "kicad_sch") {
      warnings.push("File is not a standard KiCad schematic root frame. Attempting heuristic scan anyway.");
    }

    // Heuristically extract symbols and nets from list
    const scanAndProcess = (node: SExpr) => {
      if (node.name === "symbol") {
        // Parse a component declaration
        // (symbol (lib_id "MCU_ESP32") (at 100 150) (resdes "U1") ... )
        let libId = "";
        let reference = "";
        let xCoord = 0;
        let yCoord = 0;

        for (const arg of node.args) {
          if (typeof arg !== "string") {
            if (arg.name === "lib_id") {
              libId = arg.args[0] as string;
            } else if (arg.name === "at") {
              xCoord = parseFloat(arg.args[0] as string) || 0;
              yCoord = parseFloat(arg.args[1] as string) || 0;
            } else if (arg.name === "property" && arg.args[0] === "Reference") {
              reference = arg.args[1] as string;
            }
          }
        }

        if (!reference) {
          reference = `U_${Math.floor(Math.random() * 100)}`;
        }

        const comp: PCBComponent = {
          id: `comp_${reference.toLowerCase()}_${Date.now()}`,
          designator: reference,
          partType: libId || "Component",
          footprint: libId ? `FP_${libId}` : "0805",
          position: { x: xCoord, y: yCoord },
          pins: [],
          properties: { Part_Number: libId }
        };

        graph.components.push(comp);

        actions.push({
          name: "create_component",
          args: {
            id: comp.id,
            designator: comp.designator,
            partType: comp.partType,
            footprint: comp.footprint,
            x: comp.position.x,
            y: comp.position.y,
            properties: comp.properties
          },
          reasoning: "KiCad schematic S-expression symbol migration block."
        });
      }

      // Check child nesting lists
      for (const arg of node.args) {
        if (typeof arg !== "string") {
          scanAndProcess(arg);
        }
      }
    };

    if (typeof rootNode !== "string") {
      scanAndProcess(rootNode);
    }

    const audit: ImportAuditLog = {
      timestamp: new Date().toISOString(),
      sourceFormat: "KiCad_Sch",
      success: true,
      componentsLoaded: graph.components.length,
      netsLoaded: graph.nets.length,
      tracesLoaded: 0,
      warnings
    };

    return { graph, actions, audit };
  }

  /**
   * Parses a KiCad PCB layout file (.kicad_pcb representation) to extract physical copper trace and via positions.
   */
  public parseKiCadPCB(sExprContent: string): { traces: BoardTrace[]; vias: Via[]; audit: ImportAuditLog } {
    const tokens = tokenizeSExpr(sExprContent);
    const rootNode = parseSExprTokens(tokens);
    const warnings: string[] = [];

    const traces: BoardTrace[] = [];
    const vias: Via[] = [];

    const scanSegments = (node: SExpr) => {
      if (node.name === "segment") {
        // (segment (start 10.5 15.2) (end 12.0 15.2) (width 0.25) (layer "F.Cu") (net 3))
        let startPoint: Point = { x: 0, y: 0 };
        let endPoint: Point = { x: 0, y: 0 };
        let width = 0.2;
        let layer: BoardLayer = "F.Cu";
        let netId = "net_unspecified";

        for (const arg of node.args) {
          if (typeof arg !== "string") {
            if (arg.name === "start") {
              startPoint = {
                x: parseFloat(arg.args[0] as string) || 0,
                y: parseFloat(arg.args[1] as string) || 0
              };
            } else if (arg.name === "end") {
              endPoint = {
                x: parseFloat(arg.args[0] as string) || 0,
                y: parseFloat(arg.args[1] as string) || 0
              };
            } else if (arg.name === "width") {
              width = parseFloat(arg.args[0] as string) || 0.2;
            } else if (arg.name === "layer") {
              layer = (arg.args[0] as BoardLayer) || "F.Cu";
            } else if (arg.name === "net") {
              netId = `net_${arg.args[0]}`;
            }
          }
        }

        traces.push({
          id: `trace_imported_${traces.length}_${Date.now()}`,
          netId,
          layer,
          width,
          startX: startPoint.x,
          startY: startPoint.y,
          endX: endPoint.x,
          endY: endPoint.y
        });
      } else if (node.name === "via") {
        // (via (at 10 10) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 3))
        let atPoint: Point = { x: 0, y: 0 };
        let size = 0.6;
        let drill = 0.3;
        let netId = "net_unspecified";

        for (const arg of node.args) {
          if (typeof arg !== "string") {
            if (arg.name === "at") {
              atPoint = {
                x: parseFloat(arg.args[0] as string) || 0,
                y: parseFloat(arg.args[1] as string) || 0
              };
            } else if (arg.name === "size") {
              size = parseFloat(arg.args[0] as string) || 0.6;
            } else if (arg.name === "drill") {
              drill = parseFloat(arg.args[0] as string) || 0.3;
            } else if (arg.name === "net") {
              netId = `net_${arg.args[0]}`;
            }
          }
        }

        vias.push({
          id: `via_imported_${vias.length}_${Date.now()}`,
          netId,
          x: atPoint.x,
          y: atPoint.y,
          drillSize: drill,
          padSize: size
        });
      }

      for (const arg of node.args) {
        if (typeof arg !== "string") {
          scanSegments(arg);
        }
      }
    };

    if (typeof rootNode !== "string") {
      scanSegments(rootNode);
    }

    const audit: ImportAuditLog = {
      timestamp: new Date().toISOString(),
      sourceFormat: "KiCad_Pcb",
      success: true,
      componentsLoaded: 0,
      netsLoaded: 0,
      tracesLoaded: traces.length,
      warnings
    };

    return { traces, vias, audit };
  }

  /**
   * Generates assembly-compliant bill of materials (BOM), Pick-and-Place component coordinates, and physical parameters files.
   */
  public generateManufacturingExports(graph: ProjectGraph, specs?: ManufacturingSpecs): { bomCsv: string; posCsv: string; ipcHeaders: string } {
    const activeSpecs = specs || this.getManufacturingSpecs();

    // 1. Generate BOM text spreadsheet representation
    let bomCsv = "Designator,Quantity,Value,Footprint,Manufacturer,Supplier Part Number\n";
    const componentGroups = new Map<string, { comp: PCBComponent; count: number; designators: string[] }>();

    graph.components.forEach(c => {
      const val = (c.properties.Value || c.partType).toString();
      const key = `${val}_${c.footprint}`;
      const existing = componentGroups.get(key);
      if (existing) {
        existing.count++;
        existing.designators.push(c.designator);
      } else {
        componentGroups.set(key, { comp: c, count: 1, designators: [c.designator] });
      }
    });

    componentGroups.forEach((group, key) => {
      const parts = key.split("_");
      const val = parts[0];
      const footprint = parts[1];
      const designs = group.designators.sort().join(" ");
      bomCsv += `${designs},${group.count},"${val}","${footprint}","LCSC Electronics","PN_${val}_MFR"\n`;
    });

    // 2. Generate Pick & Place physical coordinates centroid positional spreadsheet (CPL CSV)
    let posCsv = "Designator,Mid_X_mm,Mid_Y_mm,Layer,Rotation,Footprint\n";
    graph.components.forEach(c => {
      const bp = c.boardPosition || { x: 0, y: 0 };
      const layerString = c.layer === "B.Cu" ? "Bottom" : "Top";
      posCsv += `${c.designator},${bp.x.toFixed(3)},${bp.y.toFixed(3)},${layerString},${c.rotation || 0},"${c.footprint}"\n`;
    });

    // 3. Generate IPC-2581 or Gerber meta-configuration file header
    let ipcHeaders = "";
    ipcHeaders += `IPC-D-356 COMPATIBILITY DIRECTIVE\n`;
    ipcHeaders += `PRODUCED_BY: DET_AI_EDA_PIPELINE\n`;
    ipcHeaders += `METRIC: MILLIMETER\n`;
    ipcHeaders += `BOARD_CORE_MATERIAL: FR4_HIGH_TG\n`;
    ipcHeaders += `LAYER_COUNT: ${activeSpecs.layerCount}\n`;
    ipcHeaders += `THICKNESS_MM: ${activeSpecs.boardThicknessMm.toFixed(2)}\n`;
    ipcHeaders += `COPPER_WEIGHT_OZ: ${activeSpecs.copperWeightOz.toFixed(1)}\n`;
    ipcHeaders += `SURFACE_FINISH: ${activeSpecs.surfaceFinish}\n`;
    ipcHeaders += `SOLDER_MASK_COLOR: ${activeSpecs.solderMaskColor}\n`;
    ipcHeaders += `SILKSCREEN_COLOR: ${activeSpecs.silkscreenColor}\n`;

    return { bomCsv, posCsv, ipcHeaders };
  }
}
