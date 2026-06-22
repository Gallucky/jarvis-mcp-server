interface RingChartProps {
  pct: number;
  size?: number;
}

export function RingChart({ pct, size = 88 }: RingChartProps) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg className="ring-chart" width={size} height={size} viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#252525" strokeWidth="9" />
      <circle cx="44" cy="44" r={r} fill="none" stroke="#a78bfa" strokeWidth="9"
        className="ring-chart-progress"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 44 44)" />
      <text x="44" y="48" textAnchor="middle" fill="#e2e2e2" fontSize="15" fontWeight="700">{pct}%</text>
    </svg>
  );
}
