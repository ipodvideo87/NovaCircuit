import { runtimeEventBus, ObservableEventType } from './runtimeEvents';

export interface ProfileMeasurement {
  tag: string;
  durationMs: number;
  timestamp: number;
}

class PerformanceProfiler {
  private activeMarkers: Map<string, number> = new Map();
  private measurements: ProfileMeasurement[] = [];
  private maxStoredMeasurements = 500;

  /**
   * Starts timing a designated transaction/subsystem procedure.
   */
  public start(tag: string): void {
    this.activeMarkers.set(tag, performance.now());
  }

  /**
   * Stops timing a designated transaction/subsystem procedure and registers it.
   */
  public end(tag: string, customMessage?: string): number {
    const startTime = this.activeMarkers.get(tag);
    if (startTime === undefined) {
      return 0;
    }

    const duration = performance.now() - startTime;
    this.activeMarkers.delete(tag);

    const record: ProfileMeasurement = {
      tag,
      durationMs: Number(duration.toFixed(2)),
      timestamp: Date.now()
    };

    this.measurements.push(record);
    if (this.measurements.length > this.maxStoredMeasurements) {
      this.measurements.shift();
    }

    // Emit render profiling explicitly 
    if (tag.toLowerCase().includes("render") || tag.toLowerCase().includes("gpu")) {
      runtimeEventBus.emit(
        ObservableEventType.RENDER,
        `${tag} frame updated`,
        customMessage || `Refresh period computed as ${record.durationMs}ms`,
        "success",
        { durationMs: record.durationMs },
        record.durationMs
      );
    }
    // Emit routing / optimization profiling
    else {
      runtimeEventBus.emit(
        ObservableEventType.RENDER,
        `Task performance track: ${tag}`,
        customMessage || `Executed in ${record.durationMs}ms`,
        "success",
        { durationMs: record.durationMs },
        record.durationMs
      );
    }

    return record.durationMs;
  }

  /**
   * Gets list of history records for performance graphs.
   */
  public getHistory(tag?: string): ProfileMeasurement[] {
    if (tag) {
      return this.measurements.filter(m => m.tag === tag);
    }
    return [...this.measurements];
  }

  /**
   * Gets average time spent on any specific task.
   */
  public getAverageDuration(tag: string): number {
    const list = this.getHistory(tag);
    if (list.length === 0) return 0;
    const total = list.reduce((sum, item) => sum + item.durationMs, 0);
    return Number((total / list.length).toFixed(2));
  }
}

export const performanceProfiler = new PerformanceProfiler();
