import { ComponentPin, Net, PCBComponent, ProjectGraph } from '../../types';

export interface NetFragment {
  id: string;
  connections: ComponentPin[];
}

export type PinAdjacencyMap = Map<string, Set<string>>; // pin identifier -> set of connected pin identifiers

export class ConnectivityIndex {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  public makeSet(pinKey: string) {
    if (!this.parent.has(pinKey)) {
      this.parent.set(pinKey, pinKey);
      this.rank.set(pinKey, 0);
    }
  }

  public find(pinKey: string): string {
    const parentVal = this.parent.get(pinKey);
    if (parentVal === undefined) {
      return pinKey;
    }
    if (parentVal === pinKey) {
      return pinKey;
    }
    const root = this.find(parentVal);
    this.parent.set(pinKey, root); // Path compression
    return root;
  }

  public union(pinA: string, pinB: string): boolean {
    this.makeSet(pinA);
    this.makeSet(pinB);

    const rootA = this.find(pinA);
    const rootB = this.find(pinB);

    if (rootA !== rootB) {
      const rankA = this.rank.get(rootA) || 0;
      const rankB = this.rank.get(rootB) || 0;

      if (rankA < rankB) {
        this.parent.set(rootA, rootB);
      } else if (rankA > rankB) {
        this.parent.set(rootB, rootA);
      } else {
        this.parent.set(rootB, rootA);
        this.rank.set(rootA, rankA + 1);
      }
      return true; // Roots merged
    }
    return false; // Already connected
  }

  public reset() {
    this.parent.clear();
    this.rank.clear();
  }

  get unionMap(): Map<string, string> {
    return this.parent;
  }
}

export class NetCompiler {
  private adjacency: PinAdjacencyMap = new Map();
  private index: ConnectivityIndex = new ConnectivityIndex();
  private compiledNets: Net[] = [];

  constructor() {}

  /**
   * Helper to format pin representations consistently.
   */
  public getPinKey(cId: string, pName: string): string {
    return `${cId}:${pName}`;
  }

  public parsePinKey(pinKey: string): ComponentPin {
    const lastColon = pinKey.lastIndexOf(':');
    return {
      componentId: pinKey.substring(0, lastColon),
      pinName: pinKey.substring(lastColon + 1)
    };
  }

  /**
   * Fully compiles the netlist from the raw project graph using the DSU.
   */
  public compile(graph: ProjectGraph): Net[] {
    this.index.reset();
    this.adjacency.clear();

    // 1. Initialize all component pins
    graph.components.forEach(comp => {
      comp.pins.forEach(pin => {
        const pinKey = this.getPinKey(comp.id, pin.name);
        this.index.makeSet(pinKey);
        this.adjacency.set(pinKey, new Set());
      });
    });

    // 2. Perform union operations for all wire connections/nets
    graph.nets.forEach(net => {
      if (net.connections.length > 1) {
        const firstPin = net.connections[0];
        const firstKey = this.getPinKey(firstPin.componentId, firstPin.pinName);
        this.index.makeSet(firstKey);

        for (let i = 1; i < net.connections.length; i++) {
          const nextPin = net.connections[i];
          const nextKey = this.getPinKey(nextPin.componentId, nextPin.pinName);
          this.index.makeSet(nextKey);
          
          this.index.union(firstKey, nextKey);

          // Add to adjacency map
          if (!this.adjacency.has(firstKey)) this.adjacency.set(firstKey, new Set());
          if (!this.adjacency.has(nextKey)) this.adjacency.set(nextKey, new Set());
          this.adjacency.get(firstKey)!.add(nextKey);
          this.adjacency.get(nextKey)!.add(firstKey);
        }
      }
    });

    // 3. Build Compiled Net objects from disjoint-set equivalents
    const groups: Map<string, string[]> = new Map();
    this.adjacency.forEach((_, pinKey) => {
      const root = this.index.find(pinKey);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(pinKey);
    });

    this.compiledNets = [];
    let netCounter = 1;

    groups.forEach((pinKeys, rootKey) => {
      const connections = pinKeys.map(pk => this.parsePinKey(pk));
      
      // Attempt to determine the net name. If any pins have specific net associations (e.g. from input nets)
      let resolvedName = `Net-(${connections[0].componentId}-Pad${connections[0].pinName})`;
      let resolvedClass: "POWER" | "GROUND" | "SIGNAL" | "DIFFERENTIAL" | "DEFAULT" = "DEFAULT";
      let resolvedType: Net["type"] = "signal";

      // Match against original net metadata if possible
      for (const pk of pinKeys) {
        const parsed = this.parsePinKey(pk);
        const originalNet = graph.nets.find(n => 
          n.connections.some(c => c.componentId === parsed.componentId && c.pinName === parsed.pinName)
        );
        if (originalNet) {
          resolvedClass = originalNet.netClass;
          resolvedType = originalNet.type;
          
          // Power rails / Ground names take highest naming priority
          if (originalNet.name === "GND" || originalNet.name.includes("VCC") || originalNet.name.includes("+")) {
            resolvedName = originalNet.name;
            break;
          } else {
            resolvedName = originalNet.name;
          }
        }
      }

      this.compiledNets.push({
        id: `compiled-net-${netCounter++}`,
        name: resolvedName,
        netClass: resolvedClass,
        type: resolvedType,
        connections
      });
    });

    return this.compiledNets;
  }

