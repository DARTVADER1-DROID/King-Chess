import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough, Writable } from "node:stream";
import { UciStockfishEngine } from "../src/infrastructure/engine/UciStockfishEngine.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

class FakeStockfish extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly commands: string[] = [];
  readonly stdin: Writable;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  private commandWaiters: Array<{ command: string; resolve: () => void }> = [];

  constructor(private holdSearch: boolean) {
    super();
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        for (const command of chunk.toString().split(/\r?\n/).filter(Boolean)) {
          this.handleCommand(command);
        }
        callback();
      }
    });
  }

  waitForCommand(command: string): Promise<void> {
    if (this.commands.includes(command)) return Promise.resolve();
    return new Promise(resolve => this.commandWaiters.push({ command, resolve }));
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  }

  private handleCommand(command: string): void {
    this.commands.push(command);
    const waiterIndex = this.commandWaiters.findIndex(waiter => waiter.command === command);
    if (waiterIndex >= 0) this.commandWaiters.splice(waiterIndex, 1)[0].resolve();

    if (command === "uci") this.stdout.write("uciok\n");
    else if (command === "isready") this.stdout.write("readyok\n");
    else if (command === "stop") {
      this.holdSearch = false;
      this.stdout.write("bestmove e2e4\n");
    } else if (command.startsWith("go depth ") && !this.holdSearch) {
      queueMicrotask(() => {
        this.stdout.write("info depth 5 multipv 1 score cp 25 nodes 100 time 1 pv e2e4 e7e5\n");
        this.stdout.write("bestmove e2e4\n");
      });
    } else if (command === "quit") {
      this.exitCode = 0;
      queueMicrotask(() => this.emit("exit", 0, null));
    }
  }
}

test("stops an aborted UCI search and reuses the synchronized engine", async () => {
  const child = new FakeStockfish(true);
  const fakeSpawn = (() => child as unknown as ChildProcessWithoutNullStreams) as never;
  const engine = new UciStockfishEngine("fake-stockfish", fakeSpawn);
  const controller = new AbortController();

  const cancelledSearch = engine.analyze(START_FEN, 10, 1, controller.signal);
  await child.waitForCommand("go depth 10");
  controller.abort();

  await assert.rejects(
    cancelledSearch,
    error => error instanceof Error && error.name === "AbortError"
  );
  assert.ok(child.commands.includes("stop"));

  const nextSearch = await engine.analyze(START_FEN, 5, 1);
  assert.equal(nextSearch.bestMove, "e2e4");
  assert.equal(nextSearch.depth, 5);

  await engine.close();
  assert.ok(child.commands.includes("quit"));
});
