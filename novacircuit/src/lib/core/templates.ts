/**
 * Preconfigured Board Templates
 *
 * Each template returns a fully populated PCBBoard with:
 *  - Placed components at realistic positions
 *  - Routed power/ground and signal traces
 *  - RF trace at 50Ω (0.32 mm width on FR-4)
 *  - USB differential pair at 90Ω (0.18 mm width)
 */

import type { PCBBoard } from '../../types/pcb';

// ─── ESP32 IoT Dev Board ──────────────────────────────────────────────────────

export function createESP32Template(): PCBBoard {
  return {
    components: [
      { id: 'U1',  x:   0,   y:   0, rotation: 0, name: 'ESP32-S3-WROOM',  type: 'MCU'        },
      { id: 'U2',  x: -80,   y:  20, rotation: 0, name: 'AMS1117-3.3V',    type: 'LDO'        },
      { id: 'J1',  x:   0,   y: -80, rotation: 0, name: 'USB-C Connector', type: 'CONNECTOR'  },
      { id: 'C1',  x: -60,   y:  20, rotation: 0, name: '10uF Decoupling', type: 'CAPACITOR'  },
      { id: 'C2',  x: -40,   y:  20, rotation: 0, name: '100nF Decoupling',type: 'CAPACITOR'  },
      { id: 'C3',  x:  20,   y: -20, rotation: 0, name: '100nF Bypass',    type: 'CAPACITOR'  },
      { id: 'C4',  x:  20,   y:  20, rotation: 0, name: '100nF Bypass',    type: 'CAPACITOR'  },
      { id: 'R1',  x: -30,   y: -40, rotation: 0, name: '10k Pullup EN',   type: 'RESISTOR'   },
      { id: 'R2',  x: -10,   y: -40, rotation: 0, name: '10k Pullup BOOT', type: 'RESISTOR'   },
      { id: 'Y1',  x:  60,   y:   0, rotation: 0, name: '40MHz XTAL',      type: 'OSCILLATOR' },
      { id: 'ANT1',x:  90,   y:   0, rotation: 0, name: 'Inverted-F 2.4G', type: 'RF_ANTENNA' },
    ],
    traces: [
      // Power: VBUS → LDO IN
      { id: 'T1', startX: 0, startY: -80, endX: -80, endY: 20, width: 0.5,  netId: 'vbus'       },
      // Power: LDO OUT → VCC rail
      { id: 'T2', startX: -80, startY: 20, endX: 0, endY: 0,  width: 0.5,  netId: 'vcc-3.3v'   },
      // GND
      { id: 'T3', startX: 0, startY: 0, endX: -80, endY: 20,  width: 0.5,  netId: 'gnd'         },
      // USB D+/D− differential pair (90Ω, 0.18 mm)
      { id: 'T4', startX: 0, startY: -80, endX: -20, endY: -80, width: 0.18, netId: 'usb-dp'    },
      { id: 'T5', startX: 0, startY: -80, endX: -20, endY: -72, width: 0.18, netId: 'usb-dn'    },
      // RF trace 50Ω (0.32 mm) — MCU RF_OUT → antenna
      { id: 'T6', startX: 20, startY: 0, endX: 90, endY: 0,    width: 0.32, netId: 'wifi-ant-rf'},
      // Decoupling cap connections
      { id: 'T7', startX: -60, startY: 20, endX: -40, endY: 20, width: 0.3, netId: 'vcc-3.3v'  },
      { id: 'T8', startX: -40, startY: 20, endX: 0,   endY: 0,  width: 0.3, netId: 'vcc-3.3v'  },
    ],
    ratnest: [],
  };
}

// ─── STM32 Analog Front-End ───────────────────────────────────────────────────

