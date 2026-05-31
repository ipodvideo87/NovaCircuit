# ⚡ NovaCircuit

### *The Next-Generation AI-Native PCB co-design & hardware engineering suite*

NovaCircuit is a real-time, browser-native Electronic Design Automation (EDA) and PCB layout workspace, powered by high-fidelity collaborative state, multi-layer routing, real-time DRC/ERC, and a built-in expert AI hardware agent, "Nova". Designed similarly to Flux.ai but integrated with deep agentic intelligence, NovaCircuit permits beginner makers and professional engineers to design circuits via conversation or fine-grained visual tools.

---

## 🚀 Key Features

### 🧠 1. AI Schematic Synthesis
Engage with **Nova**, the integrated AI hardware design copilot. Simply request a system (e.g., "Add an ESP32 microcontroller with a voltage regulator and status LEDs") and witness the agent execute tool actions to draft correct, formatted schematics programmatically in real time.

### 🌐 2. AI & Interactive Route Engine
Multi-layer routing with IPC-compliant spacing rules:
* Constraint-driven board outline, keepout, and routing tracks.
* High-performance single-ended and differential pair impedance matching.
* Guided A* airwire routing with single-click AI route completion.

### 🌡️ 3. Physics & Layout Simulation
Simulate electric, signal, and heat distribution instantly right inside the browser canvas:
* Live thermal heatmaps overlaying resistors, ICs, and high-power nodes.
* Real-time high-speed signal integrity, crosstalk risk, and skew tolerance profiling.

### 🔍 4. Multi-Layer Real-time DRC & ERC
* **Electrical Rules Check (ERC):** Inspects schematics for floating pins, shorted power rails, and mismatched voltage nets.
* **Design Rules Check (DRC):** Continuously monitors trace-to-trace and trace-to-via clearance constraints on the PCB board layout to prevent manufacturing defects.

### 🏭 5. IPC Production Board Export
Generate production-ready manufacturing packages directly from the web:
* Standard Gerber RS-274X layer files.
* Excellon NC drill charts.
* High-fidelity formatted Bill of Materials (BOM) in CSV structure.

---

## 🛠️ Technology Stack

* **Frontend Framework:** React 19 + Vite + TypeScript
* **State Management:** Zustand (for highly responsive reactive board & schematic state tree syncing)
* **Visual Workspaces:** High-performance 2D Canvas with instanced rendering paths (GPU-accelerated vector rendering)
* **AI Engine:** Google Gemini AI SDK (`@google/genai`) on Node.js/Express proxy
* **Real-time Engine:** Express + WebSockets for multiplayer board co-design synchronization
* **Linting & Rules:** TypeScript Compiler state validation

---

## 📦 Project Setup & Local Running

Ready to launch NovaCircuit locally? Follow these quick steps:

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* A valid Gemini API Key (visit [Google AI Studio](https://aistudio.google.com/) to obtain one)

### 1. Install Workspace Dependencies
```bash
npm install
```

### 2. Configure Environment Secrets
Create a `.env` file in the root directory (or use `.env.example` as a template):
```env
# Required for AI copilot tools and chat completion
GEMINI_API_KEY=your_gemini_api_key_here

# For authenticating private GitHub resources (optional)
GITHUB_TOKEN=
```

### 3. Run the Development Server
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000` to start designing hardware or chatting with Nova.

### 4. Build and Compile for Production
```bash
npm run build
```
This bundles both the frontend Single Page Application (SPA) inside the `/dist` folder and compiles the custom Express backend into `dist/server.cjs` for immediate Node deployment.

---

*NovaCircuit is developed with precision visual typography, elegant high-contrast dark workspaces, and a focus on physical design correctness.*
