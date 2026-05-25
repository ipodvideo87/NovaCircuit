import { ProjectGraph, PCBComponent, Net, AIAction } from '../types';
import { BoardTrace } from './board';
import { PhysicsSimulationEngine, NetSimulationReport } from './physicsRuntime';

/**
 * Breakdown of layout optimization dimensions.
 */
export interface LayoutScoreMetrics {
  drcViolationsCount: number;
  totalTraceLengthMm: number;
  totalViasCount: number;
  averageImpedanceDeviationOhm: number; // Offset from target e.g. 50/90
  peakTemperatureC: number;
  maxIRDropVolt: number;
  emiRadiatedFieldDBuVm: number;
}

/**
 * Weight criteria for multi-objective optimizations (scores normalized 0.0 to 1.0).
 */
export interface OptimizationWeights {
  drcPenaltyWeight: number;      // Primary constraint
  traceLengthWeight: number;     // Material / propagation cost
  viaPenaltyWeight: number;      // Manufacturing cost
  impedanceMatchWeight: number;  // Signal integrity (SI)
  thermalPerformanceWeight: number; // Thermal reliability
  powerEfficiencyWeight: number;   // IR Drop (PI)
  emiMitigationWeight: number;    // EMC
}

/**
 * Single proposed candidate state representation.
 */
export interface OptimizationCandidate {
  id: string;
  graphSnapshot: ProjectGraph;
  proposedActions: AIAction[];
  metrics: LayoutScoreMetrics;
  aggregateUtilityScore: number; // Larger is better (0 to 100)
}

/**
 * Complete Optimization Pass audit artifact.
 */
export interface OptimizationPassReport {
  passId: string;
  seedUsed: string;
  initialScore: number;
  optimizedScore: number;
  isImprovementFound: boolean;
  appliedActions: AIAction[];
}

/**
 * Continuous physics-aware Layout Evaluator and Score Generator.
 */
export class LayoutScoringEngine {
  private physicsSimulator = new PhysicsSimulationEngine();

  constructor(private weights: OptimizationWeights = {
    drcPenaltyWeight: 1.0,
    traceLengthWeight: 0.3,
    viaPenaltyWeight: 0.15,
    impedanceMatchWeight: 0.4,
    thermalPerformanceWeight: 0.25,
    powerEfficiencyWeight: 0.25,
    emiMitigationWeight: 0.2
  }) {}

  /**
   * Scores any project state relative to real electrical and thermal boundaries.
   */
  public evaluateLayoutScore(graph: ProjectGraph): { metrics: LayoutScoreMetrics; score: number } {
    const traces = graph.traces || [];
    
    // 1. Calculate Core Trace Parameters
    let totalLengthMm = 0;
    traces.forEach(t => {
      totalLengthMm += this.physicsSimulator.calculateTraceLength(t);
    });

    // 2. Compute Physical Characteristics over all nets
    let sumImpedanceDev = 0;
    let maxTemp = 25.0;
    let maxDrop = 0.0;
    let worstEmiField = 0;

    graph.nets.forEach(net => {
      const isPower = net.netClass === "POWER";
      const isDiff = net.netClass === "DIFFERENTIAL";
      const current = isPower ? 1.5 : (isDiff ? 0.01 : 0.05);

      const netReport = this.physicsSimulator.simulateNetPowerAndSignals(graph, net.id, current);
      const emiReport = this.physicsSimulator.analyzeEMILeakage(graph, net.id, isDiff ? 100e6 : 10e6);

      // Check offset deviation (defaulting standard targets to 50 Ohms)
      const targetImpedance = isDiff ? 90.0 : 50.0;
      sumImpedanceDev += Math.abs(netReport.averageImpedanceOhm - targetImpedance);

      if (netReport.peakTemperatureC > maxTemp) maxTemp = netReport.peakTemperatureC;
      if (netReport.totalVoltageDropVolt > maxDrop) maxDrop = netReport.totalVoltageDropVolt;
      if (emiReport.radiatedFieldDBuVm > worstEmiField) worstEmiField = emiReport.radiatedFieldDBuVm;
    });

    const avgImpedanceDev = graph.nets.length > 0 ? (sumImpedanceDev / graph.nets.length) : 0;

    // Simulate DRC Violations count simply
    let drcViolations = 0;
    // Simple mock DRC: components overlapping or trace clearance check
    for (let i = 0; i < graph.components.length; i++) {
      for (let j = i + 1; j < graph.components.length; j++) {
        const cA = graph.components[i];
        const cB = graph.components[j];
        // Euclidean clearance check
        const dx = cA.position.x - cB.position.x;
        const dy = cA.position.y - cB.position.y;
        if (Math.sqrt(dx * dx + dy * dy) < 8.0) {
          drcViolations++; // Collision violation
        }
      }
    }

    const metrics: LayoutScoreMetrics = {
      drcViolationsCount: drcViolations,
      totalTraceLengthMm: totalLengthMm,
      totalViasCount: (graph.traces || []).filter(t => (t.layer as any) === "Via").length,
      averageImpedanceDeviationOhm: avgImpedanceDev,
      peakTemperatureC: maxTemp,
      maxIRDropVolt: maxDrop,
      emiRadiatedFieldDBuVm: worstEmiField
    };

    const score = this.calculateAggregateUtility(metrics);
    return { metrics, score };
  }

