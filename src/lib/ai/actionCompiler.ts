import { AIAction } from '../../types';
import { actionSchemaMap } from './actionSchemas';
import { repairAndNormalizeAction, RepairDiagnostic } from './actionRepair';

export interface CompiledBatch {
  reasoning: string;
  executableActions: AIAction[];
  rejectedActions: { action: any; error: string }[];
  diagnostics: RepairDiagnostic[];
}

// Deterministic ordering priority table for multi-step transaction pipelines
const PIPELINE_PRIORITY_ORDER: Record<string, number> = {
  'create_component': 0,
  'delete_component': 1,
  'set_property': 2,
  'assign_footprint': 3,
  'move_component': 4,
  'assign_layer': 5,
  'define_net': 6,
  'add_connection': 7,
  'connect_net': 7, // Connection phase
  'create_trace': 8,
  'delete_trace': 8,
  'update_trace_width': 9,
  'create_via': 10,
  'add_copper_pour': 11,
  'add_via_stitching': 12,
  'route_differential_pair': 13,
  'run_erc': 14,
  'run_drc': 14,
  'propose_design_review': 15
};

/**
 * Structural AI Action Compiler.
 * 
 * Separates reasoning, cleans raw LLM action definitions, repairs schema variations,
 * filters conversational messages out of the transaction batch, and orders steps deterministically
 * to optimize transactional transaction replay integrity.
 */
export function compileActionBatch(rawActions: any[], rawContent: string = ''): CompiledBatch {
  const executableActions: AIAction[] = [];
  const rejectedActions: { action: any; error: string }[] = [];
  const diagnostics: RepairDiagnostic[] = [];
  
  // 1. Separate Conversational Reasoning & Extract Text Traces
  let reasoningText = '';
  let content = rawContent;

  const strategyIndicators = ['STRATEGY:', 'REASONING:', 'THOUGHTS:', 'ANALYSIS:'];
  for (const indicator of strategyIndicators) {
    if (content.includes(indicator)) {
      const parts = content.split(indicator);
      content = parts[0].trim();
      reasoningText = parts[1].trim();
      break;
    }
  }

  // Fallback to searching markdown code blocks or general prose if reasoning not structured
  if (!reasoningText && content) {
    reasoningText = content;
  }

  // 2. Parse and Compile Action Candidates
  if (Array.isArray(rawActions)) {
    for (const rawAction of rawActions) {
      if (!rawAction) continue;

      // Classify & Repair step
      const repairResult = repairAndNormalizeAction(rawAction);
      
      // Merge diagnostic logs
      if (repairResult.diagnostics.length > 0) {
        diagnostics.push(...repairResult.diagnostics);
      }

      // Check if it's a conversational block (e.g. system chat / greeting / prose response)
      if (repairResult.isConversational || !repairResult.action) {
        // Drop safely as a rejected or redirected conversational fragment
        rejectedActions.push({
          action: rawAction,
          error: 'Conversational action filtered. Not sent to transaction engine.'
        });
        continue;
      }

      const repairedAction = repairResult.action;

      // 3. Schema Structure Validation & Verification against schemas
      const schema = actionSchemaMap[repairedAction.name];
      if (!schema) {
        // Non-mutating base actions might be allowed in secondary runtime (e.g. delete_component, set_property, assign_footprint, assign_layer, create_component)
        // If they are part of base `applyAction` in actionValidation, we should support them!
        const baseAllowedActions = [
          'create_component', 'delete_component', 'assign_footprint', 
          'set_property', 'assign_layer', 'define_net', 'create_subcircuit'
        ];
        
        if (baseAllowedActions.includes(repairedAction.name)) {
          executableActions.push(repairedAction);
          continue;
        }

        rejectedActions.push({
          action: repairedAction,
          error: `Unsupported engineering action type: '${repairedAction.name}'`
        });
        diagnostics.push({
          field: 'name',
          issue: 'unsupported_action_type',
          appliedSeverity: 'rejected',
          message: `Action type '${repairedAction.name}' cannot be applied. Registered schema parser missing.`
        });
        continue;
      }

      // Perform strict validation against target schema
      const valResult = schema.validate(repairedAction.args);
      if (valResult.success && valResult.value) {
        // Overwrite arguments with the strictly normalized schema value
        executableActions.push({
          name: repairedAction.name,
          args: valResult.value,
          reasoning: repairedAction.reasoning
        });
      } else {
        const errorMsg = valResult.error || 'Failed strict schema constraints';
        rejectedActions.push({
          action: repairedAction,
          error: errorMsg
        });
        diagnostics.push({
          field: 'args',
          issue: 'schema_validation_failure',
          appliedSeverity: 'rejected',
          message: `Schema error on '${repairedAction.name}': ${errorMsg}`
        });
      }
    }
  }

  // 4. Deterministic Action Sorting / Ordering Flow
  // We sort standard actions using the PRIORITY map to guarantee a logical construction order
  const orderedExecutableActions = [...executableActions].sort((a, b) => {
    const priorityA = PIPELINE_PRIORITY_ORDER[a.name] !== undefined ? PIPELINE_PRIORITY_ORDER[a.name] : 100;
    const priorityB = PIPELINE_PRIORITY_ORDER[b.name] !== undefined ? PIPELINE_PRIORITY_ORDER[b.name] : 100;
    return priorityA - priorityB;
  });

  return {
    reasoning: reasoningText,
    executableActions: orderedExecutableActions,
    rejectedActions,
    diagnostics
  };
}
