# Production-Grade EDA Suite: Architecture Blueprint & Phased Roadmap

This document establishes the high-level engineering audit, directory reorganization blueprint, and development roadmap for scaling our web-based Electronic Design Automation (EDA) suite to commercial-grade robustness.

Our core goals are to maintain **sub-millisecond transactional safety**, **deterministic design replay**, and **scalability to devices with 10k+ physical elements** while injecting rigorous electrical and layout engineering depth.

---

## Part 1: Architecture Audit & Restructuring

Currently, our core files are concentrated in `/src/lib` and `/src/components/PCBEditor.tsx`. As the app scale increases, monolithic files will hurt compile times, modularity, and code reviews. 

### Proposed Folder Reorganization

```text
/src
├── components/                 # Visual UI Layer (Memoized, pure rendering views)
│   ├── Schematic/              # Pure schematic views & nodes
│   ├── PCB/                    # Pure PCB rendering canvas
│   ├── Controls/               # Universal UI control panels
│   └── Shared/                 # Common elements (Toasts, Modals)
├── lib/
│   ├── core/                   # Deterministic Core & Transaction Engine
│   │   ├── graph.ts            # ProjectGraph base class and transformations
│   │   └── transaction.ts      # Action stream and Undo/Redo transaction stack
│   ├── compiler/               # Compile schematics to flattened netlists
│   │   ├── multiSheet.ts       # Hierarchical sheet tree (DAG) compilation
│   │   ├── connectivity.ts     # Disjoint-set Union-Find connectivity engine
│   │   └── spiceExporter.ts    # SPICE deck netlist formulation
│   ├── drc/                    # Design Rule Check Engine
│   │   ├── ruleRegistry.ts     # User-defined constraint evaluations
│   │   ├── geometric.ts        # Segment distance, polygon clipping, and clearances
│   │   └── manufacturing.ts    # Gerber/Drill acid traps & sliver checks
│   ├── router/                 # Autorouting and interactive routing engines
│   │   ├── grid.ts             # Dynamic spatial routing grid (R-Tree / Quadtree)
│   │   ├── maze.ts             # Dijkstra / A* route finder
│   │   └── differential.ts     # Differential pair, skew, and serpentine tuning
│   └── physics/                # Math models and physical calculators
│       └── impedance.ts        # Microstrip and Stripline impedance solvers
├── types/                      # Isolated Strictly-Typed Contracts
│   ├── core.ts                 # Schem, PCB, ProjectGraph schemas
│   └── constraints.ts          # Constraint lists and Design Rule sets
└── main.tsx
```

---

## Part 2: In-Depth Technical Audits & Deep System Workflows

### 1. Hierarchical Schematics & Multi-Sheet Projects
#### The Problem
In commercial EDA, monolithic schematics are unmanageable for large systems (e.g., multi-channel audio, high-speed SoCs). Moving to multi-sheet designs requires localizing scopes and passing signals explicitly through hierarchical sheet-blocks.

#### Production Solution
*   **Sheet DAG (Directed Acyclic Graph):** We define a hierarchical sheet symbol (a component in the database that references a target child sheet file name). 
*   **Mangled Reference Designator Namespace:** When flattening the project graph, instance designators are prefixed in hierarchical sheets (e.g., `SheetA/R1`, `SheetA/R2`, `SheetB/R1`) to avoid pin ID collisions.
*   **Port Mapping System:** Sheet symbol pins hook up to inner hierarchical ports. Power nets (VCC, GND) default to global scope, while standard signals inside sheets are insulated localized nets unless explicitly routed to an external `Port` or `Off-Sheet Connector`.

```text
               [Root Schematic Sheet]
               ┌─────────────────────┐
               │    [Sheet Block 1]  │
               │   ┌────────────────┐│
               │   │ Local net: CLK ││  <-- Bounded local scope
               │   └────────────────┘│
               └─────────────────────┘
```

---

### 2. High-Performance Connectivity Engine Improvements
#### The Problem
As components are added or wires are deleted, recalculating net connections by scanning all segments is an $O(N^2)$ operation that causes rendering lag on larger schematics.

#### Production Solution
*   **Union-Find (Disjoint-Set Forest) with Path Compression and Union by Rank:**
    We assign a unique connection ID to every component pin. When a copper segment or schematic wire is drawn touching pins:
    $$\text{Union}(\text{Pin}_A, \text{Pin}_B)$$
    This collapses connection groups in near-constant time $O(\alpha(N))$ where $\alpha$ is the inverse Ackermann function.
*   **Dynamic Connectivity Graphs:**
    For deleting connections, we maintain a secondary adjacency list map of the graph and run a Breadth-First Search (BFS) only on the affected sub-graph components to trigger net separation correctly, preventing massive global recalculation cycles.

