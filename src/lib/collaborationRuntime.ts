import { ProjectGraph, PCBComponent, Net, AIAction } from '../types';
import { BoardTrace } from './board';

/**
 * Access levels for collaborative environments.
 */
export type UserRole = "Viewer" | "Editor" | "Approver" | "Admin";

export interface UserPresence {
  userId: string;
  userName: string;
  role: UserRole;
  cursorPosition?: { x: number; y: number; sheetId?: string };
  activeSelectionIds: string[];
  lastActiveTimestamp: number;
  activeTraceId?: string;
  isAIProcessing?: boolean;
  viewport?: { x: number; y: number; zoom: number };
  selectionBox?: { startX: number; startY: number; endX: number; endY: number };
}

/**
 * Atomic mutation payload representing changes across the multiplayer channel.
 */
export interface DeltaOperation {
  id: string; // Unique message ID
  senderId: string;
  sequenceNumber: number;
  timestamp: number;
  vectorClock: Record<string, number>;
  type: "create_component" | "update_component" | "delete_component" | "route_trace" | "delete_trace" | "custom_action";
  targetId: string;
  payload: Record<string, any>;
}

/**
 * Conflict detection metadata.
 */
export interface MergeConflict {
  targetId: string;
  entityType: "component" | "net" | "trace";
  field: string;
  baseValue: any;
  branchAValue: any;
  branchBValue: any;
  resolvedValue?: any;
}

/**
 * Engineering version branch containing physical system snapshots.
 */
export interface DesignBranch {
  name: string;
  parentBranchName: string | null;
  commitHash: string;
  snapshot: ProjectGraph;
  historyLog: { description: string; author: string; timestamp: number }[];
}

/**
 * Production-grade merge report.
 */
export interface MergeCheckReport {
  isClean: boolean;
  conflicts: MergeConflict[];
  mergedGraph: ProjectGraph;
}

/**
 * Structured pull request approval stage.
 */
export interface ReviewSession {
  reviewId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  creatorId: string;
  approvals: { userId: string; status: "approved" | "changes_requested"; comments: string }[];
  isMerged: boolean;
  createdAt: number;
}

/**
 * Distributed simulation orchestration command metadata.
 */
export interface SimulationJob {
  jobId: string;
  taskType: "DRC" | "THERMAL" | "HIGH_SPEED_SI" | "EM_RAD_EMI";
  graphSnapshot: ProjectGraph;
  workerId?: string;
  status: "queued" | "running" | "completed" | "failed";
  progressPercent: number;
  result?: Record<string, any>;
}

/**
 * 1. Conflict-Free Replicated Relation & LWW Resolution
 */
export class CRDTConflictResolver {
  /**
   * Safe Last-Write-Wins (LWW) resolution for overlapping physical movements.
   * Compares vector/logical timestamps to reconcile concurrent changes.
   */
  public resolveLWW<T extends { timestamp: number; senderId: string }>(
    local: T | null,
    remote: T
  ): T {
    if (!local) return remote;
    if (remote.timestamp > local.timestamp) {
      return remote;
    }
    if (remote.timestamp === local.timestamp) {
      // Deterministic tie-breaker based on Lexicographical Sender ID
      return remote.senderId > local.senderId ? remote : local;
    }
    return local;
  }

  /**
   * Reconciles two vector clocks.
   */
  public mergeVectorClocks(
    clockA: Record<string, number>,
    clockB: Record<string, number>
  ): Record<string, number> {
    const merged: Record<string, number> = { ...clockA };
    for (const key in clockB) {
      merged[key] = Math.max(merged[key] || 0, clockB[key] || 0);
    }
    return merged;
  }
}

/**
 * 2. Engineering Branch & Merge Engine
 */
export class BranchMergeRuntime {
  private branches: Map<string, DesignBranch> = new Map();
  private resolver = new CRDTConflictResolver();

  constructor(rootGraph: ProjectGraph) {
    // Scaffold initial master repository
    this.branches.set("main", {
      name: "main",
      parentBranchName: null,
      commitHash: "rev_0",
      snapshot: this.deepClone(rootGraph),
      historyLog: [{ description: "Initial schematic and PCB core layout.", author: "System", timestamp: Date.now() }]
    });
  }

