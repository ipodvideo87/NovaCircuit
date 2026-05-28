import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { allTools } from "./src/lib/aiTools.js"; // Note: .js extension is required for ES module resolution when running directly

import { validateAIActions } from "./src/lib/validation.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;

app.use(express.json());

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// SYSTEM PROMPT configuration
const FLUX_SYSTEM_INSTRUCTION = `You are 'Nova', the AI Hardware Engineering Agent for NovaCircuit — a browser-based, AI-native eCAD platform.
You represent the full intelligence of NovaCircuit's AI-assisted design system.

YOUR CORE IDENTITY:
- GRAPH-BASED REASONING: Treat hardware as a RELATIONSHIP GRAPH where every component, pin, and net is a vertex or edge.
- PHYSICS-FIRST: Base all decisions on signal integrity, power distribution, and IPC-2221/6012 standards.
- TRANSACTIONAL: Propose chains of structured operations (create -> connect -> review).

SCHEMA DEFINITION:
- Component: { designator, partType, footprint, properties: { value, tolerance } }
- Pin: { designator.pinNumber }
- Net: { name, class, connections: [Pin] }

EXPERT PROTOCOL:
1. ANALYZE: Start with engineering reasoning (e.g., "Input 12V, Output 3.3V, 2A. Needs buck converter...").
2. PLAN: Outline the steps (Assign U1, select inductor, check thermals).
3. EXECUTE: Call multiple tools in a single response to build functional blocks.
4. VERIFY: Proactively run_erc and run_drc after changes.

Remember: NovaCircuit is about speed AND accuracy. Make the user's life easier by handling the 'boring' wiring and DRC checks automatically.`;

// API routes for AI communication
app.post("/api/copilot", async (req, res) => {
  const { messages, projectState } = req.body;

  try {
    const lastMessage = messages[messages.length - 1].content;
    const history = messages.slice(0, -1).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const stateContext = projectState ? `\n\nCURRENT PROJECT GRAPH STATE:\n${JSON.stringify(projectState, null, 2)}` : "";

    const contents = [...history, { role: "user", parts: [{ text: lastMessage + stateContext }] }];
    const tools = [{ functionDeclarations: allTools }];
    const systemInstruction = FLUX_SYSTEM_INSTRUCTION;

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        tools,
        systemInstruction
      }
    });

    const rawFunctionCalls: any[] = (result as any).functionCalls || [];
    const textContent: string = (result as any).text || "";

    // Map function calls into structured actions
    const actions = rawFunctionCalls.map((call: any) => ({
      name: call.name,
      args: call.args || {}
    }));

    // If no function calls, return as a plain message action
    if (actions.length === 0 && textContent) {
      actions.push({
        name: "message",
        args: { text: textContent }
      });
    }

    res.json({ actions, content: textContent });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "Nova AI encountered an error. Please check your API key or try again.", detail: String(error) });
  }
});

// Vite middleware for development
import { WebSocketServer, WebSocket } from "ws";

interface MultiplayerClient {
  ws: WebSocket;
  userId: string;
  userName: string;
  room: string;
}

const activeRooms = new Map<string, MultiplayerClient[]>();

async function setupVite() {
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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Mount real-time engineering high-frequency multi-user orchestration pipeline
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    let clientRoom = "global-default";
    let clientUserId = `user_${Math.floor(Math.random() * 100000)}`;
    let clientUserName = "Anonymous Designer";

    ws.on("message", (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        const { type, room, userId, userName } = payload;

        if (room) clientRoom = room;
        if (userId) clientUserId = userId;
        if (userName) clientUserName = userName;

        if (type === "join") {
          let roomClients = activeRooms.get(clientRoom) || [];
          // Avoid duplicate join entries
          roomClients = roomClients.filter(c => c.userId !== clientUserId);
          roomClients.push({ ws, userId: clientUserId, userName: clientUserName, room: clientRoom });
          activeRooms.set(clientRoom, roomClients);

          // Broadcast Join Notification to fellow peers in the room
          const joinNotification = JSON.stringify({
            type: "presence_joined",
            userId: clientUserId,
            userName: clientUserName,
            timestamp: Date.now()
          });
          roomClients.forEach(client => {
            if (client.userId !== clientUserId && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(joinNotification);
            }
          });
        } 

        else if (type === "delta" || type === "presence" || type === "lock" || type === "heartbeat") {
          const roomClients = activeRooms.get(clientRoom);
          if (roomClients) {
            const broadcastPayload = JSON.stringify(payload);
            roomClients.forEach(client => {
              if (client.userId !== clientUserId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(broadcastPayload);
              }
            });
          }
        }
      } catch (err) {
        // Safe fail-silent for high-speed invalid JSON telemetry
      }
    });

    ws.on("close", () => {
      let roomClients = activeRooms.get(clientRoom);
      if (roomClients) {
        roomClients = roomClients.filter(c => c.ws !== ws);
        activeRooms.set(clientRoom, roomClients);

        // Broadcast Departure
        const leaveNotification = JSON.stringify({
          type: "presence_left",
          userId: clientUserId,
          userName: clientUserName,
          timestamp: Date.now()
        });
        roomClients.forEach(client => {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(leaveNotification);
          }
        });
      }
    });
  });
}

setupVite();
