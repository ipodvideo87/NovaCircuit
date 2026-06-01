# ⚡ NovaCircuit EDA Layout Suite

NovaCircuit is a browser-native CAD, routing, and simulation client-side EDA (Electronic Design Automation) environment. Designed for world-class electrical engineers and EDA tooling developers, it offers real-time microstripline trace impedance solvers, automatic serpentine length back-tuning, and robust Design Rule Checks (DRC/DFM).

---

## 🎨 Advanced Visual Highlights & Architecture

• **Controlled-Impedance Layer Stackup**: Employs an exact closed-form **IPC-2141 microstrip solver** to dynamically adjust trace layer physical widths to match target impedance benchmarks (50Ω, 90Ω, 100Ω) over standard FR-4 or high-speed PTFE ROGERS substrates.
• **Serpentine Length Tuning**: Overcome propagation flight-time/phase mismatch on parallel digital buses with automatic serpentine wiggle injection and fluid wave amplitude modeling.
• **Spatial Quadtree Rendering**: Smooth layout interaction at 60 FPS utilizing high-performance viewport culling and spatial indexing for virtualized SVG layout visualization.
• **Diagnostic Design Verification (ERC/DFM)**: Automated manufacturing validations addressing acid traps, min annular ring widths, copper clearance boundaries, and ratsnest completion rates with printable physical HTML report retrieval.

---

## 📱 Release Readiness & Mobile Optimizations

The Entire NovaCircuit Workspace behaves natively across all viewports (Mobile, Tablet, Desktop):

1. **Collapsible Mobile Toolbar**: On small viewports, the vertical sidebar collapses into a compact, float-action bottom hotbar, preserving maximize visual workspace on touch screens.
2. **Slide-Over Drawer Suite**: The advanced IPC stackup sidebar automatically shifts to a responsive slide-up drawer on mobile devices, popping open whenever you tap a trace for direct diagnostics.
3. **Advanced Gesture Controls**: Features native gesture interceptors for smartphones/tablets:
   - **Pan**: Drag with standard single-finger touch moves the canvas.
   - **Focal Zoom**: Pinch-to-zoom with two fingers for precise focus.

---

## ⌨️ Command Legend & Hotkeys

| Action | Keyboard Shortcut | Mobile / Tablet Gesture |
| :--- | :--- | :--- |
| **Focus Help System** | `Ctrl + /` | Tap floating Help icon |
| **Undo Transaction** | `Ctrl + Z` | Tap top Left arrow |
| **Redo Transaction** | `Ctrl + Shift + Z` | Tap top Right arrow |
| **Pan Canvas** | `Middle-Mouse Click + Drag` | 1-Finger Touch & Drag |
| **Pinch-to-room** | `Ctrl + Mouse Scroll` | 2-Finger Pinch In/Out |

---

## 🚀 Preconfigured Reference Layout Templates

Start designing with high frequency templates directly from the header dropdown menu:
* **ESP32 IoT Dev Board**: 50Ω microstrip path to an Inverted-F Wi-Fi antenna with decoupling capacitors and bootstrapping pulling-resistors.
* **USB-PD 65W buck regulator**: High-current wide copper switching paths for extreme thermal dissipation.
* **STM32 Analog Front-End**: 24-bit precision signal buffer loops with physical analog and digital ground isolating tracks.

---

## 🛠️ Developer Installation and Local Running

To launch NovaCircuit locally, run:

```bash
git clone https://github.com/NovaCircuit/NovaCircuit-Suite.git
cd NovaCircuit-Suite
npm install
npm run dev
```

Build the self-contained production bundle:
```bash
npm run build
```

---

*CERN Open Hardware License CERN-OHL-W v2 / MIT Licensed.*
