// ─────────────────────────────────────────────────────────────────────────────
// NovaCircuit Board Templates
//
// Preconfigured PCBBoard objects for common reference designs.
// Each template includes placed vias with correct layer spans for the 4L stackup.
// ─────────────────────────────────────────────────────────────────────────────

import { PCBBoard, PCBVia } from '../../types/pcb';
import { getDefaultStackup, createVia } from '../viaManager';

// ── Via helpers ────────────────────────────────────────────────────────────────

const stackup4L = getDefaultStackup('4L');

/** Through-hole via (F.Cu → B.Cu) */
function throughVia(x: number, y: number, net: string): PCBVia {
  return createVia(x, y, 'F.Cu', 'B.Cu', net, stackup4L, 0.20);
}

/** Blind via (F.Cu → In1.Cu) */
function blindVia(x: number, y: number, net: string): PCBVia {
  return createVia(x, y, 'F.Cu', 'In1.Cu', net, stackup4L, 0.15);
}

/** Buried via (In1.Cu → In2.Cu) */
function buriedVia(x: number, y: number, net: string): PCBVia {
  return createVia(x, y, 'In1.Cu', 'In2.Cu', net, stackup4L, 0.15);
}

/** Micro-via (F.Cu → In1.Cu, laser-drilled) */
function microVia(x: number, y: number, net: string): PCBVia {
  return createVia(x, y, 'F.Cu', 'In1.Cu', net, stackup4L, 0.10);
}

// ── ESP32 IoT Dev Board ────────────────────────────────────────────────────────

const esp32Board: PCBBoard = {
  stackup: stackup4L,
  netClasses: {
    'gnd':          'Power',
    'vcc-3.3v':     'Power',
    'vbus':         'Power',
    'usb-dp':       'USB-Diff',
    'usb-dn':       'USB-Diff',
    'wifi-ant-rf':  'RF',
  },
  components: [
    { id: 'U1',  x: 0,    y: 0,    rotation: 0,   name: 'ESP32-S3-WROOM',   type: 'MCU'       },
    { id: 'U2',  x: -80,  y: 0,    rotation: 0,   name: 'AMS1117-3.3',      type: 'LDO'       },
    { id: 'J1',  x: -120, y: 20,   rotation: 0,   name: 'USB-C-Conn',       type: 'CONNECTOR' },
    { id: 'C1',  x: -60,  y: -20,  rotation: 0,   name: '100nF',            type: 'CAPACITOR' },
    { id: 'C2',  x: -60,  y: -35,  rotation: 0,   name: '10uF',             type: 'CAPACITOR' },
    { id: 'C3',  x: 40,   y: -20,  rotation: 0,   name: '100nF',            type: 'CAPACITOR' },
    { id: 'C4',  x: 40,   y: -35,  rotation: 0,   name: '100nF',            type: 'CAPACITOR' },
    { id: 'R1',  x: 80,   y: 20,   rotation: 90,  name: '10k',              type: 'RESISTOR'  },
    { id: 'R2',  x: 80,   y: 35,   rotation: 90,  name: '10k',              type: 'RESISTOR'  },
    { id: 'Y1',  x: 60,   y: -60,  rotation: 0,   name: '40MHz-XTAL',       type: 'OSCILLATOR' },
    { id: 'ANT', x: 30,   y: 60,   rotation: 0,   name: 'IFA-2.4GHz',       type: 'RF_ANTENNA' },
  ],
  traces: [
    // Power traces (wider, Power net class)
    { id: 'tr-1',  startX: -120, startY: 20,  endX: -80, endY: 0,   width: 0.40, netId: 'vbus',      layer: 'F.Cu' },
    { id: 'tr-2',  startX: -80,  startY: 0,   endX: 0,   endY: 0,   width: 0.40, netId: 'vcc-3.3v',  layer: 'F.Cu' },
    { id: 'tr-3',  startX: -60,  startY: -20, endX: -60, endY: 0,   width: 0.25, netId: 'vcc-3.3v',  layer: 'F.Cu' },
    { id: 'tr-4',  startX: -60,  startY: -35, endX: -60, endY: -20, width: 0.25, netId: 'vcc-3.3v',  layer: 'F.Cu' },
    // GND pours (simplified as traces)
    { id: 'tr-5',  startX: -120, startY: 20,  endX: -120, endY: -40, width: 0.40, netId: 'gnd',       layer: 'F.Cu' },
    { id: 'tr-6',  startX: -80,  startY: -40, endX: 0,   endY: -40, width: 0.40, netId: 'gnd',       layer: 'In1.Cu' },
    // USB differential pair (90Ω impedance, 0.18mm width)
    { id: 'tr-7',  startX: -120, startY: 18,  endX: -20, endY: 18,  width: 0.18, netId: 'usb-dp',    layer: 'F.Cu' },
    { id: 'tr-8',  startX: -120, startY: 22,  endX: -20, endY: 22,  width: 0.18, netId: 'usb-dn',    layer: 'F.Cu' },
    // RF trace (50Ω, 0.32mm width)
    { id: 'tr-9',  startX: 0,    startY: 0,   endX: 30,  endY: 60,  width: 0.32, netId: 'wifi-ant-rf', layer: 'F.Cu' },
    // XTAL oscillator
    { id: 'tr-10', startX: 0,    startY: 0,   endX: 60,  endY: -60, width: 0.15, netId: 'xtal-xi',   layer: 'F.Cu' },
    // Decoupling cap connections
    { id: 'tr-11', startX: 40,   startY: -20, endX: 0,   endY: -10, width: 0.20, netId: 'vcc-3.3v',  layer: 'F.Cu' },
    { id: 'tr-12', startX: 40,   startY: -35, endX: 40,  endY: -20, width: 0.20, netId: 'gnd',       layer: 'F.Cu' },
  ],
  ratnest: [
    { id: 'rn-1', startX: -80, startY: 0,  endX: -60, endY: -20, netId: 'vcc-3.3v' },
    { id: 'rn-2', startX: 0,   startY: 0,  endX: 40,  endY: -20, netId: 'vcc-3.3v' },
  ],
  vias: [
    // Through vias for power/GND stitching
    throughVia(-80, -10, 'gnd'),
    throughVia(-40, -10, 'gnd'),
    throughVia(20,  -10, 'gnd'),
    throughVia(60,  -10, 'gnd'),
    throughVia(-80,  10, 'vcc-3.3v'),
    // Blind vias for USB signal escape routing
    blindVia(-50, 18, 'usb-dp'),
    blindVia(-50, 22, 'usb-dn'),
    // Micro-vias for MCU signal fanout (HDI)
    microVia(10, 10, 'spi-clk'),
    microVia(10, 20, 'spi-mosi'),
    // Buried via for inner-layer power distribution
    buriedVia(0, -30, 'vcc-3.3v'),
    buriedVia(20, -30, 'gnd'),
  ],
};

