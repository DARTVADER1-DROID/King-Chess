import test from "node:test";
import assert from "node:assert/strict";
import { AnalysisQueue, AnalysisQueueFullError } from "../src/application/analysis/AnalysisQueue.js";
import { AnalysisService } from "../src/analysis/AnalysisService.js";
import type { ChessEngine } from "../src/analysis/engine/EnginePort.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("serializes engine work and bounds the waiting queue", async () => {
  const queue = new AnalysisQueue(2);
  const firstStarted = deferred<void>();
  const releaseFirst = deferred<void>();
  let active = 0;
  let maximumActive = 0;

  const run = (depth: number) => queue.run(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (depth === 5) {
      firstStarted.resolve();
      await releaseFirst.promise;
    }
    active -= 1;
    return depth;
  });

  const first = run(5);
  await firstStarted.promise;
  const second = run(10);
  const third = run(15);

  await assert.rejects(
    queue.run(async () => 20),
    AnalysisQueueFullError
  );

  releaseFirst.resolve();
  assert.deepEqual(await Promise.all([first, second, third]), [5, 10, 15]);
  assert.equal(maximumActive, 1);
});

test("removes a cancelled request while it is still queued", async () => {
  const queue = new AnalysisQueue(2);
  const firstStarted = deferred<void>();
  const releaseFirst = deferred<void>();
  let cancelledOperationRan = false;

  const first = queue.run(async () => {
    firstStarted.resolve();
    await releaseFirst.promise;
    return "first";
  });
  await firstStarted.promise;

  const controller = new AbortController();
  const cancelled = queue.run(async () => {
    cancelledOperationRan = true;
    return "cancelled";
  }, controller.signal);

  controller.abort();
  await assert.rejects(cancelled, error => error instanceof Error && error.name === "AbortError");
  releaseFirst.resolve();
  assert.equal(await first, "first");
  assert.equal(cancelledOperationRan, false);
});

test("passes active request cancellation through to the engine", async () => {
  const started = deferred<void>();
  let receivedSignal: AbortSignal | undefined;
  const engine: ChessEngine = {
    async analyze(_fen, _depth, _multiPv, signal) {
      receivedSignal = signal;
      started.resolve();
      return new Promise<EngineAnalysis>((_resolve, reject) => {
        const abort = () => {
          const error = new Error("cancelled");
          error.name = "AbortError";
          reject(error);
        };
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      });
    },
    async close() {}
  };

  const service = new AnalysisService(engine);
  const controller = new AbortController();
  const request = service.analyze({ fen: START_FEN, depth: 10 }, controller.signal);
  await started.promise;
  assert.equal(receivedSignal, controller.signal);

  controller.abort();
  await assert.rejects(request, error => error instanceof Error && error.name === "AbortError");
});
