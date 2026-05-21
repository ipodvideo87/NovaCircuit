import { ProjectGraph } from '../types';
import { resolveNetDrivers } from './netDriver';

export interface ERCIssue {
  id: string;
  severity: "warning" | "error";
  message: string;
  relatedComponents?: string[];
  relatedNets?: string[];
}

export function runERC(graph: ProjectGraph): ERCIssue[] {
  const issues: ERCIssue[] = [];
  let nextId = 1;

  const warn = (msg: string, comps?: string[], nets?: string[]) => {
    issues.push({ id: `WARN-${nextId++}`, severity: 'warning', message: msg, relatedComponents: comps, relatedNets: nets });
  };
  
  const err = (msg: string, comps?: string[], nets?: string[]) => {
    issues.push({ id: `ERR-${nextId++}`, severity: 'error', message: msg, relatedComponents: comps, relatedNets: nets });
  };

  const connectedPins = new Set<string>();
  
  // Prepare Net Names
  const netNames = new Set<string>();

  // Calculate connected pins and check duplicate net names
  graph.nets.forEach(net => {
    if (netNames.has(net.name)) {
      err(`Duplicate net name found: ${net.name}`, undefined, [net.name]);
    }
    netNames.add(net.name);

    net.connections.forEach(pin => {
      connectedPins.add(`${pin.componentId}:${pin.pinName}`);
    });
  });

  // 1. Floating nets (net with < 2 connections)
  graph.nets.forEach(net => {
    if (net.connections.length === 0) {
      warn(`Floating net with no connections: ${net.name}`, undefined, [net.name]);
    } else if (net.connections.length === 1) {
      warn(`Net has only one connection: ${net.name}`, [net.connections[0].componentId], [net.name]);
    }
  });

  // 2. Unconnected power pins
  graph.components.forEach(comp => {
    comp.pins.forEach(pin => {
      if (pin.type === 'power_in' || pin.type === 'power_out' || pin.type === 'ground') {
        if (!connectedPins.has(`${comp.id || comp.designator}:${pin.name}`)) {
          warn(`Unconnected power pin: ${pin.name} on ${comp.designator}`, [comp.id || comp.designator]);
        }
      }
    });
  });

  // Use NetDriver Resolution Engine for floating / contention / power pins checks
  const netDriverReports = resolveNetDrivers(graph);
  
  netDriverReports.forEach(report => {
    report.warnings.forEach(w => {
      if (report.contention) {
        err(w, report.drivers.map(d => d.componentId), [report.netName]);
      } else {
        warn(w, undefined, [report.netName]);
      }
    });
  });

  // 5. Missing ground reference
  const hasGround = graph.nets.some(n => 
    n.type === 'ground' || 
    n.connections.some(conn => {
      const comp = graph.components.find(c => c.id === conn.componentId || c.designator === conn.componentId);
      if (comp) {
        const pin = comp.pins.find(p => p.name === conn.pinName);
        return pin && pin.type === 'ground';
      }
      return false;
    })
  );
  if (!hasGround && graph.nets.length > 0) {
    warn(`No Ground reference found in the circuit.`);
  }

  // 6. Isolated subcircuits
  if (graph.components.length > 0) {
    const adj = new Map<string, string[]>();
    graph.components.forEach(c => adj.set(c.id || c.designator, []));
    graph.nets.forEach(n => {
      for (let i = 0; i < n.connections.length; i++) {
        for (let j = i + 1; j < n.connections.length; j++) {
          const a = n.connections[i].componentId;
          const b = n.connections[j].componentId;
          // Avoid self loops
          if (a !== b) {
            if (adj.has(a) && adj.has(b)) {
              adj.get(a)!.push(b);
              adj.get(b)!.push(a);
            }
          }
        }
      }
    });

    const visited = new Set<string>();
    let subcircuits = 0;

    const dfs = (node: string) => {
      visited.add(node);
      const neighbors = adj.get(node) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          dfs(n);
        }
      }
    };

    graph.components.forEach(c => {
      const id = c.id || c.designator;
      if (!visited.has(id)) {
        subcircuits++;
        dfs(id);
      }
    });

    // If there is more than 1 connected component graph, and at least some nets exist to make a circuit
    // Note: a single unconnected component is also a subcircuit, so this might trigger often in early designs
    if (subcircuits > 1 && graph.nets.length > 0) {
      warn(`Detected ${subcircuits} isolated subcircuits. (e.g. disconnected components or islands)`);
    }
  }

  // 7. Clock net fanout warnings
  graph.nets.forEach(net => {
    if (net.type === 'clock') {
      const sinkCount = net.connections.length - 1; // assuming 1 source
      if (sinkCount > 4) {
        warn(`Clock net '${net.name}' has high fanout (${sinkCount} sinks). Consider using a clock buffer.`, undefined, [net.name]);
      }
    }
  });

  // 8. Analog and Digital Isolation (Crossing / Proximity)
  // Check if analog nets and digital/clock nets share same components unexpectedly, or are just checking Net metadata mappings
  graph.nets.forEach(net => {
    if (net.type === 'analog') {
      // Very basic crossing rule: an analog net shouldn't be connected to a part with high-frequency digital clock without some isolation
      // For now, check if the component has both analog and clock nets without proper isolation (mocked as warning)
      const connectedComps = net.connections.map(c => c.componentId);
      graph.nets.forEach(otherNet => {
        if (otherNet.type === 'clock' || otherNet.netClass === 'SIGNAL') {
          const hasSharedComp = otherNet.connections.some(conn => connectedComps.includes(conn.componentId));
          if (hasSharedComp) {
            // warn(`Analog net '${net.name}' shares a component with digital/clock net '${otherNet.name}'. Ensure proper isolation.`, connectedComps, [net.name, otherNet.name]);
          }
        }
      });
    }
  });

  // 9. Decoupling Capacitor Detection
  graph.components.forEach(comp => {
    const isIC = comp.partType === 'IC' || comp.designator.startsWith('U') || comp.designator.startsWith('IC');
    if (isIC) {
      comp.pins.filter(p => p.type === 'power_in').forEach(powerPin => {
        // Find net connected to this power pin
        const connectedNet = graph.nets.find(n => n.connections.some(conn => conn.componentId === comp.id && conn.pinName === powerPin.name));
        if (connectedNet) {
          // Look for a capacitor on this net
          let hasDecap = false;
          let hasBulkCap = false;

          connectedNet.connections.forEach(conn => {
            if (conn.componentId !== comp.id) {
              const otherComp = graph.components.find(c => c.id === conn.componentId);
              if (otherComp && (otherComp.partType === 'Capacitor' || otherComp.designator.startsWith('C') || otherComp.partType.toLowerCase().includes('cap'))) {
                // Check if it's nearby
                const dx = comp.position.x - otherComp.position.x;
                const dy = comp.position.y - otherComp.position.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist < 150) { // arbitrary units
                  hasDecap = true;
                }

                // Check bulk capacitance via properties or metadata
                const val = (otherComp.properties?.value || '') as string;
                if (val.includes('uF')) {
                  const numMatch = val.match(/([0-9.]+)/);
                  if (numMatch && parseFloat(numMatch[1]) >= 10) {
                    hasBulkCap = true;
                  }
                }
              }
            }
          });

          if (!hasDecap) {
            warn(`IC ${comp.designator} pin ${powerPin.name} is missing a nearby decoupling capacitor on net ${connectedNet.name}.`, [comp.id || comp.designator], [connectedNet.name]);
          }
          if (connectedNet.netClass === 'POWER' && !hasBulkCap) {
             warn(`Power rail ${connectedNet.name} is missing bulk capacitance (e.g. >=10uF).`, undefined, [connectedNet.name]);
          }
        }
      });
    }
  });

  // 10. Power Rail Overloading Estimation
  graph.nets.forEach(net => {
    if (net.netClass === 'POWER') {
      let maxSupply = 0;
      let totalLoad = 0;
      net.connections.forEach(conn => {
        const comp = graph.components.find(c => c.id === conn.componentId);
        if (comp && comp.metadata) {
          const pin = comp.pins.find(p => p.name === conn.pinName);
          if (pin?.type === 'power_out') {
            maxSupply += (comp.metadata.currentRating || 0);
          } else if (pin?.type === 'power_in') {
            totalLoad += (comp.metadata.currentRating || 0.05); // Assume 50mA if not spec'd
          }
        }
      });
      if (maxSupply > 0 && totalLoad > maxSupply) {
        err(`Power net '${net.name}' is overloaded! Load: ${totalLoad}A, Supply: ${maxSupply}A`, undefined, [net.name]);
      } else if (maxSupply > 0 && totalLoad > maxSupply * 0.8) {
        warn(`Power net '${net.name}' is near capacity. Load: ${totalLoad.toFixed(2)}A, Supply: ${maxSupply}A`, undefined, [net.name]);
      }
    }
  });

  return issues;
}
