import { Type, FunctionDeclaration } from "@google/genai";

export const createComponentTool: FunctionDeclaration = {
  name: "create_component",
  description: "Creates a new component in the design.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      partType: { type: Type.STRING, description: "The type of component (e.g., 'RESISTOR', 'ESP32', 'USB-C', 'LED')." },
      partNumber: { type: Type.STRING, description: "Optional specific part number from library (e.g. 'RES-10K-0805', 'MP1584EN'). Takes precedence over partType." },
      type: { type: Type.STRING, description: "Alternative for partType." },
      value: { type: Type.STRING, description: "Optional component value (e.g., '10k', '1uF')." },
      designator: { type: Type.STRING, description: "The reference designator (e.g., 'R1', 'U1')." },
      x: { type: Type.NUMBER },
      y: { type: Type.NUMBER },
      pins: { 
        type: Type.ARRAY, 
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            type: { type: Type.STRING }
          }
        },
        description: "Specify pins if not using a library partNumber."
      }
    },
    required: ["designator", "x", "y"]
  }
};

export const connectNetTool: FunctionDeclaration = {
  name: "connect_net",
  description: "Connects two component pins together.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      from: { type: Type.STRING, description: "Source pin (e.g., 'U1.GPIO4')." },
      to: { type: Type.STRING, description: "Target pin (e.g., 'R3.1')." }
    },
    required: ["from", "to"]
  }
};

export const moveComponentTool: FunctionDeclaration = {
  name: "move_component",
  description: "Moves an existing component to new coordinates.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      designator: { type: Type.STRING },
      x: { type: Type.NUMBER },
      y: { type: Type.NUMBER }
    },
    required: ["designator", "x", "y"]
  }
};

export const moveFootprintTool: FunctionDeclaration = {
  name: "move_footprint",
  description: "Moves an existing PCB footprint to new physical board coordinates.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      designator: { type: Type.STRING },
      x: { type: Type.NUMBER, description: "X coordinate in mm." },
      y: { type: Type.NUMBER, description: "Y coordinate in mm." },
      rotation: { type: Type.NUMBER, description: "Rotation in degrees." },
      layer: { type: Type.STRING, description: "Layer, usually 'F.Cu' or 'B.Cu'." },
      isLocked: { type: Type.BOOLEAN }
    },
    required: ["designator", "x", "y"]
  }
};

export const assignLayerTool: FunctionDeclaration = {
  name: "assign_layer",
  description: "Moves a PCB footprint to a specific layer (e.g., F.Cu to B.Cu).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      designator: { type: Type.STRING },
      layer: { type: Type.STRING }
    },
    required: ["designator", "layer"]
  }
};

export const createKeepoutTool: FunctionDeclaration = {
  name: "create_keepout",
  description: "Creates a keepout region on the PCB to restrict routing or placement.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      x: { type: Type.NUMBER },
      y: { type: Type.NUMBER },
      width: { type: Type.NUMBER },
      height: { type: Type.NUMBER },
      layers: { type: Type.ARRAY, items: { type: Type.STRING } },
      restrictions: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["id", "x", "y", "width", "height", "layers", "restrictions"]
  }
};
export const deleteComponentTool: FunctionDeclaration = {
  name: "delete_component",
  description: "Removes a component from the design.",
  parameters: {
    type: Type.OBJECT,
    properties: { designator: { type: Type.STRING } },
    required: ["designator"]
  }
};

export const assignFootprintTool: FunctionDeclaration = {
  name: "assign_footprint",
  description: "Assigns a specific PCB footprint to a component.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      designator: { type: Type.STRING },
      footprint: { type: Type.STRING, description: "Footprint name (e.g., '0603', 'SOT-23-5')." }
    },
    required: ["designator", "footprint"]
  }
};