  /**
   * Creates an isolated workspace branch tracking the parent.
   */
  public forkBranch(newBranchName: string, parentName: string = "main"): void {
    const parent = this.branches.get(parentName);
    if (!parent) {
      throw new Error(`Master parent branch [${parentName}] not found.`);
    }

    this.branches.set(newBranchName, {
      name: newBranchName,
      parentBranchName: parentName,
      commitHash: `rev_${Date.now()}`,
      snapshot: this.deepClone(parent.snapshot),
      historyLog: [{ description: `Forked branch from ${parentName}.`, author: "System", timestamp: Date.now() }]
    });
  }

  /**
   * COMMITS a changed ProjectGraph snapshot to a branch.
   */
  public commitToBranch(
    branchName: string,
    updatedGraph: ProjectGraph,
    author: string,
    message: string
  ): void {
    const branch = this.branches.get(branchName);
    if (!branch) {
      throw new Error(`Branch [${branchName}] does not exist.`);
    }

    branch.snapshot = this.deepClone(updatedGraph);
    branch.commitHash = `rev_${Date.now()}`;
    branch.historyLog.push({ description: message, author, timestamp: Date.now() });
  }

  /**
   * Performs an architectural conflict-dryrun audit and merges modifications.
   */
  public mergeBranches(
    sourceName: string,
    targetName: string,
    autoResolutions: Record<string, any> = {}
  ): MergeCheckReport {
    const source = this.branches.get(sourceName);
    const target = this.branches.get(targetName);

    if (!source || !target) {
      throw new Error(`Invalid merge boundary: [${sourceName}] -> [${targetName}].`);
    }

    const mergedGraph = this.deepClone(target.snapshot);
    const conflicts: MergeConflict[] = [];

    // Evaluate component level merge properties:
    source.snapshot.components.forEach(srcComp => {
      const targetComp = mergedGraph.components.find(c => c.id === srcComp.id);
      if (!targetComp) {
        // Component added in source, insert without conflict
        mergedGraph.components.push(this.deepClone(srcComp));
      } else {
        // Evaluate property mismatches (Coordinates/Positions)
        if (srcComp.position.x !== targetComp.position.x || srcComp.position.y !== targetComp.position.y) {
          const autoRes = autoResolutions[`${srcComp.id}-position`];
          if (autoRes) {
            targetComp.position = autoRes;
          } else {
            conflicts.push({
              targetId: srcComp.id,
              entityType: "component",
              field: "position",
              baseValue: targetComp.position,
              branchAValue: targetComp.position,
              branchBValue: srcComp.position
            });
          }
        }

        // Evaluate part types/footprints
        if (srcComp.footprint !== targetComp.footprint) {
          const autoRes = autoResolutions[`${srcComp.id}-footprint`];
          if (autoRes) {
            targetComp.footprint = autoRes;
          } else {
            conflicts.push({
              targetId: srcComp.id,
              entityType: "component",
              field: "footprint",
              baseValue: targetComp.footprint,
              branchAValue: targetComp.footprint,
              branchBValue: srcComp.footprint
            });
          }
        }
      }
    });

    return {
      isClean: conflicts.length === 0,
      conflicts,
      mergedGraph
    };
  }

