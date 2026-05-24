import { 
  ProjectGraph, 
  ProjectSheet, 
  SheetSymbol, 
  PCBComponent, 
  Net, 
  ComponentPin, 
  HierarchicalPort, 
  GlobalLabel, 
  OffSheetConnector 
} from '../../types';
import { NetCompiler } from './connectivity';

export interface FlattenedProject {
  components: PCBComponent[];
  nets: Net[];
}

export class MultiSheetCompiler {
  private sheetsMap: Map<string, ProjectSheet> = new Map();
  private flattenedComponents: PCBComponent[] = [];
  
  // Maps a unique node path key (e.g. "root/BLOCK1") to sheet instance context
  private designatorPrefixMap: Map<string, string> = new Map();

  // Unified Union-Find compiler to compile final flat connections
  private connectionCompiler = new NetCompiler();

  constructor() {}

  /**
   * Compiles multi-sheet DAG structures into a flattened PCB-compatible ProjectGraph.
   */
  public compile(graph: ProjectGraph): FlattenedProject {
    this.sheetsMap.clear();
    this.flattenedComponents = [];
    this.designatorPrefixMap.clear();

    const sheets = graph.sheets || [];
    if (sheets.length === 0) {
      // Fallback if there are no sheets: return original graph components and nets as compiled
      const nets = graph.nets.map(n => ({
        ...n,
        compiledNetId: n.id
      }));
      return { components: graph.components, nets };
    }

    // Index all sheets
    sheets.forEach(s => this.sheetsMap.set(s.id, s));

    // Find the root sheet (parentSheetId is null or empty)
    const rootSheet = sheets.find(s => !s.parentSheetId) || sheets[0];

    // Traverse sheet hierarchy starting from root sheet
    this.traverseAndFlatten(rootSheet, "", "root");

    // We now have all components flattened and designators mangled (mangledPath)
    // Next, we compile net connections.
    // We build global equisets for nets.
    // We union nets connected to HierarchicalPorts on sheet symbols in parents with the corresponding ports inside child sheets.
    // We union nets with GlobalLabels of matching names.
    // We union nets with OffSheetConnectors of matching names.

    const compiledNets = this.compileHierarchicalConnections(graph, rootSheet);

    return {
      components: this.flattenedComponents,
      nets: compiledNets
    };
  }

  private traverseAndFlatten(
    sheet: ProjectSheet, 
    pathPrefix: string, 
    hierarchyPath: string
  ) {
    const currentPath = pathPrefix ? `${pathPrefix}/${sheet.name}` : sheet.name;

    // Flatten all components in this sheet module instance
    sheet.components.forEach(comp => {
      const designator = pathPrefix ? `${pathPrefix}/${comp.designator}` : comp.designator;
      const flattenedCompId = `${hierarchyPath}-${comp.id}`;

      this.flattenedComponents.push({
        ...comp,
        id: flattenedCompId,
        designator,
        hierarchyPath,
        parentSheetId: sheet.id
      });
    });

    // Traverse all child sheet symbols (blocks)
    sheet.sheetSymbols.forEach(symbol => {
      const childSheet = this.sheetsMap.get(symbol.referencedSheetId);
      if (childSheet) {
        const symbolPrefix = pathPrefix 
          ? `${pathPrefix}/${symbol.designator}` 
          : symbol.designator;
        
        const childHierarchyPath = `${hierarchyPath}/${symbol.designator}`;
        
        this.traverseAndFlatten(childSheet, symbolPrefix, childHierarchyPath);
      }
    });
  }

