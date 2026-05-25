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

  // Active in-memory caches
  private remoteUsers: Map<string, UserPresence> = new Map();
  private activeLocks: Map<string, string> = new Map();

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
      // Create user presence shell
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
        lastActiveTimestamp: Date.now()
      };
      this.remoteUsers.set(msg.userId, presence);
      this.onPresenceUpdate?.(Array.from(this.remoteUsers.values()));
    } 

    else if (msg.type === "delta") {
      if (msg.userId === this.userId) return;
      // Increment other peers vector clocks
      const peerId = msg.userId;
      this.vectorClock[peerId] = Math.max(this.vectorClock[peerId] || 0, msg.sequence || 0);

      this.onDeltaReceive?.(msg.subType, msg.payload);
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

  public broadcastPresence(
    cursor: { x: number; y: number; sheetId?: string } | undefined,
    selections: string[]
  ) {
    this.sendRaw({
      type: "presence",
      room: this.room,
      userId: this.userId,
      userName: this.userName,
      role: this.role,
      cursorPosition: cursor,
      activeSelectionIds: selections
    });
  }

  public broadcastDelta(subType: string, payload: any) {
    this.vectorClock[this.userId] = (this.vectorClock[this.userId] || 0) + 1;

    const data = {
      type: "delta",
      subType,
      room: this.room,
      userId: this.userId,
      sequence: this.vectorClock[this.userId],
      timestamp: Date.now(),
      payload
    };

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendRaw(data);
    } else {
      this.offlineQueue.push({ type: "delta", payload: data });
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
