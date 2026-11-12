import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { ChessEngine, EngineAnalysis, EngineScore } from "../../analysis/engine/EnginePort.js";

interface UciInfo {
  multipv?: number;
  depth?: number;
  nodes?: number;
  timeMs?: number;
  score?: EngineScore;
  principalVariation?: string[];
}

export function parseUciInfo(line: string): UciInfo | null {
  if (!line.startsWith("info ")) return null;
  const depth = line.match(/\bdepth (\d+)/);
  const multipv = line.match(/\bmultipv (\d+)/);
  const nodes = line.match(/\bnodes (\d+)/);
  const time = line.match(/\btime (\d+)/);
  const cp = line.match(/\bscore cp (-?\d+)/);
  const mate = line.match(/\bscore mate (-?\d+)/);
  const pv = line.match(/\bpv (.+)$/);
  const score: EngineScore | undefined = cp
    ? { kind: "centipawns", value: Number(cp[1]), perspective: "side-to-move" }
    : mate ? { kind: "mate", value: Number(mate[1]), perspective: "side-to-move" } : undefined;
  const result: UciInfo = {};
  if (depth) result.depth = Number(depth[1]);
  if (multipv) result.multipv = Number(multipv[1]);
  if (nodes) result.nodes = Number(nodes[1]);
  if (time) result.timeMs = Number(time[1]);
  if (score) result.score = score;
  if (pv) result.principalVariation = pv[1].trim().split(/\s+/);
  return Object.keys(result).length ? result : null;
}

interface Waiter {
  predicate: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const STARTUP_TIMEOUT_MS = 10_000;
const SEARCH_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 1_500;

function createAbortError(): Error {
  const error = new Error("Analysis request was cancelled.");
  error.name = "AbortError";
  return error;
}

/** UCI adapter around one locally installed Stockfish executable. */
export class UciStockfishEngine implements ChessEngine {
  private child: ChildProcessWithoutNullStreams | null = null;
  private reader: Interface | null = null;
  private startup: Promise<void> | null = null;
  private waiters: Waiter[] = [];
  private lineBuffer: string[] = [];
  private latestInfos = new Map<number, UciInfo>();
  private busy = false;
  private closing = false;
  private closePromise: Promise<void> | null = null;
  private activeAbort: (() => void) | null = null;
  private activeAnalysisDone: Promise<void> | null = null;
  private resolveActiveAnalysis: (() => void) | null = null;

  constructor(private readonly executablePath = process.env.STOCKFISH_PATH ?? "stockfish") {}

  private async start(): Promise<void> {
    if (this.closing) throw new Error("Stockfish is shutting down.");
    if (this.startup) return this.startup;
    if (this.child) return;

    this.startup = (async () => {
      this.lineBuffer = [];
      const child = spawn(this.executablePath, [], { stdio: ["pipe", "pipe", "pipe"] });
      this.child = child;
      const reader = createInterface({ input: child.stdout });
      this.reader = reader;
      reader.on("line", line => this.onLine(line.trim()));
      child.stderr.on("data", () => { /* Engine diagnostics stay server-side. */ });
      child.on("error", error => {
        if (this.child === child) {
          this.clearChild(child, reader, new Error("Could not start Stockfish: " + error.message), false);
        }
      });
      child.on("exit", code => {
        if (this.child === child) {
          this.clearChild(child, reader, new Error("Stockfish exited unexpectedly (code " + code + ")."), false);
        }
      });

      try {
        await this.commandAndWait("uci", line => line === "uciok", STARTUP_TIMEOUT_MS);
        await this.commandAndWait("isready", line => line === "readyok", STARTUP_TIMEOUT_MS);
      } catch (error) {
        if (this.child === child) {
          this.clearChild(
            child,
            reader,
            error instanceof Error ? error : new Error("Stockfish initialization failed."),
            true
          );
        }
        throw error;
      }
    })();

    try { await this.startup; }
    finally { this.startup = null; }
  }

  private onLine(line: string): void {
    const info = parseUciInfo(line);
    if (info) {
      const index = info.multipv ?? 1;
      const previous = this.latestInfos.get(index);
      const previousDepth = previous?.depth ?? 0;
      const nextDepth = info.depth ?? previousDepth;
      if (!previous || nextDepth >= previousDepth) {
        this.latestInfos.set(index, { ...previous, ...info });
      }
    }
    const index = this.waiters.findIndex(waiter => waiter.predicate(line));
    if (index >= 0) {
      const [waiter] = this.waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(line);
      return;
    }
    this.lineBuffer.push(line);
    if (this.lineBuffer.length > 100) this.lineBuffer.shift();
  }

