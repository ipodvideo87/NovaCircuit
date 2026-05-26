import { runtimeEventBus, ObservableEventType } from '../observability/runtimeEvents';

export interface AttentionRegion {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  intensity: number; // 0.0 to 1.0 (pulse strength/glow)
  color: string;
  createdAt: number;
  expiresAt: number;
}

class AttentionSystem {
  private activeRegions: Map<string, AttentionRegion> = new Map();
  private subscribers: Set<(regions: AttentionRegion[]) => void> = new Set();

  constructor() {
    // Poll expired regions out automatically
    setInterval(() => {
      let changed = false;
      const now = Date.now();
      for (const [id, region] of this.activeRegions.entries()) {
        if (now > region.expiresAt) {
          this.activeRegions.delete(id);
          changed = true;
        }
      }
      if (changed) {
        this.notify();
      }
    }, 500);
  }

  /**
   * Registers a brand new attention focus region for physical overlay indicators.
   */
  public registerFocus(
    x: number,
    y: number,
    radius: number,
    label: string,
    durationMs = 4000,
    color = "rgba(139, 92, 246, 0.45)" // beautiful ambient violet / neon magenta default
  ): string {
    const id = `attn-${Math.random().toString(36).substr(2, 9)}`;
    const region: AttentionRegion = {
      id,
      x,
      y,
      radius,
      label,
      intensity: 1.0,
      color,
      createdAt: Date.now(),
      expiresAt: Date.now() + durationMs
    };

    this.activeRegions.set(id, region);
    
    // Dispatch telemetry report
    runtimeEventBus.emit(
      ObservableEventType.AI_ACTION,
      `AI Attention Locked`,
      `Aiming logical processing viewport onto coordinate point (${x}, ${y}) labeled: ${label}`,
      "success",
      { id, label, x, y, radius }
    );

    this.notify();
    return id;
  }

  public getActiveFocuses(): AttentionRegion[] {
    return Array.from(this.activeRegions.values());
  }

  public subscribe(cb: (regions: AttentionRegion[]) => void): () => void {
    this.subscribers.add(cb);
    cb(this.getActiveFocuses());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify() {
    const list = this.getActiveFocuses();
    this.subscribers.forEach(cb => cb(list));
  }

  public clear() {
    this.activeRegions.clear();
    this.notify();
  }
}

export const aiAttentionSystem = new AttentionSystem();
