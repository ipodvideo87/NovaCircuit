import { PCBBoard, PCBComponent } from '../../types/pcb';

export interface Pin {
  name: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  offset: number; // position offset from center
}

// Map component types to standard pin arrays
export const getPinsForType = (type: string): Pin[] => {
  const t = type.toUpperCase();
  if (t === 'MCU') {
    return [
      { name: 'VCC', side: 'left', offset: -20 },
      { name: 'GND', side: 'left', offset: 20 },
      { name: 'EN', side: 'left', offset: -10 },
      { name: 'BOOT', side: 'left', offset: 0 },
      { name: 'RXD', side: 'right', offset: -10 },
      { name: 'TXD', side: 'right', offset: 0 },
      { name: 'RF_OUT', side: 'right', offset: -20 },
      { name: 'GPIO', side: 'right', offset: 10 },
    ];
  }
  if (t === 'CONNECTOR') {
    return [
      { name: 'VBUS', side: 'right', offset: -10 },
      { name: 'DP', side: 'right', offset: 0 },
      { name: 'DN', side: 'right', offset: 10 },
      { name: 'GND', side: 'left', offset: 10 },
    ];
  }
  if (t === 'LDO' || t === 'VOLTAGE_REF') {
    return [
      { name: 'IN', side: 'left', offset: -10 },
      { name: 'GND', side: 'bottom', offset: 0 },
      { name: 'OUT', side: 'right', offset: -10 },
    ];
  }
  if (t === 'OP-AMP' || t === 'ADC') {
    return [
      { name: 'IN+', side: 'left', offset: -10 },
      { name: 'IN-', side: 'left', offset: 10 },
      { name: 'OUT', side: 'right', offset: 0 },
      { name: 'VCC', side: 'top', offset: 0 },
      { name: 'GND', side: 'bottom', offset: 0 },
    ];
  }
  if (t === 'MOSFET') {
    return [
      { name: 'GATE', side: 'left', offset: 10 },
      { name: 'DRAIN', side: 'top', offset: 0 },
      { name: 'SOURCE', side: 'bottom', offset: 0 },
    ];
  }
  
  // 2-pin passives (Capacitors, Resistors, Inductors, Oscillators)
  return [
    { name: '1', side: 'left', offset: 0 },
    { name: '2', side: 'right', offset: 0 },
  ];
};