  private failAll(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private clearChild(
    child: ChildProcessWithoutNullStreams,
    reader: Interface | null,
    error: Error,
    kill: boolean
  ): void {
    if (this.child === child) this.child = null;
    if (this.reader === reader) {
      reader?.close();
      this.reader = null;
    }
    this.lineBuffer = [];
    this.failAll(error);
    if (kill) {
      try { child.kill(); } catch { /* Process may already have exited. */ }
    }
  }

  private discardProcess(error: Error): void {
    const child = this.child;
    if (!child) return;
    this.clearChild(child, this.reader, error, true);
  }

  private waitForLine(predicate: (line: string) => boolean, timeoutMs = STARTUP_TIMEOUT_MS): Promise<string> {
    const index = this.lineBuffer.findIndex(predicate);
    if (index >= 0) return Promise.resolve(this.lineBuffer.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        predicate, resolve, reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter(item => item !== waiter);
          reject(new Error("Timed out waiting for Stockfish."));
        }, timeoutMs)
      };
      this.waiters.push(waiter);
    });
  }

  private async commandAndWait(
    command: string,
    predicate: (line: string) => boolean,
    timeoutMs = STARTUP_TIMEOUT_MS
  ): Promise<string> {
    if (!this.child) throw new Error("Stockfish process is not running.");
    const response = this.waitForLine(predicate, timeoutMs);
    this.child.stdin.write(command + "\n");
    return response;
  }

  async analyze(fen: string, depth: number, multiPv = 3, signal?: AbortSignal): Promise<EngineAnalysis> {
    if (signal?.aborted) throw createAbortError();
    if (this.closing) throw new Error("Stockfish is shutting down.");
    if (this.busy) throw new Error("The analysis engine received overlapping work.");

    this.busy = true;
    this.activeAnalysisDone = new Promise<void>(resolve => { this.resolveActiveAnalysis = () => resolve(); });
    try {
      await this.start();
      if (this.closing || signal?.aborted) throw createAbortError();
      const child = this.child;
      if (!child) throw new Error("Stockfish is unavailable.");

      this.latestInfos.clear();
      this.lineBuffer = [];
      const candidateCount = Math.max(1, Math.min(5, Math.floor(multiPv)));
      child.stdin.write("setoption name MultiPV value " + candidateCount + "\n");
      await this.commandAndWait("isready", line => line === "readyok", STARTUP_TIMEOUT_MS);
      if (this.closing || signal?.aborted) throw createAbortError();

      child.stdin.write("position fen " + fen + "\n");
      const bestMovePromise = this.waitForLine(line => line.startsWith("bestmove "), SEARCH_TIMEOUT_MS);
      let abortRequested = false;
      let abortStopTimer: ReturnType<typeof setTimeout> | null = null;
      const onAbort = () => {
        if (abortRequested) return;
        abortRequested = true;
        try { this.child?.stdin.write("stop\n"); } catch { /* Process may already have exited. */ }
        abortStopTimer = setTimeout(() => {
          this.discardProcess(new Error("Stockfish did not stop after cancellation."));
        }, STOP_TIMEOUT_MS);
      };

      try {
        child.stdin.write("go depth " + depth + "\n");
        signal?.addEventListener("abort", onAbort, { once: true });
        this.activeAbort = onAbort;
        if (signal?.aborted || this.closing) onAbort();

        let bestLine: string;
        let searchCompleted = false;
        try {
          bestLine = await bestMovePromise;
          searchCompleted = true;
          if (abortRequested || signal?.aborted || this.closing) throw createAbortError();
        } catch (error) {
          if (!searchCompleted && this.child) {
            if (!abortRequested) {
              try { this.child.stdin.write("stop\n"); } catch { /* Process may already have exited. */ }
            }
            try {
              await this.waitForLine(line => line.startsWith("bestmove "), STOP_TIMEOUT_MS);
            } catch {
              this.discardProcess(new Error("Stockfish did not recover after an interrupted search."));
            }
          }
          throw error;
        }

        const bestMove = bestLine.split(/\s+/)[1];
        const lines = [...this.latestInfos.entries()]
          .sort(([left], [right]) => left - right)
          .map(([rank, info]) => ({
            rank,
            move: info.principalVariation?.[0] ?? null,
            score: info.score ?? null,
            depth: info.depth ?? depth,
            nodes: info.nodes ?? null,
            timeMs: info.timeMs ?? null,
            moves: info.principalVariation ?? []
          }));
        const best = this.latestInfos.get(1) ?? (lines[0] ? {
          score: lines[0].score, depth: lines[0].depth, nodes: lines[0].nodes,
          timeMs: lines[0].timeMs, principalVariation: lines[0].moves
        } : undefined);
        return {
          bestMove: !bestMove || bestMove === "(none)" || bestMove === "0000" ? null : bestMove,
          score: best?.score ?? null,
          depth: best?.depth ?? depth,
          nodes: best?.nodes ?? null,
          timeMs: best?.timeMs ?? null,
          principalVariation: best?.principalVariation ?? [],
          lines
        };
      } finally {
        if (abortStopTimer) clearTimeout(abortStopTimer);
        signal?.removeEventListener("abort", onAbort);
        if (this.activeAbort === onAbort) this.activeAbort = null;
      }
    } finally {
      this.busy = false;
      this.activeAbort = null;
      this.resolveActiveAnalysis?.();
      this.resolveActiveAnalysis = null;
      this.activeAnalysisDone = null;
    }
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (async () => {
      this.activeAbort?.();
      await this.activeAnalysisDone;
      const child = this.child;
      const reader = this.reader;
      if (!child) return;

      const exited = new Promise<boolean>(resolve => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve(true);
          return;
        }
        const onExit = () => {
          clearTimeout(timer);
          resolve(true);
        };
        const timer = setTimeout(() => {
          child.off("exit", onExit);
          resolve(false);
        }, SHUTDOWN_TIMEOUT_MS);
        child.once("exit", onExit);
      });

      try { child.stdin.write("quit\n"); } catch { /* Process may already have exited. */ }
      if (!(await exited)) {
        try { child.kill(); } catch { /* Process may already have exited. */ }
      }
      if (this.child === child) this.child = null;
      if (this.reader === reader) {
        reader?.close();
        this.reader = null;
      }
      this.failAll(new Error("Stockfish engine closed."));
    })();
    return this.closePromise;
  }
}
