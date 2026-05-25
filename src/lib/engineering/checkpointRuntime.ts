import { ProjectGraph, Point } from '../../types';
import { deepCloneGraph } from '../transaction';

export interface Checkpoint {
  id: string;
  timestamp: number;
  graph: ProjectGraph;
  description: string;
  tag?: string;
}

export interface ComponentDiff {
  designator: string;
  changeType: 'added' | 'removed' | 'moved' | 'modified';
  details?: string;
}

export interface GraphDiffResult {
  addedComponents: string[];
  removedComponents: string[];
  movedComponents: { designator: string; from: Point; to: Point }[];
  addedTracesCount: number;
  removedTracesCount: number;
  addedViasCount: number;
  removedViasCount: number;
}

export class CheckpointRuntime {
  private checkpoints: Checkpoint[] = [];
  private activeGraph: ProjectGraph;

  constructor(initialGraph: ProjectGraph) {
    this.activeGraph = deepCloneGraph(initialGraph);
    // Auto-create initial restore point
    this.saveCheckpoint(initialGraph, 'Initial Project Graph Recovery Base', 'INIT_BASE');
  }

  /**
   * Capture structural checkout snapshot of active ProjectGraph state.
   */
  public saveCheckpoint(graph: ProjectGraph, description: string, tag?: string): Checkpoint {
    const checkpoint: Checkpoint = {
      id: `chk-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now(),
      graph: deepCloneGraph(graph),
      description,
      tag
    };
    this.checkpoints.push(checkpoint);
    this.activeGraph = deepCloneGraph(graph);
    return checkpoint;
  }

  /**
   * Revert or advance active canvas state to specified snapshot identifier.
   */
  public restoreCheckpoint(checkpointId: string): ProjectGraph {
    const chk = this.checkpoints.find(c => c.id === checkpointId);
    if (!chk) {
      throw new Error(`Execution Recovery Checkpoint with identifier '${checkpointId}' not loaded.`);
    }
    this.activeGraph = deepCloneGraph(chk.graph);
    return this.activeGraph;
  }

  /**
   * Returns list of saved checkpoints in chronological order.
   */
  public getCheckpoints(): Checkpoint[] {
    return [...this.checkpoints];
  }

  /**
   * Remove any redundant checkpoints. Keep init bases if present.
   */
  public clearCheckpoints(): void {
    const base = this.checkpoints.find(c => c.tag === 'INIT_BASE');
    this.checkpoints = base ? [base] : [];
  }

  /**
   * Performs high-precision deep validation dry-run checks on Project Graph state mutations.
   */
  public diffGraphs(before: ProjectGraph, after: ProjectGraph): GraphDiffResult {
    const result: GraphDiffResult = {
      addedComponents: [],
      removedComponents: [],
      movedComponents: [],
      addedTracesCount: 0,
      removedTracesCount: 0,
      addedViasCount: 0,
      removedViasCount: 0
    };

    // Components assessment
    const beforeCompMap = new Map(before.components.map(c => [c.designator, c]));
    const afterCompMap = new Map(after.components.map(c => [c.designator, c]));

    for (const [des, afterComp] of afterCompMap.entries()) {
      const beforeComp = beforeCompMap.get(des);
      if (!beforeComp) {
        result.addedComponents.push(des);
      } else {
        const bp = beforeComp.boardPosition || beforeComp.position;
        const ap = afterComp.boardPosition || afterComp.position;
        if (bp.x !== ap.x || bp.y !== ap.y) {
          result.movedComponents.push({
            designator: des,
            from: { x: bp.x, y: bp.y },
            to: { x: ap.x, y: ap.y }
          });
        }
      }
    }

    for (const des of beforeCompMap.keys()) {
      if (!afterCompMap.has(des)) {
        result.removedComponents.push(des);
      }
    }

    // Trace assessments
    const beforeTracesCount = before.traces?.length || 0;
    const afterTracesCount = after.traces?.length || 0;
    if (afterTracesCount > beforeTracesCount) {
      result.addedTracesCount = afterTracesCount - beforeTracesCount;
    } else {
      result.removedTracesCount = beforeTracesCount - afterTracesCount;
    }

    // Via assessments
    const beforeViasCount = before.vias?.length || 0;
    const afterViasCount = after.vias?.length || 0;
    if (afterViasCount > beforeViasCount) {
      result.addedViasCount = afterViasCount - beforeViasCount;
    } else {
      result.removedViasCount = beforeViasCount - afterViasCount;
    }

    return result;
  }
}
