import { runtimeEventBus, ObservableEvent, ObservableEventType } from './runtimeEvents';
import { executionTraceTracker, ExecutionTraceSession, TraceNode } from './executionTrace';
import { ReplayInspector, GraphDiffReport } from './replayInspector';
import { performanceProfiler, ProfileMeasurement } from './performanceProfiler';
import { ProjectGraph } from '../../types';

export class ObservabilityRuntime {
  /**
   * Dispatches a fresh system telemetry event.
   */
  public logEvent(
    type: ObservableEventType,
    title: string,
    message: string,
    status: ObservableEvent["status"] = "success",
    metadata?: Record<string, any>,
    durationMs?: number
  ): ObservableEvent {
    return runtimeEventBus.emit(type, title, message, status, metadata, durationMs);
  }

  /**
   * Tracks an automated subsystem job (e.g. routing passes, optimizer steps, simulation runs) using a callback.
   */
  public async profileTask<T>(tag: string, task: () => Promise<T> | T, eventType = ObservableEventType.OPTIMIZATION): Promise<T> {
    performanceProfiler.start(tag);
    try {
      const result = await task();
      const elapsed = performanceProfiler.end(tag);
      this.logEvent(
        eventType,
        `Task Completed: ${tag}`,
        `Successfully completed procedural subsystem task inside ${elapsed}ms`,
        "success",
        { tag, elapsedMs: elapsed },
        elapsed
      );
      return result;
    } catch (err: any) {
      const elapsed = performanceProfiler.end(tag);
      this.logEvent(
        eventType,
        `Task Sgfault: ${tag}`,
        `Halted with exception after ${elapsed}ms: ${err?.message || err}`,
        "error",
        { tag, error: err?.message || String(err) },
        elapsed
      );
      throw err;
    }
  }

  /**
   * Compares two snapshots of project graph files.
   */
  public diffGraphs(before: ProjectGraph, after: ProjectGraph): GraphDiffReport {
    return ReplayInspector.diffGraphs(before, after);
  }

  /**
   * Translates active session steps back.
   */
  public getLiveTraceSession(): ExecutionTraceSession | null {
    return executionTraceTracker.getActiveSession();
  }

  /**
   * Full logging history array.
   */
  public getEventHistory(): ObservableEvent[] {
    return runtimeEventBus.getHistory();
  }

  /**
   * Subsystem average speed tracking.
   */
  public getSpeedAverage(tag: string): number {
    return performanceProfiler.getAverageDuration(tag);
  }
}

export const globalTelemetry = new ObservabilityRuntime();
export { runtimeEventBus, ObservableEventType } from './runtimeEvents';
export { executionTraceTracker } from './executionTrace';
export { ReplayInspector } from './replayInspector';
export { performanceProfiler } from './performanceProfiler';
