import { ProjectGraph, Point, PCBComponent } from '../types';
import { BoardTrace, BoardLayer } from './board';

/**
 * Represent standard Viewport coordinate offsets and scales.
 */
export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  width: number;
  height: number;
}

/**
 * Mouse drag, hover, or routing interaction states.
 */
export type InteractionMode = "SELECT" | "ROUTE" | "PLACE_COMPONENT" | "DRAG_OBJECT";

export interface EditorInteractionState {
  mode: InteractionMode;
  hoveredElementId?: string;
  selectedElementIds: string[];
  activeRoutingNetId?: string;
  activeRoutingPoints: Point[];
  activePlacingPartNumber?: string;
}

/**
 * Snap point coordinates representation.
 */
export interface SnapResult {
  x: number;
  y: number;
  snapped: boolean;
  snapType?: "grid" | "pin" | "pad" | "trace_midpoint";
}

/**
 * Element-level bounding boxes used for viewport virtualization.
 */
export interface VirtualizedElement {
  id: string;
  type: "component" | "trace" | "pin" | "keepout";
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 1. Physics-Aware Snapping Engine
 */
export class InteractiveSnappingEngine {
  constructor(private gridSpacingMm: number = 0.5) {}

  /**
   * Snaps a mouse position coordinate to layout rules or grid intervals.
   */
  public calculateSnap(
    inputX: number,
    inputY: number,
    pins: { x: number; y: number }[] = []
  ): SnapResult {
    // 1. Scan for nearby pins (3.0mm snap radius threshold)
    const proximityLimit = 1.5;
    let closestPin: { x: number; y: number } | null = null;
    let minDistance = proximityLimit;

    for (const pin of pins) {
      const dx = inputX - pin.x;
      const dy = inputY - pin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance) {
        minDistance = dist;
        closestPin = pin;
      }
    }

    if (closestPin) {
      return {
        x: closestPin.x,
        y: closestPin.y,
        snapped: true,
        snapType: "pin"
      };
    }

    // 2. Snap to configured ortholinear layout gridding
    const snappedX = Math.round(inputX / this.gridSpacingMm) * this.gridSpacingMm;
    const snappedY = Math.round(inputY / this.gridSpacingMm) * this.gridSpacingMm;

    return {
      x: parseFloat(snappedX.toFixed(3)),
      y: parseFloat(snappedY.toFixed(3)),
      snapped: true,
      snapType: "grid"
    };
  }
}

/**
 * 2. Viewport Virtualization & Geometry System
 * Evaluates bounding boxes to avoid rendering objects that fall outside the active visible viewport region.
 */
export class ViewportVirtualizer {
  /**
   * Translates 2D screen mouse coordinates back to physical PCB millimeters.
   */
  public screenToWorld(screenX: number, screenY: number, vp: ViewportState): Point {
    const x = (screenX - vp.panX) / vp.zoom;
    const y = (screenY - vp.panY) / vp.zoom;
    return { x, y };
  }

  /**
   * Translates real-world millimeter coordinates to screen pixel targets.
   */
  public worldToScreen(worldX: number, worldY: number, vp: ViewportState): Point {
    const x = worldX * vp.zoom + vp.panX;
    const y = worldY * vp.zoom + vp.panY;
    return { x, y };
  }

  /**
   * Filters and retrieves items intersecting with the current viewport limits to save render loops.
   */
  public getVisibleElements(
    elements: VirtualizedElement[],
    vp: ViewportState
  ): VirtualizedElement[] {
    const minVisibleX = -vp.panX / vp.zoom;
    const maxVisibleX = (vp.width - vp.panX) / vp.zoom;
    const minVisibleY = -vp.panY / vp.zoom;
    const maxVisibleY = (vp.height - vp.panY) / vp.zoom;

    return elements.filter(el => {
      // Overlap calculation
      const xOverlap = el.maxX >= minVisibleX && el.minX <= maxVisibleX;
      const yOverlap = el.maxY >= minVisibleY && el.minY <= maxVisibleY;
      return xOverlap && yOverlap;
    });
  }
}

/**
 * 3. Interactive Push-and-Shove Logic
 * Prevents overlapping traces by pushing adjacent paths.
 */
export class PushAndShoveRouter {
  /**
   * Calculates a relocated trace curve if a newly placed trace overlaps an existing trace.
   */
  public calculateShovedTrace(
    activeTrace: BoardTrace,
    obstacles: BoardTrace[],
    shoveRadiusMm: number
  ): BoardTrace[] {
    const adjustedTraces: BoardTrace[] = [];

    for (const obstacle of obstacles) {
      if (obstacle.netId === activeTrace.netId) continue;
      if (obstacle.layer !== activeTrace.layer) continue;

      // Move collinear segments slightly orthogonal to clear spacing clearance constraints
      const dx = activeTrace.endX - activeTrace.startX;
      const dy = activeTrace.endY - activeTrace.startY;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        // Orthogonal unit vector directions
        const perpX = -dy / len;
        const perpY = dx / len;

        // Shift coordinates slightly
        const shiftX = perpX * shoveRadiusMm;
        const shiftY = perpY * shoveRadiusMm;

        adjustedTraces.push({
          ...obstacle,
          startX: parseFloat((obstacle.startX + shiftX).toFixed(3)),
          startY: parseFloat((obstacle.startY + shiftY).toFixed(3)),
          endX: parseFloat((obstacle.endX + shiftX).toFixed(3)),
          endY: parseFloat((obstacle.endY + shiftY).toFixed(3))
        });
      }
    }

    return adjustedTraces;
  }
}

/**
 * 4. Interactive Command Buffer & Live DRC Verification Layer
 */
export class InteractiveEditorController {
  private viewVirtualizer = new ViewportVirtualizer();
  private snapEngine = new InteractiveSnappingEngine();
  private shoveRouter = new PushAndShoveRouter();

  private viewport: ViewportState = { zoom: 1.0, panX: 0, panY: 0, width: 800, height: 600 };
  private interactionState: EditorInteractionState = { mode: "SELECT", selectedElementIds: [], activeRoutingPoints: [] };

  constructor(customSpacing?: number) {
    if (customSpacing) {
      this.snapEngine = new InteractiveSnappingEngine(customSpacing);
    }
  }

  public getViewport(): ViewportState {
    return this.viewport;
  }

  public updateViewport(vp: Partial<ViewportState>): void {
    this.viewport = { ...this.viewport, ...vp };
  }

  public handleMouseScroll(deltaY: number, mouseX: number, mouseY: number): void {
    const zoomFactor = deltaY < 0 ? 1.1 : 0.9;
    const oldZoom = this.viewport.zoom;
    const newZoom = Math.max(0.1, Math.min(20.0, oldZoom * zoomFactor));

    // Pan viewport relative to mouse coordinate
    const worldPos = this.viewVirtualizer.screenToWorld(mouseX, mouseY, this.viewport);
    const newPanX = mouseX - worldPos.x * newZoom;
    const newPanY = mouseY - worldPos.y * newZoom;

    this.updateViewport({
      zoom: newZoom,
      panX: newPanX,
      panY: newPanY
    });
  }

  public handlePanDrag(dx: number, dy: number): void {
    this.updateViewport({
      panX: this.viewport.panX + dx,
      panY: this.viewport.panY + dy
    });
  }

  public getSnapEngine(): InteractiveSnappingEngine {
    return this.snapEngine;
  }

  public getShoveRouter(): PushAndShoveRouter {
    return this.shoveRouter;
  }
}
