/**
 * Netlist Engine
 *
 * Provides:
 *  - Pin definitions per component type
 *  - Logical net name resolution (GND normalization, template-specific rules)
 */

// ─── Pin Definitions ──────────────────────────────────────────────────────────

export interface Pin {
  name: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  x: number;   // Relative to component origin in canvas units
  y: number;
}

const PIN_DEFS: Record<string, Pin[]> = {
  MCU: [
    { name: 'VCC',    side: 'left',  x: -20, y: -12 },
    { name: 'GND',    side: 'left',  x: -20, y: -4  },
    { name: 'EN',     side: 'left',  x: -20, y:  4  },
    { name: 'BOOT',   side: 'left',  x: -20, y:  12 },
    { name: 'RXD',    side: 'right', x:  20, y: -12 },
    { name: 'TXD',    side: 'right', x:  20, y: -4  },
    { name: 'RF_OUT', side: 'right', x:  20, y:  4  },
    { name: 'GPIO',   side: 'right', x:  20, y:  12 },
  ],
  CONNECTOR: [
    { name: 'VBUS', side: 'right', x:  10, y: -10 },
    { name: 'DP',   side: 'right', x:  10, y:   0 },
    { name: 'DN',   side: 'right', x:  10, y:  10 },
    { name: 'GND',  side: 'left',  x: -10, y:   0 },
  ],
  LDO: [
    { name: 'IN',  side: 'left',   x: -8, y:  0 },
    { name: 'GND', side: 'bottom', x:  0, y:  6 },
    { name: 'OUT', side: 'right',  x:  8, y:  0 },
  ],
  VOLTAGE_REF: [
    { name: 'IN',  side: 'left',   x: -8, y:  0 },
    { name: 'GND', side: 'bottom', x:  0, y:  6 },
    { name: 'OUT', side: 'right',  x:  8, y:  0 },
  ],
  'OP-AMP': [
    { name: 'IN+', side: 'left',   x: -10, y: -5 },
    { name: 'IN-', side: 'left',   x: -10, y:  5 },
    { name: 'OUT', side: 'right',  x:  10, y:  0 },
    { name: 'VCC', side: 'top',    x:   0, y: -8 },
    { name: 'GND', side: 'bottom', x:   0, y:  8 },
  ],
  ADC: [
    { name: 'IN+', side: 'left',   x: -12, y: -5 },
    { name: 'IN-', side: 'left',   x: -12, y:  5 },
    { name: 'OUT', side: 'right',  x:  12, y:  0 },
    { name: 'VCC', side: 'top',    x:   0, y: -9 },
    { name: 'GND', side: 'bottom', x:   0, y:  9 },
  ],
  MOSFET: [
    { name: 'GATE',   side: 'left',  x: -6, y:  0 },
    { name: 'DRAIN',  side: 'top',   x:  0, y: -7 },
    { name: 'SOURCE', side: 'bottom',x:  0, y:  7 },
  ],
};

// Two-pin passives
const TWO_PIN_TYPES = ['CAPACITOR', 'RESISTOR', 'INDUCTOR', 'OSCILLATOR', 'CAP', 'RES'];
TWO_PIN_TYPES.forEach(t => {
  PIN_DEFS[t] = [
    { name: '1', side: 'left',  x: -5, y: 0 },
    { name: '2', side: 'right', x:  5, y: 0 },
  ];
});

export function getPinsForType(type: string): Pin[] {
  return PIN_DEFS[type] ?? PIN_DEFS['IC'] ?? [
    { name: '1', side: 'left',  x: -10, y: -5 },
    { name: '2', side: 'left',  x: -10, y:  5 },
    { name: '3', side: 'right', x:  10, y: -5 },
    { name: '4', side: 'right', x:  10, y:  5 },
  ];
}

// ─── Net Resolution ───────────────────────────────────────────────────────────

/** Ground net aliases — all map to canonical 'gnd' */
const GND_ALIASES = new Set(['gnd', 'gnd1', 'gnd2', 'vss', 'agnd', 'dgnd', 'pgnd']);

/**
 * Resolve the logical net name for a given component pin.
 * Normalises GND variants, applies template-specific overrides.
 */
export function getLogicalNetForPin(
  compId: string,
  compName: string,
  compType: string,
  pinName: string,
): string {
  const pinLower = pinName.toLowerCase();
  const nameLower = compName.toLowerCase();

  // Always normalise ground
  if (GND_ALIASES.has(pinLower)) return 'gnd';

  // Power pins
  if (pinLower === 'vcc' || pinLower === 'vdd') {
    // Derive from component context
    if (nameLower.includes('3.3') || nameLower.includes('3v3')) return 'vcc-3.3v';
    if (nameLower.includes('5v')) return 'vcc-5v';
    if (nameLower.includes('1.8')) return 'vcc-1.8v';
    return 'vcc-3.3v';
  }

  if (pinLower === 'vbus') return 'vbus';

  // USB differential pair
  if (pinLower === 'dp' || pinLower === 'd+') return 'usb-dp';
  if (pinLower === 'dn' || pinLower === 'd-') return 'usb-dn';

  // RF output
  if (pinLower === 'rf_out' || pinLower === 'ant') return 'wifi-ant-rf';

  // Template-specific: ESP32
  if (nameLower.includes('esp32')) {
    if (pinLower === 'en') return 'esp32-en';
    if (pinLower === 'boot') return 'esp32-boot';
    if (pinLower === 'txd') return 'uart-tx';
    if (pinLower === 'rxd') return 'uart-rx';
  }

  // Generic: combine compId + pinName
  return `${compId}-${pinName.toLowerCase()}`;
}
