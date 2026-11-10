import { useState } from "react";
import type { AnalysisResponse } from "@king-chess/shared";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const DEPTH_PRESETS = [
  { value: 5, label: "Quick", detail: "Depth 5 · fastest" },
  { value: 10, label: "Standard", detail: "Depth 10 · balanced" },
  { value: 15, label: "Deep", detail: "Depth 15 · detailed" },
  { value: 20, label: "Very deep", detail: "Depth 20 · slower" },
  { value: 22, label: "Maximum", detail: "Depth 22 · slowest" }
];

function formatScore(result: AnalysisResponse): string {
  if (!result.score) return "Score unavailable";
  if (result.score.kind === "mate") {
    return result.score.value > 0
      ? `Mate in ${result.score.value}`
      : `Mated in ${Math.abs(result.score.value)}`;
  }
  const pawns = result.score.value / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)} pawns`;
}

export default function App() {
  const [fen, setFen] = useState(STARTING_FEN);
  const [depth, setDepth] = useState(15);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  async function analyzePosition() {
    setIsAnalyzing(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: fen.trim(), depth })
      });
      const data = await response.json() as AnalysisResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Analysis request failed.");
      }
      setResult(data as AnalysisResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to analyse this position.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <main className="shell">
      <section className="workspace">
        <header className="hero">
          <p className="eyebrow">MULTIPLAYER CHESS · ENGINE LAB</p>
          <h1>King Chess</h1>
          <p className="intro">Analyse a chess position with Stockfish. Choose how deeply the engine searches before requesting an evaluation.</p>
        </header>

        <section className="analysis-panel" aria-labelledby="analysis-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">STOCKFISH</p>
              <h2 id="analysis-heading">Position analysis</h2>
            </div>
            <span className="engine-tag">ENGINE ANALYSIS</span>
          </div>

          <label htmlFor="fen">Position (FEN)</label>
          <textarea id="fen" value={fen} onChange={(event) => setFen(event.target.value)} rows={3} spellCheck={false} />

          <div className="depth-heading">
            <label htmlFor="depth">Analysis depth</label>
            <span className="depth-value">{depth}</span>
          </div>
          <select id="depth" value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
            {DEPTH_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label} — {preset.detail}</option>
            ))}
          </select>
          <p className="hint">Higher depth searches further ahead and usually takes longer. Maximum supported depth is 22.</p>

          <button className="analyze-button" onClick={analyzePosition} disabled={isAnalyzing || !fen.trim()}>
            {isAnalyzing ? "Analysing position…" : "Analyse position"}
          </button>

          {error && <p className="error" role="alert">{error}</p>}

          {result && (
            <section className="result" aria-live="polite">
              <div className="result-topline">
                <h3>Engine evaluation</h3>
                <span>Depth {result.depth}</span>
              </div>
              <p className="score">{formatScore(result)}</p>
              <div className="result-grid">
                <div><span>Best move</span><strong>{result.bestMove ?? "—"}</strong></div>
                <div><span>Nodes searched</span><strong>{result.nodes?.toLocaleString() ?? "—"}</strong></div>
                <div><span>Time</span><strong>{result.timeMs == null ? "—" : `${result.timeMs} ms`}</strong></div>
              </div>
              <div className="variation">
                <span>Principal variation</span>
                <p>{result.principalVariation.length ? result.principalVariation.join("  ") : "No variation returned."}</p>
              </div>
              <p className="hint">Score is reported from the perspective of the side to move.</p>
            </section>
          )}
        </section>
        <footer>Analysis requires the Stockfish engine to be installed and available to the server.</footer>
      </section>
    </main>
  );
}
