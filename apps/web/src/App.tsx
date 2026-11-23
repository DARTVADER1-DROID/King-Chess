import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Chess, type Square } from "chess.js";
import type { AnalysisResponse } from "@king-chess/shared";
import { useMultiplayerGame } from "./hooks/useMultiplayerGame.js";
import { apiUrl } from "./lib/api.js";
import PlayerSettings from "./components/PlayerSettings.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const START_FEN = new Chess().fen();
const ARROW_COLORS = ["#16a34a", "#d69e2e", "#e07a36"];
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

function squareCenter(square: string, flipped: boolean) {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return { x: (flipped ? 7 - file : file) + 0.5, y: (flipped ? rank - 1 : 8 - rank) + 0.5 };
}

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

function evaluationBarData(result: AnalysisResponse | null, sideToMove: "w" | "b") {
  if (!result?.score) return { label: "—", whitePercent: 50 };
  const sign = sideToMove === "w" ? 1 : -1;
  if (result.score.kind === "mate") {
    const whiteWinning = result.score.value * sign > 0;
    return {
      label: (whiteWinning ? "M" : "−M") + Math.abs(result.score.value),
      whitePercent: whiteWinning ? 100 : 0
    };
  }
  const whitePawns = (result.score.value * sign) / 100;
  return {
    label: (whitePawns > 0 ? "+" : "") + whitePawns.toFixed(2),
    whitePercent: Math.max(0, Math.min(100, 50 + whitePawns * 5))
  };
}

