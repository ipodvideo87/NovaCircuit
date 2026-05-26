import { ProjectGraph } from '../../types';
import { globalTelemetry, ObservableEventType } from '../observability/observabilityRuntime';
import { executionTraceTracker, TraceNode } from '../observability/executionTrace';

export type AIExecutionState = 'idle' | 'planning' | 'animating_focus' | 'executing' | 'complying' | 'paused' | 'completed' | 'cancelled';

export interface AIExecutionStage {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'error';
  progress: number; // 0 to 100
}

export interface AIEstimate {
  nodeId: string;
  status: 'success' | 'error' | 'warning';
  reason: string;
}

export class LiveExecutionRuntime {
  private state: AIExecutionState = 'idle';
  private stages: AIExecutionStage[] = [];
  private activeGoal = "";
  private currentStageIndex = 0;
  private currentProgress = 0;
  private snapshotGraph: ProjectGraph | null = null;
  private currentGraph: ProjectGraph;
  private changeCallback?: (graph: ProjectGraph) => void;
  private progressCallback?: (progress: number, state: AIExecutionState, stages: AIExecutionStage[]) => void;
  private executionTimer: any = null;

  constructor(graph: ProjectGraph, onChange?: (graph: ProjectGraph) => void) {
    this.currentGraph = graph;
    this.changeCallback = onChange;
  }

  public setOnProgress(cb: (progress: number, state: AIExecutionState, stages: AIExecutionStage[]) => void) {
    this.progressCallback = cb;
  }

  public getState(): AIExecutionState {
    return this.state;
  }

  public getStages(): AIExecutionStage[] {
    return [...this.stages];
  }

  public getProgress(): number {
    return this.currentProgress;
  }

  /**
   * Initializes a new interactive execution plan session.
   */
  public prepareGoal(goal: string, estimatedStages: string[]) {
    if (this.state === 'executing' || this.state === 'planning') {
      this.cancelRunningSession();
    }

    this.activeGoal = goal;
    this.state = 'planning';
    this.currentStageIndex = 0;
    this.currentProgress = 0;
    this.snapshotGraph = JSON.parse(JSON.stringify(this.currentGraph)); // Preserve clean rollback state

    this.stages = estimatedStages.map((label, idx) => ({
      id: `stage-${idx}-${Date.now()}`,
      label,
      description: `Drafting logic for procedural goal stage: "${label}"`,
      status: 'pending',
      progress: 0
    }));

    // Register TraceNode graph values in the Unified System Trace Tracker
    const traceNodes: TraceNode[] = this.stages.map((st, idx) => ({
      id: st.id,
      label: st.label,
      status: 'pending',
      dependsOn: idx > 0 ? [this.stages[idx - 1].id] : [],
      reasoning: `AI is establishing parameters for step ${idx + 1}`
    }));
    executionTraceTracker.startSession(goal, traceNodes);

    globalTelemetry.logEvent(
      ObservableEventType.AI_REASONING,
      "AI Engineering Action Planned",
      `Planning live interactive routine: "${goal}" on ${this.stages.length} procedural layout phases.`,
      "success",
      { goal, stages: estimatedStages }
    );

    this.notifyProgress();
  }

  /**
   * Starts progressive layout generation execution step sequences.
   */
  public startStreamingExecution(
    onStepApply: (stageIndex: number, currentGraph: ProjectGraph) => Promise<ProjectGraph> | ProjectGraph
  ) {
    if (this.state !== 'planning' && this.state !== 'paused') return;

    this.state = 'executing';
    globalTelemetry.logEvent(
      ObservableEventType.AI_ACTION,
      "Live Streaming Execution Started",
      `Progressively compiling parameters for: "${this.activeGoal}"`,
      "success"
    );

    this.notifyProgress();
    this.runNextIncrementalStep(onStepApply);
  }

