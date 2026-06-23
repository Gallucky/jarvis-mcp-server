import { useEffect, useRef } from 'react';

export interface LineChartSeries {
  name: string;
  color: string;
  data: number[];
}

interface LineChartProps {
  labels: string[];
  series: LineChartSeries[];
  height?: number;
  formatValue?: (n: number) => string;
}

const GRID_COLOR = 'rgba(255,255,255,0.06)';
const LABEL_COLOR = '#7d8590';

export function LineChart({ labels, series, height = 260, formatValue }: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    function draw() {
      const width = parent!.clientWidth || 600;
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const padding = { top: 16, right: 16, bottom: 28, left: 58 };
      const plotW = Math.max(1, width - padding.left - padding.right);
      const plotH = height - padding.top - padding.bottom;

      const allValues = series.flatMap((s) => s.data);
      const maxVal = Math.max(1, ...allValues);
      const niceMax = maxVal * 1.1;

      const n = labels.length;
      const xStep = n > 1 ? plotW / (n - 1) : 0;
      const xOf = (i: number) => padding.left + xStep * i;
      const yOf = (v: number) => padding.top + plotH - (v / niceMax) * plotH;

      // gridlines + y labels
      ctx.strokeStyle = GRID_COLOR;
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = '11px Rubik, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const gridLines = 4;
      for (let i = 0; i <= gridLines; i++) {
        const v = (niceMax / gridLines) * i;
        const y = yOf(v);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        const label = formatValue ? formatValue(v) : String(Math.round(v));
        ctx.fillText(label, padding.left - 8, y);
      }

      // x labels (sparse)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const maxLabels = Math.max(1, Math.min(n, Math.floor(plotW / 60) || 1));
      const labelStep = Math.max(1, Math.ceil(n / maxLabels));
      for (let i = 0; i < n; i += labelStep) {
        ctx.fillText(labels[i], xOf(i), height - padding.bottom + 8);
      }

      // series
      for (const s of series) {
        if (s.data.length === 0) continue;
        const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
        grad.addColorStop(0, hexWithAlpha(s.color, 0.28));
        grad.addColorStop(1, hexWithAlpha(s.color, 0));

        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(s.data[0]));
        for (let i = 1; i < s.data.length; i++) ctx.lineTo(xOf(i), yOf(s.data[i]));
        ctx.lineTo(xOf(s.data.length - 1), padding.top + plotH);
        ctx.lineTo(xOf(0), padding.top + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(s.data[0]));
        for (let i = 1; i < s.data.length; i++) ctx.lineTo(xOf(i), yOf(s.data[i]));
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    draw();
    // Re-measure and redraw whenever the container is resized (window
    // resize, sidebar collapsing at a breakpoint, orientation change) —
    // a canvas's pixel buffer doesn't reflow like CSS/SVG would on its own.
    const ro = new ResizeObserver(() => draw());
    ro.observe(parent);
    return () => ro.disconnect();
  }, [labels, series, height, formatValue]);

  return (
    <div style={{ maxWidth: '100%' }}>
      <canvas ref={canvasRef} />
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <div className="chart-legend-item" key={s.name}>
              <span className="chart-legend-dot" style={{ background: s.color }} />
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function hexWithAlpha(color: string, alpha: number): string {
  // color may be a CSS var() reference or a hex string — canvas needs a resolved color.
  // Resolve var() at draw time via a throwaway element; fall back to the raw string.
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}
