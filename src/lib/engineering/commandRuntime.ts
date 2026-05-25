import { ProjectGraph } from '../../types';
import { TaskGraph, TaskNode, TaskStatus } from './taskGraph';
import { TaskPlanner } from './taskPlanner';
import { CheckpointRuntime, Checkpoint } from './checkpointRuntime';
import { DesignIntentMemory } from './designIntentMemory';
import { ProjectGraphModel } from '../core/graph';

export interface CommandRuntimeStatus {
  completed: number;
  pending: number;
  failed: number;
  skipped: number;
  total: number;
  percent: number;
}

/**
 * Production-grade Hierarchical Engineering Command Runtime.
 * 
 * Orchestrates multi-agent/multi-stage engineering operations, ensuring complete dry-runs,
 * dependency DAG tracking, transactional transaction isolation, incremental steps, and zero graph corruption.
 */
export class EngineeringCommandRuntime {
  private activeGraph: ProjectGraph;
  private memory: DesignIntentMemory;
  private checkpoints: CheckpointRuntime;
  private planner: TaskPlanner;
  
  private activeTaskGraph: TaskGraph | null = null;
  private currentGoal: string = '';
  private baseRestorePointId: string = '';

  constructor(initialGraph: ProjectGraph) {
    this.activeGraph = initialGraph;
    this.memory = new DesignIntentMemory();
    this.checkpoints = new CheckpointRuntime(initialGraph);
    this.planner = new TaskPlanner();
  }

  /**
   * High fidelity action planner entry point.
   * Parses natural language command intentions, builds an execution dependency pipeline DAG,
   * and creates a rescue base state checkpoint.
   */
  public initiateCommand(goal: string, preferredCenter?: { x: number; y: number }): TaskGraph {
    this.currentGoal = goal;
    
    // Create base rescue restoration point
    const checkpoint = this.checkpoints.saveCheckpoint(
      this.activeGraph, 
      `Atomic rollback snapshot prior to executing command macro: "${goal}"`, 
      'PRE_COMMAND_REPLICA'
    );
    this.baseRestorePointId = checkpoint.id;

    // Plan DAG steps
    this.activeTaskGraph = this.planner.planEngineeringGoal(goal, {
      graph: this.activeGraph,
      preferredCenter
    });

    // Record intention fact in persistent design semantic memory
    this.memory.recordFact({
      targetType: 'board',
      targetId: 'COMMAND_RUN',
      intentionText: `Initiated high level macro sweep: "${goal}" coordinates centered at ${JSON.stringify(preferredCenter || {x: 150, y: 150})}`,
      category: 'general',
      severity: 'normal'
    });

    return this.activeTaskGraph;
  }

  /**
   * Steps the execution sequence forward by one complete tick, resolving parallel branches
   * inside the DAG. Performs automatic transaction safety dry-run checks.
   */
  public async stepExecution(): Promise<{
    success: boolean;
    executedNodes: { id: string; success: boolean; errors?: string[] }[];
    graph: ProjectGraph;
  }> {
    if (!this.activeTaskGraph) {
      throw new Error("No active command session initiated. Call initiateCommand first.");
    }

    const nextNodes = this.activeTaskGraph.getExecutableNodes();
    if (nextNodes.length === 0) {
      return {
        success: true,
        executedNodes: [],
        graph: this.activeGraph
      };
    }

    const results: { id: string; success: boolean; errors?: string[] }[] = [];
    let overallSuccess = true;

    // Apply each independent node transaction and validate state parameters
    for (const node of nextNodes) {
      this.activeTaskGraph.updateNodeStatus(node.id, 'running');
      
      const pgm = new ProjectGraphModel(this.activeGraph);
      const transaction = pgm.applyTransaction(node.actions);

      if (transaction.success) {
        // Success: Commit layout advancement and save state checkpoint
        this.activeGraph = transaction.graph;
        this.checkpoints.saveCheckpoint(this.activeGraph, `Step completed: ${node.name}`, `STEP_${node.id}`);
        this.activeTaskGraph.updateNodeStatus(node.id, 'completed');
        results.push({ id: node.id, success: true });

        // Record intent sub-rationale trace
        this.memory.recordFact({
          targetType: 'subsystem',
          targetId: node.id,
          intentionText: `Staged compile milestone: "${node.name}" actions evaluated successfully on the Project Graph layout.`,
          category: 'general',
          severity: 'normal'
        });
      } else {
        // Transaction safety validation failure! Revert graph to last checkpoint
        overallSuccess = false;
        const errMsg = transaction.errors.join('; ');
        this.activeTaskGraph.updateNodeStatus(node.id, 'failed', errMsg);
        results.push({ id: node.id, success: false, errors: transaction.errors });

        this.memory.recordFact({
          targetType: 'subsystem',
          targetId: node.id,
          intentionText: `FAILURE DIAGNOSTIC: Step compile error on "${node.name}". Trace message: ${errMsg}`,
          category: 'general',
          severity: 'critical'
        });
      }
    }

    return {
      success: overallSuccess,
      executedNodes: results,
      graph: this.activeGraph
    };
  }

  /**
   * Full atomic rollback: Reclaim pristine layout state prior to command execution initiation.
   */
  public rollbackAll(): ProjectGraph {
    if (!this.baseRestorePointId) {
      throw new Error("Cannot rollback. Previous checkpoint restore point handle was not established.");
    }
    
    this.activeGraph = this.checkpoints.restoreCheckpoint(this.baseRestorePointId);
    
    if (this.activeTaskGraph) {
      this.activeTaskGraph.resetAllNodes();
    }

    this.memory.recordFact({
      targetType: 'board',
      targetId: 'ROLLBACK',
      intentionText: `Triggered global state recovery rollback to pre-command snapshot footprint.`,
      category: 'general',
      severity: 'critical'
    });

    return this.activeGraph;
  }

  /**
   * Track completion metrics and percentiles.
   */
  public getOverallProgress(): CommandRuntimeStatus {
    if (!this.activeTaskGraph) {
      return { completed: 0, pending: 0, failed: 0, skipped: 0, total: 0, percent: 100 };
    }

    const nodes = this.activeTaskGraph.getNodes();
    const total = nodes.length;
    let completed = 0, pending = 0, failed = 0, skipped = 0;

    for (const n of nodes) {
      if (n.status === 'completed') completed++;
      else if (n.status === 'pending' || n.status === 'running') pending++;
      else if (n.status === 'failed') failed++;
      else if (n.status === 'skipped') skipped++;
    }

    const percent = total > 0 ? Math.round((completed / total) * 100) : 100;

    return { completed, pending, failed, skipped, total, percent };
  }

  public getActiveTaskGraph(): TaskGraph | null {
    return this.activeTaskGraph;
  }

  public getDesignIntentMemory(): DesignIntentMemory {
    return this.memory;
  }

  public getCheckpointRuntime(): CheckpointRuntime {
    return this.checkpoints;
  }
}