// ── STM32 Analog Front-End ────────────────────────────────────────────────────

const stm32Board: PCBBoard = {
  stackup: stackup4L,
  netClasses: {
    'gnd':      'Power',
    'vcc-3.3v': 'Power',
    'vcc-1.8v': 'Power',
    'ain0':     'High-Speed',
    'ain1':     'High-Speed',
    'spi-clk':  'High-Speed',
    'spi-mosi': 'High-Speed',
  },
  components: [
    { id: 'U1', x: 0,    y: 0,    rotation: 0,  name: 'STM32F4',      type: 'MCU'        },
    { id: 'U2', x: -80,  y: 0,    rotation: 0,  name: 'ADS1256',      type: 'ADC'        },
    { id: 'U3', x: 80,   y: 0,    rotation: 0,  name: 'OPA2134',      type: 'OP-AMP'     },
    { id: 'U4', x: -80,  y: 60,   rotation: 0,  name: 'REF5025',      type: 'VOLTAGE_REF'},
    { id: 'J1', x: -120, y: 0,    rotation: 0,  name: 'BNC-J1',       type: 'CONNECTOR'  },
    { id: 'J2', x: -120, y: 30,   rotation: 0,  name: 'BNC-J2',       type: 'CONNECTOR'  },
    { id: 'C1', x: -40,  y: -30,  rotation: 0,  name: '100nF',        type: 'CAPACITOR'  },
    { id: 'C2', x: -40,  y: -45,  rotation: 0,  name: '10uF',         type: 'CAPACITOR'  },
    { id: 'C3', x: 40,   y: -30,  rotation: 0,  name: '100nF',        type: 'CAPACITOR'  },
    { id: 'R1', x: -10,  y: -60,  rotation: 0,  name: '100R',         type: 'RESISTOR'   },
    { id: 'R2', x: 10,   y: -60,  rotation: 0,  name: '100R',         type: 'RESISTOR'   },
  ],
  traces: [
    { id: 'tr-1', startX: -120, startY: 0,  endX: -80, endY: 0,  width: 0.25, netId: 'ain0',     layer: 'F.Cu'    },
    { id: 'tr-2', startX: -120, startY: 30, endX: -80, endY: 30, width: 0.25, netId: 'ain1',     layer: 'F.Cu'    },
    { id: 'tr-3', startX: -80,  startY: 0,  endX: 0,   endY: 0,  width: 0.15, netId: 'spi-clk', layer: 'F.Cu'    },
    { id: 'tr-4', startX: 0,    startY: 0,  endX: 80,  endY: 0,  width: 0.15, netId: 'spi-mosi',layer: 'F.Cu'    },
    { id: 'tr-5', startX: -80,  startY: -20,endX: 80,  endY: -20,width: 0.40, netId: 'gnd',      layer: 'In1.Cu' },
    { id: 'tr-6', startX: -80,  startY: -30,endX: 80,  endY: -30,width: 0.40, netId: 'vcc-3.3v', layer: 'F.Cu'   },
  ],
  ratnest: [
    { id: 'rn-1', startX: -80, startY: 60, endX: -80, endY: 0, netId: 'vcc-3.3v' },
    { id: 'rn-2', startX: 0,   startY: 0,  endX: 80,  endY: 0, netId: 'vcc-1.8v' },
  ],
  vias: [
    throughVia(-40, -20, 'gnd'),
    throughVia(40, -20, 'gnd'),
    throughVia(0, -20, 'vcc-3.3v'),
    blindVia(-60, 0, 'ain0'),
    blindVia(-60, 30, 'ain1'),
    microVia(-10, -10, 'spi-clk'),
    microVia(10, -10, 'spi-mosi'),
    buriedVia(0, -40, 'vcc-1.8v'),
  ],
};

