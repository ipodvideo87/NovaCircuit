# Production AI Tool Runtime Environment: Architecture & Infrastructure

This document specifies the design, security boundaries, capability routing, and transaction-isolated runtime lifecycle for AI Tool Execution blocks.

---

## 1. Tool Registry & Capability Routing

In a professional engineering CAD, any automated layout modification must be modular, highly typed, and sandboxed. Individual tool modules register with a centralized tool coordinator (`AIToolRuntimeEngine`) specifying their capabilities, parameters, and structural sandbox scope boundaries.

### Capability Routing Map

```text
       ┌────────────────────────────────────────────────────────┐
       │                 AIToolRuntimeEngine                    │
       └───────────────────────────┬────────────────────────────┘
                                   │ Routes to Sub-Systems
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
 ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
 │ Schematic     │         │ PCB Layout    │         │ Circuit       │
 │ Sandbox       │         │ Sandbox       │         │ Simulation    │
 │ (Wire/Ports)  │         │ (Trace/Vias)  │         │ Sandbox       │
 └───────────────┘         └───────────────┘         └───────────────┘
```

---

## 2. Tool Invocation & Verification-Commit Lifecycle

When an external Planner or Executor agent schedules a tool call, the execution follows an isolated **Stage-Evaluate-Apply** loop to maintain design integrity:

### Flow Diagrams: Transaction-Aware Loop

```text
 [Agent Invocation Input]
           │
           ▼
┌───────────────────────┐
│ Check Permissions &   │ ─── (Unauthorized Scope) ──► [Abrupt Terminate & Log]
│ Policy Rules          │
└──────────┬────────────┘
           │ (Authorized)
           ▼
┌───────────────────────┐
│ Clone Project Graph   │
│ into Active Sandbox   │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│ Dry-Run Validation    │ ─── (Geometry/Design Clash) ─► [Fail Result Out]
│ Checks on Sandbox     │
└──────────┬────────────┘
           │ (Success)
           ▼
┌───────────────────────┐
│ Execute Code Mutation │
│ and Generate Trace    │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────┐
│ Validate ERC/DRC of   │ ─── (Violates Spacing/Rules) ─► [Rollback, Discard Clone]
│ Simulated Result      │
└──────────┬────────────┘
           │ (Checks Pass)
           ▼
┌───────────────────────┐
│ Atomically Commit Fused│
│ Tx and Push History   │
└───────────────────────┘
```

---

## 3. Sandboxing & Structural Boundary Enforcement

### Security Policies (`AIPermissionPolicy`)
Autonomous agents can cause severe disruption if allowed to freely modify boards without limits. The policy constraints restrict:

1.  **Allowed Scopes:** Restricts tool calls to safe categories (e.g. read-only, layout optimization, or whole schematic changes).
2.  **Mutilation Cost Threshold:** Sets a hard limit on the quantity of components modified or deleted inside a single planning cycle.
3.  **Prevent Deletions of Types:** Guarantees critical, structural chips (e.g., Microcontrollers, High-Power Regulators) cannot be deleted or relocated from their designed slots without explicit permission.

---

## 4. Multi-Agent & Collaborative Editing Safetiness

For multiplayer, concurrent development, AI tool execution is made fully compatible with Operational Transformation (OT) or Log-Replay streams:
*   **Segmented Deltas:** Rather than generating massive layout matrices, tools emit single-element mutations (`suggestedActions`) containing deterministic inputs (e.g., `move_component(R1, 20, 30)`).
*   **Idempotency Checks:** Action IDs and timestamp keys prevent out-of-order changes from corrupting layout parameters when synchronized across multi-user environments.

This architecture ensures the platform scales reliably as a robust, safe, and commercial-grade AI-native workspace.
