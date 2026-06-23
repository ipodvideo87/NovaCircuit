# NovaCircuit EDA Layout Suite — Project Context Document

## Project Overview

**NovaCircuit** is a browser-native Electronic Design Automation (EDA) environment built for electrical engineers and EDA tooling developers. It provides real-time schematic capture, controlled-impedance PCB layout routing, IPC-2141 microstrip impedance solvers, serpentine length tuning, automated Design Rule Checks (DRC/DFM), and Power Distribution Network (PDN) impedance analysis — all running client-side in the browser.

### Core Capabilities
- **IPC-2141 Microstrip Solver**: Closed-form impedance calculations to dynamically adjust trace widths for target impedances (50Ω, 90Ω, 100Ω) on FR-4 and PTFE/Rogers substrates
- **Serpentine Length Tuning**: Automatic wiggle injection for propagation flight-time/phase matching on parallel digital buses
- **Spatial Quadtree Rendering**: 60 FPS viewport culling via spatial indexing for virtualized SVG layout visualization
- **DRC/DFM Validation**: Acid trap detection, minimum annular ring width checks, copper clearance validation, ratsnest completion reporting
- **PDN Impedance Analyzer**: Power Distribution Network analysis including frequency-domain PDN impedance curves, decoupling capacitor optimization, target impedance validation, and resonance detection
- **Gerber/BOM/Pick-and-Place Export**: RS-274X Gerber, Bill of Materials, and CSV pick-and-place file generation
- **AI Copilot**: Server-side Gemini API integration for grounding and design suggestions
- **Preconfigured Templates**: ESP32 IoT Dev Board, USB-PD 65W Buck Regulator, STM32 Analog Front-End

### Target Audience
World-class electrical engineers and EDA tooling developers who require professional-grade PCB design tooling in the browser.

---

## Tech Stack

| Category | Technology | Version |
|---|---|---|
| **UI Framework** | React | ^18.2.0 |
| **Language** | TypeScript | ^5.2.2 |
| **State Management** | Zustand | ^4.4.7 |
| **Styling** | Tailwind CSS | ^3.4.0 |
| **Build Tool** | Vite | ^5.0.8 |
| **Server** | Express | ^5.2.1 |
| **AI Integration** | @google/genai (Gemini) | ^2.7.0 |
| **Icon Library** | lucide-react | ^0.300.0 |
| **File Export** | jszip | ^3.10.1 |
| **Server Runtime** | tsx / esbuild | ^4.22.4 / ^0.28.0 |
| **Linting** | ESLint + TypeScript ESLint | ^8.55.0 / ^6.14.0 |

---

## Architecture

NovaCircuit follows a **layered separation of concerns** architecture:

```
Browser Client (React + Vite)
    └── Components Layer        → Visual UI and canvas renderers
        └── State Layer         → Zustand transaction store
            └── Core Logic Layer → Netlist, routing, spatial indexing, PDN analysis
                └── Types Layer  → PCB data model definitions

Express Server (server.ts)
    └── Gemini API Proxy        → AI copilot API calls
```

### Data Flow
1. **User interactions** (click, drag, gesture) → Component event handlers
2. **State mutations** → Committed as discrete transactions via `useTransactionStore`
3. **Undo/Redo** → History stack in Zustand store with pointer (`currentIndex`)
4. **Rendering** → Spatial index queried per viewport bounds → SVG elements rendered
5. **Export** → Board state serialized by `exporter.ts` → Zip file via jszip
6. **AI Suggestions** → Frontend calls Express server → Proxied to Gemini API
7. **PDN Analysis** → Board state parsed for power nets/decoupling caps → Frequency-domain impedance computed client-side → Results rendered in `PDNAnalyzer` panel

---

## Directory Structure

