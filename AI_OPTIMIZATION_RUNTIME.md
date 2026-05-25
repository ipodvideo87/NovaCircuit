# AI-Native EDA Autonomous Optimization & Layout Synthesis Specification

This document details the architecture, formulas, and integration model for the browser-native **Autonomous Optimization & Layout Synthesis Layer** of our EDA platform, enabling agents and background solvers to refine PCB layouts, placements, and trace topologies deterministically using physics-aware scoring.

---

## 1. Abstract System Topology

To keep optimizations robust and completely rollback-safe, candidate configurations are mutated, evaluated, and verified inside isolated **Transaction Sandboxes** on a custom virtual layout tree. Successfully optimized results are committed to the master pipeline as a single atomic transaction.

```text
       ┌────────────────────────────────────────────────────────┐
       │                 Initial Project Graph                  │
       └───────────────────────────┬────────────────────────────┘
                                   │ Cloned into active sandbox
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             AUTONOMOUS OPTIMIZATION RUNTIME            │
       │                                                        │
       │   ┌────────────────────────────────────────────────┐   │
       │   │        Layout Variant Candidate Sandbox 1       │   │
       │   ├────────────────────────────────────────────────┤   │
       │   │        Layout Variant Candidate Sandbox 2       │   │
       │   ├────────────────────────────────────────────────┤   │
       │   │        Layout Variant Candidate Sandbox N       │   │
       │   └────────────────────────┬───────────────────────┘   │
       └────────────────────────────┼───────────────────────────┘
                                    │ Evaluated against
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │              MULTI-OBJECTIVE SCORING ENGINE            │
       │                                                        │
       │    [DRC / Clean Clearance]    [Trace Length Metrics]    │
       │    [Thermal Dissipation K]    [Signal Impedance Z_0]    │
       │    [EMI Radiated Fields]      [Max IR Power Drops]      │
       └────────────────────────────┬───────────────────────────┘
                                    │ Selects superior candidate
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │                  COMMIT TRANSACTION GATE               │
       │  (Fuses all selected change-instructions into 1 Trans) │
       └────────────────────────────┬───────────────────────────┘
                                    │ Atomic execution commit
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │                 Optimized Project Graph                │
       └────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Objective Layout Scoring Engine

Any layout state is graded on a composite scale of electrical engineering and physical characteristics:

### A. Evaluated Metrics
*   **DRC Clearance ($M_{drc}$):** Identifies and penalizes component and trace collision structures.
*   **Trace Length ($M_{len}$):** Total copper usage which directly affects flight timing delay and inductive loss.
*   **Via Count ($M_{via}$):** Vias add parasitic capacitance and increase PCB fabrication cost.
*   **Impedance Deviation ($M_{imp}$):** Offset deviation from target trace impedance (e.g. $50\ \Omega$ single ended or $90\ \Omega$ differential).
*   **Thermal Performance ($M_{therm}$):** Peak running temperatures under continuous electrical loads.
*   **Power Efficiency ($M_{pwr}$):** Maximum DC IR voltage drops across distribution tracks.
*   **EMI Radiation field ($M_{emi}$):** Estimated electromagnetic radiation leakage.

### B. Utility Function
Each metric is normalized relative to target constraints and aggregated using configurable importance weights ($W$):
$$U = \frac{\sum (W_i \times S_i(M_i))}{\sum W_i} \times 100$$
where:
*   $S_i(M_i) \in [0.0, 1.0]$ is the specific component utility score.
*   A larger aggregate score ($U$) represents a superior overall design.

---

## 3. Seeded Candidate Variant Generator

Optimization runs utilize deterministic processes to ensure that layout refinement is fully reproducible across multi-agent environments:
1.  **Placement Adjustment:** Relocates components slightly along orthogonal axes to clear safety clearance violations.
2.  **Width Optimization:** Adjusts trace widths dynamically on high-load nets to balance impedance targets and heat distribution requirements.

```text
[Deterministic Seed Key] ──► [Genetic Variant Mutator] ──► [Candidate Project Graphs]
```

---

## 4. Optimization Loop Execution Lifecycle

```text
[Initiate Pass]
       │
       ▼
[Current Graph Score]
       │
       ▼
[Generate Varied Candidates (Seeded)]
       │
       ▼
[Evaluate Multi-Objective Scores]
       │
       ▼
 Is Candidate Score > Base Score?
       ├──► Yes: [Fuses proposed AIAction array] ──► [Atomic Commit] ──► [Upgrade State]
       └──► No:  [Discard sandboxed candidates] ──► [Maintain Core State] 
```

---

## 5. Extensibility Roadmap & Simulation Integration

The codebase contains abstract hooks prepared for integration with highly parallel external execution runners:
*   **Autonomous Optimizer Runner:** Hooks to execute multiple iterations in parallel.
*   **Reinforcement Learning Hooks:** Pre-calculated semantic feature vectors and scoring utility results support standard actor-critic pipelines.
*   **External Solver Connectors:** Predefined JSON interfaces support direct integration with external simulators (such as SPICE engines or openEMS 3D-EM solvers).

This architecture provides the groundwork for robust, automated, and deterministic layout synthesis.
