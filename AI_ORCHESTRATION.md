# AI Orchestration Specification: Production-Grade AI-Native EDA Platform

This specification defines the high-level architecture and execution lifecycle for human-AI collaborative PCB engineering, detailing how generative agents safely and deterministically interact with our immutable transaction-based project graph.

---

## 1. AI Runtime Architecture & Isolation Model

To guarantee graph safety, the AI runtime runs inside an isolated, transaction-mediated environment. Rather than allowing an LLM to directly write state nodes or modify coordinates, we treat the AI as a pure **Query-Reasoning-Action proposal engine**.

### Structural Topology

```text
       ┌────────────────────────────────────────────────────────┐
       │                    User Chat Node                      │
       └───────────────────────────┬────────────────────────────┘
                                   │ Raw Goal
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                   AI PLANNER MODEL                     │
       │     (Generates sub-tasks, evaluates constraints)        │
       └───────────────────────────┬────────────────────────────┘
                                   │ DAG of Tasks
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                  AI EXECUTOR MODEL                     │
       │    (Evaluates graph, selects tools, writes actions)    │
       └───────────────────────────┬────────────────────────────┘
                                   │ Proposed AIAction Payload []
                                   ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                 REPLAY-SAFE VALIDATION LAYER                     │
  │    (Simulates action deltas, dry-runs ERC/DRC, checks boundaries)│
  └────────────────────────┬─────────────────────────────────────────┘
                           │ Passed Validated Transaction Flow
                           ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                    PROJECT GRAPH CORE RUNTIME                     │
  │     (Commits single immutable transaction, advances history)     │
  └──────────────────────────────────────────────────────────────────┘
```

---

## 2. Planner & Executor Agent Separation

We separate tasks into a dual-agent cascade:

### A. The Planner Model
*   **Role:** Architect & Decomposer.
*   **Responsibility:** Receives arbitrary human specs (e.g. *"Place a buck converter regulating +12V down to +5V at 1.5A"*). It does other physical layouts or routing directly. Instead, it reads current project constants, constructs a Directed Acyclic Graph (DAG) of physical tasks, and specifies which sub-circuits need retrieval.
*   **Execution Safety:** The planner has zero access to tool handles; it operates entirely in token space producing structured job arrays.

### B. The Executor Model
*   **Role:** Layout & Signal Routing Specialist.
*   **Responsibility:** Processes individual tasks assigned by the Planner. It queries local component libraries, computes spatial offsets, registers pins, and generates raw, structured `AIAction` records.
*   **Context Scope:** Restricted to local sub-graph boundaries (individual sheet blocks or trace clusters) to conserve token budget.

---

## 3. Tool Registry & Invocation Schemas

Tools are governed by explicit, typed parameters in `@google/genai` format. Every callable signature is registered globally in `/src/lib/aiTools.ts` to ensure strict matching.

```typescript
export interface ToolDescriptor {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, {
      type: "STRING" | "NUMBER" | "BOOLEAN" | "ARRAY";
      description: string;
      items?: any;
      enum?: string[];
    }>;
    required: string[];
  };
}
```

---

## 4. Transaction-Aware Tool Execution

When an Executor invokes a tool sequence, the ProjectGraph does not process changes sequentially in-place. Such intermediate processing could corrupt the layout if an intermediate action fails. Instead, the runtime implements a strict **atomic unit execution block**:

1.  **Stage Transactions:** A temporary scratchpad clone of the `ProjectGraph` is generated.
2.  **Sequencing:** The proposed actions (`AIAction[]`) are applied sequentially to the local scratchpad graph.
3.  **Compulsory Verification:** Post-execution validations (ERC Check, DRC Check, and boundary checks) are evaluated against the modified scratchpad.
4.  **Consolidated Commit:** If all checks pass, the entire sequence is squashed, committed as a single immutable transaction, and recorded on the replay-history timeline. If any verification fails, the entire scratchpad is dropped, leaving the master layout unaltered.

---

## 5. AI Memory Architecture & Long Engineering Sessions

A critical limitation of simple chat systems is short-term memory loss during long engineering loops. We implement a multi-tiered memory register to track state and design intent:

```text
              ┌──────────────────────────────────────────────┐
              │           Conversational Context             │
              │  (Chat history stream, volatile cache room)   │
              └──────────────────────┬───────────────────────┘
                                     │ Periodic Summarization
                                     ▼
              ┌──────────────────────────────────────────────┐
              │            AI Local Memory Cell              │
              │   (Extracted design intents & constraints)    │
              └──────────────────────┬───────────────────────┘
                                     │ State Export/Import
                                     ▼
              ┌──────────────────────────────────────────────┐
              │          Immutable Project Graph             │
              │   (System rules, netclasses, trace geometry) │
              └──────────────────────────────────────────────┘
```

*   **AIMemoryCell Store:** A schema in the Graph to save layout choices, user design parameters, and safety flags (e.g., *"USB differential lines must target 90 Ohms differential impedance on layer F.Cu"*).
*   **Persistence:** The memory block is serialized inside the project save file (`ProjectGraph.sheets` configuration), allowing both the AI and developers to reload a project with design intent intact.

---

## 6. Context Window Compaction Strategy

For boards containing thousands of copper nodes or vias, transmitting the entire RAW layout JSON on every chat prompt is unsustainable. We utilize an dynamic graph compaction pipeline:

*   **Sub-Graph Isolation:** When discuss routing an MCU area, components further than 50mm away are filtered out of the active prompt.
*   **Abstract Semantic Digesting:** The graph compiler replaces numerical layout geometry with high-level structural declarations (e.g., `"Connected Pin R1.1 to Pin U1.GND"`) which reduces context usage by up to 90% without losing electrical meaning.
*   **Recent Transaction Hash Streams:** Instead of full historic logs, we send a sequence of transaction hashes, providing the model with a clear logical delta trajectory.

---

## 7. Multi-Agent Expansion Safety & Autonomy

To enable future fully autonomous agent execution (e.g., autonomous PCB floorplanning, background design reviews):

*   **Resource Boundaries:** Autonomous runtimes are placed on thread-restricted loops. Tool executions are constrained to a maximum pool of 50 actions per instruction loop to prevent infinite recursive layout calls.
*   **Audit Registers:** Every action block is logged in an audit trailing map, which is fully searchable. 
*   **Interactive Rollback Gateways:** Users can click on any audit checkpoint to view the board state at that logical moment, supporting complete rollback of AI actions if needed.

```text
[User Prompt] ──► [Planner Agent] ──► [Task List] ──► [Executor Engine]
                                                             │
   ◄─── [Audit Timeline Log] ◄─── [Consolidated Tx] ◄─── [Validation Gate]
```

This design guarantees that our generative EDA platform delivers production-grade layout correctness, transaction safety, and structural integrity.