  public getBranch(name: string): DesignBranch | undefined {
    return this.branches.get(name);
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

/**
 * 3. Multiplayer Graph Presence and Real-time Collaborations Control
 */
export class InteractiveSessionManager {
  private users: Map<string, UserPresence> = new Map();
  private elementLocks: Map<string, { userId: string; timestamp: number }> = new Map();

  /**
   * Updates state coordinates and metadata for a user.
   */
  public updatePresence(user: UserPresence): void {
    this.users.set(user.userId, {
      ...user,
      lastActiveTimestamp: Date.now()
    });
  }

  /**
   * Locks layout elements (e.g. microcontroller footprint) to avoid race conditions.
   */
  public acquireLock(elementId: string, userId: string): boolean {
    const existing = this.elementLocks.get(elementId);
    if (existing && existing.userId !== userId) {
      // Check if lock expired (10 seconds ttl)
      if (Date.now() - existing.timestamp > 10000) {
        this.elementLocks.set(elementId, { userId, timestamp: Date.now() });
        return true;
      }
      return false; // Conflicting live user holds this lock
    }
    this.elementLocks.set(elementId, { userId, timestamp: Date.now() });
    return true;
  }

  /**
   * Safely releases explicit element locks.
   */
  public releaseLock(elementId: string, userId: string): boolean {
    const existing = this.elementLocks.get(elementId);
    if (existing && existing.userId === userId) {
      this.elementLocks.delete(elementId);
      return true;
    }
    return false;
  }

  public getActiveLocks(): Record<string, string> {
    const locks: Record<string, string> = {};
    this.elementLocks.forEach((val, key) => {
      locks[key] = val.userId;
    });
    return locks;
  }

  public getConnectedUsers(): UserPresence[] {
    // Clear out stale presences (idle over 30 seconds)
    const activeTimeThreshold = Date.now() - 30000;
    const activeUsers: UserPresence[] = [];
    this.users.forEach(u => {
      if (u.lastActiveTimestamp > activeTimeThreshold) {
        activeUsers.push(u);
      }
    });
    return activeUsers;
  }
}

/**
 * 4. Distributed Verification Task scheduler (SPICE / EM Simulation dispatching)
 */
export class DistributedWorkerScheduler {
  private jobs: Map<string, SimulationJob> = new Map();

  /**
   * Spawns a physical analysis task onto the task queues.
   */
  public dispatchSimulation(task: "DRC" | "THERMAL" | "HIGH_SPEED_SI" | "EM_RAD_EMI", graph: ProjectGraph): string {
    const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const job: SimulationJob = {
      jobId,
      taskType: task,
      graphSnapshot: graph,
      status: "queued",
      progressPercent: 0
    };
    this.jobs.set(jobId, job);
    return jobId;
  }

  /**
   * Mimics cloud worker heartbeats reporting synthesis metrics.
   */
  public updateWorkerHeartbeat(jobId: string, progress: number, status: SimulationJob["status"], feedback?: Record<string, any>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progressPercent = progress;
      job.status = status;
      if (feedback) {
        job.result = feedback;
      }
    }
  }

  public getJob(jobId: string): SimulationJob | undefined {
    return this.jobs.get(jobId);
  }
}

/**
 * 5. Pull Request Approval Pipeline
 */
export class MergeApprovalPipeline {
  private reviews: ReviewSession[] = [];

  public createReview(sourceBranch: string, targetBranch: string, title: string, creatorId: string): ReviewSession {
    const review: ReviewSession = {
      reviewId: `pr_${Date.now()}`,
      sourceBranch,
      targetBranch,
      title,
      creatorId,
      approvals: [],
      isMerged: false,
      createdAt: Date.now()
    };
    this.reviews.push(review);
    return review;
  }

  public submitApproval(reviewId: string, userId: string, status: "approved" | "changes_requested", comments: string): void {
    const review = this.reviews.find(r => r.reviewId === reviewId);
    if (!review) throw new Error("Proposed Review session not found.");
    
    // De-duplicate reviews
    review.approvals = review.approvals.filter(a => a.userId !== userId);
    review.approvals.push({ userId, status, comments });
  }

  /**
   * Validates if the PR meets mandatory engineering approval limits.
   */
  public isReviewReadyToMerge(reviewId: string): boolean {
    const review = this.reviews.find(r => r.reviewId === reviewId);
    if (!review) return false;
    if (review.isMerged) return false;

    // Minimum requirement of 1 positive approval and zero blocking changes requested
    const approvedCount = review.approvals.filter(a => a.status === "approved").length;
    const changesRequestedCount = review.approvals.filter(a => a.status === "changes_requested").length;

    return approvedCount >= 1 && changesRequestedCount === 0;
  }