```
novacircuit/
├── .env.example              # GEMINI_API_KEY placeholder
├── index.html                # App entry (dark bg: #0b0b10, overflow-hidden)
├── server.ts                 # Express server + Gemini API proxy
├── vite.config.ts            # Vite bundler configuration
├── tailwind.config.js        # Tailwind theme/palette config
├── tsconfig.json             # TypeScript compiler options
└── src/
    ├── main.tsx              # ReactDOM.createRoot entry point
    ├── App.tsx               # Root component → renders <PCBEditor />
    ├── index.css             # Tailwind directives + no-scrollbar utility
    ├── types/
    │   └── pcb.ts            # Core EDA type definitions (includes PDN types)
    ├── lib/
    │   ├── core/
    │   │   ├── netlist.ts    # Pin definitions, logical net resolution
    │   │   ├── templates.ts  # Preconfigured board templates (ESP32, STM32, Buck)
    │   │   ├── transaction.ts# Zustand undo/redo history store
    │   │   └── spatial.ts    # Quadtree spatial index implementation
    │   ├── exporter.ts       # Gerber RS-274X, BOM, CSV pick-and-place
    │   ├── routingSystem.ts  # Manhattan router + impedance trace calculator
    │   ├── pdnAnalyzer.ts    # PDN impedance solver, decoupling optimizer
    │   └── orchestrator.ts   # Bridge logic between subsystems
    └── components/
        ├── PCBEditor.tsx     # Grand workspace (sidebar, chat, split-view)
        ├── AboutDialog.tsx   # Engineering details modal
        ├── HelpDialog.tsx    # Keyboard shortcut guide
        ├── OnboardingDialog.tsx # Experience-level selector
        ├── ErrorBoundary.tsx # Production failure isolation
        ├── PDNAnalyzer.tsx   # PDN impedance analysis panel/overlay
        └── PCB/
            ├── PCBCanvas.tsx         # Multi-layer copper workspace
            ├── SchematicCanvas.tsx   # Schematic symbol capture sheet
            ├── ComponentRenderer.tsx # Component footprint visuals
            ├── TraceRenderer.tsx     # Copper trace routing layer
            └── RatsnestLayer.tsx     # Same-net airwire visualizer
```

---

## Key Files Reference

### `src/types/pcb.ts`
**The single source of truth for all EDA data structures.** Defines:
- `PCBBoard` — top-level board containing components, traces, and ratsnest
- `PCBComponent` — placed component with `id`, `x`, `y`, `rotation`, `name`, `type`
- `PCBTrace` — routed copper trace with `id`, `startX/Y`, `endX/Y`, `width`, `netId`
- `PCBRatsnest` — unrouted airwire connection with `id`, `startX/Y`, `endX/Y`, `netId`
- **PDN types**: `DecouplingCapacitor`, `PDNNode`, `PDNAnalysisResult`, `PDNImpedancePoint`, `PDNResonance`, `DecouplingRecommendation`

### `src/lib/core/transaction.ts`
**Zustand store — central state manager.** Key responsibilities:
- Maintains `history: PCBBoard[]` array and `currentIndex` pointer for undo/redo
- `commitTransaction(board)` — pushes new board state, auto-saves every 30 seconds
- `undo()` / `redo()` — returns the target `PCBBoard` state
- `selectedComponentId` / `selectedTraceId` — mutually exclusive selection state
- `experienceLevel` — persisted to `localStorage` as `novacircuit_experience_level`
- `pdnAnalysisResult` — cached last PDN analysis result (not part of undo history)
- Initial state seeds **300 random components** and **150 random traces** (stress-test/demo data)

### `src/lib/core/netlist.ts`
**Connectivity engine.** Key exports:
- `getPinsForType(type: string): Pin[]` — returns standard pin arrays by component type (MCU, CONNECTOR, LDO, OP-AMP, ADC, MOSFET, 2-pin passives)
- `getLogicalNetForPin(compId, compName, compType, pinName): string` — resolves logical net names; `gnd`/`gnd1`/`gnd2` always resolve to `'gnd'`; template-specific net name rules apply

### `src/lib/core/spatial.ts`
**Quadtree-based spatial index.** Key classes:
- `QuadtreeNode<T>` — recursive quadtree with `maxItems=10`, `maxDepth=5`; splits into 4 children when capacity exceeded
- `SpatialIndex<T>` — public API wrapper; default bounds `(-10000, -10000)` to `(10000, 10000)`; supports `insert()` and `query()` by bounding box

### `src/lib/core/templates.ts`
**Preconfigured board templates.** Each template provides a fully populated `PCBBoard`:
- `esp32` — ESP32-S3, AMS1117-3.3V LDO, USB-C connector, decoupling caps, pullup resistors, 40MHz XTAL, inverted-F antenna; includes power traces, USB differential pair (90Ω), RF trace (50Ω, 0.32mm width)
- Additional templates: STM32 Analog Front-End, USB-PD 65W Buck Regulator

### `src/lib/routingSystem.ts`
Manhattan trace router and controlled-impedance trace width calculator.

### `src/lib/pdnAnalyzer.ts`
**PDN impedance solver and decoupling optimizer.** Key responsibilities:
- Extracts power nets (`vcc-*`, `vbus`, `pwr-*`) and ground nets from board state
- Identifies decoupling capacitors by component type and proximity to power pins
- Computes frequency-domain PDN impedance curves (typically 1 kHz – 1 GHz log-sweep)
- Calculates target impedance from supply voltage and transient current budget: `Z_target = ΔV / ΔI`
- Detects anti-resonances and resonance peaks between capacitor banks
- Generates `DecouplingRecommendation[]` — suggested cap values, placement, and net assignments
- All computation is **client-side** (no server round-trip)

