import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import type { AnalysisResponse } from "@king-chess/shared";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const START_FEN = new Chess().fen();
const PIECES: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟"
};
const DEPTHS = [
  { value: 5, label: "Quick" },
  { value: 10, label: "Standard" },
  { value: 15, label: "Deep" },
  { value: 20, label: "Very deep" },
  { value: 22, label: "Maximum" }
];

function scoreLabel(result: AnalysisResponse): string {
  if (!result.score) return "Evaluation unavailable";
  if (result.score.kind === "mate") {
    return result.score.value > 0
      ? `Mate in ${result.score.value}`
      : `Mated in ${Math.abs(result.score.value)}`;
  }
  const pawns = result.score.value / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export default function App() {
  const [fen, setFen] = useState(START_FEN);
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [depth, setDepth] = useState(15);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then((response) => { if (!response.ok) throw new Error("API unavailable"); return response.json(); })
      .then(() => { if (active) setApiStatus("online"); })
      .catch(() => { if (active) setApiStatus("offline"); });
    return () => { active = false; };
  }, []);

  const game = useMemo(() => new Chess(fen), [fen]);
  const legalTargets = useMemo(() => {
    if (!selected) return [];
    return game.moves({ square: selected, verbose: true }).map((move) => move.to);
  }, [game, selected]);

  const boardRanks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const boardFiles = flipped ? [...FILES].reverse() : FILES;
  const history = game.history();
  const status = game.isCheckmate()
    ? `Checkmate · ${game.turn() === "w" ? "Black" : "White"} wins`
    : game.isStalemate() ? "Draw · Stalemate"
    : game.isDraw() ? "Draw · Game over"
    : game.isCheck() ? `${game.turn() === "w" ? "White" : "Black"} is in check`
    : `${game.turn() === "w" ? "White" : "Black"} to move`;

  async function analyzePosition() {
    setAnalyzing(true);
    setAnalysisError("");
    setAnalysis(null);
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen, depth })
      });
      const data = await response.json() as AnalysisResponse | { error?: string };
      if (!response.ok) throw new Error("error" in data && data.error ? data.error : "Analysis request failed.");
      setAnalysis(data as AnalysisResponse);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Could not reach the analysis engine.");
    } finally {
      setAnalyzing(false);
    }
  }

  function playSquare(square: Square) {
    if (game.isGameOver()) return;
    if (selected && legalTargets.includes(square)) {
      try {
        game.move({ from: selected, to: square, promotion: "q" });
        setFen(game.fen());
        setSelected(null);
        setAnalysis(null);
        setAnalysisError("");
        return;
      } catch {
        // An invalid move simply leaves the current selection unchanged.
      }
    }
    const piece = game.get(square);
    if (piece && piece.color === game.turn()) setSelected(square);
    else setSelected(null);
  }

  function undoMove() {
    const previous = new Chess(fen);
    if (previous.undo()) {
      setFen(previous.fen());
      setSelected(null);
      setAnalysis(null);
    }
  }

  function resetGame() {
    setFen(START_FEN);
    setSelected(null);
    setAnalysis(null);
    setAnalysisError("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="King Chess home">
          <span className="brand-mark">♔</span>
          <span>KING<span className="brand-light">CHESS</span></span>
        </a>
        <div className={`api-pill ${apiStatus}`}><i />{apiStatus === "checking" ? "Connecting" : apiStatus === "online" ? "Server online" : "Server offline"}</div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">THE BOARD IS YOURS</p>
          <h1>Play. Think. <em>Improve.</em></h1>
          <p className="subtitle">A focused chess workspace with built-in Stockfish analysis.</p>
        </div>
        <div className="heading-chip"><span>♟</span> LOCAL BOARD</div>
      </section>

      <section className="game-layout">
        <div className="board-column">
          <div className="board-topline">
            <div className="player-label"><span className="avatar black-avatar">♚</span><div><strong>Black</strong><small>Opponent</small></div></div>
            <span className="turn-indicator">{game.turn() === "b" ? "TO MOVE" : "WAITING"}</span>
          </div>

          <div className="board-frame">
            <div className="chessboard" role="group" aria-label="Chess board">
              {boardRanks.map((rank, row) => boardFiles.map((file, col) => {
                const square = `${file}${rank}` as Square;
                const piece = game.get(square);
                const isLight = (FILES.indexOf(file) + rank) % 2 !== 0;
                const isSelected = selected === square;
                const isTarget = legalTargets.includes(square);
                const isLastMove = history.length > 0 && (() => {
                  const verbose = game.history({ verbose: true });
                  const last = verbose[verbose.length - 1];
                  return last?.from === square || last?.to === square;
                })();
                return (
                  <button
                    type="button"
                    key={square}
                    className={`square ${isLight ? "light" : "dark"} ${isSelected ? "selected" : ""} ${isLastMove ? "last-move" : ""} ${isTarget ? "legal-target" : ""}`}
                    onClick={() => playSquare(square)}
                    aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ""}`}
                  >
                    {col === 0 && <span className="coordinate rank-coordinate">{rank}</span>}
                    {row === 7 && <span className="coordinate file-coordinate">{file}</span>}
                    {piece && <span className={`piece ${piece.color === "w" ? "white-piece" : "black-piece"}`}>{PIECES[piece.color + piece.type]}</span>}
                    {isTarget && !piece && <span className="target-dot" />}
                    {isTarget && piece && <span className="capture-ring" />}
                  </button>
                );
              }))}
            </div>
          </div>

          <div className="board-bottomline">
            <div className="player-label"><span className="avatar white-avatar">♔</span><div><strong>White</strong><small>You</small></div></div>
            <span className="turn-indicator">{game.turn() === "w" ? "TO MOVE" : "WAITING"}</span>
          </div>
          <div className="board-actions">
            <button className="quiet-button" onClick={undoMove} disabled={!history.length}>↶ <span>Undo</span></button>
            <button className="quiet-button" onClick={() => setFlipped(!flipped)}>⇅ <span>Flip board</span></button>
            <button className="quiet-button" onClick={resetGame}>↻ <span>New game</span></button>
          </div>
        </div>

        <aside className="side-column">
          <section className="side-card game-card">
            <div className="card-title-row"><div><p className="eyebrow">CURRENT GAME</p><h2>Game status</h2></div><span className="live-dot" /></div>
            <p className="game-status">{status}</p>
            <div className="stat-row"><span>Moves played</span><strong>{Math.ceil(history.length / 2)}</strong></div>
            <div className="stat-row"><span>Full move</span><strong>{game.moveNumber()}</strong></div>
          </section>

          <section className="side-card moves-card">
            <div className="card-title-row"><div><p className="eyebrow">MOVE TRACKER</p><h2>Move history</h2></div><span className="count-tag">{history.length}</span></div>
            <div className="move-list">
              {history.length === 0 ? <p className="empty-state">Your moves will appear here.</p> :
                Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => (
                  <div className="move-row" key={index}>
                    <span className="move-number">{index + 1}.</span>
                    <span>{history[index * 2] ?? "—"}</span>
                    <span>{history[index * 2 + 1] ?? "…"}</span>
                  </div>
                ))}
            </div>
          </section>

          <section className="side-card analysis-card">
            <div className="card-title-row"><div><p className="eyebrow">POWERED BY STOCKFISH</p><h2>Position analysis</h2></div><span className="engine-icon">⌁</span></div>
            <label className="field-label" htmlFor="depth">Search depth</label>
            <div className="depth-options" id="depth">
              {DEPTHS.map((item) => <button key={item.value} className={depth === item.value ? "depth-option active" : "depth-option"} onClick={() => { setDepth(item.value); setAnalysis(null); }}>{item.label}<small>{item.value}</small></button>)}
            </div>
            <button className="analyze-button" onClick={analyzePosition} disabled={analyzing || game.isGameOver()}>
              {analyzing ? <><span className="spinner" /> Analysing…</> : <>Analyse position <span>→</span></>}
            </button>
            {analysisError && <p className="analysis-error" role="alert">{analysisError}</p>}
            {analysis && <div className="analysis-result" aria-live="polite">
              <div className="evaluation"><span>Evaluation</span><strong>{scoreLabel(analysis)}{analysis.score?.kind === "centipawns" ? " pawns" : ""}</strong></div>
              <div className="stat-row"><span>Best move</span><strong>{analysis.bestMove ?? "—"}</strong></div>
              <div className="stat-row"><span>Nodes</span><strong>{analysis.nodes?.toLocaleString() ?? "—"}</strong></div>
              <div className="stat-row"><span>Time</span><strong>{analysis.timeMs == null ? "—" : `${analysis.timeMs} ms`}</strong></div>
              <div className="pv-line"><span>Principal variation</span><p>{analysis.principalVariation.join("  ") || "No line returned"}</p></div>
              <small className="score-note">Score from the side-to-move perspective · depth {analysis.depth}</small>
            </div>}
            <p className="engine-note">Deeper searches take longer. Engine availability depends on the server's Stockfish installation.</p>
          </section>
        </aside>
      </section>
      <footer className="app-footer">KING CHESS <span>·</span> Built for the love of the game</footer>
    </main>
  );
}
