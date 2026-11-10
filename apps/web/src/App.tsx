import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Chess, type Square } from "chess.js";
import type { AnalysisResponse } from "@king-chess/shared";
import { useMultiplayerGame } from "./hooks/useMultiplayerGame.js";
import { apiUrl } from "./lib/api.js";

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

export default function App() {
  const [fen, setFen] = useState(START_FEN);
  const [localPgn, setLocalPgn] = useState("");
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [depth, setDepth] = useState(15);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [mode, setMode] = useState<"ai" | "online" | "local">("local");
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [aiDepth, setAiDepth] = useState(10);
  const [aiThinking, setAiThinking] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [previewCandidate, setPreviewCandidate] = useState<number | null>(null);
  const [previewPly, setPreviewPly] = useState(0);
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [username, setUsername] = useState("Player");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const multiplayer = useMultiplayerGame();

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
  const isMyTurn = mode === "ai" ? game.turn() === "w" : !room || playerColor === game.turn();
  const status = game.isCheckmate()
    ? `Checkmate · ${game.turn() === "w" ? "Black" : "White"} wins`
    : game.isStalemate() ? "Draw · Stalemate"
    : game.isDraw() ? "Draw · Game over"
    : game.isCheck() ? `${game.turn() === "w" ? "White" : "Black"} is in check`
    : `${game.turn() === "w" ? "White" : "Black"} to move`;
  const gameStatus = mode === "ai" && game.turn() === "b" && !game.isGameOver() ? (aiThinking ? "Stockfish is thinking…" : "AI is thinking")
    : room?.phase === "waiting" ? "Waiting for an opponent"
    : room?.phase === "active" && !isMyTurn ? "Opponent's turn"
    : room?.phase === "active" ? "Your turn"
    : status;

  useEffect(() => {
    if (mode !== "ai" || room || game.turn() !== "b" || game.isGameOver()) {
      setAiThinking(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setAiThinking(true);
    fetch(apiUrl("/api/analysis"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, depth: aiDepth }),
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
        if (active && error instanceof Error && error.name !== "AbortError") setAnalysisError(error.message);
      })
      .finally(() => { if (active) setAiThinking(false); });
    return () => { active = false; controller.abort(); };
  }, [mode, room, fen, aiDepth]);

  function changeMode(nextMode: "ai" | "online" | "local") {
    if (nextMode === mode) return;
    if (room) multiplayer.leaveGame();
    setMode(nextMode);
    setFen(START_FEN);
    setLocalPgn("");
    setSelected(null);
    setAnalysis(null);
    setAnalysisError("");
    setPreviewCandidate(null);
    setPreviewPly(0);
    setAiThinking(false);
    setCopied(false);
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
    if (game.isGameOver() || (room && (!isMyTurn || room.phase !== "active"))) return;
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
          <p className="subtitle">Play locally or challenge someone with a live, server-authoritative game.</p>
        </div>
        <div className="heading-chip"><span>♟</span> {room ? "MULTIPLAYER ROOM" : "LOCAL BOARD"}</div>
      </section>

      <section className="multiplayer-panel">
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
      </section>

      <section className="game-layout">
        <div className="board-column">
          <div className="board-topline">
            <div className="player-label"><span className="avatar black-avatar">♚</span><div><strong>{room?.players.black?.username ?? "Black"}</strong><small>{room?.players.black ? "Black pieces" : "Waiting for player"}</small></div></div>
            <span className="turn-indicator">{game.turn() === "b" ? "TO MOVE" : "WAITING"}</span>
          </div>

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
              {analysis?.lines?.length && previewCandidate === null ? (
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
          {previewCandidate !== null && analysis?.lines[previewCandidate] && (
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
            <div className="player-label"><span className="avatar white-avatar">♔</span><div><strong>{room?.players.white.username ?? "White"}</strong><small>{room ? (playerColor === "w" ? "You · White pieces" : "White pieces") : "White pieces"}</small></div></div>
            <span className="turn-indicator">{game.turn() === "w" ? "TO MOVE" : "WAITING"}</span>
          </div>
          <div className="board-actions">
            <button className="quiet-button" onClick={undoMove} disabled={!history.length || !!room}>↶ <span>Undo</span></button>
            <button className="quiet-button" onClick={() => setFlipped(!flipped)}>⇅ <span>Flip board</span></button>
            <button className="quiet-button" onClick={resetGame}>{room ? "↩" : "↻"} <span>{room ? "Leave game" : "New game"}</span></button>
          </div>
        </div>

        <aside className="side-column">
          <section className="side-card game-card">
            <div className="card-title-row"><div><p className="eyebrow">CURRENT GAME</p><h2>Game status</h2></div><span className="live-dot" /></div>
            <p className="game-status">{room?.phase === "waiting" ? "Waiting for an opponent" : gameStatus}</p>
            <div className="stat-row"><span>Moves played</span><strong>{Math.ceil(history.length / 2)}</strong></div>
            <div className="stat-row"><span>Full move</span><strong>{game.moveNumber()}</strong></div>
            {room && <div className="stat-row"><span>Your side</span><strong>{playerColor === "w" ? "White" : playerColor === "b" ? "Black" : "—"}</strong></div>}
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
              {DEPTHS.map(item => <button key={item.value} className={depth === item.value ? "depth-option active" : "depth-option"} onClick={() => { setDepth(item.value); setAnalysis(null); setPreviewCandidate(null); setPreviewPly(0); }}>{item.label}<small>{item.value}</small></button>)}
            </div>
            <button className="analyze-button" onClick={analyzePosition} disabled={analyzing || game.isGameOver()}>
              {analyzing ? <><span className="spinner" /> Analysing…</> : <>Analyse position <span>→</span></>}
            </button>
            {analysisError && <p className="analysis-error" role="alert">{analysisError}</p>}
            {analysis && <div className="analysis-result" aria-live="polite">
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
            <p className="engine-note">Deeper searches take longer. Engine availability depends on the server's Stockfish installation.</p>
          </section>
        </aside>
      </section>
      <footer className="app-footer">KING CHESS <span>·</span> Built for the love of the game</footer>
    </main>
  );
}
