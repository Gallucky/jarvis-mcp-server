import { useEffect, useRef } from 'react';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  formatValue?: (n: number) => string;
}

export function DonutChart({ segments, size = 180, formatValue }: DonutChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size * 0.45;
    const innerR = size * 0.45 * 0.55;

    if (total <= 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill('evenodd');
      return;
    }

    let start = -Math.PI / 2;
    for (const seg of segments) {
      if (seg.value <= 0) continue;
      const angle = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, start, start + angle);
      ctx.arc(cx, cy, innerR, start + angle, start, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      start += angle;
    }
  }, [segments, size, total]);

  return (
    <div className="donut-chart-wrap">
      <canvas ref={canvasRef} />
      <div className="donut-chart-legend">
        {segments.map((s) => (
          <div className="donut-legend-row" key={s.label}>
            <span className="chart-legend-dot" style={{ background: s.color }} />
            <span className="donut-legend-label">{s.label}</span>
            <span className="donut-legend-value">{formatValue ? formatValue(s.value) : s.value}</span>
            <span className="donut-legend-pct">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
