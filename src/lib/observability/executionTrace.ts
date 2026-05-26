import { runtimeEventBus, ObservableEventType } from './runtimeEvents';

export interface TraceNode {
  id: string;
  label: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  dependsOn: string[];
  executionTimeMs?: number;
  reasoning?: string;
}

export interface ExecutionTraceSession {
  id: string;
  goal: string;
  timestamp: number;
  totalDurationMs?: number;
  status: "active" | "completed" | "failed";
  nodes: TraceNode[];
}

class ExecutionTraceTracker {
  private sessions: Map<string, ExecutionTraceSession> = new Map();
  private activeSessionId: string | null = null;

  public startSession(goal: string, nodes: TraceNode[]): string {
    const sessionId = `trace-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
    const session: ExecutionTraceSession = {
      id: sessionId,
      goal,
      timestamp: Date.now(),
      status: "active",
      nodes
    };
    
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;

    runtimeEventBus.emit(
      ObservableEventType.AI_REASONING,
      "AI Strategy Drafted",
      `Planning execution for high-level goal: "${goal}"`,
      "success",
      { sessionId, nodeCount: nodes.length }
    );

    return sessionId;
  }

  public updateNodeStatus(
    sessionId: string, 
    nodeId: string, 
    status: TraceNode["status"], 
    details?: { duration?: number; reasoning?: string }
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const node = session.nodes.find(n => n.id === nodeId);
    if (node) {
      const prevStatus = node.status;
      node.status = status;
      if (details?.duration) node.executionTimeMs = details.duration;
      if (details?.reasoning) node.reasoning = details.reasoning;

      const eventStatus = status === "error" ? "error" : status === "running" ? "pending" : "success";
      runtimeEventBus.emit(
        ObservableEventType.TASK_DAG,
        `Task Node ${nodeId} (${node.label})`,
        `Transitioned from ${prevStatus.toUpperCase()} to ${status.toUpperCase()}`,
        eventStatus,
        { sessionId, nodeId, node, prevStatus, currentStatus: status },
        details?.duration
      );
    }
  }

  public completeSession(sessionId: string, status: "completed" | "failed"): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;
    session.totalDurationMs = Date.now() - session.timestamp;
    
    runtimeEventBus.emit(
      ObservableEventType.AI_ACTION,
      `Strategy Execution ${status === 'completed' ? 'Succeeded' : 'Failed'}`,
      `Finished orchestrating plan for: "${session.goal}" in ${session.totalDurationMs}ms`,
      status === 'completed' ? "success" : "error",
      { sessionId, session }
    );

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
  }

  public getSession(sessionId: string): ExecutionTraceSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getActiveSession(): ExecutionTraceSession | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) || null;
  }

  public getAllSessions(): ExecutionTraceSession[] {
    return Array.from(this.sessions.values()).sort((a,b) => b.timestamp - a.timestamp);
  }
}

export const executionTraceTracker = new ExecutionTraceTracker();