  private async runNextIncrementalStep(
    onStepApply: (stageIndex: number, currentGraph: ProjectGraph) => Promise<ProjectGraph> | ProjectGraph
  ) {
    if (this.state !== 'executing') return;

    if (this.currentStageIndex >= this.stages.length) {
      this.completeSession();
      return;
    }

    const currentStage = this.stages[this.currentStageIndex];
    currentStage.status = 'running';
    currentStage.progress = 10;
    this.notifyProgress();

    // Trigger visual telemetry node running update
    const activeSession = executionTraceTracker.getActiveSession();
    if (activeSession) {
      executionTraceTracker.updateNodeStatus(activeSession.id, currentStage.id, 'running', {
        reasoning: `Orchestrating layout changes for execution node: "${currentStage.label}"`
      });
    }

    // Progressively ramp stage progress indicators for stunning live UX
    let stageProgressCounter = 10;
    const interval = setInterval(() => {
      if (this.state !== 'executing') {
        clearInterval(interval);
        return;
      }
      if (stageProgressCounter < 85) {
        stageProgressCounter += 15;
        currentStage.progress = stageProgressCounter;
        this.currentProgress = Math.min(
          98,
          Math.floor((this.currentStageIndex / this.stages.length) * 100 + (stageProgressCounter / this.stages.length))
        );
        this.notifyProgress();
      }
    }, 150);

    const startTime = performance.now();
    try {
      // Direct callback call to apply mutations (e.g. adding chips, vias or nets deterministically)
      this.currentGraph = await onStepApply(this.currentStageIndex, this.currentGraph);
      
      clearInterval(interval);
      const elapsed = performance.now() - startTime;

      currentStage.status = 'success';
      currentStage.progress = 100;
      currentStage.description = `Successfully configured layout paths for standard: "${currentStage.label}" (${Math.round(elapsed)}ms)`;
      
      if (activeSession) {
        executionTraceTracker.updateNodeStatus(activeSession.id, currentStage.id, 'success', {
          duration: elapsed,
          reasoning: `Step execution succeeded matching strict physical constraints.`
        });
      }

      globalTelemetry.logEvent(
        ObservableEventType.OPTIMIZATION,
        `Stage Succeeded: ${currentStage.label}`,
        `Incremental layout updates synced in ${Math.round(elapsed)}ms`,
        "success",
        { stageLabel: currentStage.label, stageIndex: this.currentStageIndex }
      );

      // Invoke state synchronization
      if (this.changeCallback) {
        this.changeCallback(this.currentGraph);
      }

      this.currentStageIndex++;
      this.currentProgress = Math.floor((this.currentStageIndex / this.stages.length) * 100);
      this.notifyProgress();

      // Chain next incremental step with a little buffer to appreciate the layout animations
      this.executionTimer = setTimeout(() => {
        this.runNextIncrementalStep(onStepApply);
      }, 600);

    } catch (err: any) {
      clearInterval(interval);
      currentStage.status = 'error';
      currentStage.description = `Halting constraint rule violation: "${err?.message || err}"`;
      
      if (activeSession) {
        executionTraceTracker.updateNodeStatus(activeSession.id, currentStage.id, 'error', {
          reasoning: `Halted layout mutation due to DRC clearances or path overlaps.`
        });
      }

      globalTelemetry.logEvent(
        ObservableEventType.AI_ACTION,
        `Stage Routing Aborted: ${currentStage.label}`,
        `Execution chain paused due to: ${err?.message || err}`,
        "error"
      );

      this.state = 'paused';
      this.notifyProgress();
    }
  }

  /**
   * Pauses progressive stream.
   */
  public pauseExecution() {
    if (this.state !== 'executing') return;
    this.state = 'paused';
    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
    }
    globalTelemetry.logEvent(
      ObservableEventType.AI_ACTION,
      "AI Sequence Paused",
      "Interactive generator execution flow was paused by operator.",
      "warning"
    );
    this.notifyProgress();
  }

  /**
   * Resumes paused progressive loop.
   */
  public resumeExecution(
    onStepApply: (stageIndex: number, currentGraph: ProjectGraph) => Promise<ProjectGraph> | ProjectGraph
  ) {
    if (this.state !== 'paused') return;
    this.startStreamingExecution(onStepApply);
  }

  /**
   * Cancels entire session, rolling back state snapshot perfectly.
   */
  public cancelRunningSession() {
    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
    }

    const wasActive = this.state !== 'idle' && this.state !== 'completed' && this.state !== 'cancelled';
    this.state = 'cancelled';

    // Safe rollback
    if (this.snapshotGraph && wasActive) {
      this.currentGraph = JSON.parse(JSON.stringify(this.snapshotGraph));
      if (this.changeCallback) {
        this.changeCallback(this.currentGraph);
      }

      globalTelemetry.logEvent(
        ObservableEventType.TRANSACTION,
        "AI Execution Rollback Synchronized",
        "Reverting to original baseline pre-execution checkpoint to maintain trace replay integrity.",
        "warning"
      );
    }

    const activeSession = executionTraceTracker.getActiveSession();
    if (activeSession) {
      executionTraceTracker.completeSession(activeSession.id, 'failed');
    }

    this.notifyProgress();
  }

  private completeSession() {
    this.state = 'completed';
    this.currentProgress = 100;
    
    const activeSession = executionTraceTracker.getActiveSession();
    if (activeSession) {
      executionTraceTracker.completeSession(activeSession.id, 'completed');
    }

    globalTelemetry.logEvent(
      ObservableEventType.AI_ACTION,
      "Unified Engine Execution Complete",
      `Completed strategy parameters setup for: "${this.activeGoal}"`,
      "success"
    );

    this.notifyProgress();
  }

  private notifyProgress() {
    if (this.progressCallback) {
      this.progressCallback(this.currentProgress, this.state, this.getStages());
    }
  }
}
