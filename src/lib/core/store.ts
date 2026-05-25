import { create } from 'zustand';
import { ProjectGraph, AIAction, NetClass, DifferentialPair } from '../../types';
import { deepCloneGraph } from '../transaction';
import { validateAndApplyActions } from '../actionValidation';
import { ConstraintDrivenRoutingSystem } from '../routingSystem';
import { AutonomousOptimizationRuntime } from '../optimizationRuntime';
import { MultiplayerCollaborationClient, UserPresence } from '../collaborationRuntime';
import { EngineeringCommandRuntime, CommandRuntimeStatus } from '../engineering/commandRuntime';
import { TaskNode } from '../engineering/taskGraph';

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

  // Orchestrator Engine State Properties
  commandRuntime: EngineeringCommandRuntime | null;
  taskNodes: TaskNode[];
  orchestrationProgress: CommandRuntimeStatus | null;

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

  // Orchestration Hooks and Transaction actions
  executeEngineeringCommand: (command: string, preferredCenter?: { x: number; y: number }) => void;
  runMacro: (macroName: string, preferredCenter?: { x: number; y: number }) => void;
  stepEngineeringStage: () => Promise<void>;
  runAllEngineeringStages: () => Promise<void>;
  rollbackEngineeringCommand: () => void;
  getTaskStatus: () => CommandRuntimeStatus | null;
  resumeFromCheckpoint: (checkpointId: string) => void;

  // Multiplayer Actions
  joinRoom: (roomName: string, userName: string) => void;
  broadcastPresenceCursor: (x: number, y: number) => void;
  acquireLock: (elementId: string) => void;
  releaseLock: (elementId: string) => void;
  disconnectMultiplayer: () => void;
  broadcastDelta: (subType: string, payload: any) => void;
  applyRemoteDelta: (subType: string, payload: any) => void;
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

  // Orchestrator State
  commandRuntime: null,
  taskNodes: [],
  orchestrationProgress: null,

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

  // Orchestrator Action Implementations
  executeEngineeringCommand: (command, preferredCenter) => {
    const currentGraph = get().graph;
    const runtime = new EngineeringCommandRuntime(currentGraph);
    const plan = runtime.initiateCommand(command, preferredCenter);
    set({
      commandRuntime: runtime,
      taskNodes: plan.getNodes(),
      orchestrationProgress: runtime.getOverallProgress()
    });
  },

  runMacro: (macroName, preferredCenter) => {
    get().executeEngineeringCommand(`Build ${macroName}`, preferredCenter);
  },

  stepEngineeringStage: async () => {
    const { commandRuntime } = get();
    if (!commandRuntime) return;
    
    set({ isAIProcessing: true });
    try {
      const stepResult = await commandRuntime.stepExecution();
      
      // Update store's active graph and task status state
      set({
        taskNodes: commandRuntime.getActiveTaskGraph()?.getNodes() || [],
        orchestrationProgress: commandRuntime.getOverallProgress(),
        isAIProcessing: false
      });

      if (stepResult.success && stepResult.executedNodes.length > 0) {
        // Find executed nodes and commit transaction to graph
        get().commitTransaction(stepResult.graph);
      }
    } catch (e) {
      console.error("Step execution error:", e);
      set({ isAIProcessing: false });
    }
  },

  runAllEngineeringStages: async () => {
    const { commandRuntime } = get();
    if (!commandRuntime) return;

    let nextNodes = commandRuntime.getActiveTaskGraph()?.getExecutableNodes() || [];
    while (nextNodes.length > 0) {
      set({ isAIProcessing: true });
      const stepResult = await commandRuntime.stepExecution();
      
      set({
        taskNodes: commandRuntime.getActiveTaskGraph()?.getNodes() || [],
        orchestrationProgress: commandRuntime.getOverallProgress(),
        isAIProcessing: false
      });

      if (stepResult.success && stepResult.executedNodes.length > 0) {
        get().commitTransaction(stepResult.graph);
      } else if (!stepResult.success) {
        break; // safety halt on node transactional failure
      }

      await new Promise(r => setTimeout(r, 600)); // smooth spacing
      nextNodes = commandRuntime.getActiveTaskGraph()?.getExecutableNodes() || [];
    }
  },

  rollbackEngineeringCommand: () => {
    const { commandRuntime } = get();
    if (!commandRuntime) return;

    try {
      const revertedGraph = commandRuntime.rollbackAll();
      get().commitTransaction(revertedGraph);

      set({
        commandRuntime: null,
        taskNodes: [],
        orchestrationProgress: null
      });
    } catch (e) {
      console.error("Rollback error:", e);
    }
  },

  getTaskStatus: () => {
    const { commandRuntime } = get();
    return commandRuntime ? commandRuntime.getOverallProgress() : null;
  },

  resumeFromCheckpoint: (checkpointId) => {
    const { commandRuntime } = get();
    if (!commandRuntime) return;

    try {
      const restoredGraph = commandRuntime.getCheckpointRuntime().restoreCheckpoint(checkpointId);
      if (restoredGraph) {
        // Reset node failures in the active task graph DAG to retry execution
        commandRuntime.getActiveTaskGraph()?.getNodes().forEach(n => {
          if (n.status === 'failed' || n.status === 'running') {
            commandRuntime.getActiveTaskGraph()?.updateNodeStatus(n.id, 'pending');
          }
        });

        get().commitTransaction(restoredGraph);
        set({
          taskNodes: commandRuntime.getActiveTaskGraph()?.getNodes() || [],
          orchestrationProgress: commandRuntime.getOverallProgress()
        });
      }
    } catch (e) {
      console.error("Checkpoint restore error:", e);
    }
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
  },

  broadcastDelta: (subType, payload) => {
    const client = get().multiplayerClient;
    if (client) {
      client.broadcastDelta(subType, payload);
    }
  },

  applyRemoteDelta: (subType, payload) => {
    if (subType === "graph_update" && payload.graph) {
      get().commitTransaction(payload.graph, true);
    }
  }
}));

export function useCollaborationStore() {
  return useProjectStore((state) => ({
    presences: state.presences,
    activeLocks: state.activeLocks,
    isConnected: state.isConnected,
    joinRoom: state.joinRoom,
    disconnectMultiplayer: state.disconnectMultiplayer,
    broadcastPresenceCursor: state.broadcastPresenceCursor,
    acquireLock: state.acquireLock,
    releaseLock: state.releaseLock,
    broadcastDelta: state.broadcastDelta,
    applyRemoteDelta: state.applyRemoteDelta,
  }));
}