  private compileHierarchicalConnections(
    graph: ProjectGraph,
    rootSheet: ProjectSheet
  ): Net[] {
    const netsToCompile: Net[] = [];
    
    // Step 1: Gather all sheet nets and prepend path strings to local nets inside instances
    const sheets = graph.sheets || [];
    
    // For each sheet instance, we must trace all connections.
    // Let's implement path-based resolution of nets.
    // We will build a unified graph of net segments connected together.
    // We use our Disjoint Set Union (DSU) connection engine to find merged groupings.
    
    // To do this, we collect all physical pins of instanced components and their original connections.
    // Each pin gets represented globally as `${hierarchyPath}-${componentId}:${pinName}`
    
    const virtualNets: Array<{
      id: string;
      connections: ComponentPin[];
      globalName?: string;
      offSheetName?: string;
    }> = [];

    // Map: hierarchyPath -> internal sheet nets
    // For every sheet symbols instanced, we bind its parent-level wires to inner hierarchical ports
    const bindSheetSymbols = (sheet: ProjectSheet, hierarchyPath: string) => {
      // 1. Map all local sheet nets inside this instance
      sheet.nets.forEach(net => {
        const netId = `${hierarchyPath}-${net.id}`;
        
        // Map connected pins with hierarchy context
        const connections = net.connections.map(c => ({
          componentId: `${hierarchyPath}-${c.componentId}`,
          pinName: c.pinName
        }));

        let globalName: string | undefined = undefined;
        let offSheetName: string | undefined = undefined;

        // Check if this net connects to physical global labels
        const matchingGlobal = sheet.globalLabels?.find(gl => 
          net.connections.some(conn => {
             // If a connection touches a label coordinate or by name association
             // Here we model labeled nets simply where the net name matches the global label name, 
             // or the net connects to a global label reference
             return originalMatchLabel(net, gl);
          })
        ) || sheet.globalLabels?.find(gl => gl.name === net.name);

        if (matchingGlobal) {
          globalName = matchingGlobal.name;
        }

        const matchingOffSheet = sheet.offSheetConnectors?.find(osc => 
          osc.name === net.name
        );
        if (matchingOffSheet) {
          offSheetName = matchingOffSheet.name;
        }

        virtualNets.push({
          id: netId,
          connections,
          globalName,
          offSheetName
        });
      });

      // 2. Map hierarchical port bindings on child sheet symbols
      sheet.sheetSymbols.forEach(symbol => {
        const childSheet = this.sheetsMap.get(symbol.referencedSheetId);
        if (childSheet) {
          const childPath = `${hierarchyPath}/${symbol.designator}`;

          // For every pin binding on the symbol (ports on parent symbol)
          symbol.ports.forEach(port => {
            // Find parent net in this sheet connected to the symbol port
            // Parent connects to the symbol "componentId" representing the block, and pinName = port.name
            const parentNet = sheet.nets.find(n =>
              n.connections.some(conn => conn.componentId === symbol.id && conn.pinName === port.name)
            );

            // Find child net inside child sheet connected to hierarchy port
            // The child net touches child HierarchicalPort matching port.name
            const childNet = childSheet.nets.find(n =>
              childSheet.ports.some(p => p.name === port.name && n.name === p.name) || n.name === port.name
            );

            if (parentNet && childNet) {
              const parentNetId = `${hierarchyPath}-${parentNet.id}`;
              const childNetId = `${childPath}-${childNet.id}`;

              // We'll bridge them by creating a virtual merge connection
              // We inject a virtual wire connecting a representative pin from parent to child
              if (parentNet.connections.length > 0 && childNet.connections.length > 0) {
                const parentPin = parentNet.connections[0];
                const childPin = childNet.connections[0];

                virtualNets.push({
                  id: `bridge-${parentNetId}-${childNetId}`,
                  connections: [
                    { componentId: `${hierarchyPath}-${parentPin.componentId}`, pinName: parentPin.pinName },
                    { componentId: `${childPath}-${childPin.componentId}`, pinName: childPin.pinName }
                  ]
                });
              }
            }
          });

          // Recurse down hierarchy
          bindSheetSymbols(childSheet, childPath);
        }
      });
    };

    function originalMatchLabel(net: Net, label: GlobalLabel): boolean {
       return net.name === label.name;
    }

    bindSheetSymbols(rootSheet, "root");

    // Build Union-Find set across all virtual and bridges
    const dsu = new NetCompiler();
    
    // Add all nodes
    this.flattenedComponents.forEach(comp => {
      comp.pins.forEach(p => {
        dsu.addWire({ componentId: comp.id, pinName: p.name }, { componentId: comp.id, pinName: p.name });
      });
    });

    // Perform DSU merges on every internal/bridged connection
    virtualNets.forEach(v => {
      if (v.connections.length > 1) {
        const pinA = v.connections[0];
        for (let i = 1; i < v.connections.length; i++) {
          const pinB = v.connections[i];
          dsu.addWire(pinA, pinB);
        }
      }
    });

    // Merge GlobalLabels
    const globalGroupings: Map<string, ComponentPin[]> = new Map();
    virtualNets.forEach(v => {
      if (v.globalName && v.connections.length > 0) {
        if (!globalGroupings.has(v.globalName)) {
          globalGroupings.set(v.globalName, []);
        }
        globalGroupings.get(v.globalName)!.push(...v.connections);
      }
    });

    globalGroupings.forEach((pins, name) => {
      if (pins.length > 1) {
        const pinA = pins[0];
        for (let i = 1; i < pins.length; i++) {
          dsu.addWire(pinA, pins[i]);
        }
      }
    });

    // Merge OffSheetConnectors
    const offSheetGroupings: Map<string, ComponentPin[]> = new Map();
    virtualNets.forEach(v => {
      if (v.offSheetName && v.connections.length > 0) {
        if (!offSheetGroupings.has(v.offSheetName)) {
          offSheetGroupings.set(v.offSheetName, []);
        }
        offSheetGroupings.get(v.offSheetName)!.push(...v.connections);
      }
    });

    offSheetGroupings.forEach((pins, name) => {
      if (pins.length > 1) {
        const pinA = pins[0];
        for (let i = 1; i < pins.length; i++) {
          dsu.addWire(pinA, pins[i]);
        }
      }
    });

    // Use connection compile output to extract normalized global net names & references
    const rawCompiledNets = dsu.compile({
      components: this.flattenedComponents,
      nets: []
    });

    // Assign names appropriately
    const renamedNets = rawCompiledNets.map((net, idx) => {
      let finalName = net.name;
      
      // Let's check if this net contains pins belonging to a GlobalLabel
      for (const conn of net.connections) {
        // Trace back if it's connected to VCC or GND in our groups
        for (const [gName, pins] of globalGroupings.entries()) {
          const matchesGlobal = pins.some(p => p.componentId === conn.componentId && p.pinName === conn.pinName);
          if (matchesGlobal) {
            finalName = gName;
            break;
          }
        }
        for (const [oName, pins] of offSheetGroupings.entries()) {
          const matchesOffSheet = pins.some(p => p.componentId === conn.componentId && p.pinName === conn.pinName);
          if (matchesOffSheet) {
            finalName = oName;
            break;
          }
        }
      }

      return {
        ...net,
        id: `compiled-net-${idx}`,
        name: finalName,
        compiledNetId: `mangled-net-${idx}`
      };
    });

    return renamedNets;
  }
}