type AppPage = "ai" | "local" | "online" | "analysis" | "history" | "settings";
const PAGE_FROM_HASH = (): AppPage => {
  const value = window.location.hash.replace(/^#/, "");
  return (["ai", "local", "online", "analysis", "history", "settings"] as const).includes(value as AppPage) ? value as AppPage : "ai";
};

export default function App() {
  const [page, setPage] = useState<AppPage>(PAGE_FROM_HASH);
  const navigate = (next: AppPage) => { window.location.hash = next; setPage(next); };
  useEffect(() => {
    const sync = () => setPage(PAGE_FROM_HASH());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const [fen, setFen] = useState(START_FEN);
  const [localPgn, setLocalPgn] = useState("");
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [depth, setDepth] = useState(15);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [mode, setMode] = useState<"ai" | "online" | "local">(() => PAGE_FROM_HASH() === "online" ? "online" : PAGE_FROM_HASH() === "ai" ? "ai" : "local");
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [evaluationBarEnabled, setEvaluationBarEnabled] = useState(true);
  const [aiRating, setAiRating] = useState<number | null>(() => { const saved = localStorage.getItem("king-chess.ai-rating"); return saved === "max" ? null : saved ? Number(saved) : 1500; });
  const [aiColor, setAiColor] = useState<"w" | "b">("b");
  const [localResult, setLocalResult] = useState<"draw" | "white-resigned" | "black-resigned" | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiRetry, setAiRetry] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [previewCandidate, setPreviewCandidate] = useState<number | null>(null);
  const [previewPly, setPreviewPly] = useState(0);
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [username, setUsername] = useState(() => localStorage.getItem("king-chess.player-name") ?? "Player");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const multiplayer = useMultiplayerGame();

  useEffect(() => { localStorage.setItem("king-chess.player-name", username); }, [username]);
  useEffect(() => { localStorage.setItem("king-chess.ai-rating", aiRating === null ? "max" : String(aiRating)); }, [aiRating]);
  useEffect(() => { localStorage.setItem("king-chess.ai-color", aiColor); }, [aiColor]);
  useEffect(() => { localStorage.setItem("king-chess.analysis-enabled", String(analysisEnabled)); }, [analysisEnabled]);
  useEffect(() => { localStorage.setItem("king-chess.eval-bar-enabled", String(evaluationBarEnabled)); }, [evaluationBarEnabled]);

  useEffect(() => {
    let active = true;
    fetch(apiUrl("/api/health"))
      .then(response => { if (!response.ok) throw new Error("API unavailable"); return response.json(); })
      .then(() => { if (active) setApiStatus("online"); })
      .catch(() => { if (active) setApiStatus("offline"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setFen(multiplayer.room?.fen ?? START_FEN);
    setLocalPgn(multiplayer.room?.pgn ?? "");
    setSelected(null);
    setAnalysis(null);
    setAnalysisError("");
    setPreviewCandidate(null);
    setPreviewPly(0);
  }, [multiplayer.room]);

  const game = useMemo(() => {
    const current = new Chess();
    const pgn = multiplayer.room?.pgn ?? localPgn;
    if (pgn) current.loadPgn(pgn);
    else current.load(fen);
    return current;
  }, [fen, localPgn, multiplayer.room?.pgn]);
  const legalTargets = useMemo(() => {
    if (!selected || previewCandidate !== null) return [];
    return game.moves({ square: selected, verbose: true }).map(move => move.to);
  }, [game, selected, previewCandidate]);
  const boardGame = useMemo(() => {
    const preview = new Chess();
    const pgn = multiplayer.room?.pgn ?? localPgn;
    if (pgn) preview.loadPgn(pgn);
    else preview.load(fen);
    const line = previewCandidate === null ? null : analysis?.lines[previewCandidate];
    if (line) {
      for (const uci of line.moves.slice(0, previewPly)) {
        try {
          preview.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q" });
        } catch { break; }
      }
    }
    return preview;
  }, [fen, localPgn, multiplayer.room?.pgn, analysis, previewCandidate, previewPly]);

  const evaluation = evaluationBarData(analysisEnabled ? analysis : null, game.turn());
  const boardRanks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const boardFiles = flipped ? [...FILES].reverse() : FILES;
  const history = game.history();
  const boardHistory = boardGame.history({ verbose: true });
  const boardLastMove = boardHistory[boardHistory.length - 1];
  const room = multiplayer.room;
  const playerColor = room && multiplayer.socketId
    ? room.players.white.id === multiplayer.socketId ? "w"
      : room.players.black?.id === multiplayer.socketId ? "b" : null
    : null;
  const humanColor = aiColor === "w" ? "b" : "w";
  const isMyTurn = mode === "ai" ? game.turn() === humanColor : !room || playerColor === game.turn();
  const finalResult = room?.result ?? localResult;
  const status = game.isCheckmate()
    ? `Checkmate · ${game.turn() === "w" ? "Black" : "White"} wins`
    : game.isStalemate() ? "Draw · Stalemate"
    : game.isDraw() ? "Draw · Game over"
    : game.isCheck() ? `${game.turn() === "w" ? "White" : "Black"} is in check`
    : `${game.turn() === "w" ? "White" : "Black"} to move`;
  const gameStatus = finalResult === "draw" ? "Draw agreed · Game over"
    : finalResult === "white-resigned" ? "White resigned · Black wins"
    : finalResult === "black-resigned" ? "Black resigned · White wins"
    : mode === "ai" && game.turn() === aiColor && !game.isGameOver() ? (aiThinking ? "Stockfish is thinking…" : aiError ? "AI move failed" : "AI is thinking")
    : mode === "online" && !room ? "Create a room or join an opponent"
    : room?.phase === "waiting" ? "Waiting for an opponent"
    : room?.phase === "active" && !isMyTurn ? "Opponent's turn"
    : room?.phase === "active" ? "Your turn"
    : status;

  useEffect(() => {
    if (page !== "ai" || mode !== "ai" || room || localResult || game.turn() !== aiColor || game.isGameOver()) {
      setAiThinking(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setAiThinking(true);
    setAiError("");
    setAnalysisError("");
    fetch(apiUrl("/api/analysis"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, depth: 22, ...(aiRating === null ? {} : { elo: aiRating }) }),
      signal: controller.signal
    })
      .then(async response => {
        const data = await response.json() as AnalysisResponse | { error?: string };
        if (!response.ok) throw new Error("error" in data && data.error ? data.error : "Stockfish could not choose a move.");
        const result = data as AnalysisResponse;
        if (!result.bestMove) throw new Error("Stockfish did not return a legal move.");
        if (!active) return;
        const next = new Chess(fen);
        next.move({
          from: result.bestMove.slice(0, 2),
          to: result.bestMove.slice(2, 4),
          promotion: (result.bestMove[4] as "q" | "r" | "b" | "n" | undefined) ?? "q"
        });
        setFen(next.fen());
        setLocalPgn(next.pgn());
        setAnalysis(null);
        setPreviewCandidate(null);
        setPreviewPly(0);
      })
      .catch(error => {
        if (active && error instanceof Error && error.name !== "AbortError") setAiError(error.message);
      })
      .finally(() => { if (active) setAiThinking(false); });
    return () => { active = false; controller.abort(); };
  }, [page, mode, room, fen, aiRating, aiRetry, aiColor, localResult]);

  function changeMode(nextMode: "ai" | "online" | "local") {
    if (nextMode === mode) { navigate(nextMode); return; }
    if (room) multiplayer.leaveGame();
    setMode(nextMode);
    navigate(nextMode);
    setFen(START_FEN);
    setLocalPgn("");
    setLocalResult(null);
    setSelected(null);
    setAnalysis(null);
    setAnalysisError("");
    setPreviewCandidate(null);
    setPreviewPly(0);
    setAiThinking(false);
    setAiError("");
    setCopied(false);
  }

  function chooseAiSide(color: "w" | "b") {
    setAiColor(color);
    setFlipped(color === "w");
    setFen(START_FEN);
    setLocalPgn("");
    setLocalResult(null);
    setSelected(null);
    setAnalysis(null);
    setAnalysisError("");
    setAiError("");
    setAiRetry(value => value + 1);
  }

  function offerOrAgreeDraw() {
    if (room) {
      if (room.drawOfferBy && room.drawOfferBy !== playerColor) multiplayer.respondToDraw(true);
      else if (!room.drawOfferBy) multiplayer.offerDraw();
      return;
    }
    if (!game.isGameOver() && !localResult) setLocalResult("draw");
  }

  function surrender() {
    if (room) { multiplayer.resign(); return; }
    if (game.isGameOver() || localResult) return;
    const resigningColor = mode === "ai" ? humanColor : game.turn();
    setLocalResult(resigningColor === "w" ? "white-resigned" : "black-resigned");
  }

  function toggleAnalysis() {
    setAnalysisEnabled(value => !value);
    setAnalysis(null);
    setAnalysisError("");
    setPreviewCandidate(null);
    setPreviewPly(0);
  }

  async function analyzePosition() {
    if (!analysisEnabled) return;
    setAnalyzing(true);
    setAnalysisError("");
    setAnalysis(null);
    setPreviewCandidate(null);
    setPreviewPly(0);
    try {
      const response = await fetch(apiUrl("/api/analysis"), {
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
    if (analyzing || previewCandidate !== null) return;
    if (game.isGameOver() || finalResult || !isMyTurn || (mode === "online" && !room) || (room && room.phase !== "active")) return;
    if (selected && legalTargets.includes(square)) {
      if (room) {
        multiplayer.submitMove(room.gameId, selected, square);
      } else {
        try {
          game.move({ from: selected, to: square, promotion: "q" });
          setFen(game.fen());
          setLocalPgn(game.pgn());
          setAnalysis(null);
          setPreviewCandidate(null);
          setPreviewPly(0);
          setAnalysisError("");
        } catch {
          // Keep the selection when a move cannot be applied locally.
        }
      }
      setSelected(null);
      return;
    }
    const piece = game.get(square);
    if (piece && piece.color === game.turn() && (!room || piece.color === playerColor)) setSelected(square);
    else setSelected(null);
  }

  function undoMove() {
    if (room) return;
    const previous = new Chess(fen);
    if (previous.undo()) {
      if (mode === "ai" && previous.turn() === "b" && previous.undo()) { /* Undo the AI reply and human move together. */ }
      setFen(previous.fen());
      setLocalPgn(previous.pgn());
      setSelected(null);
      setAnalysis(null);
      setPreviewCandidate(null);
      setPreviewPly(0);
    }
  }

  function resetGame() {
    if (room) {
      multiplayer.leaveGame();
      setFen(START_FEN);
      setLocalPgn("");
    } else {
      setFen(START_FEN);
      setLocalPgn("");
    }
    setSelected(null);
    setLocalResult(null);
    setAnalysis(null);
    setAnalysisError("");
    setPreviewCandidate(null);
    setPreviewPly(0);
  }

  function createRoom() {
    multiplayer.createGame(username);
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    multiplayer.joinGame(joinCode.trim(), username);
  }

  function copyInviteCode() {
    if (!room || !navigator.clipboard) return;
    void navigator.clipboard.writeText(room.gameId)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#ai" aria-label="King Chess home">
          <span className="brand-mark">♔</span>
          <span>KING<span className="brand-light">CHESS</span></span>
        </a>
        <nav className="app-nav" aria-label="Main navigation">
          <button className={page === "ai" ? "nav-link active" : "nav-link"} onClick={() => changeMode("ai")}>Play vs AI</button>
          <button className={page === "local" ? "nav-link active" : "nav-link"} onClick={() => changeMode("local")}>Local</button>
          <button className={page === "online" ? "nav-link active" : "nav-link"} onClick={() => changeMode("online")}>Online</button>
          <button className={page === "analysis" ? "nav-link active" : "nav-link"} onClick={() => { setAnalysisEnabled(true); navigate("analysis"); }}>Analysis</button>
          <button className={page === "history" ? "nav-link active" : "nav-link"} onClick={() => navigate("history")}>History</button>
          <button className={page === "settings" ? "nav-link active" : "nav-link"} onClick={() => navigate("settings")}>Settings</button>
        </nav>
        <div className={`api-pill ${apiStatus}`}><i />{apiStatus === "checking" ? "Connecting" : apiStatus === "online" ? "Server online" : "Server offline"}</div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">KING CHESS WORKSPACE</p>
          <h1>{page === "analysis" ? <>Position <em>analysis.</em></> : page === "history" ? <>Move <em>history.</em></> : page === "settings" ? <>Player <em>settings.</em></> : page === "online" ? <>Play <em>online.</em></> : page === "local" ? <>Local <em>match.</em></> : <>Play vs <em>Stockfish.</em></>}</h1>
          <p className="subtitle">{page === "analysis" ? "Explore engine evaluations, candidate moves and variations in a dedicated analysis workspace." : page === "history" ? "Review the moves from your current game without the distractions of play controls." : page === "settings" ? "Configure your player identity, bot strength and analysis preferences." : page === "online" ? "Create a room or join a friend using an invite code." : page === "local" ? "Two players. One board. Take turns on the same device." : "Challenge Stockfish and sharpen your game."}</p>
        </div>
        <div className="heading-chip"><span>♟</span> {page.toUpperCase()}</div>
      </section>

      {page === "ai" && <section className="mode-options">
        {mode === "ai" && <div className="ai-difficulty">
          <span className="mode-option-label">PLAY AS</span>
          <div className="ai-depth-options">
            <button className={aiColor === "b" ? "ai-depth active" : "ai-depth"} onClick={() => chooseAiSide("b")}>White</button>
            <button className={aiColor === "w" ? "ai-depth active" : "ai-depth"} onClick={() => chooseAiSide("w")}>Black</button>
          </div>
          <span className="mode-option-label">BOT RATING</span>
          <div className="ai-depth-options">
            {[1320, 1500, 1700, 1900, 2100, 2300, 2500].map(rating =>
              <button key={rating} className={aiRating === rating ? "ai-depth active" : "ai-depth"} onClick={() => setAiRating(rating)}>{rating}</button>
            )}
            <button className={aiRating === null ? "ai-depth active" : "ai-depth"} onClick={() => setAiRating(null)}>Maximum</button>
          </div>
        </div>}
        <div className="analysis-setting">
          <div><strong>Position analysis</strong><small>Engine evaluations, suggested arrows and variation previews</small></div>
          <button type="button" role="switch" aria-checked={analysisEnabled} className={analysisEnabled ? "toggle-switch on" : "toggle-switch"} onClick={toggleAnalysis}><span /></button>
        </div>
      </section>}

      {page === "online" && <section className="multiplayer-panel">
        <div className="multiplayer-heading">
          <div><p className="eyebrow">PLAY WITH A FRIEND</p><h2>Multiplayer</h2></div>
          <span className={`connection-label ${multiplayer.connected ? "connected" : ""}`}><i />{multiplayer.connected ? "Realtime connected" : "Connecting to realtime server"}</span>
        </div>
        {room ? (
          <div className="room-active">
            <div className="room-code"><span>INVITE CODE</span><strong>{room.gameId}</strong></div>
            <div className="room-players">
              <span>♔ {room.players.white.username}</span>
              <span>♚ {room.players.black?.username ?? "Waiting for Black"}</span>
            </div>
            <div className="room-actions">
              <button className="lobby-button" onClick={copyInviteCode}>{copied ? "Copied" : "Copy invite code"}</button>
              <button className="lobby-button secondary" onClick={resetGame}>Leave game</button>
            </div>
          </div>
        ) : (
          <div className="lobby-controls">
            <label className="lobby-field"><span>YOUR NAME</span><input value={username} maxLength={24} onChange={event => setUsername(event.target.value)} placeholder="Enter a name" /></label>
            <button className="lobby-button" onClick={createRoom} disabled={!multiplayer.connected || !username.trim()}>Create game</button>
            <form className="join-form" onSubmit={joinRoom}>
              <input aria-label="Invite code" value={joinCode} onChange={event => setJoinCode(event.target.value)} placeholder="Paste invite code" />
              <button className="lobby-button secondary" type="submit" disabled={!multiplayer.connected || !username.trim() || !joinCode.trim()}>Join game</button>
            </form>
          </div>
        )}
        {multiplayer.error && <p className="multiplayer-error" role="alert">{multiplayer.error}</p>}
        <p className="multiplayer-note">Create a room and share its invite code. The server validates every move and broadcasts the official position to both players.</p>
      </section>}

      {page !== "settings" && <section className={page === "history" ? "game-layout history-layout" : "game-layout"}>
        {page !== "history" && <div className="board-column">
          <div className="board-topline">
            <div className="player-label"><span className="avatar black-avatar">♚</span><div><strong>{mode === "ai" && aiColor === "w" ? "Stockfish" : mode === "ai" ? "You" : room?.players.black?.username ?? "Black"}</strong><small>{mode === "ai" ? (aiColor === "w" ? "AI · White pieces" : "You · Black pieces") : room?.players.black ? "Black pieces" : mode === "online" ? "Waiting for player" : "Local player"}</small></div></div>
            <span className="turn-indicator">{game.turn() === "b" ? "TO MOVE" : "WAITING"}</span>
          </div>

          <div className="board-with-eval">
            {evaluationBarEnabled && analysisEnabled && (
              <div className="evaluation-bar-column" role="img" aria-label={`Position evaluation ${evaluation.label} from White side`}>
                <span className="evaluation-bar-score">{evaluation.label}</span>
                <div className="evaluation-bar-track">
                  <div className="evaluation-bar-white" style={{ height: `${evaluation.whitePercent}%` }} />
                </div>
                <span className="evaluation-bar-piece">♔</span>
              </div>
            )}
            <div className="board-frame">
            <div className="chessboard" role="group" aria-label="Chess board">
              {boardRanks.map((rank, row) => boardFiles.map((file, col) => {
                const square = `${file}${rank}` as Square;
                const piece = boardGame.get(square);
                const isLight = (FILES.indexOf(file) + rank) % 2 === 0;
                const isSelected = selected === square;
                const isTarget = legalTargets.includes(square);
                const isLastMove = boardLastMove?.from === square || boardLastMove?.to === square;
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
              {analysisEnabled && analysis?.lines?.length && previewCandidate === null ? (
                <svg className="analysis-arrows" viewBox="0 0 8 8" role="group" aria-label="Engine suggested moves">
                  <defs>
                    {analysis.lines.map((_, index) => (
                      <marker key={index} id={`analysis-arrow-${index}`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto" viewBox="0 0 4 4">
                        <path d="M0 0 L4 2 L0 4 Z" fill={ARROW_COLORS[index % ARROW_COLORS.length]} />
                      </marker>
                    ))}
                  </defs>
                  {analysis.lines.map((line, index) => {
                    const move = line.moves[0];
                    if (!move || move.length < 4) return null;
                    const from = squareCenter(move.slice(0, 2), flipped);
                    const to = squareCenter(move.slice(2, 4), flipped);
                    return (
                      <line
                        key={line.rank}
                        x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke={ARROW_COLORS[index % ARROW_COLORS.length]}
                        strokeWidth={previewCandidate === index ? 0.15 : 0.11}
                        strokeLinecap="round"
                        markerEnd={`url(#analysis-arrow-${index})`}
                        className={previewCandidate === index ? "analysis-arrow selected" : "analysis-arrow"}
                        onClick={() => { setPreviewCandidate(index); setPreviewPly(1); setSelected(null); }}
                      />
                    );
                  })}
                </svg>
              ) : null}
            </div>
            </div>
          </div>
          {analysisEnabled && previewCandidate !== null && analysis?.lines[previewCandidate] && (
            <div className="variation-preview">
              <div><strong>Previewing line {previewCandidate + 1}</strong><small>{analysis.lines[previewCandidate].moves.join("  ")}</small></div>
              <div className="variation-controls">
                <button className="quiet-button" onClick={() => setPreviewPly(value => Math.max(0, value - 1))} disabled={previewPly === 0}>←</button>
                <span>{previewPly}/{analysis.lines[previewCandidate].moves.length}</span>
                <button className="quiet-button" onClick={() => setPreviewPly(value => Math.min(analysis.lines[previewCandidate].moves.length, value + 1))} disabled={previewPly >= analysis.lines[previewCandidate].moves.length}>→</button>
                <button className="quiet-button" onClick={() => { setPreviewCandidate(null); setPreviewPly(0); }}>Return</button>
              </div>
            </div>
          )}

          <div className="board-bottomline">
            <div className="player-label"><span className="avatar white-avatar">♔</span><div><strong>{mode === "ai" && aiColor === "b" ? "Stockfish" : mode === "ai" ? "You" : mode === "online" ? room?.players.white.username ?? "White" : "White"}</strong><small>{mode === "ai" ? (aiColor === "b" ? "AI · White pieces" : "You · White pieces") : mode === "online" ? (room ? (playerColor === "w" ? "You · White pieces" : "White pieces") : "White pieces") : "Local player"}</small></div></div>
            <span className="turn-indicator">{game.turn() === "w" ? "TO MOVE" : "WAITING"}</span>
          </div>
          <div className="board-actions">
            <button className={evaluationBarEnabled ? "quiet-button eval-toggle active" : "quiet-button eval-toggle"} type="button" aria-pressed={evaluationBarEnabled} onClick={() => setEvaluationBarEnabled(value => !value)}>▥ <span>Eval bar</span></button>
            <button className="quiet-button" onClick={undoMove} disabled={!history.length || !!room || aiThinking || !!finalResult}>↶ <span>Undo</span></button>
            <button className="quiet-button" onClick={offerOrAgreeDraw} disabled={!!finalResult || game.isGameOver() || (!!room && (!room.players.black || (!!room.drawOfferBy && room.drawOfferBy === playerColor)))}>{room?.drawOfferBy && room.drawOfferBy !== playerColor ? "Accept draw" : room?.drawOfferBy ? "Draw offered" : mode === "online" ? "Offer draw" : "Agree draw"}</button>
            {room?.drawOfferBy && room.drawOfferBy !== playerColor && <button className="quiet-button" onClick={() => multiplayer.respondToDraw(false)}>Decline</button>}
            <button className="quiet-button" onClick={surrender} disabled={!!finalResult || game.isGameOver() || (!!room && !room.players.black)}>⚑ <span>Resign</span></button>
            <button className="quiet-button" onClick={() => setFlipped(!flipped)}>⇅ <span>Flip board</span></button>
            <button className="quiet-button" onClick={resetGame}>{room ? "↩" : "↻"} <span>{room ? "Leave game" : "New game"}</span></button>
          </div>
        </div>}

        <aside className="side-column">
          {page !== "history" && <section className="side-card game-card">
            <div className="card-title-row"><div><p className="eyebrow">CURRENT GAME</p><h2>Game status</h2></div><span className="live-dot" /></div>
            <p className="game-status">{gameStatus}</p>
            {room?.drawOfferBy && !room.result && <p className="draw-notice">{room.drawOfferBy === playerColor ? "Draw offer sent · waiting for opponent" : "Your opponent offered a draw."}</p>}
            {finalResult && <p className="result-note">Game finished. Start a new game to play again.</p>}
            {mode === "ai" && aiError && <div className="analysis-error" role="alert">{aiError} <button className="quiet-button" onClick={() => setAiRetry(value => value + 1)}>Retry AI move</button></div>}
            <div className="stat-row"><span>Moves played</span><strong>{Math.ceil(history.length / 2)}</strong></div>
            <div className="stat-row"><span>Full move</span><strong>{game.moveNumber()}</strong></div>
            {room && <div className="stat-row"><span>Your side</span><strong>{playerColor === "w" ? "White" : playerColor === "b" ? "Black" : "—"}</strong></div>}
          </section>}

          {page === "history" && <section className="side-card moves-card history-card">
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
          </section>}

          {page === "analysis" && <section className="side-card analysis-card">
            <div className="card-title-row"><div><p className="eyebrow">POWERED BY STOCKFISH</p><h2>Position analysis</h2></div><span className="engine-icon">⌁</span></div>
            <label className="field-label" htmlFor="depth">Analysis depth</label>
            <div className="depth-options" id="depth">
              {DEPTHS.map(item => <button key={item.value} className={depth === item.value ? "depth-option active" : "depth-option"} onClick={() => { setDepth(item.value); setAnalysis(null); setPreviewCandidate(null); setPreviewPly(0); }}>{item.label}<small>{item.value}</small></button>)}
            </div>
            <button className="analyze-button" onClick={analyzePosition} disabled={!analysisEnabled || analyzing || aiThinking || game.isGameOver() || !!finalResult}>
              {analyzing ? <><span className="spinner" /> Analysing…</> : <>Analyse position <span>→</span></>}
            </button>
            {analysisEnabled && analysisError && <p className="analysis-error" role="alert">{analysisError}</p>}
            {analysisEnabled && analysis && <div className="analysis-result" aria-live="polite">
              <div className="evaluation"><span>Evaluation</span><strong>{scoreLabel(analysis)}{analysis.score?.kind === "centipawns" ? " pawns" : ""}</strong></div>
              <div className="stat-row"><span>Best move</span><strong>{analysis.bestMove ?? "—"}</strong></div>
              {analysis.lines?.length > 0 && (
                <div className="candidate-list">
                  <span className="candidate-heading">Top candidate moves · tap to preview</span>
                  {analysis.lines.map((line, index) => (
                    <button key={line.rank} className={previewCandidate === index ? "candidate-row active" : "candidate-row"} onClick={() => { setPreviewCandidate(index); setPreviewPly(1); setSelected(null); }}>
                      <span className="candidate-rank" style={{ color: ARROW_COLORS[index % ARROW_COLORS.length] }}>{line.rank}</span>
                      <strong>{line.move ?? "—"}</strong>
                      <span>{line.score?.kind === "mate" ? `M${line.score.value}` : line.score ? (line.score.value / 100).toFixed(2) : "—"}</span>
                      <i style={{ background: ARROW_COLORS[index % ARROW_COLORS.length] }} />
                    </button>
                  ))}
                </div>
              )}
              <div className="stat-row"><span>Nodes</span><strong>{analysis.nodes?.toLocaleString() ?? "—"}</strong></div>
              <div className="stat-row"><span>Time</span><strong>{analysis.timeMs == null ? "—" : `${analysis.timeMs} ms`}</strong></div>
              <div className="pv-line"><span>Principal variation</span><p>{analysis.principalVariation.join("  ") || "No line returned"}</p></div>
              <small className="score-note">Score from the side-to-move perspective · depth {analysis.depth}</small>
            </div>}
            <p className="engine-note">Deeper searches take longer. Engine availability depends on the server Stockfish installation.</p>
          </section>}
        </aside>
      </section>
      </section>}
      {page === "settings" && <PlayerSettings
        playerName={username} onPlayerNameChange={setUsername}
        aiColor={aiColor} onAiColorChange={chooseAiSide}
        aiRating={aiRating} onAiRatingChange={setAiRating}
        analysisEnabled={analysisEnabled} onAnalysisEnabledChange={setAnalysisEnabled}
        evaluationBarEnabled={evaluationBarEnabled} onEvaluationBarEnabledChange={setEvaluationBarEnabled}
      />}
      <footer className="app-footer">KING CHESS <span>·</span> Independent play, analysis and review workspaces</footer>
    </main>
  );
}