  public completeMerge(reviewId: string): void {
    const review = this.reviews.find(r => r.reviewId === reviewId);
    if (review) {
      review.isMerged = true;
    }
  }
}

import { deepCloneGraph } from './transaction';

export interface TransactionOp {
  type: 'upsert_component' | 'delete_component' | 'upsert_net' | 'delete_net' | 'upsert_trace' | 'delete_trace' | 'upsert_via' | 'delete_via' | 'upsert_keepout' | 'delete_keepout' | 'update_outline';
  payload: any;
}

export interface DesignTransaction {
  id: string;
  senderId: string;
  sequence: number;
  timestamp: number;
  operations: TransactionOp[];
  vectorClock: Record<string, number>;
}

/**
 * Computes deterministic differences between two ProjectGraph states.
 */
export function diffGraphs(oldG: ProjectGraph, newG: ProjectGraph): TransactionOp[] {
  const ops: TransactionOp[] = [];

  // 1. Components Diff
  const oldComps = new Map((oldG.components || []).map(c => [c.id, c]));
  const newComps = new Map((newG.components || []).map(c => [c.id, c]));

  for (const [id, newC] of newComps.entries()) {
    const oldC = oldComps.get(id);
    if (!oldC || JSON.stringify(oldC) !== JSON.stringify(newC)) {
      ops.push({
        type: 'upsert_component',
        payload: { component: newC }
      });
    }
  }

  for (const id of oldComps.keys()) {
    if (!newComps.has(id)) {
      ops.push({
        type: 'delete_component',
        payload: { id }
      });
    }
  }

  // 2. Nets Diff
  const oldNets = new Map((oldG.nets || []).map(n => [n.id, n]));
  const newNets = new Map((newG.nets || []).map(n => [n.id, n]));

  for (const [id, newN] of newNets.entries()) {
    const oldN = oldNets.get(id);
    if (!oldN || JSON.stringify(oldN) !== JSON.stringify(newN)) {
      ops.push({
        type: 'upsert_net',
        payload: { net: newN }
      });
    }
  }

  for (const id of oldNets.keys()) {
    if (!newNets.has(id)) {
      ops.push({
        type: 'delete_net',
        payload: { id }
      });
    }
  }

  // 3. Traces Diff
  const oldTracesList = oldG.traces || [];
  const newTracesList = newG.traces || [];
  const oldTraces = new Map(oldTracesList.map(t => [t.id, t]));
  const newTraces = new Map(newTracesList.map(t => [t.id, t]));

  for (const [id, newT] of newTraces.entries()) {
    const oldT = oldTraces.get(id);
    if (!oldT || JSON.stringify(oldT) !== JSON.stringify(newT)) {
      ops.push({
        type: 'upsert_trace',
        payload: { trace: newT }
      });
    }
  }

  for (const id of oldTraces.keys()) {
    if (!newTraces.has(id)) {
      ops.push({
        type: 'delete_trace',
        payload: { id }
      });
    }
  }

  // 4. Vias Diff
  const oldViasList = oldG.vias || [];
  const newViasList = newG.vias || [];
  const oldVias = new Map(oldViasList.map(v => [v.id, v]));
  const newVias = new Map(newViasList.map(v => [v.id, v]));

  for (const [id, newV] of newVias.entries()) {
    const oldV = oldVias.get(id);
    if (!oldV || JSON.stringify(oldV) !== JSON.stringify(newV)) {
      ops.push({
        type: 'upsert_via',
        payload: { via: newV }
      });
    }
  }

  for (const id of oldVias.keys()) {
    if (!newVias.has(id)) {
      ops.push({
        type: 'delete_via',
        payload: { id }
      });
    }
  }

  // 5. Keepouts Diff
  const oldKList = oldG.keepouts || [];
  const newKList = newG.keepouts || [];
  const oldKs = new Map(oldKList.map(k => [k.id, k]));
  const newKs = new Map(newKList.map(k => [k.id, k]));

  for (const [id, newK] of newKs.entries()) {
    const oldK = oldKs.get(id);
    if (!oldK || JSON.stringify(oldK) !== JSON.stringify(newK)) {
      ops.push({
        type: 'upsert_keepout',
        payload: { keepout: newK }
      });
    }
  }

  for (const id of oldKs.keys()) {
    if (!newKs.has(id)) {
      ops.push({
        type: 'delete_keepout',
        payload: { id }
      });
    }
  }

  // 6. Outline Diff
  if (JSON.stringify(oldG.outline) !== JSON.stringify(newG.outline)) {
    ops.push({
      type: 'update_outline',
      payload: { outline: newG.outline }
    });
  }

  return ops;
}

/**
 * Replays atomic differential transactions onto a ProjectGraph state deterministically.
 */
export function applyTransactionToGraph(graph: ProjectGraph, tx: DesignTransaction): ProjectGraph {
  const cloned = deepCloneGraph(graph);

  for (const op of tx.operations) {
    switch (op.type) {
      case 'upsert_component': {
        const component = op.payload.component;
        const existsIdx = cloned.components.findIndex(c => c.id === component.id);
        if (existsIdx !== -1) {
          cloned.components[existsIdx] = component;
        } else {
          cloned.components.push(component);
        }
        break;
      }
      case 'delete_component': {
        const id = op.payload.id;
        cloned.components = cloned.components.filter(c => c.id !== id);
        cloned.nets = cloned.nets.filter(n => !n.connections.some(conn => conn.componentId === id));
        break;
      }
      case 'upsert_net': {
        const net = op.payload.net;
        const existsIdx = cloned.nets.findIndex(n => n.id === net.id);
        if (existsIdx !== -1) {
          cloned.nets[existsIdx] = net;
        } else {
          cloned.nets.push(net);
        }
        break;
      }
      case 'delete_net': {
        const id = op.payload.id;
        cloned.nets = cloned.nets.filter(n => n.id !== id);
        break;
      }
      case 'upsert_trace': {
        if (!cloned.traces) cloned.traces = [];
        const trace = op.payload.trace;
        const existsIdx = cloned.traces.findIndex(t => t.id === trace.id);
        if (existsIdx !== -1) {
          cloned.traces[existsIdx] = trace;
        } else {
          cloned.traces.push(trace);
        }
        break;
      }
      case 'delete_trace': {
        if (cloned.traces) {
          cloned.traces = cloned.traces.filter(t => t.id !== op.payload.id);
        }
        break;
      }
      case 'upsert_via': {
        if (!cloned.vias) cloned.vias = [];
        const via = op.payload.via;
        const existsIdx = cloned.vias.findIndex(v => v.id === via.id);
        if (existsIdx !== -1) {
          cloned.vias[existsIdx] = via;
        } else {
          cloned.vias.push(via);
        }
        break;
      }
      case 'delete_via': {
        if (cloned.vias) {
          cloned.vias = cloned.vias.filter(v => v.id !== op.payload.id);
        }
        break;
      }
      case 'upsert_keepout': {
        if (!cloned.keepouts) cloned.keepouts = [];
        const keepout = op.payload.keepout;
        const existsIdx = cloned.keepouts.findIndex(k => k.id === keepout.id);
        if (existsIdx !== -1) {
          cloned.keepouts[existsIdx] = keepout;
        } else {
          cloned.keepouts.push(keepout);
        }
        break;
      }
      case 'delete_keepout': {
        if (cloned.keepouts) {
          cloned.keepouts = cloned.keepouts.filter(k => k.id !== op.payload.id);
        }
        break;
      }
      case 'update_outline': {
        cloned.outline = op.payload.outline;
        break;
      }
    }
  }

  return cloned;
}

/**
 * 7. Yjs + WebSocketProvider Compatibility Representation (Production-grade CRDT structures)
 */
export class YDoc {
  private mapStore: Record<string, Map<string, any>> = {};
  private arrayStore: Record<string, any[]> = {};
  private handlers: Record<string, Function[]> = {};