// Logical net solver mapping for template parts and generic components
export function getLogicalNetForPin(compId: string, compName: string, compType: string, pinName: string): string {
  const cName = compName.toLowerCase();
  const cType = compType.toUpperCase();
  const pName = pinName.toLowerCase();

  // Unified global Ground naming rule
  if (pName === 'gnd' || pName === 'gnd1' || pName === 'gnd2') {
    return 'gnd';
  }

  // 1. ESP32 Dev Board template
  if (cName.includes('esp32') || compId === 'U1') {
    if (pName === 'vcc' || pName === '3.3v') return 'vcc-3.3v';
    if (pName === 'en') return 'en';
    if (pName === 'boot' || pName === 'gpio0' || pName === 'boot strap') return 'boot';
    if (pName === 'rf_out' || pName === 'ant' || pName === 'rf') return 'wifi-ant-rf';
    if (pName === 'rxd' || pName === 'dp') return 'usb-dp';
    if (pName === 'txd' || pName === 'dn') return 'usb-dn';
    return `net-${compId}-${pinName}`;
  }

  if (cName.includes('ams1117') || cName.includes('ldo') || compId === 'U2') {
    if (pName === 'in') return 'vcc-5v';
    if (pName === 'out') return 'vcc-3.3v';
    if (pName === 'gnd') return 'gnd';
  }

  if (cName.includes('usb') || cName.includes('connector') || compId === 'J1') {
    if (cName.includes('bnc')) {
      if (pName === 'in' || pinName === '1') return 'analog_input';
      return 'gnd';
    }
    if (pName === 'vbus' || pName === '5v' || pinName === '1') return 'vcc-5v';
    if (pName === 'dp' || pinName === '2') return 'usb-dp';
    if (pName === 'dn' || pinName === '3') return 'usb-dn';
    if (pName === 'gnd' || pinName === '4') return 'gnd';
  }

  if (cName.includes('decouple') || cName.includes('10uf') || compId === 'C1') {
    if (pinName === '1') return 'vcc-5v';
    if (pinName === '2') return 'gnd';
  }

  if (cName.includes('output') || cName.includes('22uf') || compId === 'C2') {
    if (pinName === '1') return 'vcc-3.3v';
    if (pinName === '2') return 'gnd';
  }

  if (cName.includes('pullup') || cName.includes('en pullup') || compId === 'R1') {
    if (pinName === '1') return 'vcc-3.3v';
    if (pinName === '2') return 'en';
  }

  if (cName.includes('strap') || cName.includes('bootstrap') || compId === 'R2') {
    if (pinName === '1') return 'gnd';
    if (pinName === '2') return 'boot';
  }

  if (cName.includes('xtal') || cName.includes('40mhz') || compId === 'Y1') {
    if (pinName === '1') return 'xtal-clk';
    if (pinName === '2') return 'gnd';
  }

  if (cName.includes('antenna') || compId === 'ANT1') {
    if (pinName === '1') return 'wifi-ant-rf';
    if (pinName === '2') return 'gnd';
  }

  // 2. Buck Boost Converter template
  if (cName.includes('max77958') || (cType === 'IC' && compId === 'U1' && !cName.includes('stm32'))) {
    if (pName === 'vcc') return 'vcc-3.3v';
    if (pName === 'gnd') return 'gnd';
    if (pName === 'fb' || pName === 'feedback') return 'feedback';
    if (pName === 'gate_h' || pName === 'gate_high' || pName === 'gate1') return 'gate_high';
    if (pName === 'gate_l' || pName === 'gate_low' || pName === 'gate2') return 'gate_low';
  }

  if (cName.includes('hs switching') || compId === 'Q1') {
    if (pinName === '1') return 'v_in';
    if (pinName === '2') return 'v_switch';
    if (pinName === '3') return 'gate_high';
  }

  if (cName.includes('ls switching') || compId === 'Q2') {
    if (pinName === '1') return 'v_switch';
    if (pinName === '2') return 'gnd';
    if (pinName === '3') return 'gate_low';
  }

  if (cName.includes('power inductor') || compId === 'L1') {
    if (pinName === '1') return 'v_switch';
    if (pinName === '2') return 'v_out';
  }

  if (cName.includes('solid alum') || compId === 'C_IN1') {
    if (pinName === '1') return 'v_in';
    if (pinName === '2') return 'gnd';
  }

  if (cName.includes('ultra-low esr') || compId === 'C_OUT1') {
    if (pinName === '1') return 'v_out';
    if (pinName === '2') return 'gnd';
  }

  if (cName.includes('terminal block') || compId === 'TB1') {
    if (pinName === '1') return 'v_out';
    if (pinName === '2') return 'gnd';
  }

  // 3. STM32 Analog front end template
  if (cName.includes('stm32h7') || (cName.includes('stm32') && compId === 'U1')) {
    if (pName === 'vcc') return 'vcc-3.3v';
    if (pName === 'gnd') return 'gnd';
    // SPI connections
    if (pName === 'sclk' || pName === 'spi_sck') return 'spi_sck';
    if (pName === 'miso' || pName === 'spi_miso') return 'spi_miso';
    if (pName === 'mosi' || pName === 'spi_mosi') return 'spi_mosi';
    if (pName === 'cs' || pName === 'spi_cs') return 'spi_cs';
    if (pName === 'rxd') return 'analog_filtered';
  }

  if (cName.includes('ads1262') || compId === 'U2') {
    if (pName === 'vcc' || pName === 'vcc_ref') return 'vcc-3.3v';
    if (pName === 'gnd') return 'gnd';
    if (pName === 'in+' || pName === 'rx') return 'analog_filtered';
    if (pName === 'in-') return 'gnd';
    if (pName === 'vref' || pName === 'tx') return 'vref';
    // SPI connections
    if (pName === 'sclk' || pName === 'spi_sck') return 'spi_sck';
    if (pName === 'miso' || pName === 'spi_miso') return 'spi_miso';
    if (pName === 'mosi' || pName === 'spi_mosi') return 'spi_mosi';
    if (pName === 'cs' || pName === 'spi_cs') return 'spi_cs';
  }

  if (cName.includes('opa350') || compId === 'U3') {
    if (pName === 'in+') return 'analog_input';
    if (pName === 'in-') return 'analog_filtered';
    if (pName === 'out') return 'analog_filtered';
    if (pName === 'vcc') return 'vcc-3.3v';
    if (pName === 'gnd') return 'gnd';
  }

  if (cName.includes('ref5025') || compId === 'REF1') {
    if (pName === 'in' || pinName === '1') return 'vcc-3.3v';
    if (pName === 'out' || pinName === '2') return 'vref';
    if (pName === 'gnd') return 'gnd';
  }

  if (cName.includes('bnc') || compId === 'J1') {
    if (pinName === '1' || pName === 'in') return 'analog_input';
    if (pinName === '2' || pName === 'gnd') return 'gnd';
  }

  // Fallbacks based on common name patterns
  if (pName === 'vcc' || pName === 'vbus' || pName === '3.3v' || pName === '5v' || pName === 'in') {
    if (cName.includes('usb') || cName.includes('vbus')) return 'vcc-5v';
    return 'vcc-3.3v';
  }
  if (pName === 'gnd' || pName === 'bottom') {
    return 'gnd';
  }

  return `net-${compId}-${pinName}`;
}

