# NovaCircuit — Developer Reference (CLAUDE.md)

## Build & Dev

```bash
# Install
npm install

# Dev server (Vite + Express proxy)
npm run dev          # Vite on :5173
npm run server       # Express on :3001

# Production
npm run build
npm run preview

# Tests
npm run test          # vitest run (all unit tests)
npm run test:watch    # vitest watch mode
npm run test:coverage # v8 coverage

# Lint
npm run lint
```

## Environment

Copy `.env.example` → `.env` and set:
```
GEMINI_API_KEY=your_key_here
```

---

## Architecture Overview

```
src/
├── types/pcb.ts          ← Single source of truth for ALL EDA types
├── lib/
│   ├── viaManager.ts     ← Via DRC, type inference, depth calc, factory
│   ├── routingSystem.ts  ← Manhattan router + IPC-2141A impedance solver
│   ├── pdnAnalyzer.ts    ← PDN impedance analysis
│   ├── exporter.ts       ← Gerber RS-274X + Excellon drill + BOM
│   ├── orchestrator.ts   ← Subsystem bridge / coordinator
│   └── core/
│       ├── transaction.ts ← Zustand store (history, selection, via actions)
│       ├── templates.ts  ← ESP32 / STM32-AFE / USB-PD-Buck templates
│       ├── netlist.ts    ← Pin definitions, logical net resolution
│       └── spatial.ts    ← Quadtree spatial index
└── components/
    ├── PCBEditor.tsx     ← Grand workspace
    ├── ViaDRCPanel.tsx   ← IPC-6012 violation list
    ├── ViaToolbar.tsx    ← Via placement mode controller
    ├── PDNAnalyzer.tsx   ← PDN impedance panel
    └── PCB/
        ├── PCBCanvas.tsx         ← Canvas + via placement click handler
        ├── ViaRenderer.tsx       ← SVG via glyphs (colour by type)
        ├── StackupDrawer.tsx     ← Layer cross-section + via overlays
        ├── ViaInspector.tsx      ← Selected-via property editor
        ├── TraceRenderer.tsx     ← Layer-aware trace rendering
        ├── ComponentRenderer.tsx
        ├── SchematicCanvas.tsx
        └── RatsnestLayer.tsx
```

---

## Via Management System

### Type Hierarchy
```
ViaType = 'through' | 'blind' | 'buried' | 'micro'
```

| Type    | Layer span                  | Drill method   | IPC AR limit |
|---------|-----------------------------|----------------|-------------|
| through | F.Cu → B.Cu (all layers)    | Mechanical     | 10:1        |
| blind   | Outer → inner               | Mechanical     | 10:1        |
| buried  | Inner → inner               | Mechanical     | 10:1        |
| micro   | Adjacent layers only (±1)   | Laser (≤0.15mm)| 1:1         |

### Key APIs (`src/lib/viaManager.ts`)

```typescript
// Create a via (auto-selects type from layer pair + drill)
createVia(x, y, fromLayer, toLayer, netId, stackup, drillOverride?)

// Run IPC-6012 DRC on all vias
runViaDRC(vias, stackup): ViaDRCResult

// Router helper — picks via type from net class constraints
selectViaForTransition(x, y, fromLayer, toLayer, netId, stackup, netClass?)

// Compute physical drill depth from stackup dielectrics
calcDrillDepth(fromLayer, toLayer, stackup): number

// Infer via type from layer span + drill diameter
inferViaType(fromLayer, toLayer, drillMm, stackup): ViaType
```

### Stackup Presets

- `'4L'` — 4-layer FR-4, 1.6 mm (default)
- `'6L'` — 6-layer FR-4, 1.6 mm
- `'8L'` — 8-layer FR-4, 1.6 mm

Each stackup provides copper thickness (µm) + dielectric thickness (mm) + εr + tan δ per layer.

### Net Classes → Via Type Mapping

| Net Class  | Preferred Via | Drill Override |
|------------|--------------|---------------|
| Default    | through      | —             |
| Power      | through      | 0.30 mm       |
| High-Speed | micro        | 0.10 mm       |
| USB-Diff   | blind        | 0.15 mm       |
| RF         | blind        | 0.15 mm       |

### IPC-6012 DRC Rules

The DRC engine (`runViaDRC`) checks:
1. **LAYER_NOT_IN_STACKUP** — via references a layer absent from active stackup
2. **VIA_TYPE_MISMATCH** — declared type inconsistent with layer span
3. **MIN_DRILL_DIAMETER** — drill below per-type minimum
4. **ANNULAR_RING** — pad − drill < 2 × minimum annular ring
5. **ASPECT_RATIO** — depth ÷ drill > limit (10:1 standard, 1:1 micro)
6. **ASPECT_RATIO_WARNING** — within 15% of limit (warning, not error)

---

## PCBBoard Type

```typescript
interface PCBBoard {
  components: PCBComponent[];
  traces: PCBTrace[];
  ratnest: PCBRatsnest[];     // field name is "ratnest" (NOT "ratsnest")
  vias?: PCBVia[];            // placed vias (added in v2)
  stackup?: PCBStackup;       // active layer stackup (default 4L FR-4)
  netClasses?: Record<string, string>; // netId → NetClass name
}
```

## PCBTrace Type (updated)

```typescript
interface PCBTrace {
  id: string;
  startX, startY, endX, endY: number;
  width: number;      // mm
  netId: string;
  layer?: LayerId;    // copper layer (default 'F.Cu')
  netClass?: string;  // net class name
}
```

---

## Transaction Store (Zustand)

Additional via-specific actions:

```typescript
store.addVia(via)              // commit new via, refresh summary
store.removeVia(viaId)         // remove + deselect
store.updateVia(via)           // update properties
store.runViasDRC()             // run DRC, cache in store.viaDRCResult
store.setStackupPreset(preset) // switch stackup, re-run DRC
store.refreshViaSummary()      // recompute store.viaSummary
store.setSelectedVia(id|null)  // exclusive with component/trace selection
```

---

## Export Package Contents

```
novacircuit_export.zip
├── gerber/
│   ├── F_Cu.gbr      ← Top copper layer
│   ├── In1_Cu.gbr    ← Inner layers
│   ├── In2_Cu.gbr
│   └── B_Cu.gbr      ← Bottom copper layer
├── drill/
│   ├── novacircuit.drl   ← Excellon NC drill (grouped by via type)
│   └── via_report.csv    ← Via inventory + aspect ratios
├── bom/
│   └── novacircuit_bom.csv
├── assembly/
│   └── novacircuit_pos.csv
└── README.txt
```

---

## Testing

Unit tests live in `src/lib/__tests__/`.

```bash
npm run test
```

Coverage target: `src/lib/**/*.ts` (excluding `__tests__/`).

Key test file: `src/lib/__tests__/viaManager.test.ts`
- `calcDrillDepth` — depth calculations for all via types and stackups
- `inferViaType` — type inference edge cases
- `runViaDRC` — aspect ratio, annular ring, type mismatch, layer availability
- `createVia` — factory defaults and ID uniqueness
- `selectViaForTransition` — net-class-driven type selection
- Layer helpers — adjacency, adjacent inner layer resolution
