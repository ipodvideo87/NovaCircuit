import { ConstraintGraph } from './constraintGraph';
import { 
  PhysicalConstraintBounds, 
  ConstraintType, 
  EngineeringConstraint,
  StandardManufacturingLimits
} from './constraintSchemas';

export class ConstraintResolver {
  private graph: ConstraintGraph;

  constructor(graph: ConstraintGraph) {
    this.graph = graph;
  }

  /**
   * Resolves the final cumulative design rules on a given net of the board.
   * Traverses priorities: lowest (global defaults) to highest (region / manual overrides).
   */
  public resolveNetRules(
    netId: string, 
    netClassName?: string, 
    x?: number, 
    y?: number
  ): PhysicalConstraintBounds {
    // 1. Establish hard fallback defaults
    const rules: PhysicalConstraintBounds = {
      minWidth: 0.2,
      preferredWidth: 0.25,
      maxWidth: 2.5,
      minSpacing: 0.20,
      allowedLayers: ["F.Cu", "B.Cu"],
      viaDrillSize: 0.3,
      viaPadSize: 0.6,
      thermalRelief: "relief",
      isEmiSensitive: false
    };

    // 2. Query constraints affecting this net sorted from LOWEST to HIGHEST priority
    // this lets highest priority rules override previously written fields in sequence.
    const activeConstraints = this.graph.getConstraintsForNet(netId, netClassName, x, y);
    const sortedConstraints = [...activeConstraints].reverse(); // reverse so highest is applied last (wins)

    for (const c of sortedConstraints) {
      this.applyConstraintToRules(c, rules);
    }

    // 3. Post-resolve verification ensuring standard safety boundaries are not breached
    this.enforceManufacturingFloors(rules);

    return rules;
  }

  /**
   * Translates an abstract constraint statement parameter object into concrete physical layout rules.
   */
  private applyConstraintToRules(c: EngineeringConstraint, rules: PhysicalConstraintBounds): void {
    const p = c.parameters;
    if (!p) return;

    switch (c.type) {
      case ConstraintType.NETCLASS:
        if (p.minWidth !== undefined) rules.minWidth = p.minWidth;
        if (p.preferredWidth !== undefined) rules.preferredWidth = p.preferredWidth;
        if (p.maxWidth !== undefined) rules.maxWidth = p.maxWidth;
        if (p.minSpacing !== undefined) rules.minSpacing = p.minSpacing;
        if (p.viaDrillSize !== undefined) rules.viaDrillSize = p.viaDrillSize;
        if (p.viaPadSize !== undefined) rules.viaPadSize = p.viaPadSize;
        if (p.impedanceOhms !== undefined) rules.impedanceOhms = p.impedanceOhms;
        if (p.allowedLayers !== undefined) rules.allowedLayers = p.allowedLayers;
        break;

      case ConstraintType.CLEARANCE:
        if (p.minSpacing !== undefined) rules.minSpacing = p.minSpacing;
        break;

      case ConstraintType.IMPEDANCE:
        if (p.targetImpedance !== undefined) rules.impedanceOhms = p.targetImpedance;
        if (p.minWidth !== undefined) rules.minWidth = p.minWidth;
        break;

      case ConstraintType.DIFF_PAIR:
        if (p.targetImpedance !== undefined) rules.impedanceOhms = p.targetImpedance;
        if (p.spacing !== undefined) rules.minSpacing = p.spacing;
        if (p.width !== undefined) {
          rules.minWidth = p.width;
          rules.preferredWidth = p.width;
        }
        if (p.maxUncoupledLength !== undefined) rules.maxUncoupledLength = p.maxUncoupledLength;
        break;

      case ConstraintType.SKEW_MATCH:
        if (p.skewTolerance !== undefined) rules.skewTolerance = p.skewTolerance;
        break;

      case ConstraintType.LAYER_RESTRICTION:
        if (p.allowedLayers !== undefined) rules.allowedLayers = p.allowedLayers;
        break;

      case ConstraintType.VIA_RESTRICTION:
        if (p.drillSize !== undefined) rules.viaDrillSize = p.drillSize;
        if (p.padSize !== undefined) rules.viaPadSize = p.padSize;
        break;

      case ConstraintType.CURRENT_REQMNT:
        // Rule of thumb scaling for current: trace width increases with current 
        // standard formula: Width = (Current / (k * TempRise^0.44))^(1/0.725)
        if (p.currentAmps !== undefined) {
          rules.currentRatingAmps = p.currentAmps;
          const reqWidth = Math.max(0.2, p.currentAmps * 0.35); // standard safe sizing
          if (reqWidth > rules.minWidth) {
            rules.minWidth = reqWidth;
            rules.preferredWidth = Math.max(rules.preferredWidth, reqWidth * 1.2);
          }
        }
        break;

      case ConstraintType.THERMAL:
        if (p.reliefStyle !== undefined) rules.thermalRelief = p.reliefStyle;
        break;

      case ConstraintType.EMI_REGION:
      case ConstraintType.RF_ISOLATION:
        rules.isEmiSensitive = true;
        if (p.minSpacing !== undefined) {
          rules.minSpacing = Math.max(rules.minSpacing, p.minSpacing);
        }
        break;

      default:
        // Ignore generic or AI metadata constraint updates
        break;
    }
  }

  /**
   * Clamps final resolved layouts to hard legal manufacturing floors.
   */
  private enforceManufacturingFloors(rules: PhysicalConstraintBounds): void {
    if (rules.minWidth < StandardManufacturingLimits.minTraceWidth) {
      rules.minWidth = StandardManufacturingLimits.minTraceWidth;
    }
    if (rules.preferredWidth < rules.minWidth) {
      rules.preferredWidth = rules.minWidth;
    }
    if (rules.minSpacing < StandardManufacturingLimits.minTraceClearance) {
      rules.minSpacing = StandardManufacturingLimits.minTraceClearance;
    }
    if (rules.viaDrillSize < StandardManufacturingLimits.minDrillSize) {
      rules.viaDrillSize = StandardManufacturingLimits.minDrillSize;
    }
    if (rules.viaPadSize < StandardManufacturingLimits.minViaSize) {
      rules.viaPadSize = StandardManufacturingLimits.minViaSize;
    }
  }
}