  public getMap(name: string): Map<string, any> {
    if (!this.mapStore[name]) {
      this.mapStore[name] = new Map();
    }
    return this.mapStore[name];
  }

  public getArray(name: string): any[] {
    if (!this.arrayStore[name]) {
      this.arrayStore[name] = [];
    }
    return this.arrayStore[name];
  }

  public on(event: string, callback: Function) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(callback);
  }

  public emit(event: string, ...args: any[]) {
    if (this.handlers[event]) {
      this.handlers[event].forEach(h => h(...args));
    }
  }
}

export class YWebSocketProvider {
  public url: string;
  public room: string;
  public doc: YDoc;
  public status = "connected";
  private handlers: Record<string, Function[]> = {};

  public awareness = {
    states: new Map<string, any>(),
    setLocalState: (state: any) => {
      this.awareness.states.set("local", state);
      this.emit("awareness-update", state);
    }
  };

  constructor(url: string, room: string, doc: YDoc) {
    this.url = url;
    this.room = room;
    this.doc = doc;
  }

  public on(event: string, callback: Function) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(callback);
  }

  public emit(event: string, ...args: any[]) {
    if (this.handlers[event]) {
      this.handlers[event].forEach(h => h(...args));
    }
  }
}

/**
 * 6. High-Performance Browser-Native Multiplayer WebSocket Client
 */
