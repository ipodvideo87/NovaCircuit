# AI-Native EDA Physics & Simulation Intelligence Runtime Specification

This document defines the architecture, formulas, and integration model for the browser-native **Physics and Simulation Intelligence Layer** of our EDA runway, enabling artificial intelligence planners, routing agents, and human designers to evaluate real-world signal integrity, thermal dissipation, and EM issues.

---

## 1. Abstract System Topology

To keep calculations sub-millisecond and fully transaction-safe during interactive routing or autonomous optimizations, our simulation pipeline executes side-by-side with our transaction history engine on a temporary staging sandboxed ProjectGraph clone. Only validated iterations bypass the safety gates:

```text
                     ┌──────────────────────────────────────────┐
                     │          Proposed AIAction Sequence      │
                     └────────────────────┬─────────────────────┘
                                          │ Drafts physical traces
                                          ▼
                     ┌──────────────────────────────────────────┐
                     │      Staging Project Graph Sandbox       │
                     └────────────────────┬─────────────────────┘
                                          │ Evaluated by
                                          ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │             PHYSICS & SIMULATION INTELLIGENCE RUNTIME LAYER              │
   │                                                                          │
   │  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────┐ │
   │  │ Signal Integrity (W/H)  │ │ Thermal Solver (IPC)    │ │ EMI Radiate │ │
   │  └─────────────────────────┘ └─────────────────────────┘ └─────────────┘ │
   └──────────────────────────────────────┬───────────────────────────────────┘
                                          │ Emits precise metrics
                                          ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                       CONSTRAINT INTEGRITY GATEWAY                       │
   │  (Checks if temperature <= 85°C, V_drop <= 150mv, impedance = 90 ± 10Ω)  │
   └──────────────────────────────────────┬───────────────────────────────────┘
                                          │ Checks Passed (True)
                                          ▼
                     ┌──────────────────────────────────────────┐
                     │     Consolidated Immutable Commit        │
                     │  (Main Graph updated, history advanced)  │
                     └──────────────────────────────────────────┘
```

---

## 2. Signal Integrity (SI) & Impedance Modeling

Physical trace routing is modeled with real electromagnetic substrate properties. High-speed signal paths are governed by standard empirical Wheeler and IPC expressions:

### A. Substrate Stackup Constants
*   **Dielectric Constant ($\epsilon_r$):** FR4 baseline targeting $4.2$ (configurable per lamination).
*   **Dielectric Height ($H$):** Distance between copper trace and referencing Ground plane (default $0.18\text{ mm}$ for multi-layer outer segments).
*   **Copper Thickness ($T$):** Standard $1\text{ oz}$ packaging copper thickness ($0.035\text{ mm}$).

### B. Microstrip Model (Outer Layer `F.Cu` / `B.Cu` over plane)
Impedance ($Z_0$) is derived via:
$$Z_0 = \frac{87}{\sqrt{\epsilon_r + 1.41}} \ln\left( \frac{5.98 \cdot H}{0.8 \cdot W + T} \right)$$

### C. Stripline Model (Inner Layer routing sandwich)
$$Z_0 = \frac{60}{\sqrt{\epsilon_r}} \ln\left( \frac{1.9 \cdot B}{0.8 \cdot W + T} \right)$$
where $B \approx 2 \cdot H$ is the total dielectric core thickness.

### D. Single-Ended Impedance vs Trace Width Calibration
Using these models, single-ended impedance varies dynamically relative to the trace width ($W$):

```text
   Impedance (Ohms)
     ▲
 120 ┼──     
     │  ▀▄
 90  ┼──  ▀▄
     │      ▀▄  ◄── Ideal Impedance corridor (e.g. 50 / 90 Ohms)
 50  ┼───     ▀▄▄
     │           ▀▀▀▄▄
   0 ┴──┼───┼───┼───┼───► Trace Width (W) in mm
       0.1 0.2 0.3 0.4
```

---

## 3. Thermal Analysis & Current Density Solver

Traces act as power resistors, converting current into heat. Overloading a track causes physical lifting or dielectric breakdown:

### A. Empirical Thermal Formula (IPC-2152 Standard)
The temperature rise ($\Delta T$) is calculated relative to maximum passing current ($I$) and the cross-sectional area of the trace ($A = \text{width} \times \text{thickness}$):
$$I = k \cdot \Delta T^{0.44} \cdot A^{0.725}$$
Which the engine solves for trace temperature rise:
$$\Delta T = \left( \frac{I}{k \cdot A^{0.725}} \right)^{\frac{1}{0.44}}$$
Where:
*   **External traces:** $k = 0.048$
*   **Internal traces:** $k = 0.024$ (reduced cooling due to surrounding substrate encapsulation)

### B. Current Density Metrics
Current Density ($J = I / A$) is flagged if it exceeds standard electromigration safety limits of $100\text{ A/mm}^2$ on copper pathways.

---

## 4. Power Integrity (PI) & DC Voltage Drop Analysis

For power distribution networks (PDN), high line-impedance results in active IC supply sag (sinking IR drops):

1.  **Resistivity Model:** Resistivity is corrected dynamically for temperature to maintain model accuracy under load:
    $$\rho(T) = \rho_0 \cdot [1 + \alpha \cdot (T_{actual} - 20.0)]$$
    where:
    *   $\rho_0 \approx 1.72 \times 10^{-5}\ \Omega\text{·mm}$ (Annealed copper resistivity at 20°C)
    *   $\alpha \approx 0.00393\ \text{K}^{-1}$ (Thermal coefficient of copper)
2.  **Voltage Drop ($V_{drop}$):** Determined by $V_{drop} = I \times R$, flagging if sag on power rails exceeds the standard target maximum of $150\text{ mV}$.

---

## 5. EMI/EMC Heuristic Predictor

To verify designs against FCC Class B / CISPR limits, we evaluate electromagnetic radiation leakage metrics:

*   **Loop Area Approximation:** Calculated as:
    $$\text{Area} = \text{Trace Length} \times \text{Dielectric Height} \times 1.5$$
    Keeping traces close to referencing planes minimizes the current return loop area, drastically reducing EMI signature.
*   **Radiated Field Model:**
    $$E_{max} = \frac{1.316 \times 10^{-6} \cdot (I \cdot \text{Area} \cdot F^2)}{d}$$
    Estimated field strength at $d = 3\text{ meters}$ standard distance for high frequency clock nets (e.g., $100\text{ MHz}$).

---

## 6. Real-Time Incremental Cache Architecture

To prevent system lag when adjusting points interactive or during large auto-placements, the simulation engine implements a high-speed **Transactional Layout Fingerprint Map**:
*   **Fingerprint Key:** Produced relative to `id`, `width`, `startX`, `startY`, `endX`, `endY`, and substrate constants.
*   **Lookup:** If matching trace key is found in cache, pre-calculated physics results are immediately returned. Memory traces are swept out dynamically when layout lines are removed.

---

## 7. Constraint-to-Physics Translator (AI Synthesis Routing)

Agents use the Simulator's direct inversions for routing tasks instead of guessing widths.
*   **Target impedance matching:** When the AI Planner requests routing for differential pairs (`USB_D` target $90\ \Omega$ or high-speed reference clocked line target $50\ \Omega$), the compiler uses an iterative golden-section search to calculate the ideal track thickness before generating routing deltas:

```typescript
// Auto-solves track thickness parameter mapping target constraints
const targetWidthMm = simulator.matchWidthForTargetImpedance(targetImpedanceOhm);
```

This guarantees that raw coordinate placement is electrically correct on the very first pass.
