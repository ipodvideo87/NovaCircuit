# AI-Native EDA Constraint-Driven Routing System Specification

This document details the architecture, routing algorithms, cost heuristics, differential pairing model, and transaction translation layer for the browser-native **AI-Assisted Constraint-Driven Routing System** of our high-performance EDA platform.

---

## 1. System Topology Overview

To support automated, interactive layout synthesis, our routing flow translates high-level signal integrity constraints and physical board keepouts into optimal, replayable vector coordinates. It works synergistically with the underlying transaction managers and physics simulators:

```text
       ┌────────────────────────────────────────────────────────┐
       │             User Goal / AI Net Routing Intent          │
       └───────────────────────────┬────────────────────────────┘
                                   │ Spawns route search pass
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │     SUBSTRATE & CONSTRAINT MATRIX GATES (50Ω / 90Ω)    │
       ├────────────────────────────────────────────────────────┤
       │     A* ROUTING GRAPH & IMPEDANCE RESOLVER ROUTER      │
       │                                                        │
       │  - Ortholinear 45° Snapping   - Proximity Interference │
       │  - Spacing Clearance Checks   - Via Cost Penalization  │
       └───────────────────────────┬────────────────────────────┘
                                   │ Generates trace lists & vias
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │              ROUTING CANDIDATE SANDBOX                 │
       │    [Trace Segment ID]       [Sub-mm Coordinates]       │
       │    [Via Properties x, y]    [Aggregate Path Score]     │
       └───────────────────────────┬────────────────────────────┘
                                   │ Map to atomic deltas list
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │              TRANSACTION REPLAY PIPELINE               │
       │   `create_board_trace` & `create_board_via` actions    │
       └────────────────────────────────────────────────────────┘
```

---

## 2. A* Pathfinding Cost Heuristics

Rather than simplistic geometric lines, our router calculates path weights dynamically relative to critical electrical characteristics:

### A. Total Path Cost Function
The cost to expand a route to node $N$ ($F(N)$) is derived as:
$$F(N) = G(N) + H(N)$$
Where:
*   **$G(N)$** is the total accumulated movement cost from origin, modified by physical and electromagnetic penalties:
    $$G(N) = G(Prev) + \text{StepLength} + \Phi_{via}(N) + \sum \Phi_{emi}(N)$$
    *   **$\Phi_{via}(N)$:** Path transition penalty ($120.0$ default) representing the parasitic capacitance and manufacturing expense of via layers redirection.
    *   **$\Phi_{emi}(N)$:** Electromagnetic coupling penalty ($15.0$ multiplier) applied when passing in close proximity to noisy clock networks or high-speed channels to keep spatial return paths clean.
*   **$H(N)$** is the standard Euclidean terminal target heuristic metric.

### B. Gridless Obstacle Spacing Clearance Checker
To satisfy DRC spacing limits, the cost engine scans:
1.  **Keepout Zone Intersection:** Verifies that copper segment sweeps bypass forbidden board bounds.
2.  **Element Overlap Boundaries:** Enforces minimum clearance parameters ($0.25\text{ mm}$ baseline) away from conflicting traces and pins belonging to other nets.

---

## 3. Differential Pair Sync Routing Engine

Differential pairings (such as high-speed $90\ \Omega$ USB or PCIe differential transmission rows) must run tightly coupled and phase-aligned:

```text
Positive Trace Start (X, Y)  ───► [Coupled Path Routing Engine] ───► Target (X, Y)
                                       ▲              ▲
                                       │ Spacing=S    │ Spacing=S
                                       ▼              ▼
Negative Trace Start (X_n, Y_n) ─► [Coupled Path Routing Engine] ───► Target (X_n, Y_n)
```

1.  **Offset Vector Extraction:** Tracks positive and negative paths concurrently separated by an orthogonal distance vector representing target track clearance spacing ($S$).
2.  **Phase / Length Timing Calibration (Skew Correction):** Any trace length variation between lines induces phase skew:
    $$\Delta L = |L_{pos} - L_{neg}|$$
    If length variations exceed set limits (skew tolerance limits of $0.1\text{ mm}$), the compiler injects timing matching serpentine patterns to balance propagation delays.

---

## 4. Replayable Production-Ready AI Handlers

To maintain full replayability across collaborative sessions, verified route candidates are serialized into explicit, idempotent `AIAction` transactions:

*   **`create_board_trace`:** Injects custom copper segment properties (`width`, `layer`, coordinates).
*   **`create_board_via`:** Places transition drills (`drillSize`, `padSize`) over reference coordinates.

This decouples the routing search computationally from the rendering stage, ensuring instant canvas redraws and allowing optimization runs to trace and replay coordinates historically with precision.
