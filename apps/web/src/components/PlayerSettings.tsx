import { AI_RATING_OPTIONS } from "../lib/aiRatings.js";

interface PlayerSettingsProps {
  playerName: string;
  onPlayerNameChange: (value: string) => void;
  aiColor: "w" | "b";
  onAiColorChange: (value: "w" | "b") => void;
  aiRating: number | null;
  onAiRatingChange: (value: number | null) => void;
  analysisEnabled: boolean;
  onAnalysisEnabledChange: (value: boolean) => void;
  evaluationBarEnabled: boolean;
  onEvaluationBarEnabledChange: (value: boolean) => void;
}



export default function PlayerSettings(props: PlayerSettingsProps) {
  return (
    <section className="player-settings side-card">
      <div className="card-title-row">
        <div><p className="eyebrow">PREFERENCES</p><h2>Player settings</h2></div>
        <span className="engine-icon">⚙</span>
      </div>
      <label className="settings-field">
        <span>PLAYER DISPLAY NAME</span>
        <input value={props.playerName} maxLength={24} onChange={event => props.onPlayerNameChange(event.target.value)} />
        <small>Used when creating or joining online rooms. Accounts and cloud profiles remain disabled.</small>
      </label>
      <div className="settings-grid">
        <label className="settings-field">
          <span>DEFAULT SIDE VS AI</span>
          <select value={props.aiColor} onChange={event => props.onAiColorChange(event.target.value as "w" | "b")}>
            <option value="b">Play White</option>
            <option value="w">Play Black</option>
          </select>
        </label>
        <label className="settings-field">
          <span>DEFAULT BOT RATING</span>
          <select value={props.aiRating ?? "max"} onChange={event => props.onAiRatingChange(event.target.value === "max" ? null : Number(event.target.value))}>
            {AI_RATING_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value="max">Maximum · unrestricted</option>
          </select>
          <small>Stockfish UCI_Elo strength limiting; rated presets begin at 1320 Elo.</small>
        </label>
      </div>
      <div className="settings-preference">
        <div><strong>Position analysis</strong><small>Show engine arrows and candidate variations.</small></div>
        <button type="button" role="switch" aria-checked={props.analysisEnabled} className={props.analysisEnabled ? "toggle-switch on" : "toggle-switch"} onClick={() => props.onAnalysisEnabledChange(!props.analysisEnabled)}><span /></button>
      </div>
      <div className="settings-preference">
        <div><strong>Evaluation bar</strong><small>Show the White-versus-Black evaluation beside the board.</small></div>
        <button type="button" role="switch" aria-checked={props.evaluationBarEnabled} className={props.evaluationBarEnabled ? "toggle-switch on" : "toggle-switch"} onClick={() => props.onEvaluationBarEnabledChange(!props.evaluationBarEnabled)}><span /></button>
      </div>
    </section>
  );
}