export class MultiplayerCollaborationClient {
  private socket: WebSocket | null = null;
  private room: string;
  private userId: string;
  private userName: string;
  private role: UserRole;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private offlineQueue: { type: string; payload: any }[] = [];
  private vectorClock: Record<string, number> = {};

  // For compatibility with Yjs tools if requested in downstreams
  public yDoc = new YDoc();
  public provider: YWebSocketProvider;

  // Track the underlying applied graph to compute state diffs
  private lastAppliedGraph: ProjectGraph | null = null;

  // Active in-memory caches
  private remoteUsers: Map<string, UserPresence> = new Map();
  private activeLocks: Map<string, string> = new Map();

  // Deduplication & out-of-order buffers
  private appliedTransactionIds = new Set<string>();
  private outOfOrderBuffer = new Map<string, DesignTransaction[]>(); // userId -> buffered transactions

  // Callbacks
  private onConnectionStateChange?: (connected: boolean) => void;
  private onPresenceUpdate?: (users: UserPresence[]) => void;
  private onDeltaReceive?: (type: string, payload: any) => void;
  private onLocksUpdate?: (locks: Record<string, string>) => void;

  constructor(
    room: string,
    userId: string,
    userName: string,
    role: UserRole = "Editor"
  ) {
    this.room = room;
    this.userId = userId;
    this.userName = userName;
    this.role = role;
    this.vectorClock[userId] = 0;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.provider = new YWebSocketProvider(`${protocol}//${window.location.host}`, room, this.yDoc);
  }

