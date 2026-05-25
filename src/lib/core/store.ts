import { create } from 'zustand';
import { ProjectGraph, AIAction, NetClass, DifferentialPair } from '../../types';
import { deepCloneGraph } from '../transaction';
import { validateAndApplyActions } from '../actionValidation';
import { ConstraintDrivenRoutingSystem } from '../routingSystem';
import { AutonomousOptimizationRuntime } from '../optimizationRuntime';
import { MultiplayerCollaborationClient, UserPresence } from '../collaborationRuntime';

export interface ProjectState {
  graph: ProjectGraph;
  activeLayer: "F.Cu" | "B.Cu";
  undoHistory: ProjectGraph[];
  redoHistory: ProjectGraph[];
  viewMode: "schematic" | "pcb";
  selectedIds: string[];
  isAIProcessing: boolean;
  routingLogs: string[];

  // Multiplayer Collaboration Properties
  multiplayerClient: MultiplayerCollaborationClient | null;
  isConnected: boolean;
  presences: UserPresence[];
  activeLocks: Record<string, string>;

  // Actions
  setGraph: (graph: ProjectGraph) => void;
  toggleLayer: () => void;
  setViewMode: (mode: "schematic" | "pcb") => void;
  setSelectedIds: (ids: string[]) => void;
  
  commitTransaction: (updatedGraph: ProjectGraph, skipBroadcast?: boolean) => void;
  undo: () => void;
  redo: () => void;

  applyAIActionBatch: (actions: AIAction[]) => { success: boolean; errors: string[]; validActions: AIAction[] };
  runOptimizationPass: () => { success: boolean; initialScore: number; optimizedScore: number; logs: string[] };
  autoRouteAllNets: (ratnestWires: any[]) => { success: boolean; routedCount: number; failedCount: number; logs: string[] };

