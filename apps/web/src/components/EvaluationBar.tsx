interface EvaluationBarProps {
  label: string;
  whitePercent: number;
}

export default function EvaluationBar({ label, whitePercent }: EvaluationBarProps) {
  const boundedPercent = Math.max(0, Math.min(100, whitePercent));
  return (
    <div className="evaluation-bar-column" role="img" aria-label={`Position evaluation ${label} from White side`}>
      <span className="evaluation-bar-score">{label}</span>
      <div className="evaluation-bar-track">
        <div className="evaluation-bar-white" style={{ height: `${boundedPercent}%` }} />
      </div>
      <span className="evaluation-bar-piece">♔</span>
    </div>
  );
}