// Auto Router Solver: scan layout components and chain them with missing physical ratsnests
export function autoRouteBoardNets(board: PCBBoard): PCBBoard {
  const components = [...board.components];
  const currentTraces = [...board.traces];
  const nextRatnest = [...board.ratnest];

  // Group component details by computed logical net ID
  const netToComps: Record<string, { comp: PCBComponent; pinName: string }[]> = {};

  components.forEach(comp => {
    const pins = getPinsForType(comp.type);
    pins.forEach(pin => {
      const netId = getLogicalNetForPin(comp.id, comp.name, comp.type, pin.name);
      
      // Skip fallback/unique pin-only nets since they don't form linked nets
      if (netId.startsWith('net-') && netId.includes(comp.id)) {
        return;
      }

      if (!netToComps[netId]) {
        netToComps[netId] = [];
      }
      netToComps[netId].push({ comp, pinName: pin.name });
    });
  });

  // For each net, ensure they are fully chained sequentially by ratsnests/traces
  Object.entries(netToComps).forEach(([netId, compList]) => {
    if (compList.length < 2) return;

    // Sort by coordinate alignment to route shortest visual path
    const sorted = [...compList].sort((a, b) => a.comp.x - b.comp.x);

    for (let i = 0; i < sorted.length - 1; i++) {
      const c1 = sorted[i].comp;
      const c2 = sorted[i+1].comp;

      // Check if there is already a connection in traces or ratnest
      const alreadyConnected = nextRatnest.some(r => 
        r.netId === netId &&
        ((Math.abs(r.startX - c1.x) < 40 && Math.abs(r.endX - c2.x) < 40) ||
         (Math.abs(r.startX - c2.x) < 40 && Math.abs(r.endX - c1.x) < 40))
      ) || currentTraces.some(t =>
        t.netId === netId &&
        ((Math.abs(t.startX - c1.x) < 40 && Math.abs(t.endX - c2.x) < 40) ||
         (Math.abs(t.startX - c2.x) < 40 && Math.abs(t.endX - c1.x) < 40))
      );

      if (!alreadyConnected) {
        nextRatnest.push({
          id: `rat-auto-${netId}-${c1.id}-${c2.id}-${i}`,
          startX: c1.x,
          startY: c1.y,
          endX: c2.x,
          endY: c2.y,
          netId: netId
        });
      }
    }
  });

  return {
    ...board,
    ratnest: nextRatnest
  };
}
