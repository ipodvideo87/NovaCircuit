import { ProjectGraph, PinType } from '../types';

export interface DriverInfo {
  componentId: string;
  pinName: string;
  type: PinType;
}

export interface SinkInfo {
  componentId: string;
  pinName: string;
  type: PinType;
}

export interface NetDriverReport {
  netId: string;
  netName: string;
  drivers: DriverInfo[];
  sinks: SinkInfo[];
  floating: boolean;
  contention: boolean;
  warnings: string[];
}

export function resolveNetDrivers(graph: ProjectGraph): NetDriverReport[] {
  const compMap = new Map();
  graph.components.forEach(c => {
    if (c.id) compMap.set(c.id, c);
    compMap.set(c.designator, c);
  });

  return graph.nets.map(net => {
    const drivers: DriverInfo[] = [];
    const sinks: SinkInfo[] = [];
    const warnings: string[] = [];
    let floating = false;
    let contention = false;

    let powerOuts = 0;
    let outputs = 0;
    let grounds = 0;
    let inputs = 0;
    let passives = 0;
    let bidirectionals = 0;

    net.connections.forEach(conn => {
      const comp = compMap.get(conn.componentId);
      if (!comp) return;
      const pin = comp.pins.find(p => p.name === conn.pinName);
      if (!pin) return;

      const info = { componentId: conn.componentId, pinName: conn.pinName, type: pin.type };

      if (['output', 'power_out', 'ground', 'bidirectional'].includes(pin.type)) {
        drivers.push(info);
      }
      if (['input', 'power_in', 'bidirectional', 'passive'].includes(pin.type)) {
        sinks.push(info);
      }

      switch (pin.type) {
        case 'power_out': powerOuts++; break;
        case 'output': outputs++; break;
        case 'ground': grounds++; break;
        case 'input': inputs++; break;
        case 'power_in': inputs++; break;
        case 'passive': passives++; break;
        case 'bidirectional': bidirectionals++; break;
      }
    });

    // Detect driver contention
    if (powerOuts > 1 || outputs > 1 || (powerOuts > 0 && outputs > 0) || (powerOuts > 0 && grounds > 0) || (outputs > 0 && grounds > 0)) {
      contention = true;
      warnings.push(`Driver contention on ${net.name} detected`);
    }

    // Detect floating/undriven nets
    if (powerOuts === 0 && outputs === 0 && grounds === 0 && bidirectionals === 0 && passives === 0) {
      if (inputs > 0) {
        floating = true;
        warnings.push(`Floating input detected on ${net.name}`);
      } else {
        warnings.push(`Undriven net ${net.name}`);
      }
    }

    return {
      netId: net.id,
      netName: net.name,
      drivers,
      sinks,
      floating,
      contention,
      warnings
    };
  });
}
