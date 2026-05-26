import { 
  EngineeringConstraint, 
  ConstraintType, 
  ConstraintScope, 
  StandardManufacturingLimits 
} from './constraintSchemas';

export interface ConstraintConflict {
  id: string;
  constraintA: EngineeringConstraint;
  constraintB: EngineeringConstraint;
  severity: "error" | "warning";
  message: string;
  resolutionHint: string;
}

export class ConstraintGraph {
  private vertices: Map<string, EngineeringConstraint> = new Map();

  constructor(initialConstraints?: EngineeringConstraint[]) {
    if (initialConstraints) {
      initialConstraints.forEach(c => this.addConstraint(c));
    }
  }

  /**
   * Clears all constraints.
   */
  public clear(): void {
    this.vertices.clear();
  }

  /**
   * Adds a constraint to the graph. Performs validation.
   */
  public addConstraint(constraint: EngineeringConstraint): void {
    this.vertices.set(constraint.id, {
      ...constraint,
      priority: constraint.priority ?? this.getDefaultPriority(constraint)
    });
  }

  /**
   * Removes a constraint from the graph.
   */
  public removeConstraint(id: string): boolean {
    return this.vertices.delete(id);
  }

  /**
   * Retrieves a constraint by its ID.
   */
  public getConstraint(id: string): EngineeringConstraint | undefined {
    return this.vertices.get(id);
  }

  /**
   * Gets all active constraints in the graph.
   */
  public getAllConstraints(): EngineeringConstraint[] {
    return Array.from(this.vertices.values());
  }

  /**
   * Filters constraints by scope and target matching.
   */
  public getConstraintsForScope(scope: ConstraintScope, target?: string): EngineeringConstraint[] {
    return Array.from(this.vertices.values()).filter(c => {
      if (c.scope !== scope) return false;
      if (target !== undefined && c.target !== target) return false;
      return true;
    });
  }

  /**
   * Resolves the hierarchy chain for a specific net and its netclass.
   * Order of precedence: REGION -> NET -> NETCLASS -> GLOBAL.
   */
  public getConstraintsForNet(netId: string, netClassName?: string, x?: number, y?: number): EngineeringConstraint[] {
    const list: EngineeringConstraint[] = [];

    for (const c of this.vertices.values()) {
      let isApplicable = false;

      // 1. Global constraints apply to everything
      if (c.scope === ConstraintScope.GLOBAL) {
        isApplicable = true;
      }
      // 2. NetClass scope applies if the net matches the class name
      else if (c.scope === ConstraintScope.NETCLASS && netClassName && c.target === netClassName) {
        isApplicable = true;
      }
      // 3. Net scope applies if it matches explicitly
      else if (c.scope === ConstraintScope.NET && c.target === netId) {
        isApplicable = true;
      }
      // 4. Region-based constraints apply if the trace coordinate intersects the target area
      else if (c.scope === ConstraintScope.REGION && c.boundingBox && x !== undefined && y !== undefined) {
        const bbox = c.boundingBox;
        if (x >= bbox.x && x <= bbox.x + bbox.width && y >= bbox.y && y <= bbox.y + bbox.height) {
          isApplicable = true;
        }
      }

      if (isApplicable) {
        list.push(c);
      }
    }

    // Sort by priority (highest first) and then creation time
    return list.sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt);
  }

  /**
   * Determines default priorities for constraint scopes to model hierarchical inheritance.
   */
  private getDefaultPriority(c: EngineeringConstraint): number {
    switch (c.scope) {
      case ConstraintScope.REGION: return 80;
      case ConstraintScope.COMPONENT: return 70;
      case ConstraintScope.DIFFERENTIAL_PAIR: return 60;
      case ConstraintScope.NET: return 50;
      case ConstraintScope.NETCLASS: return 30;
      case ConstraintScope.LAYER: return 20;
      case ConstraintScope.GLOBAL: return 10;
      default: return 0;
    }
  }

  /**
   * Detects static overlaps, contradictions, or violations of basic manufacturing rules.
   */
  public detectConflicts(): ConstraintConflict[] {
    const conflicts: ConstraintConflict[] = [];
    const all = this.getAllConstraints();

    // 1. Inter-rule spacing contradiction checking
    for (let i = 0; i < all.length; i++) {
      const cA = all[i];

      // Check violation of hard physical manufacturing thresholds
      if (cA.type === ConstraintType.CLEARANCE && cA.parameters.minSpacing < StandardManufacturingLimits.minTraceClearance) {
        conflicts.push({
          id: `conflict-mfg-clearance-${cA.id}`,
          constraintA: cA,
          constraintB: cA, // self reference
          severity: "error",
          message: `Constraint on clearance (${cA.parameters.minSpacing}mm) violates factory DRC minimums (${StandardManufacturingLimits.minTraceClearance}mm).`,
          resolutionHint: `Increase clearance value on target "${cA.target}" to at least ${StandardManufacturingLimits.minTraceClearance}mm.`
        });
      }

      if (cA.type === ConstraintType.NETCLASS && cA.parameters.minWidth < StandardManufacturingLimits.minTraceWidth) {
        conflicts.push({
          id: `conflict-mfg-width-${cA.id}`,
          constraintA: cA,
          constraintB: cA,
          severity: "error",
          message: `Constraint on trace width (${cA.parameters.minWidth}mm) violates factory DRC limits (${StandardManufacturingLimits.minTraceWidth}mm).`,
          resolutionHint: `Increase trace width value on netclass "${cA.target}" to >= ${StandardManufacturingLimits.minTraceWidth}mm.`
        });
      }

      // Check overlap conflicts
      for (let j = i + 1; j < all.length; j++) {
        const cB = all[j];

        // If matching target, scope and type - check if they specify conflicting properties
        if (cA.type === cB.type && cA.scope === cB.scope && cA.target === cB.target) {
          if (cA.priority === cB.priority) {
            conflicts.push({
              id: `conflict-priority-${cA.id}-${cB.id}`,
              constraintA: cA,
              constraintB: cB,
              severity: "warning",
              message: `Ambiguous constraint overlap: Rule "${cA.description || cA.id}" and Rule "${cB.description || cB.id}" override the same target with matching priority (${cA.priority}).`,
              resolutionHint: `Differentiate priorities by setting one rule value higher.`
            });
          }
        }
      }
    }

    return conflicts;
  }
}
