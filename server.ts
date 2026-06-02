import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for requests body parsing
  app.use(express.json());

  // Initialize Gemini Client server-side securely
  const genaiApiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: genaiApiKey || "dummy-key",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  app.post("/api/copilot", async (req, res) => {
    try {
      const { prompt, traces, experienceLevel } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Missing natural language copilot prompt." });
      }

      // If GEMINI_API_KEY is not defined, we fall back to a rule-based mock processor so the app is always functional!
      if (!genaiApiKey) {
        console.warn("GEMINI_API_KEY is not configured. Falling back to local offline heuristic planner.");
        const lowerPrompt = prompt.toLowerCase();
        
        // Check if the prompt suggests building a whole project or high-level system (flipper core, power delivery, etc.)
        const isSystemGoal = lowerPrompt.includes("flipper") || lowerPrompt.includes("clone") || lowerPrompt.includes("build") || lowerPrompt.includes("design") || lowerPrompt.includes("esp32") || lowerPrompt.includes("power") || lowerPrompt.includes("receiver") || lowerPrompt.includes("project") || lowerPrompt.includes("desk") || lowerPrompt.includes("fun");
        
        interface LayoutAction {
          type: string;
          targetNetKeywords: string[];
          width?: number;
          clearance?: number;
        }

        interface PlanStep {
          id: string;
          title: string;
          desc: string;
          actions: LayoutAction[];
        }

        let explanation = "";
        const actions: LayoutAction[] = [];
        let planSteps: PlanStep[] = [];
        let clarifyingQuestion = "";

        const level = (experienceLevel as 'beginner' | 'intermediate' | 'advanced') || 'intermediate';

        if (isSystemGoal) {
          if (level === 'beginner') {
            if (lowerPrompt.includes("flipper")) {
              explanation = "Wow! Building a Flipper Zero clone is an amazing and fun adventure! It's like a pocket-sized key to understanding wireless signals around us. Let's draft a super simple step-by-step layout plan first to map everything out. No scary terms, just clean pathways!";
              clarifyingQuestion = "Should we design your pocket gadget to fit in a super tiny portable shell, or are you okay making it slightly larger so it's easier to solder ?";
            } else if (lowerPrompt.includes("desk") || lowerPrompt.includes("fun")) {
              explanation = "Designing a cozy, fun widget or display for your desk is a brilliant way to paint with electronics! Let's schedule a simple step-by-step trace layout plan so your device gets safe power and coordinates LEDs beautifully.";
              clarifyingQuestion = "Should we power your desk toy with a portable coin-cell battery, or just use a standard USB cable plugged into your computer?";
            } else {
              explanation = "I see you want to build a grand new PCB project! Let's draft a simple, friendly step-by-step layout plan first to make thing easy and clear. No scary engineering terms, just clean steps!";
              clarifyingQuestion = "Should we design this to run on a standard flat rechargeable lithium battery, or just power it directly from a USB wire?";
            }
            planSteps = [
              {
                id: "step-1",
                title: "Thicken Your Electric Power Tracks",
                desc: "We will widen the main power pathways so they stay cool and charge nicely.",
                actions: [{ type: "SET_WIDTH", targetNetKeywords: ["vcc", "5v", "pwr"], width: 0.5 }]
              },
              {
                id: "step-2",
                title: "Keep Digital Talking Lines Synchronized",
                desc: "We will balance memory lines so communication signals flow without stalling.",
                actions: [{ type: "SET_WIDTH", targetNetKeywords: ["spi", "sck"], width: 0.25 }]
              },
              {
                id: "step-3",
                title: "Set up Safe Computer Connection Paths",
                desc: "We will style the USB connection tracks so your computer can talk with your device.",
                actions: [{ type: "SET_WIDTH", targetNetKeywords: ["usb"], width: 0.45 }]
              }
            ];
          } else if (level === 'advanced') {
            explanation = "Initiating multi-phase PCB physical layout planning for a modular system. Evaluating physical trace geometry parameters, conformal copper-pour loop boundaries, and controlled impedance microstrip structures under IPC-2141.";
            planSteps = [
              {
                id: "step-1",
                title: "50-Ohm Controlled Proximity Coupling Shields",
                desc: "Generate dual bilateral grounded guard trace shields alongside RF microwave signal feeds to prevent parasitic capacitive coupling.",
                actions: [{ type: "ADD_GUARD", targetNetKeywords: ["rf", "antenna", "feed"], clearance: 15 }]
              },
              {
                id: "step-2",
                title: "Serpentine High-Speed Parallel Bus Balancing",
                desc: "Apply flight-time serpentine snake elements to match length geometries over fast clock lines and eliminate signal flight skew.",
                actions: [{ type: "LENGTH_MATCH", targetNetKeywords: ["spi"] }]
              },
              {
                id: "step-3",
                title: "90-Ohm Differential Stackup Tuning",
                desc: "Recalculate trace widths containing 'usb_dp' or 'usb_dn' vectors to 0.45mm to satisfy high frequency differential modes.",
                actions: [{ type: "SET_WIDTH", targetNetKeywords: ["usb", "dp", "dn"], width: 0.45 }]
              }
            ];
          } else {
            // Intermediate
            explanation = "Let's structure a custom layout plan for your board. We will optimize your trace widths for the USB lines and protect your antenna loops from noisy signals.";
            clarifyingQuestion = "Do you want to shield high frequency transceiver tracks with ground guards to protect them from digital crosstalk?";
            planSteps = [
              {
                id: "step-1",
                title: "90Ω USB Differential Impedance Width",
                desc: "Set USB positive and negative differential files to 0.45mm width to achieve an optimal feedback path.",
                actions: [{ type: "SET_WIDTH", targetNetKeywords: ["usb", "dp", "dn"], width: 0.45 }]
              },
              {
                id: "step-2",
                title: "Serpentine SPI Flight-Time Synchronization",
                desc: "Snakify clock and data traces so they exhibit equal layout lengths, preventing bit clock delay gaps.",
                actions: [{ type: "LENGTH_MATCH", targetNetKeywords: ["spi"] }]
              },
              {
                id: "step-3",
                title: "3W clearance RF Guard-rings",
                desc: "Generate isolation paths on either side of the critical antenna nets to block high-frequency electromagnetic noise.",
                actions: [{ type: "ADD_GUARD", targetNetKeywords: ["rf", "antenna"], clearance: 18 }]
              }
            ];
          }
        } else {
          // If not a global system goal, do individual direct action triggers
          if (lowerPrompt.includes("usb") || lowerPrompt.includes("90")) {
            explanation = level === 'beginner' 
              ? "I widened your USB paths so electricity flows cleanly and smoothly with zero bottlenecks!"
              : level === 'advanced'
                ? "Re-routed USB differential microsignal strips to 0.45mm to target 90Ω characteristic impedances under the IPC-2141 conformal solver."
                : "Configured USB differential nets to 0.45mm to match standard 90Ω PCB impedance requirements.";
            actions.push({ type: "SET_WIDTH", targetNetKeywords: ["usb", "dp", "dn"], width: 0.45 });
          } else if (lowerPrompt.includes("length") || lowerPrompt.includes("match") || lowerPrompt.includes("spi")) {
            explanation = level === 'beginner'
              ? "Tuned all information lines to the exact same length so they share notes without any lag or confusion!"
              : level === 'advanced'
                ? "Calculated pin propagation skew thresholds to trigger serpentine-style flight-time calibration on SPI buses."
                : "Balanced physical flight lengths on the SPI bus lines ('sck', 'mosi', 'miso') to align communication cycles.";
            actions.push({ type: "LENGTH_MATCH", targetNetKeywords: ["spi"] });
          } else if (lowerPrompt.includes("guard") || lowerPrompt.includes("shield") || lowerPrompt.includes("antenna") || lowerPrompt.includes("feed")) {
            explanation = level === 'beginner'
              ? "Wrapped your antenna in thick protective ground tracks to isolate it from noisy wires."
              : level === 'advanced'
                ? "Implanted dual GND guard trace shields parallel to RF paths to eliminate microwave substrate electromagnetic coupling."
                : "Engineered parallel shielding lines next to the antenna tracks with a 18px clearance buffer to isolate crosstalk.";
            actions.push({ type: "ADD_GUARD", targetNetKeywords: ["rf", "antenna", "feed"], clearance: 18 });
          } else {
            explanation = "Optimized layout geometry width settings with safe general clearances.";
            actions.push({ type: "SET_WIDTH", targetNetKeywords: ["net"], width: 0.25 });
          }
        }

        return res.json({ isPlan: isSystemGoal, explanation, planSteps, clarifyingQuestion, actions });
      }

      // Structure format instruction for Gemini
      const systemInstruction = 
        `You are NovaCircuit AI Copilot, a senior electrical engineer and EDA tool director.
You analyze natural language inputs from layout designers and convert them into structured plans or actions to update the PCB CAD board.

Tailor your response tone, vocabulary complexity, and advise depth strictly based on the experienceLevel of the designer:
- 'beginner': Use extremely clear, reassuring, simple, non-technical words. Avoid terms like "dielectric constants", "impedance matching", "conformal solver", or "capacitive parasitics". Instead, use friendly descriptions (e.g. "wider tracks let electrical current flow smoothly, like water in a wide pipe"). Ask exactly ONE simple, non-spec clarifying question at a time (e.g. "Should we power this using a USB cable or a basic battery?").
- 'intermediate': Balanced professional terms. Discuss relative impedance targets, signal loops, noise isolation, ground returns, and standard rules.
- 'advanced': Precise electrical engineering veterancy. Mention IPC-2141 conformal microstripline solvers, skin-depth skin effect parasitics, electromagnetic compatibility (EMC) guard shields, parallel bus skew, and crosstalk coefficients.

If the user wants to build a high-level system/project (e.g. "Flipper Zero clone", "ESP32 board", "Power supply", "RF receiver") or explicitly requests a plan, you MUST set isPlan = true, compile a structured layout roadmap array ('planSteps'), and NOT return immediate actions (actions = []).
Each plan step must track a clear title, a brief description suited to their experienceLevel, and a list of internal actions (type SET_WIDTH, LENGTH_MATCH, or ADD_GUARD) to run once the user approves that specific step.

Supported mathematical action types:
1. SET_WIDTH: targetNetKeywords (array of wire substrings like ['usb', 'dp']), width (number, e.g. 0.45 for 90Ω, 0.35 for 100Ω, 0.25 for 50Ω).
2. LENGTH_MATCH: targetNetKeywords (array of substrings like ['spi', 'sck']). Aligns lengths by adding serpents.
3. ADD_GUARD: targetNetKeywords (array, e.g. ['rf', 'antenna']), clearance (number, e.g. 18).

Output a beautifully structured JSON block.`;

      // Query Gemini using responses schema configurations
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Analyze this user command: "${prompt}"\n\nExperience Level: ${experienceLevel || 'intermediate'}\n\nCurrent board traces network: ${JSON.stringify(traces?.map((t: { id: string; netId: string }) => ({ id: t.id, netId: t.netId })) || [])}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isPlan: { type: Type.BOOLEAN, description: "Set to true if this is a high-level system outline requiring a multi-action step-by-step roadmap." },
              explanation: { type: Type.STRING, description: "Detailed EE justification customized to the user's skill level." },
              clarifyingQuestion: { type: Type.STRING, description: "An optional simple question to ask the user of lower experience levels." },
              planSteps: {
                type: Type.ARRAY,
                description: "Sequential steps of the design layout plan (empty if isPlan is false).",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    desc: { type: Type.STRING },
                    actions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          type: { type: Type.STRING, description: "SET_WIDTH, LENGTH_MATCH, or ADD_GUARD" },
                          targetNetKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                          width: { type: Type.NUMBER, description: "Width in mm for traces." },
                          clearance: { type: Type.NUMBER, description: "Guard line clearance buffer in px." }
                        },
                        required: ["type", "targetNetKeywords"]
                      }
                    }
                  },
                  required: ["id", "title", "desc", "actions"]
                }
              },
              actions: {
                type: Type.ARRAY,
                description: "Immediate direct layout actions (empty if isPlan is true).",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    targetNetKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    width: { type: Type.NUMBER },
                    clearance: { type: Type.NUMBER }
                  },
                  required: ["type", "targetNetKeywords"]
                }
              }
            },
            required: ["isPlan", "explanation", "planSteps", "actions"]
          }
        }
      });

      const dataText = response.text ? response.text.trim() : "{}";
      const parsedData = JSON.parse(dataText);
      res.json(parsedData);
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Gemini Copilot Error:", err);
      res.status(500).json({ error: "Interpreting error: " + err.message });
    }
  });

  // Client-side Vite configuration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NovaCircuit Express Backend online at http://localhost:${PORT}`);
  });
}

startServer();
