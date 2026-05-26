import { ProjectGraph } from '../../types';
import { EngineeringConstraint, ConstraintType, ConstraintScope } from './constraintSchemas';

export interface VisualConstraintOverlay {
  id: string;
  type: "keepout" | "emi_boundary" | "diff_corridor" | "rf_isolation_ring" | "thermal_spot";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: string;
  layers: string[];
}

export class ConstraintVisualization {
  /**
   * Synthesizes visual overlay descriptors for active constraints on the board.
   */
  public static generateCanvasOverlays(
    graph: ProjectGraph, 
    constraints: EngineeringConstraint[]
  ): VisualConstraintOverlay[] {
    const overlays: VisualConstraintOverlay[] = [];

    // 1. Process Keepout zones explicitly from board definitions
    if (graph.keepouts && graph.keepouts.length > 0) {
      graph.keepouts.forEach(k => {
        overlays.push({
          id: `vis-keepout-${k.id}`,
          type: "keepout",
          x: k.x,
          y: k.y,
          width: k.width,
          height: k.height,
          color: "rgba(239, 68, 68, 0.15)", // soft red keepout overlay
          label: `KEEPOUT: Avoid (${k.restrictions.join(", ")})`,
          layers: k.layers
        });
      });
    }

    // 2. Synthesize overlays matching semantic active constraint nodes (such as EMI sensitive or RF isolation zones)
    constraints.forEach(c => {
      // If of type RF_ISOLATION or EMI_REGION and carries bounding box settings, display spacing rings
      if ((c.type === ConstraintType.RF_ISOLATION || c.type === ConstraintType.EMI_REGION) && c.boundingBox) {
        const box = c.boundingBox;
        overlays.push({
          id: `vis-rf-ring-${c.id}`,
          type: "rf_isolation_ring",
          x: box.x - 2, // offset slightly for visual ring bounds
          y: box.y - 2,
          width: box.width + 4,
          height: box.height + 4,
          color: "rgba(59, 130, 246, 0.15)", // glowing cyan/blue
          label: `RF GUARD ZONE: ${c.target || 'Critical'} (${c.parameters.minSpacing || 1.5}mm Clearance)`,
          layers: box.layers
        });
      }

      // If of type CURRENT_REQMNT specifying high currents, display thermal warning spot
      if (c.type === ConstraintType.CURRENT_REQMNT && c.boundingBox) {
        const box = c.boundingBox;
        overlays.push({
          id: `vis-thermal-${c.id}`,
          type: "thermal_spot",
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          color: "rgba(249, 115, 22, 0.15)", // warm orange thermal zone
          label: `HEAVY COPPER Relief Relieves: ${c.target} (${c.parameters.currentAmps || 3}A)`,
          layers: box.layers
        });
      }

      // If of type DIFF_PAIR, plot standard high-speed differential corridors
      if (c.type === ConstraintType.DIFF_PAIR && c.boundingBox) {
        const box = c.boundingBox;
        overlays.push({
          id: `vis-diff-corridor-${c.id}`,
          type: "diff_corridor",
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          color: "rgba(168, 85, 247, 0.12)", // ambient violet
          label: `DIFF PAIR CORRIDOR: ${c.target} ${c.parameters.targetImpedance || 90}Ω`,
          layers: box.layers || ["F.Cu"]
        });
      }
    });

    return overlays;
  }
}
