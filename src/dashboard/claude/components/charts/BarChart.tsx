import { useEffect, useRef } from 'react';

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  orientation?: 'horizontal' | 'vertical';
  height?: number;
  color?: string;
  formatValue?: (n: number) => string;
}

const DEFAULT_COLOR = '#58a6ff';

export function BarChart({ data, orientation = 'horizontal', height = 220, color = DEFAULT_COLOR, formatValue }: BarChartProps) {
  if (orientation === 'vertical') {
    return <VerticalBarChart data={data} height={height} color={color} />;
  }
  return <HorizontalBarChart data={data} height={height} color={color} formatValue={formatValue} />;
}

function HorizontalBarChart({ data, color, formatValue }: { data: BarDatum[]; height: number; color: string; formatValue?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbar-chart">
      {data.map((d) => (
        <div className="hbar-row" key={d.label}>
          <div className="hbar-label" title={d.label}>{d.label}</div>
          <div className="hbar-track">
            <div
              className="hbar-fill"
              style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: d.color ?? color }}
            />
          </div>
          <div className="hbar-value">{formatValue ? formatValue(d.value) : d.value}</div>
        </div>
      ))}
    </div>
  );
}

function VerticalBarChart({ data, height, color }: { data: BarDatum[]; height: number; color: string }) {
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

      const padding = { top: 12, right: 8, bottom: 22, left: 8 };
      const plotW = Math.max(1, width - padding.left - padding.right);
      const plotH = height - padding.top - padding.bottom;
      const max = Math.max(1, ...data.map((d) => d.value));

      const n = data.length;
      const slot = plotW / n;
      const barW = Math.max(2, slot * 0.6);

      ctx.font = '10px Rubik, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7d8590';

      data.forEach((d, i) => {
        const x = padding.left + slot * i + slot / 2;
        const barH = (d.value / max) * plotH;
        const y = padding.top + plotH - barH;
        ctx!.fillStyle = d.color ?? color;
        ctx!.fillRect(x - barW / 2, y, barW, Math.max(1, barH));
        if (i % Math.max(1, Math.round(n / 12)) === 0) {
          ctx!.fillStyle = '#7d8590';
          ctx!.fillText(d.label, x, height - padding.bottom + 12);
        }
      });
    }

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(parent);
    return () => ro.disconnect();
  }, [data, height, color]);

  return <canvas ref={canvasRef} />;
}
