import { create } from 'zustand';
import { ProjectGraph, AIAction, NetClass, DifferentialPair } from '../../types';
import { deepCloneGraph } from '../transaction';
import { validateAndApplyActions } from '../actionValidation';
import { ConstraintDrivenRoutingSystem } from '../routingSystem';
import { AutonomousOptimizationRuntime } from '../optimizationRuntime';
import { MultiplayerCollaborationClient, UserPresence } from '../collaborationRuntime';
import { EngineeringCommandRuntime, CommandRuntimeStatus } from '../engineering/commandRuntime';
import { TaskNode } from '../engineering/taskGraph';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  auth, 
  UserProfile, 
  getOrCreateUserProfile, 
  incrementAIActionCount as dbIncrementAI, 
  incrementBoardCount as dbIncrementBoard, 
  updateProfileSubscription as dbUpdateSub,
  signInWithGooglePopup,
  signOutUser,
  saveProjectToFirestore
} from '../firebase';

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

  // Firebase Auth & Monetization Properties
  user: User | null;
  userProfile: UserProfile | null;
  isLoadingAuth: boolean;
  isPricingModalOpen: boolean;
  projectId: string | null;
  projectName: string;
  isSaving: boolean;

  // Actions
  setGraph: (graph: ProjectGraph) => void;
  toggleLayer: () => void;
  setViewMode: (mode: "schematic" | "pcb") => void;
  setSelectedIds: (ids: string[]) => void;
  saveProject: (name?: string) => Promise<void>;
  loadProjectAndSetup: (projectId: string, name: string, graph: ProjectGraph) => void;
  
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

  // Auth and Subscription Actions
  initAuthListener: () => void;
  setPricingModalOpen: (open: boolean) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  incrementAIActionCount: () => Promise<boolean>;
  incrementBoardCount: () => Promise<boolean>;
  requirePro: (feature: string) => boolean;
  setMockProState: (isPro: boolean) => Promise<void>;
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

  // Firebase Auth & Monetization State Default Values
  user: null,
  userProfile: null,
  isLoadingAuth: true,
  isPricingModalOpen: false,
  projectId: null,
  projectName: "Untitled Design",
  isSaving: false,

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

  saveProject: async (name) => {
    const { graph, projectId, projectName, user } = get();
    if (!user) return;
    const finalName = name || projectName || "Untitled Design";
    const finalId = projectId || `proj_${user.uid}_${Date.now()}`;
    set({ isSaving: true });
    try {
      await saveProjectToFirestore({
        id: finalId,
        name: finalName,
        ownerId: user.uid,
        ownerEmail: user.email || 'collaborator@novacircuit.io',
        componentsCount: graph.components?.length || 0,
        tracesCount: graph.traces?.length || 0,
        isPublic: false,
        graph
      });
      set({ projectId: finalId, projectName: finalName, isSaving: false });
    } catch (e) {
      console.error("Auto-sync failed:", e);
      set({ isSaving: false });
    }
  },

  loadProjectAndSetup: (projectId, name, graph) => {
    set({
      projectId,
      projectName: name,
      graph: deepCloneGraph(graph),
      undoHistory: [],
      redoHistory: []
    });
  },

  commitTransaction: (updatedGraph, skipBroadcast = false) => {
    const { undoHistory, graph, multiplayerClient, user, projectId, saveProject } = get();
    const nextHistory = [...undoHistory, deepCloneGraph(graph)];
    if (nextHistory.length > 30) {
      nextHistory.shift();
    }

    // Broadcast delta packet across ws multi-user channel if enabled
    if (!skipBroadcast && multiplayerClient) {
      multiplayerClient.broadcastDelta("graph_update", {
        graph: updatedGraph
      });
    }

    set({
      graph: deepCloneGraph(updatedGraph),
      undoHistory: nextHistory,
      redoHistory: [] // Clear redo stack on new commits
    });

    if (user && projectId) {
      saveProject();
    }
  },

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
  },

  initAuthListener: () => {
    if ((window as any).__firebaseAuthListenerInitialized) return;
    (window as any).__firebaseAuthListenerInitialized = true;

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        set({ user, isLoadingAuth: true });
        try {
          const profile = await getOrCreateUserProfile(user.uid, user.email);
          set({ userProfile: profile, isLoadingAuth: false });
        } catch (e) {
          console.error("Failed loading user profile:", e);
          set({ isLoadingAuth: false });
        }
      } else {
        set({ user: null, userProfile: null, isLoadingAuth: false });
      }
    });
  },

  setPricingModalOpen: (open) => set({ isPricingModalOpen: open }),

  signIn: async () => {
    set({ isLoadingAuth: true });
    try {
      const user = await signInWithGooglePopup();
      if (user) {
        const profile = await getOrCreateUserProfile(user.uid, user.email);
        set({ user, userProfile: profile, isLoadingAuth: false });
      } else {
        set({ isLoadingAuth: false });
      }
    } catch (e) {
      console.error("Sign in failed:", e);
      set({ isLoadingAuth: false });
    }
  },

  signOut: async () => {
    set({ isLoadingAuth: true });
    try {
      await signOutUser();
      set({ user: null, userProfile: null, isLoadingAuth: false });
    } catch (e) {
      console.error("Sign out failed:", e);
      set({ isLoadingAuth: false });
    }
  },

  refreshUserProfile: async () => {
    const { user } = get();
    if (!user) return;
    try {
      const profile = await getOrCreateUserProfile(user.uid, user.email);
      set({ userProfile: profile });
    } catch (e) {
      console.error("Profile refresh failed:", e);
    }
  },

  incrementAIActionCount: async () => {
    const { user, userProfile } = get();
    if (!user || !userProfile) return true;
    if (userProfile.isAdmin) return true;
    if (userProfile.isPro) return true;
    
    if (userProfile.aiActionsThisMonth >= 20) {
      set({ isPricingModalOpen: true });
      return false;
    }

    try {
      await dbIncrementAI(user.uid);
      set((state) => ({
        userProfile: state.userProfile 
          ? { ...state.userProfile, aiActionsThisMonth: state.userProfile.aiActionsThisMonth + 1 }
          : null
      }));
      return true;
    } catch (e) {
      console.error("AI count increment failed:", e);
      return true;
    }
  },

  incrementBoardCount: async () => {
    const { user, userProfile } = get();
    if (!user || !userProfile) return true;
    if (userProfile.isAdmin) return true;
    if (userProfile.isPro) return true;

    if (userProfile.boardsThisMonth >= 2) {
      set({ isPricingModalOpen: true });
      return false;
    }

    try {
      await dbIncrementBoard(user.uid);
      set((state) => ({
        userProfile: state.userProfile 
          ? { ...state.userProfile, boardsThisMonth: state.userProfile.boardsThisMonth + 1 }
          : null
      }));
      return true;
    } catch (e) {
      console.error("Board count increment failed:", e);
      return true;
    }
  },

  requirePro: (feature: string) => {
    const { userProfile } = get();
    const isAdmin = userProfile?.isAdmin || false;
    const isPro = userProfile?.isPro || false;

    if (isAdmin || isPro) return true;

    const gatedFeatures = ['advanced_macro', 'complex_stages', 'auto_routing', 'export_manufacturing', 'active_live_preview'];
    if (gatedFeatures.includes(feature)) {
      set({ isPricingModalOpen: true });
      return false;
    }

    if (feature === 'ai_action') {
      const count = userProfile?.aiActionsThisMonth || 0;
      if (count >= 20) {
        set({ isPricingModalOpen: true });
        return false;
      }
    }

    if (feature === 'board_creation') {
      const count = userProfile?.boardsThisMonth || 0;
      if (count >= 2) {
        set({ isPricingModalOpen: true });
        return false;
      }
    }

    return true;
  },

  setMockProState: async (isPro: boolean) => {
    const { user } = get();
    if (!user) {
      set({
        userProfile: {
          uid: 'mock_user',
          isPro,
          aiActionsThisMonth: 5,
          boardsThisMonth: 1,
          updatedAt: new Date().toISOString()
        }
      });
      return;
    }
    try {
      const updated = await dbUpdateSub(user.uid, isPro);
      set({ userProfile: updated });
    } catch (e) {
      console.error("Subscription update failed:", e);
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