// ── USB-PD 65W Buck Regulator ─────────────────────────────────────────────────

const buckBoard: PCBBoard = {
  stackup: stackup4L,
  netClasses: {
    'gnd':    'Power',
    'vbus':   'Power',
    'vout':   'Power',
    'sw-node':'Power',
    'gate-hi':'High-Speed',
    'gate-lo':'High-Speed',
  },
  components: [
    { id: 'U1', x: 0,    y: 0,   rotation: 0,  name: 'UCC27714',    type: 'IC'        },
    { id: 'Q1', x: 60,   y: 0,   rotation: 0,  name: 'CSD19532Q5B', type: 'MOSFET'    },
    { id: 'Q2', x: 60,   y: 40,  rotation: 0,  name: 'CSD19532Q5B', type: 'MOSFET'    },
    { id: 'L1', x: 120,  y: 20,  rotation: 0,  name: '4.7uH-10A',   type: 'INDUCTOR'  },
    { id: 'C1', x: -60,  y: -10, rotation: 0,  name: '100uF/100V',  type: 'CAPACITOR' },
    { id: 'C2', x: 160,  y: 20,  rotation: 0,  name: '220uF/16V',   type: 'CAPACITOR' },
    { id: 'J1', x: -100, y: 0,   rotation: 0,  name: 'USB-C-PD',    type: 'CONNECTOR' },
    { id: 'J2', x: 200,  y: 20,  rotation: 0,  name: 'DC-JACK-OUT', type: 'CONNECTOR' },
    { id: 'R1', x: 0,    y: -40, rotation: 0,  name: '10R-Snub',    type: 'RESISTOR'  },
    { id: 'C3', x: 20,   y: -40, rotation: 0,  name: '1nF-Snub',    type: 'CAPACITOR' },
  ],
  traces: [
    { id: 'tr-1', startX: -100, startY: 0,  endX: -60, endY: -10, width: 1.00, netId: 'vbus',     layer: 'F.Cu'    },
    { id: 'tr-2', startX: -60,  startY: -10,endX: 60,  endY: 0,   width: 1.00, netId: 'vbus',     layer: 'F.Cu'    },
    { id: 'tr-3', startX: 60,   startY: 40, endX: 120, endY: 20,  width: 1.20, netId: 'sw-node',  layer: 'F.Cu'    },
    { id: 'tr-4', startX: 120,  startY: 20, endX: 160, endY: 20,  width: 1.20, netId: 'vout',     layer: 'F.Cu'    },
    { id: 'tr-5', startX: 160,  startY: 20, endX: 200, endY: 20,  width: 1.20, netId: 'vout',     layer: 'F.Cu'    },
    { id: 'tr-6', startX: -100, startY: 10, endX: 200, endY: 10,  width: 1.00, netId: 'gnd',      layer: 'In1.Cu'  },
    { id: 'tr-7', startX: 0,    startY: 0,  endX: 60,  endY: 0,   width: 0.30, netId: 'gate-hi',  layer: 'F.Cu'    },
    { id: 'tr-8', startX: 0,    startY: 0,  endX: 60,  endY: 40,  width: 0.30, netId: 'gate-lo',  layer: 'F.Cu'    },
  ],
  ratnest: [
    { id: 'rn-1', startX: -60, startY: -10, endX: 0, endY: -40,  netId: 'gnd' },
    { id: 'rn-2', startX: 160, startY: 20,  endX: 160, endY: 10, netId: 'gnd' },
  ],
  vias: [
    // Heavy GND stitching with through vias
    throughVia(-80,  10, 'gnd'),
    throughVia(-60,  10, 'gnd'),
    throughVia(0,   -10, 'gnd'),
    throughVia(60,  -10, 'gnd'),
    throughVia(120,  10, 'gnd'),
    throughVia(160,  10, 'gnd'),
    // Gate driver signal via (blind for signal integrity)
    blindVia(30, 0,  'gate-hi'),
    blindVia(30, 40, 'gate-lo'),
    // VBUS input cap via
    throughVia(-60, -10, 'vbus'),
    // Buried via for snubber loop
    buriedVia(10, -40, 'sw-node'),
  ],
};

// ── Template Registry ─────────────────────────────────────────────────────────

export type TemplateName = 'esp32' | 'stm32-afe' | 'usb-pd-buck';

export const TEMPLATES: Record<TemplateName, PCBBoard> = {
  'esp32':       esp32Board,
  'stm32-afe':   stm32Board,
  'usb-pd-buck': buckBoard,
};

export function getTemplate(name: TemplateName): PCBBoard {
  return JSON.parse(JSON.stringify(TEMPLATES[name])) as PCBBoard;
}
