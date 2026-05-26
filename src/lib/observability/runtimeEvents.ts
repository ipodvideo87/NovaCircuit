export enum ObservableEventType {
  AI_REASONING = "AI_REASONING",
  AI_ACTION = "AI_ACTION",
  TASK_DAG = "TASK_DAG",
  TRANSACTION = "TRANSACTION",
  CONSTRAINT_EVAL = "CONSTRAINT_EVAL",
  ROUTING = "ROUTING",
  OPTIMIZATION = "OPTIMIZATION",
  RENDER = "RENDER",
  CRDT_SYNC = "CRDT_SYNC",
  PHYSICS_SIM = "PHYSICS_SIM"
}

export interface ObservableEvent {
  id: string;
  type: ObservableEventType;
  timestamp: number;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  durationMs?: number;
  status: "success" | "warning" | "error" | "pending";
}

type ObservableEventListener = (event: ObservableEvent) => void;

class RuntimeEventBus {
  private listeners: Set<ObservableEventListener> = new Set();
  private eventLog: ObservableEvent[] = [];
  private maxLogSize = 1000;

  /**
   * Dispatches a brand new event to all active visual telemetry diagnostics.
   */
  public emit(
    type: ObservableEventType,
    title: string,
    message: string,
    status: ObservableEvent["status"] = "success",
    metadata?: Record<string, any>,
    durationMs?: number
  ): ObservableEvent {
    const event: ObservableEvent = {
      id: `evt-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`,
      type,
      timestamp: Date.now(),
      title,
      message,
      status,
      metadata,
      durationMs
    };

    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in telemetry listener", err);
      }
    });

    return event;
  }

  /**
   * Subscribes to realtime events.
   */
  public subscribe(listener: ObservableEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Gets the current buffer of events.
   */
  public getHistory(): ObservableEvent[] {
    return [...this.eventLog];
  }

  /**
   * Clears the event log entirely.
   */
  public clear(): void {
    this.eventLog = [];
    this.emit(ObservableEventType.TRANSACTION, "Telemetry Cleared", "Observability history was reset.", "success");
  }
}

export const runtimeEventBus = new RuntimeEventBus();
