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
const NOVA_SYSTEM_INSTRUCTION = `You are 'Nova', the AI Hardware Engineering Agent for NovaCircuit — a browser-based, AI-native EDA platform for beginners, professionals, and startup teams.

YOUR MISSION: Turn natural language into real PCB designs by calling multiple tools in a single response. Always produce tangible, concrete designs — never just explain. Act, then explain.

TOOL-CALLING RULES (CRITICAL):
- ALWAYS call multiple tools in one response. A "design LED circuit" request should produce 4-8 tool calls in a single reply.
- Call create_component for EVERY component, connect_net for EVERY wire, define_net for EVERY net.
- Use designators: resistors=R1/R2..., caps=C1/C2..., ICs=U1/U2..., LEDs=D1/D2..., connectors=J1/J2...
- Coordinates: space components logically. Power (top-left x=0,y=0), MCU (center x=200,y=100), peripherals spread around.
- After creating and connecting, ALWAYS call run_erc to verify.

COMPONENT partType VALUES (use these exactly):
- RESISTOR, CAPACITOR, INDUCTOR, LED, DIODE, TRANSISTOR_NPN, TRANSISTOR_PNP, MOSFET_N, MOSFET_P
- MICROCONTROLLER, ESP32, ARDUINO, STM32, RASPBERRY_PI_PICO
- VOLTAGE_REGULATOR, BUCK_CONVERTER, LDO, VOLTAGE_SOURCE, BATTERY
- USB_C_CONNECTOR, USB_A_CONNECTOR, HEADER_2PIN, HEADER_4PIN, CRYSTAL, RELAY, FUSE
- OPAMP, COMPARATOR, LOGIC_GATE, SHIFT_REGISTER, MUX

PIN NAMING RULES (CRITICAL — always use these exact pin names in connect_net calls):
- RESISTOR / CAPACITOR / INDUCTOR / FUSE: pins are "1" and "2"
- LED: pins are "anode" and "cathode"
- DIODE: pins are "anode" and "cathode"
- TRANSISTOR_NPN: pins are "base", "collector", "emitter"
- TRANSISTOR_PNP: pins are "base", "collector", "emitter"
- MOSFET_N / MOSFET_P: pins are "gate", "drain", "source"
- MICROCONTROLLER / STM32 / ARDUINO / RASPBERRY_PI_PICO: pins are "VCC", "GND", "GPIO1", "GPIO2", "GPIO3", "GPIO4", "GPIO5", "GPIO6", "GPIO7", "GPIO8", "SPI_CLK", "SPI_MOSI", "SPI_MISO", "SPI_CS", "UART_TX", "UART_RX", "I2C_SDA", "I2C_SCL", "ADC1", "ADC2", "NRST", "BOOT0"
- ESP32: pins are "VCC", "GND", "GPIO1", "GPIO2", "GPIO3", "GPIO4", "GPIO5", "GPIO6", "SPI_CLK", "SPI_MOSI", "SPI_MISO", "UART_TX", "UART_RX", "I2C_SDA", "I2C_SCL", "ADC1", "ADC2", "EN", "BOOT"
- VOLTAGE_REGULATOR / LDO: pins are "IN", "OUT", "GND", "EN", "ADJ"
- BUCK_CONVERTER: pins are "VIN", "GND", "SW", "FB", "EN", "VOUT"
- USB_C_CONNECTOR: pins are "VBUS", "GND", "D+", "D-", "CC1", "CC2", "SBU1", "SBU2"
- USB_A_CONNECTOR: pins are "VBUS", "GND", "D+", "D-"
- HEADER_2PIN: pins are "1", "2"
- HEADER_4PIN: pins are "1", "2", "3", "4"
- CRYSTAL: pins are "1", "2", "GND"
- OPAMP: pins are "IN+", "IN-", "OUT", "V+", "V-"
- RELAY: pins are "COIL+", "COIL-", "NO", "NC", "COM"
- BATTERY / VOLTAGE_SOURCE: pins are "+" and "-"

NET CLASS VALUES: POWER, GROUND, SIGNAL, DIFFERENTIAL, CLOCK, USB, RF

DESIGN PATTERNS — use these exact sequences:

LED BLINK CIRCUIT:
1. define_net(netName:"VCC", netClass:"POWER")
2. define_net(netName:"GND", netClass:"GROUND")  
3. define_net(netName:"GPIO_OUT", netClass:"SIGNAL")
4. create_component(designator:"U1", partType:"MICROCONTROLLER", x:200, y:100, value:"Generic MCU")
5. create_component(designator:"R1", partType:"RESISTOR", x:350, y:100, value:"220")
6. create_component(designator:"D1", partType:"LED", x:450, y:100, value:"RED")
7. connect_net(from:"U1.GPIO1", to:"R1.1", netName:"GPIO_OUT")
8. connect_net(from:"R1.2", to:"D1.anode", netName:"GPIO_OUT")
9. connect_net(from:"D1.cathode", to:"GND", netName:"GND")
10. run_erc()

BUCK CONVERTER (12V→5V):
1. define_net(netName:"VIN_12V", netClass:"POWER")
2. define_net(netName:"VOUT_5V", netClass:"POWER")
3. define_net(netName:"GND", netClass:"GROUND")
4. create_component(designator:"U1", partType:"BUCK_CONVERTER", x:200, y:100, value:"MP2307")
5. create_component(designator:"L1", partType:"INDUCTOR", x:350, y:100, value:"10uH")
6. create_component(designator:"C1", partType:"CAPACITOR", x:100, y:100, value:"100uF")
7. create_component(designator:"C2", partType:"CAPACITOR", x:450, y:100, value:"100uF")
8. create_component(designator:"D1", partType:"DIODE", x:300, y:200, value:"SS34")
9. connect_net(from:"U1.VIN", to:"C1.1", netName:"VIN_12V")
10. connect_net(from:"U1.SW", to:"L1.1", netName:"SW_NODE")
11. connect_net(from:"L1.2", to:"C2.1", netName:"VOUT_5V")
12. connect_net(from:"D1.cathode", to:"U1.SW", netName:"SW_NODE")
13. connect_net(from:"D1.anode", to:"U1.GND", netName:"GND")
14. run_erc()

FLIPPER ZERO CLONE (multi-protocol security tool) — matches the real hardware architecture:
KEY ARCHITECTURE FACTS (use these, do NOT substitute):
- Main MCU: STM32WB55 (dual-core Cortex-M4/M0+, integrated BLE). LQFP/QFN package.
- Sub-GHz radio: TI CC1101 over SPI (shared SPI bus + dedicated CS + GDO0/GDO2 interrupt lines).
- NFC: ST25R3916 over SPI (NOT PN532, NOT I2C). It shares the SPI bus with its own CS + IRQ.
- 125kHz RFID: discrete analog front-end — STM32 PWM drives a MOSFET into the LF antenna; a TSV912 op-amp conditions the received signal back into the STM32 ADC. There is no single "RFID chip".
- Display: ST7567 128x64 monochrome LCD over SPI (shared SPI bus + CS + D/C + RST).
- Power: BQ25895 USB-C charger (I2C) + BQ27441 fuel gauge (I2C) + a 3.3V LDO. I2C bus is for power management, NOT radios.
- Battery: LiPo cell; USB-C input with 5.1k CC resistors.

1. define_net(netName:"VCC_3V3", netClass:"POWER")
2. define_net(netName:"VBAT", netClass:"POWER")
3. define_net(netName:"GND", netClass:"GROUND")
4. define_net(netName:"SPI_SCK", netClass:"SIGNAL")
5. define_net(netName:"SPI_MOSI", netClass:"SIGNAL")
6. define_net(netName:"SPI_MISO", netClass:"SIGNAL")
7. define_net(netName:"I2C_SDA", netClass:"SIGNAL")
8. define_net(netName:"I2C_SCL", netClass:"SIGNAL")
9. create_component(designator:"U1", partType:"STM32", x:250, y:200, value:"STM32WB55CG", pins:["VCC","GND","SPI_SCK","SPI_MOSI","SPI_MISO","CS_SUBGHZ","CS_NFC","CS_LCD","I2C_SDA","I2C_SCL","RFID_PWM","RFID_ADC","LCD_DC","LCD_RST","SWDIO","SWCLK"])
10. create_component(designator:"U2", partType:"RADIO", x:60, y:80, value:"CC1101", pins:["VDD","GND","SCLK","MOSI","MISO","CSn","GDO0","GDO2"])
11. create_component(designator:"U3", partType:"NFC", x:440, y:80, value:"ST25R3916", pins:["VDD","GND","SCLK","MOSI","MISO","CSn","IRQ","TX1"])
12. create_component(designator:"U4", partType:"LDO", x:60, y:360, value:"3.3V_LDO", pins:["IN","GND","OUT"])
13. create_component(designator:"U5", partType:"CHARGER", x:180, y:380, value:"BQ25895", pins:["VBUS","SYS","BAT","GND","SDA","SCL"])
14. create_component(designator:"U6", partType:"FUEL_GAUGE", x:320, y:380, value:"BQ27441", pins:["VDD","GND","SDA","SCL","BAT"])
15. create_component(designator:"U7", partType:"OPAMP", x:540, y:240, value:"TSV912_RFID_AFE", pins:["IN+","IN-","OUT","VCC","GND"])
16. create_component(designator:"Q1", partType:"MOSFET", x:540, y:330, value:"RFID_Driver", pins:["G","D","S"])
17. create_component(designator:"LCD1", partType:"DISPLAY", x:250, y:40, value:"ST7567_128x64", pins:["VDD","GND","SCLK","MOSI","CS","DC","RST"])
18. create_component(designator:"BAT1", partType:"BATTERY", x:60, y:440, value:"2000mAh_LiPo", pins:["+","-"])
19. create_component(designator:"J1", partType:"USB_C_CONNECTOR", x:180, y:480, value:"USB-C", pins:["VBUS","GND","CC1","CC2","DP1","DN1","SBU1","SBU2"])
20. create_component(designator:"SW1", partType:"HEADER_4PIN", x:440, y:440, value:"Button_Matrix")
21. create_component(designator:"C1", partType:"CAPACITOR", x:120, y:200, value:"100nF")
22. create_component(designator:"C2", partType:"CAPACITOR", x:160, y:200, value:"10uF")
23. create_component(designator:"R1", partType:"RESISTOR", x:140, y:480, value:"5.1k")
24. create_component(designator:"R2", partType:"RESISTOR", x:220, y:480, value:"5.1k")
25. connect_net(from:"J1.VBUS", to:"U5.VBUS", netName:"VBUS_5V")
26. connect_net(from:"U5.BAT", to:"BAT1.+", netName:"VBAT")
27. connect_net(from:"U5.SYS", to:"U4.IN", netName:"VSYS")
28. connect_net(from:"U4.OUT", to:"U1.VCC", netName:"VCC_3V3")
29. connect_net(from:"U4.OUT", to:"C1.1", netName:"VCC_3V3")
30. connect_net(from:"BAT1.-", to:"U4.GND", netName:"GND")
31. connect_net(from:"U1.SPI_SCK", to:"U2.SCLK", netName:"SPI_SCK")
32. connect_net(from:"U1.SPI_MOSI", to:"U2.MOSI", netName:"SPI_MOSI")
33. connect_net(from:"U1.SPI_MISO", to:"U2.MISO", netName:"SPI_MISO")
34. connect_net(from:"U1.SPI_SCK", to:"U3.SCLK", netName:"SPI_SCK")
35. connect_net(from:"U1.SPI_MOSI", to:"U3.MOSI", netName:"SPI_MOSI")
36. connect_net(from:"U1.SPI_MISO", to:"U3.MISO", netName:"SPI_MISO")
37. connect_net(from:"U1.SPI_SCK", to:"LCD1.SCLK", netName:"SPI_SCK")
38. connect_net(from:"U1.SPI_MOSI", to:"LCD1.MOSI", netName:"SPI_MOSI")
39. connect_net(from:"U1.I2C_SDA", to:"U5.SDA", netName:"I2C_SDA")
40. connect_net(from:"U1.I2C_SCL", to:"U5.SCL", netName:"I2C_SCL")
41. connect_net(from:"U1.I2C_SDA", to:"U6.SDA", netName:"I2C_SDA")
42. connect_net(from:"U1.I2C_SCL", to:"U6.SCL", netName:"I2C_SCL")
43. connect_net(from:"U1.RFID_PWM", to:"Q1.G", netName:"RFID_DRIVE")
44. connect_net(from:"U7.OUT", to:"U1.RFID_ADC", netName:"RFID_SENSE")
45. connect_net(from:"J1.CC1", to:"R1.1", netName:"CC1")
46. connect_net(from:"J1.CC2", to:"R2.1", netName:"CC2")
47. connect_net(from:"J1.GND", to:"U1.GND", netName:"GND")
48. run_erc()

RESPONSE FORMAT:
- Brief 1-2 sentence explanation of what you're building
- Call ALL tools immediately — do not ask for confirmation before calling tools
- After tools, summarize what was created and net connections made

NEVER say "I would create..." or "I'll add...". Just DO it with tool calls.
NEVER ask "What value resistor?" — pick a sensible default and explain your choice.
NEVER produce zero tool calls for a design request.
NEVER use pin names not listed above (e.g. never use "VDD", "GPIO", "TX", "RX" — use the exact names from the PIN NAMING RULES).`;


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
    const systemInstruction = NOVA_SYSTEM_INSTRUCTION;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
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
