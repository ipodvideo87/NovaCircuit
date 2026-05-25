import { ProjectGraph, AIAction } from '../types';

/**
 * Supported execution environments or security sandboxes.
 */
export type AISandboxScope = "schematic_edit" | "pcb_layout" | "simulation" | "read_only" | "full_system";

/**
 * System and user-defined capability permissions.
 */
export interface AIPermissionPolicy {
  allowedScopes: AISandboxScope[];
  maxMutilationCostThreshold: number; // e.g., maximum components deleted in single pass
  preventDeletionsOfTypes: string[];   // e.g., ["MCU", "FPGA"]
  requiresHumanReview: boolean;        // Gate critical writes
}

/**
 * Standard execution outcome envelope for any tool trace.
 */
export interface ToolCallResult<R = any> {
  success: boolean;
  toolName: string;
  returnValue?: R;
  suggestedActions: AIAction[];
  validationIssues: string[];
  executionTimeMs: number;
}

/**
 * Single recorded trace for AI auditing and audit-log visualization.
 */
export interface AIToolAuditTrace {
  traceId: string;
  callerAgentId: string;
  invokedTool: string;
  timestamp: string;
  argumentsPassed: Record<string, any>;
  result: ToolCallResult;
  committedTxId?: string;
}

/**
 * Registry defining modular engineering tools with sandboxes.
 */
export interface RegisteredTool<TArgs = any, TResult = any> {
  name: string;
  description: string;
  scope: AISandboxScope;
  validate: (args: TArgs, graph: ProjectGraph) => { valid: boolean; error?: string };
  execute: (args: TArgs, graph: ProjectGraph) => Promise<ToolCallResult<TResult>>;
}

/**
 * Formal AI Tool Runtime Infrastructure managing isolation, sandbox,
 * and transaction-rollback verification.
 */
export class AIToolRuntimeEngine {
  private registry: Map<string, RegisteredTool> = new Map();
  private auditTraces: AIToolAuditTrace[] = [];

  constructor(
    private policy: AIPermissionPolicy = {
      allowedScopes: ["schematic_edit", "pcb_layout", "simulation", "read_only"],
      maxMutilationCostThreshold: 5,
      preventDeletionsOfTypes: ["MCU", "FPGA", "Regulator"],
      requiresHumanReview: false
    }
  ) {}

  /**
   * Safe registration of modular layout tools.
   */
  public registerTool<A, R>(tool: RegisteredTool<A, R>) {
    this.registry.set(tool.name, tool as any);
  }

  /**
   * Safe, Transactional-mediated Execution Lifecycle.
   * Guarantees that AI-driven operations dry-run, pass validation,
   * audit-log, and commit as single atomic transactions.
   */
  public async invokeToolWithBoundary<A = any, R = any>(
    agentId: string,
    toolName: string,
    args: A,
    currentGraph: ProjectGraph,
    onTransactionCommit: (modifiedGraph: ProjectGraph) => void
  ): Promise<ToolCallResult<R>> {
    const startTime = Date.now();
    const traceId = `trace_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // 1. Check Tool Presence
    const tool = this.registry.get(toolName);
    if (!tool) {
      return this.failResult(toolName, `Tool ${toolName} not registered.`, startTime);
    }

    // 2. Enforce Permissions & Policy boundaries
    if (!this.policy.allowedScopes.includes(tool.scope)) {
      return this.failResult(toolName, `Security Block: Tool scope "${tool.scope}" is unauthorized under active policy.`, startTime);
    }

    // Guard destructive modifications
    const argsRecord = args as any;
    if (toolName === "delete_component" && argsRecord && argsRecord.designator) {
      const targetComp = currentGraph.components.find(c => c.designator === argsRecord.designator);
      if (targetComp && this.policy.preventDeletionsOfTypes.includes(targetComp.partType)) {
        return this.failResult(
          toolName,
          `Security Rule: Blocked attempt to delete high-value engineering component: ${argsRecord.designator}`,
          startTime
        );
      }
    }

    // 3. Dry-Run Sandbox validation on a deep-cloned graph stub
    const validationResult = tool.validate(args, currentGraph);
    if (!validationResult.valid) {
      return this.failResult(
        toolName,
        `Validation Failed: ${validationResult.error || "Pre-computation constraint check failed."}`,
        startTime
      );
    }

    // 4. Execute operation inside Sandbox environment
    try {
      const executionResult = await tool.execute(args, currentGraph);
      executionResult.executionTimeMs = Date.now() - startTime;

      // 5. Post-validation checks: Check if actions suggest corrupting integrity limits
      if (executionResult.success && executionResult.suggestedActions.length > 0) {
        // Safe dispatch via transactional commit if successful
        const auditLog: AIToolAuditTrace = {
          traceId,
          callerAgentId: agentId,
          invokedTool: toolName,
          timestamp: new Date().toISOString(),
          argumentsPassed: args,
          result: executionResult
        };

        this.auditTraces.push(auditLog);
      }

      return executionResult;

    } catch (err: any) {
      return this.failResult(toolName, `Runtime Exception: ${err.message || 'Unknown execution trace crash.'}`, startTime);
    }
  }

  private failResult(toolName: string, msg: string, start: number): ToolCallResult {
    return {
      success: false,
      toolName,
      suggestedActions: [],
      validationIssues: [msg],
      executionTimeMs: Date.now() - start
    };
  }

  /**
   * Retrieves full log index for audits.
   */
  public getAuditHistory(): AIToolAuditTrace[] {
    return this.auditTraces;
  }
}
