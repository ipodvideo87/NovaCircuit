import { ProjectGraph } from '../../types';
import { runtimeEventBus, ObservableEventType } from './runtimeEvents';

export interface GraphDiffReport {
  addedComponents: string[];
  removedComponents: string[];
  movedComponents: { designator: string; from: { x: number; y: number }; to: { x: number; y: number } }[];
  addedNets: string[];
  removedNets: string[];
  connectionChanges: string[];
}

export class ReplayInspector {
  /**
   * Compares two project state snapshots to generate a structured and clean diff report.
   */
  public static diffGraphs(before: ProjectGraph, after: ProjectGraph): GraphDiffReport {
    const report: GraphDiffReport = {
      addedComponents: [],
      removedComponents: [],
      movedComponents: [],
      addedNets: [],
      removedNets: [],
      connectionChanges: []
    };

    // Components evaluation
    const beforeCompMap = new Map(before.components.map(c => [c.designator, c]));
    const afterCompMap = new Map(after.components.map(c => [c.designator, c]));

    after.components.forEach(c => {
      const oldComp = beforeCompMap.get(c.designator);
      if (!oldComp) {
        report.addedComponents.push(c.designator);
      } else {
        if (oldComp.position.x !== c.position.x || oldComp.position.y !== c.position.y) {
          report.movedComponents.push({
            designator: c.designator,
            from: { ...oldComp.position },
            to: { ...c.position }
          });
        }
      }
    });

    before.components.forEach(c => {
      if (!afterCompMap.has(c.designator)) {
        report.removedComponents.push(c.designator);
      }
    });

    // Nets evaluation
    const beforeNetMap = new Map(before.nets.map(n => [n.name || n.id, n]));
    const afterNetMap = new Map(after.nets.map(n => [n.name || n.id, n]));

    after.nets.forEach(n => {
      const netKey = n.name || n.id;
      const oldNet = beforeNetMap.get(netKey);
      if (!oldNet) {
        report.addedNets.push(netKey);
      } else {
        // Evaluate connection changes
        const oldConns = new Set(oldNet.connections.map(cn => `${cn.componentId}.${cn.pinName}`));
        const newConns = new Set(n.connections.map(cn => `${cn.componentId}.${cn.pinName}`));
        
        let changed = false;
        n.connections.forEach(cn => {
          if (!oldConns.has(`${cn.componentId}.${cn.pinName}`)) changed = true;
        });
        oldNet.connections.forEach(cn => {
          if (!newConns.has(`${cn.componentId}.${cn.pinName}`)) changed = true;
        });

        if (changed) {
          report.connectionChanges.push(`Net ${netKey} connections modified`);
        }
      }
    });

    before.nets.forEach(n => {
      const netKey = n.name || n.id;
      if (!afterNetMap.has(netKey)) {
        report.removedNets.push(netKey);
      }
    });

    return report;
  }

  /**
   * Evaluates the trace of transaction records for UI timeline rendering.
   */
  public static logTransactionTimelineStep(
    index: number, 
    history: ProjectGraph[]
  ): void {
    if (index < 0 || index >= history.length) return;

    const current = history[index];
    const prev = index > 0 ? history[index - 1] : null;

    let diffText = "Initial core setup state.";
    if (prev) {
      const diff = this.diffGraphs(prev, current);
      const parts: string[] = [];
      if (diff.addedComponents.length > 0) parts.push(`Added comps: ${diff.addedComponents.join(', ')}`);
      if (diff.removedComponents.length > 0) parts.push(`Removed comps: ${diff.removedComponents.join(', ')}`);
      if (diff.movedComponents.length > 0) parts.push(`Relocated ${diff.movedComponents.length} components`);
      if (diff.addedNets.length > 0) parts.push(`Added nets: ${diff.addedNets.join(', ')}`);
      if (diff.connectionChanges.length > 0) parts.push(diff.connectionChanges.join('; '));
      
      diffText = parts.length > 0 ? parts.join(' | ') : "No physical changes detected in this step.";
    }

    runtimeEventBus.emit(
      ObservableEventType.TRANSACTION,
      `State Replay Stepped to idx ${index}`,
      diffText,
      "success",
      { index, componentCount: current.components.length, netCount: current.nets.length }
    );
  }
}