export function createSTM32AFETemplate(): PCBBoard {
  return {
    components: [
      { id: 'U1', x:   0, y:   0, rotation: 0, name: 'STM32F407',     type: 'MCU'        },
      { id: 'U2', x: -60, y: -20, rotation: 0, name: 'ADA4528 Op-Amp',type: 'OP-AMP'     },
      { id: 'U3', x:  60, y: -20, rotation: 0, name: 'ADS1256 ADC',   type: 'ADC'        },
      { id: 'U4', x: -60, y:  30, rotation: 0, name: 'REF5025 Vref',  type: 'VOLTAGE_REF'},
      { id: 'C1', x: -40, y:   0, rotation: 0, name: '100nF Decoup',  type: 'CAPACITOR'  },
      { id: 'C2', x:  40, y:   0, rotation: 0, name: '100nF Decoup',  type: 'CAPACITOR'  },
      { id: 'C3', x: -80, y:  30, rotation: 0, name: '10uF Bypass',   type: 'CAPACITOR'  },
      { id: 'R1', x: -20, y: -40, rotation: 0, name: '1k Input R',    type: 'RESISTOR'   },
      { id: 'R2', x:  20, y: -40, rotation: 0, name: '100R Filter',   type: 'RESISTOR'   },
    ],
    traces: [
      { id: 'T1', startX: -60, startY: -20, endX:   0, endY:  0, width: 0.25, netId: 'vcc-3.3v' },
      { id: 'T2', startX:  60, startY: -20, endX:   0, endY:  0, width: 0.25, netId: 'vcc-3.3v' },
      { id: 'T3', startX:   0, startY:   0, endX: -60, endY: 30, width: 0.25, netId: 'gnd'      },
      { id: 'T4', startX: -60, startY: -20, endX:  60, endY:-20, width: 0.18, netId: 'afe-sig'  },
    ],
    ratnest: [
      { id: 'RN1', startX: -20, startY: -40, endX: -60, endY: -20, netId: 'afe-in' },
      { id: 'RN2', startX:  20, startY: -40, endX:  60, endY: -20, netId: 'afe-out'},
    ],
  };
}

// ─── USB-PD 65W Buck Regulator ────────────────────────────────────────────────

export function createUSBPDBuckTemplate(): PCBBoard {
  return {
    components: [
      { id: 'U1',  x:   0, y:   0, rotation: 0, name: 'FUSB302 PD Ctrl',  type: 'IC'         },
      { id: 'U2',  x:  60, y:   0, rotation: 0, name: 'LM5140 Buck Ctrl', type: 'IC'         },
      { id: 'Q1',  x:  60, y: -40, rotation: 0, name: 'CSD19531Q5A NFET', type: 'MOSFET'     },
      { id: 'Q2',  x:  80, y: -40, rotation: 0, name: 'CSD19531Q5A NFET', type: 'MOSFET'     },
      { id: 'J1',  x: -60, y:   0, rotation: 0, name: 'USB-C PD Port',    type: 'CONNECTOR'  },
      { id: 'C1',  x:  20, y:  20, rotation: 0, name: '100uF Bulk',       type: 'CAPACITOR'  },
      { id: 'C2',  x:  40, y:  20, rotation: 0, name: '47uF Bulk',        type: 'CAPACITOR'  },
      { id: 'C3',  x: -20, y:  20, rotation: 0, name: '100nF Bypass',     type: 'CAPACITOR'  },
    ],
    traces: [
      { id: 'T1', startX: -60, startY: 0, endX:   0, endY:  0, width: 1.0,  netId: 'vbus'     },
      { id: 'T2', startX:   0, startY: 0, endX:  60, endY:  0, width: 0.5,  netId: 'vcc-5v'   },
      { id: 'T3', startX:  60, startY: 0, endX:  60, endY:-40, width: 0.5,  netId: 'sw-node'  },
      { id: 'T4', startX:   0, startY: 0, endX:  20, endY: 20, width: 0.5,  netId: 'gnd'      },
    ],
    ratnest: [],
  };
}

// ─── Template Registry ────────────────────────────────────────────────────────

export type TemplateName = 'esp32' | 'stm32-afe' | 'usb-pd-buck';

export function loadTemplate(name: TemplateName): PCBBoard {
  switch (name) {
    case 'esp32':       return createESP32Template();
    case 'stm32-afe':   return createSTM32AFETemplate();
    case 'usb-pd-buck': return createUSBPDBuckTemplate();
  }
}
