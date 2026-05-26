import { ProjectGraph, NetClass, DifferentialPair } from '../../types';
import { 
  EngineeringConstraint, 
  ConstraintType, 
  ConstraintScope, 
  ConstraintSource 
} from './constraintSchemas';
import { ConstraintGraph, ConstraintConflict } from './constraintGraph';
import { ConstraintResolver } from './constraintResolver';
import { runDRC, DRCViolation } from '../drc';
import { syncBoardFromGraph } from '../board';

export class ConstraintRuntime {
  private activeGraph: ProjectGraph;
  private constraintGraph: ConstraintGraph;
  private resolver: ConstraintResolver;

  constructor(graph: ProjectGraph) {
    this.activeGraph = graph;
    this.constraintGraph = new ConstraintGraph();
    this.resolver = new ConstraintResolver(this.constraintGraph);
    this.bootstrap(graph);
  }

  /**
   * Initializes constraints from the graph, converting any pre-existing netclasses
   * or differential pair specifications into modern unified constraints automatically.
   */
  public bootstrap(graph: ProjectGraph): void {
    this.activeGraph = graph;
    this.constraintGraph.clear();

    const now = Date.now();

    // 1. Ingest existing graph constraints if present
    const extGraph = graph as any;
    if (extGraph.constraints && Array.isArray(extGraph.constraints)) {
      extGraph.constraints.forEach((c: EngineeringConstraint) => {
        this.constraintGraph.addConstraint(c);
      });
    }

    // 2. Ingest Legacy NetClasses for total backward compatibility
    if (graph.netClasses && graph.netClasses.length > 0) {
      graph.netClasses.forEach((nc: NetClass) => {
        // Only convert if a corresponding constraint does not exist already
        const exists = this.constraintGraph
          .getConstraintsForScope(ConstraintScope.NETCLASS, nc.name)
          .some(c => c.type === ConstraintType.NETCLASS);

        if (!exists) {
          this.constraintGraph.addConstraint({
            id: `legacy-${nc.id}`,
            type: ConstraintType.NETCLASS,
            scope: ConstraintScope.NETCLASS,
            target: nc.name,
            parameters: {
              minWidth: nc.minWidth,
              minSpacing: nc.minSpacing,
              viaDrillSize: nc.viaSize?.drillSize,
              viaPadSize: nc.viaSize?.padSize,
              impedanceOhms: nc.impedanceOhms
            },
            priority: 30,
            source: ConstraintSource.SYSTEM,
            isLocked: false,
            description: `Interoperating netclass constraint parsed from board setup (${nc.name}).`,
            createdAt: now
          });
        }
      });
    }

    // 3. Ingest Legacy Differential Pairs
    if (graph.diffPairs && graph.diffPairs.length > 0) {
      graph.diffPairs.forEach((dp: DifferentialPair) => {
        const exists = this.constraintGraph
          .getConstraintsForScope(ConstraintScope.DIFFERENTIAL_PAIR, dp.name)
          .some(c => c.type === ConstraintType.DIFF_PAIR);

        if (!exists) {
          this.constraintGraph.addConstraint({
            id: `legacy-${dp.id}`,
            type: ConstraintType.DIFF_PAIR,
            scope: ConstraintScope.DIFFERENTIAL_PAIR,
            target: dp.name,
            parameters: {
              width: dp.width,
              spacing: dp.spacing,
              skewTolerance: dp.skewTolerance,
              targetImpedance: dp.targetImpedance,
              maxUncoupledLength: dp.maxUncoupledLength
            },
            priority: 60,
            source: ConstraintSource.SYSTEM,
            isLocked: false,
            description: `Interoperating high speed diff pair parsed from board context (${dp.name}).`,
            createdAt: now
          });
        }
      });
    }

    // Always guarantee a global DEFAULT fallback is registered
    const defaultsExist = this.constraintGraph
      .getConstraintsForScope(ConstraintScope.GLOBAL)
      .some(c => c.type === ConstraintType.NETCLASS);

    if (!defaultsExist) {
      this.constraintGraph.addConstraint({
        id: `sys-default-anchor`,
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
        description: "Standard industrial physical geometry constraints.",
        createdAt: now
      });
    }
  }

  /**
   * Retrieves the in-memory ConstraintGraph.
   */
  public getGraph(): ConstraintGraph {
    return this.constraintGraph;
  }

  /**
   * Retrieves the computed Resolver instance.
   */
  public getResolver(): ConstraintResolver {
    return this.resolver;
  }

  /**
   * Commits current memory constraints array into the graph field for React and server sync.
   */
  public serializeToGraph(graph: ProjectGraph): ProjectGraph {
    const updated = { ...graph };
    (updated as any).constraints = this.constraintGraph.getAllConstraints();
    return updated;
  }

  /**
   * Adds constraint, serializes results and returns updated project graph.
   */
  public addConstraint(constraint: EngineeringConstraint): ProjectGraph {
    this.constraintGraph.addConstraint(constraint);
    this.activeGraph = this.serializeToGraph(this.activeGraph);
    return this.activeGraph;
  }

  /**
   * Removes constraint, serializes results and returns updated project graph.
   */
  public removeConstraint(id: string): ProjectGraph {
    this.constraintGraph.removeConstraint(id);
    this.activeGraph = this.serializeToGraph(this.activeGraph);
    return this.activeGraph;
  }

  /**
   * Detects conflict profiles.
   */
  public findConflicts(): ConstraintConflict[] {
    return this.constraintGraph.detectConflicts();
  }

  /**
   * Audits physical board elements directly against resolved multi-layer constraints.
   */
  public evaluateDRC(graph?: ProjectGraph): DRCViolation[] {
    const targetGraph = graph || this.activeGraph;
    // Keep internal board synced
    const board = syncBoardFromGraph(targetGraph);
    
    // Leverage optimized core spatial-indexing checker algorithm, fully augmented with resolver overrides
    return runDRC(board);
  }
}
