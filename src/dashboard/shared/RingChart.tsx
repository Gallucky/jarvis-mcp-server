import { useId } from 'react';

interface RingChartProps {
  pct: number;
  size?: number;
}

export function RingChart({ pct, size = 88 }: RingChartProps) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  const glowId = useId();
  return (
    <svg className="ring-chart" width={size} height={size} viewBox="0 0 88 88">
      <defs>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#8b7bff" floodOpacity="0.7" />
        </filter>
      </defs>
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
      <circle cx="44" cy="44" r={r} fill="none" stroke="#8b7bff" strokeWidth="9"
        className="ring-chart-progress" filter={`url(#${glowId})`}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 44 44)" />
      <text x="44" y="48" textAnchor="middle" fill="#e8eaf6" fontSize="15" fontWeight="700">{pct}%</text>
    </svg>
  );
}
