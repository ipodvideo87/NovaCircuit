# NovaCircuit Architect — Project Structure File tree

This document outlines the professional EDA directory and file structures implemented in the NovaCircuit application.

```text
novacircuit/
├── .env.example              # Sample environment configuration
├── index.html                # Main entry point served in the browser
├── package.json              # Package description and script targets
├── postcss.config.js         # PostCSS configurations for Tailwind integration
├── tailwind.config.js        # Modern Tailwind palette and theme configurations
├── tsconfig.json             # TypeScript compiler rules
├── vite.config.ts            # Vite dev & build bundle optimizations
├── PROJECT_STRUCTURE.md      # [This File] Curated workspace directory schematic
└── src/
    ├── main.tsx              # React mounting root and entry execution
    ├── App.tsx               # Main layout orchestrator of the system
    ├── index.css             # Unified CSS containing Tailwind directives
    ├── types/
    │   └── pcb.ts            # Core EDA structures (Board, Traces, Netlists, Components)
    │
    ├── lib/
    │   ├── core/
    │   │   ├── netlist.ts    # Connectivity engine, logical net matching and Auto-routing
    │   │   ├── templates.ts  # Pre-defined circuit boards (ESP32 Dev Board, STM32 AFE, Buck Converter)
    │   │   ├── transaction.ts# Command history & undo-redo transactional state store
    │   │   └── spatial.ts    # Grid snapping and geometric calculations
    │   │
    │   ├── exporter.ts       # Gerber RS-274X, Boh-of-Materials (BOM), CSV Pick-and-Place exporters
    │   ├── routingSystem.ts  # Manhattan traces router and impedance trace calculator
    │   └── orchestrator.ts   # Core bridge logic
    │
    └── components/
        ├── AboutDialog.tsx   # Interactive engineering details modal
        ├── HelpDialog.tsx    # Keyboard shortcut guides and manual tuning notes
        ├── OnboardingDialog.tsx# Experience-level customizer
        ├── ErrorBoundary.tsx # Production layout failure isolation wrapper
        ├── PCBEditor.tsx     # Grand Workspace (Sidebar, Chat Console, PCB/Schematic Split-View)
        │
        └── PCB/
            ├── SchematicCanvas.tsx # Schematic symbols capture sheet & dynamic pins
            ├── PCBCanvas.tsx       # Multi-layer copper workspace & stackup settings
            ├── ComponentRenderer.tsx# Individual component footprint visuals renderer
            ├── TraceRenderer.tsx   # Precision copper traces routing layer
            └── RatsnestLayer.tsx   # Same-net airwires visualizer
```

## Modular Separation of Concerns

1. **`src/types/pcb.ts`**: Holds exact type descriptions for layout models. High predictability across schematic and PCB traces.
2. **`src/lib/core/netlist.ts`**: Resolves logical nets dynamically during symbol mapping and physical board sync. Controls the Manhattan airwires generator tool.
3. **`src/components/PCB/`**: Divides visual layers cleanly. Ensures the React virtual DOM renders canvas elements smoothly without unnecessary re-renders.
