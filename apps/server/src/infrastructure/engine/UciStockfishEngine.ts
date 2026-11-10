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
  const depth = line.match(/\\bdepth (\\d+)/);
  const multipv = line.match(/\\bmultipv (\\d+)/);
  const nodes = line.match(/\\bnodes (\\d+)/);
  const time = line.match(/\\btime (\\d+)/);
  const cp = line.match(/\\bscore cp (-?\\d+)/);
  const mate = line.match(/\\bscore mate (-?\\d+)/);
  const pv = line.match(/\\bpv (.+)$/);
  const score: EngineScore | undefined = cp
    ? { kind: "centipawns", value: Number(cp[1]), perspective: "side-to-move" }
    : mate ? { kind: "mate", value: Number(mate[1]), perspective: "side-to-move" } : undefined;
  const result: UciInfo = {};
  if (depth) result.depth = Number(depth[1]);
  if (multipv) result.multipv = Number(multipv[1]);
  if (nodes) result.nodes = Number(nodes[1]);
  if (time) result.timeMs = Number(time[1]);
  if (score) result.score = score;
  if (pv) result.principalVariation = pv[1].trim().split(/\\s+/);
  return Object.keys(result).length ? result : null;
}

interface Waiter {
  predicate: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** UCI adapter around a locally installed Stockfish executable. One search at a time. */
export class UciStockfishEngine implements ChessEngine {
  private child: ChildProcessWithoutNullStreams | null = null;
  private reader: Interface | null = null;
  private startup: Promise<void> | null = null;
  private waiters: Waiter[] = [];
  private lineBuffer: string[] = [];
  private latestInfos = new Map<number, UciInfo>();
  private busy = false;

  constructor(private readonly executablePath = process.env.STOCKFISH_PATH ?? "stockfish") {}

  private async start(): Promise<void> {
    if (this.child) return;
    if (this.startup) return this.startup;
    this.startup = (async () => {
      const child = spawn(this.executablePath, [], { stdio: ["pipe", "pipe", "pipe"] });
      this.child = child;
      this.reader = createInterface({ input: child.stdout });
      this.reader.on("line", line => this.onLine(line.trim()));
      child.stderr.on("data", () => { /* Engine diagnostics stay server-side. */ });
      child.on("error", error => {
        this.child = null;
        this.failAll(new Error("Could not start Stockfish: " + error.message));
      });
      child.on("exit", code => {
        this.child = null;
        this.failAll(new Error("Stockfish exited unexpectedly (code " + code + ")."));
      });
      await this.commandAndWait("uci", line => line === "uciok");
      await this.commandAndWait("isready", line => line === "readyok");
    })();
    try { await this.startup; } finally { this.startup = null; }
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
    this.lineBuffer.push(line);
    if (this.lineBuffer.length > 100) this.lineBuffer.shift();
    const index = this.waiters.findIndex(waiter => waiter.predicate(line));
    if (index >= 0) {
      const [waiter] = this.waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(line);
    }
  }

  private failAll(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private waitForLine(predicate: (line: string) => boolean, timeoutMs = 30000): Promise<string> {
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

  private async commandAndWait(command: string, predicate: (line: string) => boolean): Promise<string> {
    if (!this.child) throw new Error("Stockfish process is not running.");
    const response = this.waitForLine(predicate);
    this.child.stdin.write(command + "\\n");
    return response;
  }

  async analyze(fen: string, depth: number, multiPv = 3): Promise<EngineAnalysis> {
    if (this.busy) throw new Error("The analysis engine is busy. Retry shortly.");
    this.busy = true;
    try {
      await this.start();
      if (!this.child) throw new Error("Stockfish is unavailable.");
      this.latestInfos.clear();
      this.lineBuffer = [];
      const candidateCount = Math.max(1, Math.min(5, Math.floor(multiPv)));
      this.child.stdin.write("setoption name MultiPV value " + candidateCount + "\\n");
      await this.commandAndWait("isready", line => line === "readyok");
      this.child.stdin.write("position fen " + fen + "\\n");
      const response = this.waitForLine(line => line.startsWith("bestmove "));
      this.child.stdin.write("go depth " + depth + "\\n");
      let bestLine: string;
      try { bestLine = await response; }
      catch (error) {
        this.child?.stdin.write("stop\\n");
        try { await this.waitForLine(line => line.startsWith("bestmove "), 5000); } catch { /* engine may have exited */ }
        throw error;
      }
      const bestMove = bestLine.split(/\\s+/)[1];
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
      const best = this.latestInfos.get(1) ?? lines[0];
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
      this.busy = false;
    }
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child) return;
    try { child.stdin.write("quit\\n"); } catch { /* process already closed */ }
    this.reader?.close();
    this.reader = null;
    child.kill();
  }
}
