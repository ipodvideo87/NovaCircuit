import { ProjectGraph, PCBComponent, Net, AIAction, ProjectSheet } from '../../types';
import { validateAndApplyActions } from '../actionValidation';
import { PCBBoard, syncBoardFromGraph } from '../board';
import { deepCloneGraph } from '../transaction';

export class ProjectGraphModel {
  private currentGraph: ProjectGraph;

  constructor(initialGraph: ProjectGraph) {
    this.currentGraph = deepCloneGraph(initialGraph);
  }

  /**
   * Returns current read-only snapshot of the ProjectGraph.
   */
  public getGraph(): ProjectGraph {
    return this.currentGraph;
  }

  /**
   * Replace active graph footprint.
   */
  public updateGraph(graph: ProjectGraph): void {
    this.currentGraph = deepCloneGraph(graph);
  }

  /**
   * Dry-runs transactions and commits changes atomically only if zero validation errors occur.
   */
  public applyTransaction(actions: AIAction[]): {
    success: boolean;
    graph: ProjectGraph;
    errors: string[];
    validActions: AIAction[];
  } {
    const { updatedGraph, errors, validActions } = validateAndApplyActions(actions, this.currentGraph);
    if (errors.length === 0) {
      this.currentGraph = updatedGraph;
      return { success: true, graph: this.currentGraph, errors: [], validActions };
    }
    return { success: false, graph: this.currentGraph, errors, validActions };
  }

  /**
   * Produces a compressed text layout representing active board components for AI copilot queries.
   */
  public getSemanticDigestForAI(): string {
    const summary: string[] = [];
    summary.push(`=== ACTIVE EDA PROJECT GRAPH STATE ===`);
    summary.push(`Active Components list count: ${this.currentGraph.components.length}`);
    this.currentGraph.components.forEach(c => {
      summary.push(`- Device [${c.designator}] => Part: ${c.partType} | Package: ${c.footprint} | Properties: ${JSON.stringify(c.properties)}`);
    });

    summary.push(`Electrical Nets list count: ${this.currentGraph.nets.length}`);
    this.currentGraph.nets.forEach(n => {
      const pinNodes = n.connections.map(cn => `${cn.componentId}.${cn.pinName}`).join(' <-> ');
      summary.push(`- Net "${n.name}" [Class: ${n.netClass || "DEFAULT"}]: Links [ ${pinNodes} ]`);
    });

    if (this.currentGraph.sheets && this.currentGraph.sheets.length > 0) {
      summary.push(`Hierarchical sheets modules loaded: ${this.currentGraph.sheets.length}`);
      this.currentGraph.sheets.forEach(s => {
        summary.push(`  * Sub-Sheet: "${s.name}" (ID: ${s.id})`);
      });
    }

    return summary.join('\n');
  }

  /**
   * Compile and generate physical traces, vias, and ratsnest endpoints.
   */
  public syncToBoard(): PCBBoard {
    return syncBoardFromGraph(this.currentGraph);
  }

  /**
   * Flattens nested Schematic sheets into a cohesive flat electrical layout list.
   */
  public flattenMultiSheet(): ProjectGraph {
    const baseGraph = this.currentGraph;
    if (!baseGraph.sheets || baseGraph.sheets.length === 0) {
      return baseGraph;
    }

    const flatGraph: ProjectGraph = {
      ...baseGraph,
      components: [...baseGraph.components],
      nets: [...baseGraph.nets]
    };

    baseGraph.sheets.forEach(sheet => {
      sheet.components.forEach(comp => {
        if (!flatGraph.components.some(c => c.id === comp.id || c.designator === comp.designator)) {
          flatGraph.components.push({
            ...comp,
            hierarchyPath: comp.hierarchyPath || sheet.name,
            parentSheetId: sheet.id
          });
        }
      });

      sheet.nets.forEach(net => {
        let exist = flatGraph.nets.find(n => n.name === net.name);
        if (!exist) {
          exist = {
            id: `net_${net.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
            name: net.name,
            netClass: net.netClass,
            type: net.type,
            connections: []
          };
          flatGraph.nets.push(exist);
        }
        net.connections.forEach(conn => {
          if (!exist!.connections.some(cn => cn.componentId === conn.componentId && cn.pinName === conn.pinName)) {
            exist!.connections.push(conn);
          }
        });
      });
    });

    return flatGraph;
  }
}
