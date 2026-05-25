# AI-Assisted Schematic Synthesis & Component Intelligence Specification

This document defines the architecture, data models, placement algorithms, semantic naming rules, power optimization guidelines, and ERC validation suite for the browser-native **AI-Assisted Schematic Synthesis & Component Intelligence System** of our high-fidelity EDA platform.

---

## 1. Schematic Synthesis Subsystem Topology

The system translates vague engineering natural-language intent (e.g., *"give me a clean 3.3V power regulator for an ESP32 processor"*) into complete, validated connection topologies. It sits upstream of board layouts and routing loops:

```text
       ┌────────────────────────────────────────────────────────┐
       │             Unstructured Engineering Intent            │
       │     "Synthesise a 12V Buck powering an ESP32 loop"     │
       └───────────────────────────┬────────────────────────────┘
                                   │ Natural Language Parsing
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │               DESIRED INTENT GOALS BLOCK               │
       │  [Required Rails]     [MCU Embedded Processor Flag]    │
       │  [Low-Noise PDN]      [Selected High-Speed Ports]      │
       └───────────────────────────┬────────────────────────────┘
                                   │ Triggers schematic generator
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │              SCHEMATIC SYNTHESIS RUNTIME               │
       ├────────────────────────────────────────────────────────┤
       │  1. Component Intelligence Catalog Match Check         │
       │  2. Left-to-Right Signal Flow Placement Matrix         │
       │  3. Automatic Bypass Decoupling Filter Allocation      │
       │  4. Power Rail Topology Selector (Buck vs. LDO)        │
       └───────────────────────────┬────────────────────────────┘
                                   │ Spawns netlists and nodes list
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │              TRANSACTION TRANSACTION DELTAS            │
       │   `create_component` & `connect_pin_net` actions       │
       └───────────────────────────┬────────────────────────────┘
                                   │ Run rules compilation audit
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │        ELECTRICAL RULE RUNTIME CHECKER (ERC)           │
       │   - Contention Checks     - Return GND validations     │
       └────────────────────────────────────────────────────────┘
```

---

## 2. Power Rail Selection Topology Rules

To dynamically choose the ideal power-delivery controller matching supply voltages, the synthesizer executes the following selection heuristic matrix:

```text
             ┌───────────────────────────────┐
             │       System Input V_IN       │
             └───────────────┬───────────────┘
                             │
              Is V_IN <= 6V? ├─────────────────► [AP2112K-3.3TRG1 LDO Regulator]
                             │                   (Low drop-out, minimal vias path)
                             │
              Is V_IN > 6V?  └─────────────────► [MP1584EN Step-Down switcher]
                                                 (Buck converter, highly efficient thermal dissipation)
```

1.  **Low Drop-Out LDO:** If input voltage is less than or equal to $6V$, select LDO regulators (e.g. `AP2112K-3.3`) to prevent complex switching noise spikes and lower design footprint overheads.
2.  **High-Efficiency Buck Switcher:** If higher voltages (e.g. $12V$) must step-down to digital microchip rails, deploy switching converters (e.g. `MP1584EN`), preventing excessive heat rise and satisfying power thermal constraints.

---

## 3. Power Delivery Network (PDN) Decoupling & Filtering Heuristics

High-frequency processors pull current in sharp surges. The synthesis engine automatically reinforces PDN integrity by injecting decoupler nodes:

*   **Bulk Input Damping:** Places $10\ \mu\text{F}$ capacitors close to input pins to damp input trace ripples.
*   **High-Frequency Noise Shunt:** Layers $0.1\ \mu\text{F}$ ceramic parallel bypass capacitors near each active digital supply terminal.
*   **Low-Noise filtering:** If target intent requests "clean supply" or "low noise", adds extra parallel $0.1\ \mu\text{F}$ branches to bypass low-frequency substrate noise.

---

## 4. Replayable Mutation Transactions

The synthesized nodes list maps into structured `AIAction` transactions:
*   **`create_component`:** Spawns components referencing precise X/Y schematic canvas coordinates.
*   **`connect_pin_net`:** Binds physical pin names to structured semantic networks (e.g., `+3V3`, `GND`, `MCU_EN_RESET`).

This decouples mathematical calculations from canvas visualization, enabling instant undo/redo actions and transaction logs.
