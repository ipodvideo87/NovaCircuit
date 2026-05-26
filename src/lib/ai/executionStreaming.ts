import { runtimeEventBus, ObservableEventType } from '../observability/runtimeEvents';

export interface ReasoningChunk {
  id: string;
  timestamp: number;
  thought: string;
  focusRegion?: { x: number; y: number; radius: number; label: string };
  confidence: number; // 0.0 to 1.0
}

export class ExecutionStreamingEngine {
  private activeThoughts: ReasoningChunk[] = [];
  private onThoughtCallback?: (chunk: ReasoningChunk) => void;

  public setOnThought(cb: (chunk: ReasoningChunk) => void) {
    this.onThoughtCallback = cb;
  }

  /**
   * Progressive reasoning stream generator. Emits granular conceptual engineering insights.
   */
  public async streamReasoningPlan(
    goal: string,
    steps: { thought: string; focus?: { x: number; y: number; radius: number; label: string } }[]
  ): Promise<ReasoningChunk[]> {
    this.activeThoughts = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const chunk: ReasoningChunk = {
        id: `thought-${i}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: Date.now(),
        thought: step.thought,
        focusRegion: step.focus,
        confidence: Number((0.85 + Math.random() * 0.14).toFixed(2))
      };

      this.activeThoughts.push(chunk);

      // Trigger telemetry stream event
      runtimeEventBus.emit(
        ObservableEventType.AI_REASONING,
        `AI Reasoning Stream [Step ${i+1}]`,
        step.thought,
        "success",
        { chunk }
      );

      if (this.onThoughtCallback) {
        this.onThoughtCallback(chunk);
      }

      // Simulate step parsing delay
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    return this.activeThoughts;
  }

  public getThoughts(): ReasoningChunk[] {
    return [...this.activeThoughts];
  }

  public clear() {
    this.activeThoughts = [];
  }
}

export const executionStreamingEngine = new ExecutionStreamingEngine();