### `src/lib/exporter.ts`
Generates Gerber RS-274X files, BOM spreadsheets, and CSV pick-and-place outputs; packaged via jszip for download.

### `src/lib/orchestrator.ts`
Core bridge/coordinator logic connecting routing, netlist resolution, PDN analysis, and state management.

### `server.ts`
Express server that:
- Serves the Vite-built frontend in production
- Proxies AI Copilot requests to Google Gemini API (requires `GEMINI_API_KEY` env var)

### `src/components/PCBEditor.tsx`
The **grand workspace** — primary layout container housing:
- Collapsible sidebar (collapses to bottom hotbar on mobile)
- AI Chat console panel
- Split-view: `SchematicCanvas` + `PCBCanvas`
- IPC stackup drawer (slide-up on mobile when trace selected)
- PDN Analyzer panel (accessible via sidebar or toolbar)

### `src/components/PDNAnalyzer.tsx`
**PDN impedance analysis panel.** Key responsibilities:
- Accepts current `PCBBoard` and renders PDN analysis controls
- Displays frequency-domain impedance plot (SVG-based, log-frequency axis)
- Shows target impedance line, pass/fail regions, and identified resonances
- Lists decoupling cap inventory parsed from board and optimization recommendations
- Provides per-power-rail breakdown (each `vcc-*` net analyzed independently)
- Integrates with `pdnAnalyzer.ts` lib; triggers re-analysis on board change or manual refresh

---

## Core Data Model

```typescript
// Inferred from usage across the codebase
interface PCBComponent {
  id: string;          // e.g., "U1", "comp-42"
  x: number;           // Canvas X coordinate
  y: number;           // Canvas Y coordinate
  rotation: number;    // Degrees (0, 90, 180, 270)
  name: string;        // Human-readable, e.g., "ESP32-S3-WROOM"
  type: string;        // "MCU" | "CONNECTOR" | "LDO" | "CAPACITOR" | "RESISTOR"
                       // | "OSCILLATOR" | "RF_ANTENNA" | "MOSFET" | "OP-AMP"
                       // | "ADC" | "VOLTAGE_REF" | "IC" | ...
}

interface PCBTrace {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;       // in mm — e.g., 0.18 (USB diff), 0.32 (RF 50Ω)
  netId: string;       // e.g., "vcc-3.3v", "gnd", "usb-dp", "wifi-ant-rf"
}

interface PCBRatsnest {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  netId: string;
}

interface PCBBoard {
  components: PCBComponent[];
  traces: PCBTrace[];
  ratnest: PCBRatsnest[];    // Note: field name is "ratnest" (not "ratsnest")
}

// PDN Analysis Types
interface PDNImpedancePoint {
  frequency: number;   // Hz
  impedance: number;   // Ohms
}

interface PDNResonance {
  frequency: number;   // Hz
  impedance: number;   // Ohms (peak or anti-resonance trough)
  type: 'resonance' | 'anti-resonance';
}

interface DecouplingCapacitor {
  componentId: string;
  capacitance: number; // Farads
  esr: number;         // Equivalent Series Resistance, Ohms
  esl: number;         // Equivalent Series Inductance, Henries
  netId: string;       // Power net this cap decouples
  mountingInductance?: number; // Via/pad inductance, Henries
}

interface DecouplingRecommendation {
  netId: string;
  suggestedValue: number;   // Farads
  suggestedCount: number;
  reason: string;
  frequencyRange: [number, number]; // Hz
}

interface PDNAnalysisResult {
  netId: string;
  impedanceCurve: PDNImpedancePoint[];
  targetImpedance: number;  // Ohms — derived from ΔV/ΔI budget
  resonances: PDNResonance[];
  recommendations: DecouplingRecommendation[];
  passesTarget: boolean;   // true if Z < Z_target across full frequency range
}
```

---

## Pin Type Reference

Standard pin configurations returned by `getPinsForType()`:

| Component Type | Pins |
|---|---|
| `MCU` | VCC, GND, EN, BOOT (left); RXD, TXD, RF_OUT, GPIO (right) |
| `CONNECTOR` | VBUS, DP, DN (right); GND (left) |
| `LDO` / `VOLTAGE_REF` | IN (left); GND (bottom); OUT (right) |
| `OP-AMP` / `ADC` | IN+, IN- (left); OUT (right); VCC (top); GND (bottom) |
| `MOSFET` | GATE (left); DRAIN (top); SOURCE (bottom) |
| All passives (CAP, RES, IND, OSC) | 1 (left); 2 (right) |

---

## State Management Patterns

### Zustand Transaction