  // Multiplayer Actions
  joinRoom: (roomName: string, userName: string) => void;
  broadcastPresenceCursor: (x: number, y: number) => void;
  acquireLock: (elementId: string) => void;
  releaseLock: (elementId: string) => void;
  disconnectMultiplayer: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  graph: {
    components: [],
    nets: [],
    traces: [],
    vias: [],
    keepouts: [],
    netClasses: [],
    diffPairs: [],
    outline: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }] }
  },
  activeLayer: "F.Cu",
  undoHistory: [],
  redoHistory: [],
  viewMode: "schematic",
  selectedIds: [],
  isAIProcessing: false,
  routingLogs: [],

  // Multiplayer standard state
  multiplayerClient: null,
  isConnected: false,
  presences: [],
  activeLocks: {},

  setGraph: (graph) => set({ graph: deepCloneGraph(graph) }),

  toggleLayer: () => set((state) => ({
    activeLayer: state.activeLayer === "F.Cu" ? "B.Cu" : "F.Cu"
  })),

  setViewMode: (viewMode) => set({ viewMode }),

  setSelectedIds: (selectedIds) => {
    set({ selectedIds });
    // Keep collaborative selections synced on selection changes
    const client = get().multiplayerClient;
    if (client) {
      client.broadcastPresence(undefined, selectedIds);
    }
  },

  commitTransaction: (updatedGraph, skipBroadcast = false) => set((state) => {
    const nextHistory = [...state.undoHistory, deepCloneGraph(state.graph)];
    if (nextHistory.length > 30) {
      nextHistory.shift();
    }

    // Broadcast delta packet across ws multi-user channel if enabled
    if (!skipBroadcast && state.multiplayerClient) {
      state.multiplayerClient.broadcastDelta("graph_update", {
        graph: updatedGraph
      });
    }

    return {
      graph: deepCloneGraph(updatedGraph),
      undoHistory: nextHistory,
      redoHistory: [] // Clear redo stack on new commits
    };
  }),

  undo: () => set((state) => {
    if (state.undoHistory.length === 0) return {};
    const previous = state.undoHistory[state.undoHistory.length - 1];
    const newUndo = state.undoHistory.slice(0, state.undoHistory.length - 1);
    const newRedo = [...state.redoHistory, deepCloneGraph(state.graph)];

    if (state.multiplayerClient) {
      state.multiplayerClient.broadcastDelta("graph_update", { graph: previous });
    }

    return {
      graph: previous,
      undoHistory: newUndo,
      redoHistory: newRedo
    };
  }),

  redo: () => set((state) => {
    if (state.redoHistory.length === 0) return {};
    const next = state.redoHistory[state.redoHistory.length - 1];
    const newRedo = state.redoHistory.slice(0, state.redoHistory.length - 1);
    const newUndo = [...state.undoHistory, deepCloneGraph(state.graph)];

    if (state.multiplayerClient) {
      state.multiplayerClient.broadcastDelta("graph_update", { graph: next });
    }

    return {
      graph: next,
      undoHistory: newRedo,
      redoHistory: newUndo
    };
  }),

  applyAIActionBatch: (actions) => {
    set({ isAIProcessing: true });
    try {
      const currentState = get().graph;
      const { updatedGraph, errors, validActions } = validateAndApplyActions(actions, currentState);
      if (errors.length === 0) {
        get().commitTransaction(updatedGraph);
        set({ isAIProcessing: false });
        return { success: true, errors: [], validActions };
      }
      set({ isAIProcessing: false });
      return { success: false, errors, validActions };
    } catch (e: any) {
      set({ isAIProcessing: false });
      return { success: false, errors: [e.message], validActions: [] };
    }
  },

  runOptimizationPass: () => {
    const currentGraph = get().graph;
    const runtime = new AutonomousOptimizationRuntime();
    const logs: string[] = ["Initializing physical thermal/EMI optimizer runtime..."];

    try {
      const report = runtime.runOptimizationPass(
        currentGraph,
        `seed_${Date.now()}`,
        (actions) => {
          const { updatedGraph, errors } = validateAndApplyActions(actions, currentGraph);
          return { success: errors.length === 0, updatedGraph };
        }
      );

      if (report.isImprovementFound && report.appliedActions.length > 0) {
        const { updatedGraph } = validateAndApplyActions(report.appliedActions, currentGraph);
        get().commitTransaction(updatedGraph);
        logs.push(`Successfully completed layout optimization pass! Improved utilities score from ${report.initialScore} up to ${report.optimizedScore}`);
        return { success: true, initialScore: report.initialScore, optimizedScore: report.optimizedScore, logs };
      } else {
        logs.push(`Optimization complete. No safer layout placement candidate found (Score stable at ${report.initialScore}).`);
        return { success: false, initialScore: report.initialScore, optimizedScore: report.initialScore, logs };
      }
    } catch (err: any) {
      logs.push(`Optimizer Exception: ${err.message}`);
      return { success: false, initialScore: 0, optimizedScore: 0, logs };
    }
  },

  autoRouteAllNets: (ratnestWires) => {
    const currentGraph = get().graph;
    const router = new ConstraintDrivenRoutingSystem();
    const res = router.autoRouteAllNets(currentGraph, ratnestWires);
    if (res.success) {
      get().commitTransaction(res.graph);
    }
    return {
      success: res.success,
      routedCount: res.routedCount,
      failedCount: res.failedCount,
      logs: res.logs
    };
  },

  joinRoom: (roomName, userName) => {
    // Teardown stale sessions
    get().disconnectMultiplayer();

    const userId = `user_${Math.floor(Math.random() * 8999) + 1000}`;
    const client = new MultiplayerCollaborationClient(roomName, userId, userName, "Editor");

    client.connect({
      onConnectionStateChange: (connected) => {
        set({ isConnected: connected });
      },
      onPresenceUpdate: (presences) => {
        set({ presences });
      },
      onLocksUpdate: (activeLocks) => {
        set({ activeLocks });
      },
      onDeltaReceive: (subType, payload) => {
        if (subType === "graph_update" && payload.graph) {
          // Commit incoming updates from peer designers bypass duplicate broadcasts
          get().commitTransaction(payload.graph, true);
        }
      }
    });

    set({ multiplayerClient: client });
  },

  broadcastPresenceCursor: (x, y) => {
    const client = get().multiplayerClient;
    if (client) {
      client.broadcastPresence({ x, y, sheetId: "root" }, get().selectedIds);
    }
  },

  acquireLock: (elementId) => {
    const client = get().multiplayerClient;
    if (client) {
      client.acquireElementLock(elementId);
    }
  },

  releaseLock: (elementId) => {
    const client = get().multiplayerClient;
    if (client) {
      client.releaseElementLock(elementId);
    }
  },

  disconnectMultiplayer: () => {
    const client = get().multiplayerClient;
    if (client) {
      client.disconnect();
    }
    set({ multiplayerClient: null, isConnected: false, presences: [], activeLocks: {} });
  }
}));
