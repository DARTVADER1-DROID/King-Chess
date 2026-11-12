export class AnalysisQueueFullError extends Error {
  constructor() {
    super("The analysis queue is full. Retry shortly.");
    this.name = "AnalysisQueueFullError";
  }
}

interface QueueJob {
  operation: () => Promise<unknown>;
  signal?: AbortSignal;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  abortListener?: () => void;
}

function createAbortError(): Error {
  const error = new Error("Analysis request was cancelled.");
  error.name = "AbortError";
  return error;
}

/**
 * Serializes access to the single Stockfish process and bounds waiting work.
 * The active job receives its AbortSignal; queued jobs can be removed before
 * they consume engine time.
 */
export class AnalysisQueue {
  private active = false;
  private readonly pending: QueueJob[] = [];

  constructor(private readonly maxPending = 2) {
    if (!Number.isInteger(maxPending) || maxPending < 0) {
      throw new RangeError("maxPending must be a non-negative integer.");
    }
  }

  run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(createAbortError());

    if (!this.active) {
      this.active = true;
      return this.execute(operation);
    }

    if (this.pending.length >= this.maxPending) {
      return Promise.reject(new AnalysisQueueFullError());
    }

    return new Promise<T>((resolve, reject) => {
      const job: QueueJob = {
        operation,
        signal,
        resolve: value => resolve(value as T),
        reject
      };

      if (signal) {
        job.abortListener = () => {
          const index = this.pending.indexOf(job);
          if (index < 0) return;
          this.pending.splice(index, 1);
          signal.removeEventListener("abort", job.abortListener!);
          reject(createAbortError());
        };
        signal.addEventListener("abort", job.abortListener, { once: true });
        if (signal.aborted) {
          job.abortListener();
          return;
        }
      }

      this.pending.push(job);
    });
  }

  private execute<T>(operation: () => Promise<T>): Promise<T> {
    return Promise.resolve()
      .then(operation)
      .finally(() => this.startNext());
  }

  private startNext(): void {
    while (this.pending.length > 0) {
      const job = this.pending.shift()!;
      if (job.signal && job.abortListener) {
        job.signal.removeEventListener("abort", job.abortListener);
      }
      if (job.signal?.aborted) {
        job.reject(createAbortError());
        continue;
      }

      void this.execute(job.operation).then(job.resolve, job.reject);
      return;
    }

    this.active = false;
  }
}
