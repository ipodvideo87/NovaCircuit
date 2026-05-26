import { ProjectGraph } from '../../types';
import { globalTelemetry, ObservableEventType } from '../observability/observabilityRuntime';

export interface StagedTransaction {
  id: string;
  description: string;
  timestamp: number;
  mutation: (state: ProjectGraph) => ProjectGraph;
  status: 'draft' | 'dry_run_success' | 'committed' | 'failed';
  error?: string;
}

export class TransactionStreamer {
  private stagedQueue: StagedTransaction[] = [];
  private history: StagedTransaction[] = [];

  /**
   * Stages a layout graph mutation transaction.
   */
  public enqueue(description: string, mutation: (state: ProjectGraph) => ProjectGraph): string {
    const id = `tx-stream-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
    const tx: StagedTransaction = {
      id,
      description,
      timestamp: Date.now(),
      mutation,
      status: 'draft'
    };

    this.stagedQueue.push(tx);
    globalTelemetry.logEvent(
      ObservableEventType.TRANSACTION,
      "Transaction Mutation Staged",
      `Buffered pipeline transaction: "${description}"`,
      "success",
      { id, description }
    );

    return id;
  }

  /**
   * Evaluates all queued mutations sequentially and commits atomically if successful.
   */
  public applyStreamPipeline(initialState: ProjectGraph): { finalState: ProjectGraph; committedCount: number; errors: string[] } {
    let state = JSON.parse(JSON.stringify(initialState));
    let committedCount = 0;
    const errors: string[] = [];

    while (this.stagedQueue.length > 0) {
      const tx = this.stagedQueue.shift()!;
      try {
        // DRY RUN first (clone state reference to check sanity)
        const stateTrial = JSON.parse(JSON.stringify(state));
        const mutatedTrial = tx.mutation(stateTrial);

        if (!mutatedTrial || !mutatedTrial.components || !mutatedTrial.nets) {
          throw new Error("Mutation dry-run produced invalid ProjectGraph structural parameters.");
        }

        // Apply mutations
        state = tx.mutation(state);
        tx.status = 'committed';
        this.history.push(tx);
        committedCount++;

        globalTelemetry.logEvent(
          ObservableEventType.TRANSACTION,
          `Transaction Committed`,
          `Applied logical change: "${tx.description}"`,
          "success",
          { txId: tx.id }
        );

      } catch (err: any) {
        tx.status = 'failed';
        tx.error = err?.message || String(err);
        this.history.push(tx);
        errors.push(`Error executing transaction ${tx.id} ("${tx.description}"): ${tx.error}`);

        globalTelemetry.logEvent(
          ObservableEventType.TRANSACTION,
          `Transaction Execution Corrupted`,
          `Rolled back operation: "${tx.description}" - Reason: ${tx.error}`,
          "error",
          { txId: tx.id }
        );
      }
    }

    return {
      finalState: state,
      committedCount,
      errors
    };
  }

  public getHistory(): StagedTransaction[] {
    return [...this.history];
  }

  public clear() {
    this.stagedQueue = [];
    this.history = [];
  }
}

export const transactionStreamer = new TransactionStreamer();
