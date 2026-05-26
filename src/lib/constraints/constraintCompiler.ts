import { 
  EngineeringConstraint, 
  ConstraintType, 
  ConstraintScope, 
  ConstraintSource 
} from './constraintSchemas';

export class ConstraintCompiler {
  /**
   * Translates natural language engineering design intent into formal ProjectGraph constraints.
   */
  public static compileIntentToConstraints(intent: string): EngineeringConstraint[] {
    const compiled: EngineeringConstraint[] = [];
    const text = intent.toLowerCase();
    const now = Date.now();

    // 1. Differential pair detection e.g. "USB differential pair"
    if (text.includes("usb") || text.includes("differential") || text.includes("diff pair")) {
      compiled.push({
        id: `c-diff-${now}-1`,
        type: ConstraintType.DIFF_PAIR,
        scope: ConstraintScope.DIFFERENTIAL_PAIR,
        target: "USB_D",
        parameters: {
          width: 0.15,
          spacing: 0.2,
          targetImpedance: 90,
          maxUncoupledLength: 6.0,
          skewTolerance: 0.15
        },
        priority: 70,
        source: ConstraintSource.AI,
        isLocked: false,
        description: "Linguistic compiled differential pair constraint matching USB high speed tolerances.",
        createdAt: now
      });
    }

    // 2. RF / Isolation requirements e.g. "RF isolation" or "microwave antenna"
    if (text.includes("rf") || text.includes("isolation") || text.includes("antenna") || text.includes("shield")) {
      compiled.push({
        id: `c-rf-${now}-2`,
        type: ConstraintType.RF_ISOLATION,
        scope: ConstraintScope.NET,
        target: "RF_ANT",
        parameters: {
          minSpacing: 1.5,
          allowedLayers: ["F.Cu"],
          isEmiSensitive: true
        },
        priority: 85,
        source: ConstraintSource.AI,
        isLocked: false,
        description: "RF Guardring & Spacing constraint isolating high frequency trace paths.",
        createdAt: now
      });
    }

    // 3. Power or High Current stage rules e.g. "buck converter power stage"
    if (text.includes("buck") || text.includes("power") || text.includes("current") || text.includes("motor")) {
      compiled.push({
        id: `c-pwr-${now}-3`,
        type: ConstraintType.CURRENT_REQMNT,
        scope: ConstraintScope.NETCLASS,
        target: "POWER",
        parameters: {
          currentAmps: 3.5,
          minWidth: 1.2,
          preferredWidth: 1.5,
          thermalRelief: "relief"
        },
        priority: 75,
        source: ConstraintSource.AI,
        isLocked: false,
        description: "Heavy copper routing rules enforcing thermal reliefs and high amp traces.",
        createdAt: now
      });
    }

    // 4. Clock tuning / skew guidelines e.g. "skew tuning", "clock lines"
    if (text.includes("clock") || text.includes("skew") || text.includes("spi") || text.includes("memory")) {
      compiled.push({
        id: `c-skew-${now}-4`,
        type: ConstraintType.SKEW_MATCH,
        scope: ConstraintScope.NETCLASS,
        target: "CLOCK",
        parameters: {
          skewTolerance: 0.10, // 0.1mm max path skew
          lengthTarget: 45.0,
          lengthTolerance: 1.0
        },
        priority: 80,
        source: ConstraintSource.AI,
        isLocked: false,
        description: "Length-matching constraint ensuring precise signal propagation alignment.",
        createdAt: now
      });
    }

    // 5. General clearance enlargement e.g. "EMI sensitive"
    if (text.includes("clearance") || text.includes("creepage") || text.includes("high voltage")) {
      compiled.push({
        id: `c-clear-${now}-5`,
        type: ConstraintType.CLEARANCE,
        scope: ConstraintScope.GLOBAL,
        target: "",
        parameters: {
          minSpacing: 0.35
        },
        priority: 40,
        source: ConstraintSource.USER,
        isLocked: false,
        description: "Global minimum physical clearance threshold modification.",
        createdAt: now
      });
    }

    // Default system global constraint to anchor validation if empty
    if (compiled.length === 0) {
      compiled.push({
        id: `c-global-${now}-0`,
        type: ConstraintType.NETCLASS,
        scope: ConstraintScope.GLOBAL,
        target: "DEFAULT",
        parameters: {
          minWidth: 0.2,
          minSpacing: 0.2,
          viaDrillSize: 0.3,
          viaPadSize: 0.6
        },
        priority: 10,
        source: ConstraintSource.SYSTEM,
        isLocked: true,
        description: "Base system fallback design rules.",
        createdAt: now
      });
    }

    return compiled;
  }

  /**
   * Formats constraint records into a compressed AI-readable markdown string.
   */
  public static compileConstraintsToSummary(constraints: EngineeringConstraint[]): string {
    if (constraints.length === 0) {
      return "CONSTRAINTS LEDGER: Empty (Standard manufacturing limits apply globally).";
    }

    let summary = "### ACTIVE ENGINEERING DESIGN CONSTRAINTS\n\n";
    summary += "| Rule ID | Type | Scope | Target | Details | Src | Pri |\n";
    summary += "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n";

    constraints.forEach(c => {
      const detailsStr = Object.entries(c.parameters)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ");
      summary += `| ${c.id} | ${c.type} | ${c.scope} | ${c.target || "*"} | ${detailsStr} | ${c.source} | ${c.priority} |\n`;
    });

    return summary;
  }
}
