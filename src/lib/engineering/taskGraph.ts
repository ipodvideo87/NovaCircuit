import { AIAction } from '../../types';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskNode {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  dependencies: string[]; // parent task node IDs
  actions: AIAction[];
  rollbackActions?: AIAction[];
  error?: string;
  startTime?: number;
  endTime?: number;
}

export class TaskGraph {
  private nodes: Map<string, TaskNode> = new Map();

  /**
   * Insert a new step node with explicit topological dependencies.
   */
  public addNode(node: TaskNode): void {
    // Assert no cycle is introduced before inserting
    if (this.wouldIntroduceCycle(node.id, node.dependencies)) {
      throw new Error(`Circular dependency detected: Task '${node.id}' cannot depend on specified nodes.`);
    }
    this.nodes.set(node.id, { ...node, status: 'pending' });
  }

  /**
   * Returns complete list of task steps in registration map.
   */
  public getNodes(): TaskNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Query specific step details by database key.
   */
  public getNode(id: string): TaskNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Set status update for a designated task block.
   */
  public updateNodeStatus(id: string, status: TaskStatus, error?: string): void {
    const node = this.nodes.get(id);
    if (node) {
      node.status = status;
      if (status === 'running' && !node.startTime) {
        node.startTime = Date.now();
      }
      if ((status === 'completed' || status === 'failed') && !node.endTime) {
        node.endTime = Date.now();
      }
      if (error) {
        node.error = error;
      }
      this.nodes.set(id, node);

      // If a task failed, cascade skip-state to downstream dependents automatically
      if (status === 'failed') {
        this.cascadeSkipState(id);
      }
    }
  }

  /**
   * Selects all pending nodes whose corresponding dependency nodes have completed successfully.
   */
  public getExecutableNodes(): TaskNode[] {
    const executable: TaskNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.status !== 'pending') continue;

      const allMet = node.dependencies.every(depId => {
        const depNode = this.nodes.get(depId);
        return depNode && depNode.status === 'completed';
      });

      if (allMet) {
        executable.push(node);
      }
    }
    return executable;
  }

  /**
   * Cleans all states back to pending.
   */
  public resetAllNodes(): void {
    for (const node of this.nodes.values()) {
      node.status = 'pending';
      node.error = undefined;
      node.startTime = undefined;
      node.endTime = undefined;
      this.nodes.set(node.id, node);
    }
  }

  /**
   * Cascade-sets skipping state downwards to transitive dependents.
   */
  private cascadeSkipState(failedNodeId: string): void {
    const queue: string[] = [failedNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const node of this.nodes.values()) {
        if (node.dependencies.includes(current) && node.status === 'pending') {
          node.status = 'skipped';
          node.error = `Dependency '${current}' failed execution block. Cascaded skip trigger.`;
          this.nodes.set(node.id, node);
          queue.push(node.id);
        }
      }
    }
  }

  /**
   * Standard Depth First Search cycle detection algorithm to guarantee graph keeps being a DAG.
   */
  private wouldIntroduceCycle(nodeId: string, dependencies: string[]): boolean {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (currId: string): boolean => {
      visited.add(currId);
      stack.add(currId);

      // Look at children
      const children: string[] = [];
      if (currId === nodeId) {
        children.push(...dependencies);
      } else {
        const existingNode = this.nodes.get(currId);
        if (existingNode) {
          children.push(...existingNode.dependencies);
        }
      }

      for (const child of children) {
        if (!visited.has(child)) {
          if (dfs(child)) return true;
        } else if (stack.has(child)) {
          return true; // Cycle found
        }
      }

      stack.delete(currId);
      return false;
    };

    return dfs(nodeId);
  }
}