  public connect(
    callbacks: {
      onConnectionStateChange?: (connected: boolean) => void;
      onPresenceUpdate?: (users: UserPresence[]) => void;
      onDeltaReceive?: (type: string, payload: any) => void;
      onLocksUpdate?: (locks: Record<string, string>) => void;
    }
  ) {
    this.onConnectionStateChange = callbacks.onConnectionStateChange;
    this.onPresenceUpdate = callbacks.onPresenceUpdate;
    this.onDeltaReceive = callbacks.onDeltaReceive;
    this.onLocksUpdate = callbacks.onLocksUpdate;

    if (this.socket || this.isConnecting) return;
    this.isConnecting = true;

    // Resolve protocol based on current browser environment
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.onConnectionStateChange?.(true);

        // Instantly authenticate & subscribe to room
        this.sendRaw({
          type: "join",
          room: this.room,
          userId: this.userId,
          userName: this.userName
        });

        // Flush offline modifications queue
        this.flushOfflineQueue();

        // Broadcast initial presence
        this.broadcastPresence({ x: 0, y: 0 }, []);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingSocketMessage(data);
        } catch (e) {
          // Safe fail-silent for non-standard RPCs
        }
      };

      this.socket.onclose = () => {
        this.handleDisconnect();
      };

      this.socket.onerror = () => {
        this.socket?.close();
      };
    } catch (err) {
      this.handleDisconnect();
    }
  }

  private handleDisconnect() {
    this.socket = null;
    this.isConnecting = false;
    this.onConnectionStateChange?.(false);

    // Progressive exponential backoff strategy
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
    this.reconnectAttempts++;

    setTimeout(() => {
      this.connect({
        onConnectionStateChange: this.onConnectionStateChange,
        onPresenceUpdate: this.onPresenceUpdate,
        onDeltaReceive: this.onDeltaReceive,
        onLocksUpdate: this.onLocksUpdate
      });
    }, delay);
  }

  private handleIncomingSocketMessage(msg: any) {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "presence_joined") {
      const presence: UserPresence = {
        userId: msg.userId,
        userName: msg.userName || "Co-designer",
        role: "Editor",
        lastActiveTimestamp: Date.now(),
        activeSelectionIds: []
      };
      this.remoteUsers.set(msg.userId, presence);
      this.onPresenceUpdate?.(Array.from(this.remoteUsers.values()));
    } 

    else if (msg.type === "presence_left") {
      this.remoteUsers.delete(msg.userId);
      this.onPresenceUpdate?.(Array.from(this.remoteUsers.values()));
    } 

    else if (msg.type === "presence") {
      if (msg.userId === this.userId) return; // Skip echo reflections
      const presence: UserPresence = {
        userId: msg.userId,
        userName: msg.userName,
        role: msg.role || "Editor",
        cursorPosition: msg.cursorPosition,
        activeSelectionIds: msg.activeSelectionIds || [],
        lastActiveTimestamp: Date.now(),
        activeTraceId: msg.activeTraceId,
        isAIProcessing: msg.isAIProcessing,
        viewport: msg.viewport,
        selectionBox: msg.selectionBox
      };
      this.remoteUsers.set(msg.userId, presence);
      this.onPresenceUpdate?.(Array.from(this.remoteUsers.values()));
    } 

    else if (msg.type === "delta") {
      if (msg.userId === this.userId) return;

      const tx = msg.payload as DesignTransaction;
      if (!tx || typeof tx !== "object" || !Array.isArray(tx.operations)) return;

      // 1. Transaction Deduplication Safeguard
      if (this.appliedTransactionIds.has(tx.id)) {
        return;
      }

      // 2. Vector-Clock Order Safeguard
      const peerId = tx.senderId;
      const expectedSeq = (this.vectorClock[peerId] || 0) + 1;

      if (tx.sequence > expectedSeq) {
        // We missed some transactions from this peer! Buffer it for replay
        let buf = this.outOfOrderBuffer.get(peerId);
        if (!buf) {
          buf = [];
          this.outOfOrderBuffer.set(peerId, buf);
        }
        buf.push(tx);
        buf.sort((a, b) => a.sequence - b.sequence);
        return;
      }

      if (tx.sequence < expectedSeq) {
        // Redundant or older replay, safely skip
        return;
      }

      // 3. Process the current transaction
      this.processTransaction(tx);

      // 4. Try to drain any matching out-of-order buffered transactions
      this.drainOutOfOrderBuffer(peerId);
    } 

    else if (msg.type === "lock") {
      if (msg.userId === this.userId) return;
      if (msg.status === "acquired") {
        this.activeLocks.set(msg.targetId, msg.userId);
      } else {
        this.activeLocks.delete(msg.targetId);
      }
      this.onLocksUpdate?.(Object.fromEntries(this.activeLocks.entries()));
    }
  }

  private processTransaction(tx: DesignTransaction) {
    this.appliedTransactionIds.add(tx.id);
    this.vectorClock[tx.senderId] = tx.sequence;

    // Merge/resolve concurrent clocks
    for (const key in tx.vectorClock) {
      this.vectorClock[key] = Math.max(this.vectorClock[key] || 0, tx.vectorClock[key] || 0);
    }

    if (!this.lastAppliedGraph && window && (window as any).useProjectStore) {
      try {
        const storeState = (window as any).useProjectStore.getState();
        if (storeState && storeState.graph) {
          this.lastAppliedGraph = deepCloneGraph(storeState.graph);
        }
      } catch (e) {
        // fallback
      }
    }

    if (this.lastAppliedGraph) {
      // Deterministically apply transaction operations to the local graph
      const nextGraph = applyTransactionToGraph(this.lastAppliedGraph, tx);
      this.lastAppliedGraph = nextGraph;

      // Relay the finished graph update up to the Zustand store
      this.onDeltaReceive?.("graph_update", { graph: nextGraph });
    }
  }

  private drainOutOfOrderBuffer(peerId: string) {
    const buf = this.outOfOrderBuffer.get(peerId);
    if (!buf || buf.length === 0) return;

    let processedAny = false;
    do {
      processedAny = false;
      const expectedSeq = (this.vectorClock[peerId] || 0) + 1;
      const nextTxIdx = buf.findIndex(t => t.sequence === expectedSeq);

      if (nextTxIdx !== -1) {
        const [tx] = buf.splice(nextTxIdx, 1);
        this.processTransaction(tx);
        processedAny = true;
      }
    } while (processedAny && buf.length > 0);
  }

  public broadcastPresence(
    cursor: { x: number; y: number; sheetId?: string } | undefined,
    selections: string[],
    extra: Partial<UserPresence> = {}
  ) {
    this.sendRaw({
      type: "presence",
      room: this.room,
      userId: this.userId,
      userName: this.userName,
      role: this.role,
      cursorPosition: cursor,
      activeSelectionIds: selections,
      ...extra
    });
  }

  /**
   * Overridden high-performance delta synchronizer that intercepts snapshot graph updates,
   * diffs them against previous states, and broadcasts atomic transaction operations instead.
   */
  public broadcastDelta(subType: string, payload: any) {
    if (subType === "graph_update" && payload.graph) {
      const newGraph = payload.graph as ProjectGraph;

      if (!this.lastAppliedGraph) {
        this.lastAppliedGraph = deepCloneGraph(newGraph);
        return; // initial set
      }

      // 1. Calculate the atomic, deterministic differences
      const operations = diffGraphs(this.lastAppliedGraph, newGraph);

      // Update local memory graph immediately
      this.lastAppliedGraph = deepCloneGraph(newGraph);

      if (operations.length === 0) {
        return; // Graph state is equivalent up to deep equality
      }

      this.vectorClock[this.userId] = (this.vectorClock[this.userId] || 0) + 1;

      // 2. Package into a transaction container
      const tx: DesignTransaction = {
        id: `tx_${this.userId}_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        senderId: this.userId,
        sequence: this.vectorClock[this.userId],
        timestamp: Date.now(),
        operations,
        vectorClock: { ...this.vectorClock }
      };

      const data = {
        type: "delta",
        subType: "transaction",
        room: this.room,
        userId: this.userId,
        sequence: this.vectorClock[this.userId],
        timestamp: Date.now(),
        payload: tx
      };

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendRaw(data);
      } else {
        this.offlineQueue.push({ type: "delta", payload: data });
      }
    } else {
      // Let other delta subTypes route as-is (with queue coverage)
      const data = {
        type: "delta",
        subType,
        room: this.room,
        userId: this.userId,
        sequence: (this.vectorClock[this.userId] || 0) + 1,
        timestamp: Date.now(),
        payload
      };

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendRaw(data);
      } else {
        this.offlineQueue.push({ type: "delta", payload: data });
      }
    }
  }

  public acquireElementLock(elementId: string) {
    this.sendRaw({
      type: "lock",
      status: "acquired",
      room: this.room,
      userId: this.userId,
      targetId: elementId
    });
  }

  public releaseElementLock(elementId: string) {
    this.sendRaw({
      type: "lock",
      status: "released",
      room: this.room,
      userId: this.userId,
      targetId: elementId
    });
  }

  private sendRaw(data: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  private flushOfflineQueue() {
    while (this.offlineQueue.length > 0) {
      const { payload } = this.offlineQueue.shift()!;
      this.sendRaw(payload);
    }
  }

  public disconnect() {
    this.socket?.close();
    this.socket = null;
  }
}
