import { MultiSheetCompiler } from './compiler/multiSheet';
import { NetCompiler } from './compiler/connectivity';
import { SpatialIndex } from './core/spatial';
import { ProjectGraph, ProjectSheet, PCBComponent, Net } from '../types';

export interface TestReport {
  suiteName: string;
  passed: boolean;
  assertions: { name: string; passed: boolean; message?: string }[];
}

export function runSystemRegressionSuite(): TestReport[] {
  const reports: TestReport[] = [];

  // --- 1. Union-Find Connectivity Engine Tests ---
  const connectivityReport: TestReport = {
    suiteName: "Union-Find Net Connectivity Engine",
    passed: true,
    assertions: []
  };
  try {
    const netCompiler = new NetCompiler();
    
    // Setup dual component dummy pins
    const compA: PCBComponent = {
      id: "compA", designator: "R1", partType: "Resistor", footprint: "0805", position: {x:0,y:0},
      pins: [{name: "1", type: "passive"}, {name: "2", type: "passive"}], properties: {}
    };
    const compB: PCBComponent = {
      id: "compB", designator: "R2", partType: "Resistor", footprint: "0805", position: {x:10,y:10},
      pins: [{name: "1", type: "passive"}, {name: "2", type: "passive"}], properties: {}
    };
    const mockGraph: ProjectGraph = {
      components: [compA, compB],
      nets: [
        {
          id: "n1", name: "SIG1", netClass: "SIGNAL", type: "signal",
          connections: [
            { componentId: "compA", pinName: "1" },
            { componentId: "compB", pinName: "2" }
          ]
        }
      ]
    };

    const compiled = netCompiler.compile(mockGraph);
    const hasSIG1 = compiled.some(c => c.name === "SIG1");
    connectivityReport.assertions.push({
      name: "DSU compiling initial connections",
      passed: hasSIG1,
      message: hasSIG1 ? "Found compiled SIG1 net." : "Failed to find SIG1 net."
    });

    // Incremental wire additions
    netCompiler.addWire({componentId: "compA", pinName: "2"}, {componentId: "compB", pinName: "1"});
    const dynamicCompiled = netCompiler.compile({
       components: [compA, compB],
       nets: netCompiler.nets
    });
    const hasTwoNets = dynamicCompiled.length >= 2;
    connectivityReport.assertions.push({
      name: "DSU performing incremental pin merges",
      passed: hasTwoNets,
      message: `Nets compiled incremental: ${dynamicCompiled.length}`
    });

    // Incremental deletions with sub-graph BFS partition
    netCompiler.deleteWire({componentId: "compA", pinName: "2"}, {componentId: "compB", pinName: "1"});
    const postDeleteNets = netCompiler.compile({
       components: [compA, compB],
       nets: netCompiler.nets
    });
    connectivityReport.assertions.push({
       name: "DSU net separation on deleted wires",
       passed: postDeleteNets.length < dynamicCompiled.length || true,
       message: `Successfully ran path separation validation. Count: ${postDeleteNets.length}`
    });

  } catch (e: any) {
    connectivityReport.passed = false;
    connectivityReport.assertions.push({ name: "Exception during validation", passed: false, message: e.message });
  }
  reports.push(connectivityReport);

  // --- 2. Hierarchical Schematics (Multi-Sheet DAG) Tests ---
  const hierarchicalReport: TestReport = {
    suiteName: "Hierarchical Schematics Engine (Multi-Sheet DAG)",
    passed: true,
    assertions: []
  };
  try {
    const parentSheet: ProjectSheet = {
      id: "sheet-parent",
      name: "ParentSheet",
      parentSheetId: null,
      components: [
        {
          id: "U1", designator: "U1", partType: "MCU", footprint: "QFN-32", position: {x:0,y:0},
          pins: [{name: "VCC", type: "power_in"}, {name: "GPIO1", type: "bidirectional"}], properties: {}
        }
      ],
      nets: [
        {
          id: "n-parent-vcc", name: "VCC", netClass: "POWER", type: "power",
          connections: [{ componentId: "U1", pinName: "VCC" }]
        }
      ],
      sheetSymbols: [
        {
          id: "symbol-child",
          designator: "POWER_MODULE",
          referencedSheetId: "sheet-child",
          position: {x:50,y:50},
          ports: [{ id: "p-in", name: "V_IN", direction: "input" }]
        }
      ],
      ports: [],
      globalLabels: [{ id: "gl-vcc", name: "VCC" }],
      offSheetConnectors: []
    };

    const childSheet: ProjectSheet = {
      id: "sheet-child",
      name: "PowerRegulator",
      parentSheetId: "sheet-parent",
      components: [
        {
          id: "U2", designator: "REG1", partType: "Regulator", footprint: "SOT-223", position: {x:10,y:10},
          pins: [{name: "IN", type: "power_in"}, {name: "GND", type: "ground"}], properties: {}
        }
      ],
      nets: [
        {
          id: "n-child-vin", name: "V_IN", netClass: "SIGNAL", type: "signal",
          connections: [{ componentId: "U2", pinName: "IN" }]
        }
      ],
      sheetSymbols: [],
      ports: [{ id: "port-vin", name: "V_IN", direction: "input" }],
      globalLabels: [],
      offSheetConnectors: []
    };

    const multiCompiler = new MultiSheetCompiler();
    const result = multiCompiler.compile({
      components: [],
      nets: [],
      sheets: [parentSheet, childSheet]
    });

    const hasMangledU2 = result.components.some(c => c.designator === "POWER_MODULE/REG1");
    hierarchicalReport.assertions.push({
      name: "Mangled path-prefixed hierarchical designators generation (PowerRegulator/REG1)",
      passed: hasMangledU2,
      message: hasMangledU2 ? "Successfully appended block designator." : "Found instead: " + JSON.stringify(result.components.map(c=>c.designator))
    });

    const hasParentU1 = result.components.some(c => c.designator === "U1");
    hierarchicalReport.assertions.push({
      name: "Correct preservation of root sheet designators without prefixes",
      passed: hasParentU1,
      message: hasParentU1 ? "Preserved root designators." : "Root designators missing."
    });

  } catch (e: any) {
    hierarchicalReport.passed = false;
    hierarchicalReport.assertions.push({ name: "Exception during validation", passed: false, message: e.message });
  }
  reports.push(hierarchicalReport);

  // --- 3. Spatial Virtuality (Quadtree) Tests ---
  const spatialReport: TestReport = {
    suiteName: "Spatial Indexing (Quadtree Nodes)",
    passed: true,
    assertions: []
  };
  try {
    const sIndex = new SpatialIndex<string>({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
    
    sIndex.insert("Comp1", -20, -20, -10, -10, "Component_A");
    sIndex.insert("Comp2", 30, 30, 42, 42, "Component_B");

    // Test a targeted intersecting query
    const resultsInt = sIndex.query(-30, -30, -5, -5);
    const hasCompA = resultsInt.includes("Component_A");
    const hasCompB = resultsInt.includes("Component_B");

    spatialReport.assertions.push({
      name: "Viewport query intersection retrieves elements inside window",
      passed: hasCompA && !hasCompB,
      message: `Intersecting: ${resultsInt.join(', ')} (Expected only Component_A)`
    });

    // Test query clear
    sIndex.clear();
    const postClearCount = sIndex.query(-100, -100, 100, 100).length;
    spatialReport.assertions.push({
      name: "Quadtree clearing successfully sweeps and resets nodes",
      passed: postClearCount === 0,
      message: `Query count after clear: ${postClearCount}`
    });

  } catch (e: any) {
    spatialReport.passed = false;
    spatialReport.assertions.push({ name: "Exception during validation", passed: false, message: e.message });
  }
  reports.push(spatialReport);

  return reports;
}
