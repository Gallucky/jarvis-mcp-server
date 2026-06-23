import { useEffect, useState } from 'react';
import type { CostsResponse } from '../types';
import { fmtTokens, fmtCost, CLAUDE_HEX } from '../utils';
import { StatCard } from './StatCard';
import { LineChart } from './charts/LineChart';
import { BarChart } from './charts/BarChart';

export function Costs() {
  const [data, setData] = useState<CostsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/claude/costs')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="claude-loading">Loading…</div>;
  if (!data) return <div className="claude-empty">Failed to load cost data.</div>;

  const labels = data.costOverTime.map((d) => d.date.slice(5));
  const series = [
    { name: 'Sonnet', color: CLAUDE_HEX.sonnet, data: data.costOverTime.map((d) => d.sonnet) },
    { name: 'Opus', color: CLAUDE_HEX.opus, data: data.costOverTime.map((d) => d.opus) },
    { name: 'Haiku', color: CLAUDE_HEX.haiku, data: data.costOverTime.map((d) => d.haiku) },
  ];

  const projectBars = data.costByProject.map((p) => ({ label: p.name, value: p.costUSD }));

  return (
    <div className="claude-page">
      <div className="claude-page-header">
        <h1>Costs</h1>
      </div>

      <div className="claude-stat-grid">
        <StatCard label="Total Cost" value={fmtCost(data.totalCostUSD)} icon="💵" />
        <StatCard label="Cache Savings" value={fmtCost(data.cacheSavingsUSD)} icon="🧊" />
        <StatCard label="Input Tokens" value={fmtTokens(data.inputTokens)} icon="⬇️" />
        <StatCard label="Output Tokens" value={fmtTokens(data.outputTokens)} icon="⬆️" />
      </div>

      <div className="claude-card">
        <div className="claude-card-title">Cost Over Time</div>
        <LineChart labels={labels} series={series} formatValue={fmtCost} />
      </div>

      <div className="claude-grid-2">
        <div className="claude-card">
          <div className="claude-card-title">Cost by Project</div>
          {projectBars.length === 0 ? (
            <div className="claude-empty">No project cost data yet.</div>
          ) : (
            <BarChart data={projectBars} orientation="horizontal" color={CLAUDE_HEX.orange} formatValue={fmtCost} />
          )}
        </div>

        <div className="claude-card">
          <div className="claude-card-title">Cost by Model</div>
          {data.costByModel.length === 0 ? (
            <div className="claude-empty">No model cost data yet.</div>
          ) : (
            <div className="claude-cost-by-model">
              {data.costByModel.map((m) => (
                <div className="claude-cost-model-row" key={m.model}>
                  <div className="claude-cost-model-name">{m.model}</div>
                  <div className="claude-cost-model-meta">
                    <span>{fmtTokens(m.inputTokens)} in</span>
                    <span>{fmtTokens(m.outputTokens)} out</span>
                    <span>{fmtTokens(m.cacheRead)} cache read</span>
                    <span>{fmtTokens(m.cacheWrite)} cache write</span>
                  </div>
                  <div className="claude-cost-model-value">{fmtCost(m.costUSD)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