  /**
   * Incrementally handles adding a wire connection without global graph parsing.
   */
  public addWire(pinA: ComponentPin, pinB: ComponentPin) {
    const keyA = this.getPinKey(pinA.componentId, pinA.pinName);
    const keyB = this.getPinKey(pinB.componentId, pinB.pinName);

    this.index.makeSet(keyA);
    this.index.makeSet(keyB);

    this.index.union(keyA, keyB);

    if (!this.adjacency.has(keyA)) this.adjacency.set(keyA, new Set());
    if (!this.adjacency.has(keyB)) this.adjacency.set(keyB, new Set());
    this.adjacency.get(keyA)!.add(keyB);
    this.adjacency.get(keyB)!.add(keyA);
  }

  /**
   * Incremental wire deletion. Performs localized sub-graph BFS reconstruction to split nets.
   */
  public deleteWire(pinA: ComponentPin, pinB: ComponentPin) {
    const keyA = this.getPinKey(pinA.componentId, pinA.pinName);
    const keyB = this.getPinKey(pinB.componentId, pinB.pinName);

    // Remove adjacency link
    this.adjacency.get(keyA)?.delete(keyB);
    this.adjacency.get(keyB)?.delete(keyA);

    // Check if keyA and keyB are still connected via some other path (BFS)
    const visited = new Set<string>();
    const queue = [keyA];
    visited.add(keyA);
    let pathFound = false;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === keyB) {
        pathFound = true;
        break;
      }
      const neighbors = this.adjacency.get(curr) || new Set();
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    if (!pathFound) {
      // The nodes are in isolated components. We must split them.
      // Simply trigger a refresh of our local DSU indices from the adjacency list
      const rootsToRefresh = new Set<string>([keyA, keyB]);
      this.rebuildLocalRoots(rootsToRefresh);
    }
  }

  /**
   * Rebuilds partition root associations for a set of changed pin paths.
   */
  private rebuildLocalRoots(dirtyPins: Set<string>) {
    // For every pin reachable from dirtyPins, gather all elements of their respective connected groups
    const visited = new Set<string>();
    const components: string[][] = [];

    dirtyPins.forEach(pin => {
      if (!visited.has(pin)) {
        const currentGroup: string[] = [];
        const queue = [pin];
        visited.add(pin);

        while (queue.length > 0) {
          const curr = queue.shift()!;
          currentGroup.push(curr);
          const neighbors = this.adjacency.get(curr) || new Set();
          for (const n of neighbors) {
            if (!visited.has(n)) {
              visited.add(n);
              queue.push(n);
            }
          }
        }
        components.push(currentGroup);
      }
    });

    // Reconstruct DSU mappings specifically for these isolated components
    components.forEach(compGroup => {
      if (compGroup.length > 0) {
        const root = compGroup[0];
        // Ensure root is established inside index
        this.index.makeSet(root);

        for (let i = 1; i < compGroup.length; i++) {
          const pin = compGroup[i];
          this.index.makeSet(pin);
          this.index.union(root, pin);
        }
      }
    });
  }

  get nets(): Net[] {
    return this.compiledNets;
  }
}
