# AI Engineering Semantic Intelligence Specification

This document details the high-level design and capability profiles for the browser-native **Engineering Semantic Intelligence Engine**—enabling LLM planners and routing agents to reason with genuine physical and electrical systems knowledge.

---

## 1. Abstract System Topology

Rather than forcing an AI model to operate strictly with raw geometrical coordinate boxes or numeric nodes, the semantic layer compiles the board into a formalized, multi-tiered **Semantic Knowledge Graph**:

```text
                  ┌──────────────────────────────────────────────┐
                  │          Raw Visual Layout Graph             │
                  │ (Component x/y, trace nodes, net connections)│
                  └──────────────────────┬───────────────────────┘
                                         │ Compiled by Semantic Engine
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │         Refined Electrical Topology          │
                  │   (Inferred component roles, power domains)  │
                  └──────────────────────┬───────────────────────┘
                                         │ Filtered & Compressed
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │         Context-Optimized Prompt             │
                  │ (Only contains semantic anomalies & warnings)│
                  └──────────────────────────────────────────────┘
```

---

## 2. Dynamic Electrical Role Mapping

The runtime maps components to functional categories based on connected signals:

| Component Type | Connected Pin Context | Inferred Functional Category | Layout Recommendation |
| :--- | :--- | :--- | :--- |
| **Capacitor (`C*`)** | Pin 1: Power Rail (`VCC` / `3V3`) <br> Pin 2: Ground Return (`GND`) | `decoupling_capacitor` | Place as close to the power pin on the MCU as physically possible. |
| **Resistor (`R*`)** | Pin 1: Power Rail (`VCC`) <br> Pin 2: Digital I/O Lane (`IO*`) | `pull_up_resistor` | Standard pull-up configuration on line. |
| **Integrated Chip (`U*`)** | Pin counts > 8, digital signals, crystal reference lines | `microcontroller` | Space out cleanly to allow differential signal termination. |
| **Power Converter (`REG*`)**| High switching inputs, inductor ports, multiple output outputs | `buck_converter` / `linear_regulator` | Establish strong power island ground pour return paths. |

---

## 3. Power Domain Segmentation & Thermal Island Extraction

The runtime separates the board into distinct **Power Domain Isolation Nodes** based on outputs from buck converters or linear regulators:
*   **Source Isolation:** Pinpoints which regulator drives the domain limit.
*   **Loading Vector Mapping:** Calculates all components fed from this domain to detect thermal crowding.
*   **GND Return Indices:** Confirms every power rail has a distinct return pathway, identifying loop-inductance vulnerabilities before high-speed trace drawing begins.

---

## 4. Signal Category Classification & Routing Recommendations

All nets are continuously monitored to identify performance-critical characteristics:

*   **Diff Pairs (`_P` / `_N` suffixes):** Must maintain strict length matching and equal-spacing paths to avoid skew issues.
*   **Crystal Oscillators:** Kept away from high-noise loops.
*   **Analog Signal Lines:** Shielded from layout components and digital SPI buses.

---

## 5. Constraint Integration with DRC & Manufacturing Verification

The semantic information is directly integrated into the board checkout loop:
*   Checks if decoupling capacitors are within the maximum allowable trace distance from MCU pins.
*   Verifies high-speed differential pairs match targeting impedance limits.
*   Performs structural verification to ensure components are within reasonable placement bounds.

This architecture enables autonomous agents to operate with true engineering insight, ensuring reliable layouts.
