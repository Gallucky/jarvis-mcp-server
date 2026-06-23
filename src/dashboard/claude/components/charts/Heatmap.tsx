import { useMemo } from 'react';
import type { ActivityGridEntry } from '../../types';

interface HeatmapProps {
  data: ActivityGridEntry[];
}

const CELL = 11;
const GAP = 3;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function colorFor(count: number, max: number): string {
  if (count <= 0) return '#0d1117';
  const t = Math.min(1, count / Math.max(1, max));
  // interpolate between a dim and a bright green, GitHub-heatmap style
  const stops = ['#0e4429', '#006d32', '#26a641', '#39d353'];
  const idx = Math.min(stops.length - 1, Math.floor(t * stops.length));
  return stops[idx];
}

export function Heatmap({ data }: HeatmapProps) {
  const { weeks, max, monthLabels } = useMemo(() => {
    if (data.length === 0) return { weeks: [] as ActivityGridEntry[][], max: 0, monthLabels: [] as { weekIndex: number; label: string }[] };

    // Pad the front so the grid starts on a Sunday, matching a GitHub-style grid.
    const first = new Date(data[0].date);
    const firstDow = first.getDay();
    const padded: (ActivityGridEntry | null)[] = [...Array(firstDow).fill(null), ...data];

    const weeksArr: (ActivityGridEntry | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) weeksArr.push(padded.slice(i, i + 7));

    const maxCount = Math.max(1, ...data.map((d) => d.count));

    const labels: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    weeksArr.forEach((week, wi) => {
      const firstReal = week.find((d) => d != null) as ActivityGridEntry | undefined;
      if (!firstReal) return;
      const month = new Date(firstReal.date).getMonth();
      if (month !== lastMonth) {
        labels.push({ weekIndex: wi, label: MONTH_NAMES[month] });
        lastMonth = month;
      }
    });

    return { weeks: weeksArr as ActivityGridEntry[][], max: maxCount, monthLabels: labels };
  }, [data]);

  if (weeks.length === 0) return null;

  const width = weeks.length * (CELL + GAP);
  const height = 7 * (CELL + GAP);

  return (
    <div className="heatmap-wrap">
      <svg width={width} height={height + 16} viewBox={`0 0 ${width} ${height + 16}`}>
        {monthLabels.map((m) => (
          <text key={m.weekIndex} x={m.weekIndex * (CELL + GAP)} y={10} fontSize={10} fill="#7d8590">
            {m.label}
          </text>
        ))}
        <g transform="translate(0, 16)">
          {weeks.map((week, wi) =>
            week.map((day, di) => {
              if (!day) return null;
              return (
                <rect
                  key={`${wi}-${di}`}
                  x={wi * (CELL + GAP)}
                  y={di * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  fill={colorFor(day.count, max)}
                >
                  <title>{`${day.date}: ${day.count} event${day.count === 1 ? '' : 's'}`}</title>
                </rect>
              );
            })
          )}
        </g>
      </svg>
    </div>
  );
}