---

### 3. Constraint-Driven Geometry & Advanced Routing
#### The Problem
In high-speed designs, routing must respect dynamic guidelines: clearances, thermal relief constraints, maximum lengths, and differential impedance matches. Clearances are currently checked only post-routing.

#### Production Solution
*   **Dijkstra / A\*** with a **Dynamic Euclidean Spatial Index (R-Tree / Quadtree):**
    The routing engine must queries a local spatial coordinate window, returning all components, trace obstacles, and vias.
*   **Virtual Obstacle Halos:**
    Obstacles are expanded by their net's specific clearance constraint ($\delta$). The routing expansion algorithm assigns infinite traversal cost inside these virtual boundary rings, ensuring trace generation is inherently DRC-compliant.

```text
       Trace Obstacle            Dynamic Corridor Path
       ┌──────────────┐         ╔═════════════════════════
       │   Pad / Via  │         ║
       │  (Net: VCC)  │         ║   ◄── Path of Net: Signal
       └──────────────┘         ║       automatically stays outside obstacle + gap
       ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒         ║
         ▲─ Clearance Boundary (δ)
```

---

### 4. Polygon Fills, Copper Pours, & Thermal Reliefs
#### The Problem
Manually drawing ground paths is inefficient. Standard boards require multi-layer copper planes (fills) that automatically wrap around traces while remaining fully interconnected.

#### Production Solution
*   **Polygon Boolean Operations via Vatti or Martinez-Rueda Algorithms:**
    Using the **Clipper** library, the copper plane is treated as a master polygon. For each trace segment, pad, or via belonging to an opposing net inside the zone:
    1. Expand the obstacle polygon by the clearance value ($\delta$).
    2. Subtract this expanded shape from the main plane polygon.
*   **Thermal Relief Spokes:**
    For pads connected to the plane net, we generate four orthogonal spoke segments. This prevents local cold-soldering failures when copper acts as a heat sink on THT/SMD pads.

```text
              ┌───────────────────────────┐
              │  Copper Plane (GND)       │
              │   ┌───────┐   ┌───────┐   │
              │   │ Spoke │   │ Spoke │   │
              │   └───┬───┘   └───┬───┘   │
              │ ───────┼─── Pad ───┼───────  <-- Thermal relief
              │   ┌───┴───┐   ┌───┴───┐   │
              │   │ Spoke │   │ Spoke │   │
              │   └───────┘   └───────┘   │
              └───────────────────────────┘
```

---

### 5. Advanced Analytical Differential Pair & Single-Ended Impedance
#### The Problem
High-speed data lanes (USB, Ethernet, PCIe) require exact, calibrated differential impedance. Simple lookup models do not account for physical substrate properties.

#### Production Solution
*   **Empirical Wave formulas (IPC-2141):**
    For microstrips and striplines, calculate characteristic impedance $Z_0$ and differential impedance $Z_{\text{diff}}$ using substrate thickness ($H$), conductor thickness ($T$), conductor width ($W$), trace spacing ($S$), and dielectric constant ($\epsilon_r$):
    $$Z_0 = \frac{87}{\sqrt{\epsilon_r + 1.41}} \cdot \ln \left( \frac{5.98 \cdot H}{0.8 \cdot W + T} \right)$$
    $$Z_{\text{diff}} = 2 \cdot Z_0 \left( 1 - 0.48 \cdot e^{-0.96 \frac{S}{H}} \right)$$
*   **Real-time Skew Serpentine Auto-Tuner:**
    We build a geometric serpentine planner. When trace $L_{\text{skew}} > \theta_{\text{limit}}$, we dynamically loop trace lines in $U$-bends on the shorter net until lengths match.

---

### 6. Design-Rule Authoring System & AST Evaluator
#### The Problem
A flat constraint dictionary is inadequate for modeling industrial PCBs and cannot support conditions such as board-region specific clearances or inner-layer micro-vias.

#### Production Solution
*   **Rule Engine Abstract Syntax Tree (AST):**
    We structure design rules using JSON or a clear parser model:
    ```json
    {
      "rules": [
        {
          "id": "rule_hsd_spacing",
          "name": "Diff Pair Separation",
          "match": "net.netClass == 'DIFFERENTIAL' and layer == 'F.Cu'",
          "action": { "minSpacing": "0.15", "minWidth": "0.15" }
        }
      ]
    }
    ```
*   **Priority Rule Selector:**
    Rules are matched sequentially, cascading from general values (default board class) down to specialized classes (differential microstrips), which are evaluated locally with a simple boolean AST runner.

---

### 7. Virtualized Canvas & Performance Optimizations (10k+ Nodes)
#### The Problem
React-based rendering scales poorly when updating large canvas trees. Re-rendering over 1,000 components and 5k traces in standard state models throttles the application down to sub-10FPS.

