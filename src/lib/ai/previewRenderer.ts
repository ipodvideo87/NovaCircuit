export interface DraftComponentPreview {
  id: string;
  designator: string;
  name: string;
  footprint: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  pins: { name: string; x: number; y: number }[];
}

export interface DraftTracePreview {
  id: string;
  netName: string;
  points: { x: number; y: number }[];
  width: number;
  color?: string;
}

class PreviewRenderer {
  private draftCount = 0;
  private componentGhosts: DraftComponentPreview[] = [];
  private tracePreviews: DraftTracePreview[] = [];
  private listeners: Set<() => void> = new Set();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  /**
   * Adds provisional component ghosts prior to state committing.
   */
  public addComponentGhost(ghost: Omit<DraftComponentPreview, 'id'>): string {
    const id = `ghost-comp-${this.draftCount++}-${Date.now()}`;
    this.componentGhosts.push({ ...ghost, id });
    this.notify();
    return id;
  }

  /**
   * Adds provisional routing previews.
   */
  public addTracePreview(trace: Omit<DraftTracePreview, 'id'>): string {
    const id = `ghost-trace-${this.draftCount++}-${Date.now()}`;
    this.tracePreviews.push({ ...trace, id });
    this.notify();
    return id;
  }

  public getComponentGhosts(): DraftComponentPreview[] {
    return [...this.componentGhosts];
  }

  public getTracePreviews(): DraftTracePreview[] {
    return [...this.tracePreviews];
  }

  /**
   * Erases temporary preview ghosts easily.
   */
  public clearPreviews() {
    this.componentGhosts = [];
    this.tracePreviews = [];
    this.notify();
  }
}

export const aiPreviewRenderer = new PreviewRenderer();
