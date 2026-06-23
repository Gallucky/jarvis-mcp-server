interface ProgressBarProps {
  label: string;
  done: number;
  total: number;
  color: string;
}

export function ProgressBar({ label, done, total, color }: ProgressBarProps) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return (
    <div className="progress-row">
      <div className="progress-row-head">
        <span>{label}</span>
        <span className="progress-row-meta">{done}/{total} · {pct}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: pct + '%', background: color, boxShadow: `0 0 10px -1px ${color}` }} />
      </div>
    </div>
  );
}