#### Production Solution
*   **Spatial Indexing (Quadtrees / R-Trees):**
    Store bounding boxes of all components, traces, labels, and pads in a persistent client-side spatial index.
*   **On-Screen Rendering Viewport Culling:**
    During drag or zoom events:
    1. Fetch current canvas viewport boundary $[X_{\text{min}}, Y_{\text{min}}, X_{\text{max}}, Y_{\text{max}}]$.
    2. Query the Quadtree for elements intersecting this bounding box.
    3. Render only the retrieved visible elements inside the viewport, optimizing memory usage and frame rates.

---

### 8. Transaction Compression, Serialization, & Collaboration
#### The Problem
For multi-user applications, streaming full-page JSON documents creates excessive network overhead. Additionally, continuous updates (e.g., mouse dragging) pollute the undo/redo stack.

#### Production Solution
*   **Action Delta Compression:**
    Continuous events (like moving a component) are aggregated into micro-transactions and squashed into a single commit upon pointer release:
    ```typescript
    // Aggressive sliding window debounce
    function commitCompressedTransaction(actionStream: Action[]) {
      const consolidated = actionStream.reduce((acc, act) => {
         if (act.type === 'MOVE' && acc.id === act.id) {
           return act; // Keep final point only
         }
         return act;
      });
      return consolidated;
    }
    ```
*   **Operational Transformation (OT) / CRDT Integration:**
    Format each transactional action as a change chunk (e.g. `add_trace(netId, Layer, coords)`) so they can be dispatched as conflict-free logs immediately, laying the foundation for multiplayer collaborative editing.

---

## Part 3: Phased Master Roadmap

```text
PHASE 1: Foundations & Net Connectivity Optimizer  ──────►  PHASE 2: Advanced DRC & Physical Physics Engines
                                                                           │
                                                                           ▼
PHASE 4: SPICE & Manufacturing Integrity Validation  ◄─────  PHASE 3: Canvas Virtualization & Autorouting
```

### Phase 1: Structural Reorganization & High-Performance Net Compiler
*   **Restructure Workspace Files:** Relocate layouts and state handlers to match the proposed directory structure.
*   **Implement Union-Find Netlist Engine:** Upgrade schematic wiring logic to compile instant pin relationships using disjoint assemblies.
*   **Design-Rule Cascading Registry:** Create the Abstract Rule System supporting nested constraint rules for individual nets, layers, or footprints.

### Phase 2: Structural Routing, Geometry Fills, and Impedance Modeling
*   **Implement Martinez-Rueda Polygon Clipper:** Integrate robust copper pour plane calculation logic.
*   **Empirical Impedance Solver:** Calculate physical microstrip structures and warn developers when impedance deviations exceed limits.
*   **Dynamic Trace Corridor Guidance:** Ensure routing and via placement paths dynamically avoid rule obstacles inside the search grid.

### Phase 3: Spatial Virtualization & Maze Autorouting
*   **Canvas Virtualization (R-Tree Indexing):** Migrate visual rendering pipelines to select and draw only elements intersecting the screen viewport, scaling performance to 10k+ nodes.
*   **Gridless A* Line-Searching Router:** Build a multi-layer maze path router utilizing A* routing with direction and via cost penalties.
*   **Serpentine Length-Matching Engine:** Support trace serpentine routes for skew correction on high-speed differential pairs.

### Phase 4: Full Simulation integration, DFM Validation, and Collaborative Pipelines
*   **SPICE Netlist Compiled Simulator:** Add schematic-to-SPICE model exports and compile `ngspice` to WebAssembly to output physical transient plots on-screen.
*   **Commercial Pre-Manufacturing Validation (DFM):** Validate exports and files for acid traps, copper stars, short circuits, and mask slivers before final Gerber output.
*   **CRDT Co-editing Engine:** Setup event streams to support low-latency real-time collaborative editing.

---

## Part 4: High-Risk Technical Debt Mitigation

1.  **React State Splitting:** Keeping full project trees in a single React state slows down layout updates. We must isolate PCB traces, schematic symbols, and user settings into separate state stores (e.g., Zustand or custom localized contexts).
2.  **Float / Grid Precision Drift:** Browser-based zoom inputs can cause minor decimal drift. We must run layout and routing calculations on a fixed sub-nanometer integer grid, scaling to floating millimeters only during final layout rendering:
    $$X_{\text{internal}} = \text{Math.round}(X_{\text{mm}} \cdot 100000)$$
3.  **Cross-layer Net Mismatches:** Changing a net name in a hierarchical schematic sheet can break physical PCB routes. We must enforce structural net UUIDs that remain consistent across schematic updates, decoupling connectivity structures from user-edited names.
