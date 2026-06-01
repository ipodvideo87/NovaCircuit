import { PCBBoard } from '../../types/pcb';

export interface ProjectTemplate {
  name: string;
  description: string;
  board: PCBBoard;
}

export const TEMPLATES: Record<string, ProjectTemplate> = {
  esp32: {
    name: "ESP32 IoT Dev Board",
    description: "Compact dual-core MCU, matching trace layouts for 2.4GHz Wi-Fi/Bluetooth antenna, and LDO voltage regulators.",
    board: {
      components: [
        { id: "U1", x: 400, y: 300, rotation: 0, name: "ESP32-S3-WROOM", type: "MCU" },
        { id: "U2", x: 250, y: 220, rotation: 90, name: "AMS1117-3.3V", type: "LDO" },
        { id: "J1", x: 150, y: 220, rotation: 270, name: "USB-C Female", type: "CONNECTOR" },
        { id: "C1", x: 210, y: 180, rotation: 0, name: "10uF Decouple", type: "CAPACITOR" },
        { id: "C2", x: 290, y: 180, rotation: 0, name: "22uF Output", type: "CAPACITOR" },
        { id: "R1", x: 350, y: 240, rotation: 90, name: "10k EN Pullup", type: "RESISTOR" },
        { id: "R2", x: 350, y: 260, rotation: 90, name: "10k Boot strap", type: "RESISTOR" },
        { id: "Y1", x: 480, y: 380, rotation: 0, name: "40MHz XTAL", type: "OSCILLATOR" },
        { id: "ANT1", x: 500, y: 180, rotation: 180, name: "Inverted-F Antenna", type: "RF_ANTENNA" }
      ],
      traces: [
        // USB VBUS to AMS1117 Input
        { id: "trace-pwr-1", startX: 150, startY: 220, endX: 210, endY: 180, width: 0.6, netId: "vcc-5v" },
        { id: "trace-pwr-2", startX: 210, startY: 180, endX: 250, endY: 220, width: 0.6, netId: "vcc-5v" },
        // AMS1117 Output to Decoupling C2
        { id: "trace-pwr-3", startX: 250, startY: 220, endX: 290, endY: 180, width: 0.6, netId: "vcc-3.3v" },
        { id: "trace-pwr-4", startX: 290, startY: 180, endX: 400, endY: 300, width: 0.5, netId: "vcc-3.3v" },
        // USB D+/D- lines with 90 ohm differential mapping
        { id: "trace-diff-p", startX: 150, startY: 215, endX: 400, endY: 295, width: 0.18, netId: "usb-dp" },
        { id: "trace-diff-n", startX: 150, startY: 225, endX: 400, endY: 305, width: 0.18, netId: "usb-dn" },
        // RF trace from MCU base to Antenna (Impedance controlled 50 ohm microstrip)
        { id: "trace-rf-path", startX: 400, startY: 300, endX: 500, endY: 180, width: 0.32, netId: "wifi-ant-rf" }
      ],
      ratnest: [
        { id: "rat-gnd-1", startX: 150, startY: 210, endX: 250, endY: 210, netId: "gnd" },
        { id: "rat-gnd-2", startX: 250, startY: 210, endX: 400, endY: 320, netId: "gnd" },
        { id: "rat-en", startX: 350, startY: 240, endX: 400, endY: 290, netId: "en" }
      ]
    }
  },
  powerDelivery: {
    name: "USB-PD 65W Buck-Boost Converter",
    description: "Multi-phase power supply containing high power switching MOSFETs, controller IC, input/output filter arrays, and heavy copper pours.",
    board: {
      components: [
        { id: "U1", x: 400, y: 300, rotation: 0, name: "MAX77958 PD Controller", type: "IC" },
        { id: "Q1", x: 280, y: 220, rotation: 0, name: "DirectFET HS Switching MOSFET", type: "MOSFET" },
        { id: "Q2", x: 280, y: 380, rotation: 0, name: "DirectFET LS Switching MOSFET", type: "MOSFET" },
        { id: "L1", x: 380, y: 300, rotation: 90, name: "6.8uH Power Inductor", type: "INDUCTOR" },
        { id: "C_IN1", x: 180, y: 250, rotation: 0, name: "100uF Solid Alum Cap", type: "CAPACITOR" },
        { id: "C_OUT1", x: 480, y: 300, rotation: 90, name: "220uF Ultra-low ESR", type: "CAPACITOR" },
        { id: "TB1", x: 580, y: 300, rotation: 0, name: "High-Amperage Terminal Block", type: "CONNECTOR" }
      ],
      traces: [
        // Heavy high current traces (high width for thermal/amperage)
        { id: "trace-pwr-input", startX: 180, startY: 250, endX: 280, endY: 220, width: 1.25, netId: "v_in" },
        { id: "trace-switch-node-1", startX: 280, startY: 220, endX: 380, endY: 300, width: 1.5, netId: "v_switch" },
        { id: "trace-switch-node-2", startX: 280, startY: 380, endX: 380, endY: 300, width: 1.5, netId: "v_switch" },
        { id: "trace-output-path", startX: 380, startY: 300, endX: 480, endY: 300, width: 1.25, netId: "v_out" },
        { id: "trace-term-path", startX: 480, startY: 300, endX: 580, endY: 300, width: 1.25, netId: "v_out" }
      ],
      ratnest: [
        { id: "rat-fb", startX: 480, startY: 290, endX: 400, endY: 290, netId: "feedback" },
        { id: "rat-gate-h", startX: 400, startY: 310, endX: 280, endY: 230, netId: "gate_high" },
        { id: "rat-gate-l", startX: 400, startY: 320, endX: 280, endY: 370, netId: "gate_low" }
      ]
    }
  },
  stm32: {
    name: "STM32 Analog Front-End System",
    description: "Designed for high-precision 24-bit ADC reference, operational amplifier signal conditioning arrays, and separate analog/digital grounding planes.",
    board: {
      components: [
        { id: "U1", x: 400, y: 300, rotation: 0, name: "STM32H7 MCU Core", type: "MCU" },
        { id: "U2", x: 260, y: 220, rotation: 180, name: "ADS1262 24-Bit Precision ADC", type: "ADC" },
        { id: "U3", x: 180, y: 160, rotation: 0, name: "OPA350 Low Noise Buffer", type: "OP-AMP" },
        { id: "REF1", x: 180, y: 280, rotation: 90, name: "REF5025 High Accuracy Reference", type: "VOLTAGE_REF" },
        { id: "J1", x: 100, y: 160, rotation: 270, name: "BNC Signal Input", type: "CONNECTOR" },
      ],
      traces: [
        // Analog Signal path
        { id: "trace-sig-in", startX: 100, startY: 160, endX: 180, endY: 160, width: 0.25, netId: "analog_input" },
        { id: "trace-sig-buffered", startX: 180, startY: 160, endX: 260, endY: 220, width: 0.25, netId: "analog_filtered" },
        // Voltage reference
        { id: "trace-vref", startX: 180, startY: 280, endX: 260, endY: 220, width: 0.4, netId: "vref" },
        // High speed analog/digital spi lines with serpentines
        { id: "trace-spi-sck", startX: 260, startY: 220, endX: 400, endY: 300, width: 0.2, netId: "spi_sck" },
        { id: "trace-spi-miso", startX: 260, startY: 225, endX: 400, endY: 305, width: 0.2, netId: "spi_miso" }
      ],
      ratnest: [
        { id: "rat-spi-cs", startX: 260, startY: 215, endX: 400, endY: 295, netId: "spi_cs" },
        { id: "rat-spi-mosi", startX: 260, startY: 230, endX: 400, endY: 310, netId: "spi_mosi" }
      ]
    }
  }
};