export const setComponentPropertyTool: FunctionDeclaration = {
  name: "set_property",
  description: "Sets specific electrical properties for a component (Value, Tolerance, Voltage rating).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      designator: { type: Type.STRING },
      property: { type: Type.STRING, description: "Property name (e.g., 'value', 'tolerance')." },
      value: { type: Type.STRING }
    },
    required: ["designator", "property", "value"]
  }
};

export const defineNetTool: FunctionDeclaration = {
  name: "define_net",
  description: "Creates or renames a net in the project and assigns its class.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      netName: { type: Type.STRING, description: "Unique name for the net (e.g., '+5V_ANALOG')." },
      netClass: { type: Type.STRING, enum: ["POWER", "GROUND", "SIGNAL", "DIFFERENTIAL", "DEFAULT"] }
    },
    required: ["netName", "netClass"]
  }
};

export const calculateTraceWidthTool: FunctionDeclaration = {
  name: "calculate_trace_width",
  description: "Calculates the required trace width based on current, temperature rise, and copper thickness (IPC-2221).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      current: { type: Type.NUMBER, description: "Current in Amperes." },
      tempRise: { type: Type.NUMBER, description: "Allowed temperature rise in Celsius (standard is 10C)." },
      thickness: { type: Type.NUMBER, description: "Copper thickness in oz/ft^2 (standard is 1.0)." }
    },
    required: ["current"]
  }
};

export const createSubcircuitTool: FunctionDeclaration = {
  name: "create_subcircuit",
  description: "Deploys a pre-validated functional block (e.g., 'Buck Converter', 'USB-C Interface').",
  parameters: {
    type: Type.OBJECT,
    properties: {
      blockType: { type: Type.STRING, description: "Type of block needed." },
      parameters: { type: Type.OBJECT, description: "Operating specs (e.g. { v_out: 3.3 })." }
    },
    required: ["blockType"]
  }
};

export const searchComponentsTool: FunctionDeclaration = {
  name: "search_components",
  description: "Searches the global library for parts with validated footprints and models.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "Spec/Part number (e.g., 'STM32F103', 'Low ESR Cap 10uF')." }
    },
    required: ["query"]
  }
};

export const runErcTool: FunctionDeclaration = {
  name: "run_erc",
  description: "Runs Electrical Rule Check (pin types, floating nets, power conflicts).",
  parameters: { type: Type.OBJECT, properties: {} }
};

export const runDrcTool: FunctionDeclaration = {
  name: "run_drc",
  description: "Runs Design Rule Check (clearances, trace widths, annular rings).",
  parameters: { type: Type.OBJECT, properties: {} }
};

export const simulateCircuitTool: FunctionDeclaration = {
  name: "run_simulator",
  description: "Runs a SPICE-based simulation on the current circuit fragment.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      duration: { type: Type.STRING },
      targetNet: { type: Type.STRING }
    }
  }
};

export const designReviewTool: FunctionDeclaration = {
  name: "propose_design_review",
  description: "Runs an AI-driven high-level design review of the entire project schematic and layout.",
  parameters: { type: Type.OBJECT, properties: {} }
};

export const generateBomTool: FunctionDeclaration = {
  name: "generate_bom",
  description: "Generates a Bill of Materials for the current project.",
  parameters: { type: Type.OBJECT, properties: {} }
};

export const messageTool: FunctionDeclaration = {
  name: "message",
  description: "Send a textual message or explanation to the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: "The text of the message." }
    },
    required: ["text"]
  }
};

export const allTools = [
  createComponentTool, 
  connectNetTool, 
  moveComponentTool, 
  moveFootprintTool,
  assignLayerTool,
  createKeepoutTool,
  deleteComponentTool,
  assignFootprintTool,
  setComponentPropertyTool,
  defineNetTool,
  calculateTraceWidthTool,
  createSubcircuitTool,
  searchComponentsTool,
  runErcTool,
  runDrcTool,
  simulateCircuitTool,
  designReviewTool,
  generateBomTool,
  messageTool
];
