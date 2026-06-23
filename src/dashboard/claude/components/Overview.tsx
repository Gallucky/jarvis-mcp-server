import { useEffect, useState } from 'react';
import { StatCard } from './StatCard';
import { LineChart } from './charts/LineChart';
import { DonutChart } from './charts/DonutChart';
import { BarChart } from './charts/BarChart';
import { Heatmap } from './charts/Heatmap';
import type { OverviewResponse } from '../types';
import { fmtTokens, fmtCost, modelColorHex, modelShortName, CLAUDE_HEX } from '../utils';
import { COWORK_LIMITS } from '../../../constants';

type Metric = 'messages' | 'sessions' | 'tokens';

export function Overview() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>('messages');

  useEffect(() => {
    fetch('/api/claude/overview')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="claude-loading">Loading…</div>;
  if (!data) return <div className="claude-empty">Failed to load overview data.</div>;

  const labels = data.dailyUsage.map((d) => d.date.slice(5));
  const series = [{ name: metric, color: CLAUDE_HEX.orange, data: data.dailyUsage.map((d) => d[metric]) }];

  const donutSegments = data.modelBreakdown.map((m) => ({
    label: modelShortName(m.model),
    value: m.tokens,
    color: modelColorHex(m.model),
  }));

  const peakHourData = data.peakHours.map((v, h) => ({ label: String(h), value: v }));

  const codeDailyPct = Math.round((data.limits.codeDailyTokens / data.limits.codeDailyLimit) * 100);
  const codeWeeklyPct = Math.round((data.limits.codeWeeklyTokens / data.limits.codeWeeklyLimit) * 100);
  const coworkSessionPct = Math.min(100, Math.round((data.limits.coworkSessionTokens / COWORK_LIMITS.session5h.tokens) * 100));
  const coworkDailyPct = Math.min(100, Math.round((data.limits.coworkDailyTokens / COWORK_LIMITS.daily.tokens) * 100));

  return (
    <div className="claude-page">
      <div className="claude-page-header">
        <h1>Overview</h1>
      </div>

      <div className="claude-stat-grid">
        <StatCard label="Total Sessions" value={data.totalSessions} icon="💬" sub={`${data.coworkSessions} cowork`} />
        <StatCard label="Total Messages" value={fmtTokens(data.totalMessages)} icon="📨" />
        <StatCard label="Total Tokens" value={fmtTokens(data.totalTokens)} icon="🔢" />
        <StatCard label="Est. Cost" value={fmtCost(data.estimatedCostUSD)} icon="💵" sub={`${fmtCost(data.cacheSavingsUSD)} saved via cache`} />
      </div>

      <div className="claude-card">
        <div className="claude-card-header">
          <div className="claude-card-title">Usage Over Time</div>
          <div className="claude-toggle-group">
            {(['messages', 'sessions', 'tokens'] as Metric[]).map((m) => (
              <button key={m} className={`claude-toggle${metric === m ? ' active' : ''}`} onClick={() => setMetric(m)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <LineChart labels={labels} series={series} formatValue={metric === 'tokens' ? fmtTokens : undefined} />
      </div>

      <div className="claude-grid-2">
        <div className="claude-card">
          <div className="claude-card-title">Model Usage</div>
          <DonutChart segments={donutSegments} formatValue={fmtTokens} />
        </div>

        <div className="claude-card">
          <div className="claude-card-title">Rate Limits</div>
          <div className="claude-limit-caveat">
            Estimated — Anthropic doesn't publish exact Claude Code quotas. Calibrated against your own usage history.
          </div>
          <LimitBar label="Claude Code — daily" pct={codeDailyPct} sub={`${fmtTokens(data.limits.codeDailyTokens)} / ${fmtTokens(data.limits.codeDailyLimit)}`} />
          <LimitBar label="Claude Code — weekly" pct={codeWeeklyPct} sub={`${fmtTokens(data.limits.codeWeeklyTokens)} / ${fmtTokens(data.limits.codeWeeklyLimit)}`} />
          <LimitBar label="Cowork — current session" pct={coworkSessionPct} sub={`${fmtTokens(data.limits.coworkSessionTokens)} / ${fmtTokens(COWORK_LIMITS.session5h.tokens)}`} />
          <LimitBar label="Cowork — daily" pct={coworkDailyPct} sub={`${fmtTokens(data.limits.coworkDailyTokens)} / ${fmtTokens(COWORK_LIMITS.daily.tokens)}`} />
        </div>
      </div>

      <div className="claude-grid-2">
        <div className="claude-card">
          <div className="claude-card-title">Activity (90 days)</div>
          <Heatmap data={data.activityGrid} />
        </div>

        <div className="claude-card">
          <div className="claude-card-title">Peak Hours (UTC)</div>
          <BarChart data={peakHourData} orientation="vertical" color={CLAUDE_HEX.blue} height={200} />
        </div>
      </div>
    </div>
  );
}

function LimitBar({ label, pct, sub }: { label: string; pct: number; sub: string }) {
  const color = pct >= 90 ? '#f85149' : pct >= 70 ? '#d29922' : CLAUDE_HEX.green;
  return (
    <div className="claude-limit-bar">
      <div className="claude-limit-head">
        <span>{label}</span>
        <span className="claude-limit-sub">{sub}</span>
      </div>
      <div className="claude-limit-track">
        <div className="claude-limit-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}