  private calculateAggregateUtility(m: LayoutScoreMetrics): number {
    // Standardizing values into fractional penlaties to yield utility score (0 to 100)
    // Larger utility score is a superior design
    const drcTerm = Math.max(0, 1.0 - m.drcViolationsCount * 0.5) * this.weights.drcPenaltyWeight;
    const lengthTerm = Math.max(0, 1.0 - m.totalTraceLengthMm / 1000) * this.weights.traceLengthWeight;
    const viaTerm = Math.max(0, 1.0 - m.totalViasCount * 0.05) * this.weights.viaPenaltyWeight;
    const impedanceTerm = Math.max(0, 1.0 - m.averageImpedanceDeviationOhm / 50) * this.weights.impedanceMatchWeight;
    const thermalTerm = Math.max(0, 1.0 - (m.peakTemperatureC - 25.0) / 100) * this.weights.thermalPerformanceWeight;
    const powerTerm = Math.max(0, 1.0 - m.maxIRDropVolt / 1.0) * this.weights.powerEfficiencyWeight;
    const emiTerm = Math.max(0, 1.0 - m.emiRadiatedFieldDBuVm / 80) * this.weights.emiMitigationWeight;

    const totalWeight = Object.values(this.weights).reduce((a, b) => a + b, 0);
    const rawSum = drcTerm + lengthTerm + viaTerm + impedanceTerm + thermalTerm + powerTerm + emiTerm;
    
    return parseFloat(((rawSum / totalWeight) * 100).toFixed(4));
  }
}

/**
 * Autonomous Layout and Routing Synthesis Optimizer.
 * Iteratively alters layout candidates deterministicly to maximize electrical utility.
 */
export class AutonomousOptimizationRuntime {
  private scoringEngine = new LayoutScoringEngine();

  constructor(customWeights?: Partial<OptimizationWeights>) {
    if (customWeights) {
      this.scoringEngine = new LayoutScoringEngine({
        drcPenaltyWeight: 1.0,
        traceLengthWeight: 0.3,
        viaPenaltyWeight: 0.15,
        impedanceMatchWeight: 0.4,
        thermalPerformanceWeight: 0.25,
        powerEfficiencyWeight: 0.25,
        emiMitigationWeight: 0.2,
        ...customWeights
      });
    }
  }

  /**
   * Generates a single round of deterministic, seeded layout candidates.
   */
  public generateCandidates(
    graph: ProjectGraph,
    seed: string,
    iterations: number = 4
  ): OptimizationCandidate[] {
    const candidates: OptimizationCandidate[] = [];
    
    // Seeded multi-direction exploration
    for (let i = 0; i < iterations; i++) {
      const candidateGraph = this.deepClone(graph);
      const proposedActions: AIAction[] = [];

      // Simulate specific evolutionary tweaks on the sandbox graph:
      // Tweak 1: Component relocation to clear collisions
      if (candidateGraph.components.length > 1) {
        const victimComp = candidateGraph.components[i % candidateGraph.components.length];
        // Move component outwards dynamically to resolve overlapping
        victimComp.position.x += (i + 1) * 2;
        victimComp.position.y += (i + 1) * 2;

        proposedActions.push({
          name: "move_component",
          args: { designator: victimComp.designator, x: victimComp.position.x, y: victimComp.position.y },
          reasoning: `Deterministic placement relocation tweak to clear spacing clearances. Iteration index [${i}].`
        });
      }

      // Tweak 2: Change Trace width on high-power rails to counter heat / IR drop
      if (candidateGraph.traces && candidateGraph.traces.length > 0) {
        const victimTrace = candidateGraph.traces[i % candidateGraph.traces.length];
        victimTrace.width = 0.4 + (i * 0.05); // Adjust width dynamically

        proposedActions.push({
          name: "adjust_trace_width",
          args: { traceId: victimTrace.id, newWidth: victimTrace.width },
          reasoning: `Synthesis width widening operation targeting heat load mitigation.`
        });
      }

      const evalData = this.scoringEngine.evaluateLayoutScore(candidateGraph);

      candidates.push({
        id: `candidate_p${i}_${seed}`,
        graphSnapshot: candidateGraph,
        proposedActions,
        metrics: evalData.metrics,
        aggregateUtilityScore: evalData.score
      });
    }

    return candidates;
  }

  /**
   * Executes a robust Autonomous pass over the ProjectGraph.
   * Searches for superior candidate topologies and optionally merges them.
   */
  public runOptimizationPass(
    graph: ProjectGraph,
    seed: string,
    onApplyActions: (actions: AIAction[]) => { success: boolean; updatedGraph: ProjectGraph }
  ): OptimizationPassReport {
    const baseEval = this.scoringEngine.evaluateLayoutScore(graph);
    
    // 1. Generate candidate revisions
    const candidates = this.generateCandidates(graph, seed);
    
    // 2. Select superior candidate with higher aggregate utility
    let bestCandidate: OptimizationCandidate | null = null;
    let bestScore = baseEval.score;

    candidates.forEach(cand => {
      if (cand.aggregateUtilityScore > bestScore) {
        bestScore = cand.aggregateUtilityScore;
        bestCandidate = cand;
      }
    });

    if (bestCandidate && bestCandidate.proposedActions.length > 0) {
      // 3. Apply the winner transaction cleanly
      const commitResult = onApplyActions(bestCandidate.proposedActions);
      if (commitResult.success) {
        return {
          passId: `pass_${Date.now()}_${seed}`,
          seedUsed: seed,
          initialScore: baseEval.score,
          optimizedScore: bestCandidate.aggregateUtilityScore,
          isImprovementFound: true,
          appliedActions: bestCandidate.proposedActions
        };
      }
    }

    return {
      passId: `pass_${Date.now()}_${seed}`,
      seedUsed: seed,
      initialScore: baseEval.score,
      optimizedScore: baseEval.score,
      isImprovementFound: false,
      appliedActions: []
    };
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
