import { useEffect, useState } from 'react';
import type { SessionDetail as SessionDetailData, SessionSource } from '../types';
import { isCodeSessionDetail } from '../types';
import { fmtTokens, fmtCost, fmtDateTime, modelShortName, modelColor } from '../utils';
import { StatCard } from './StatCard';
import { LineChart } from './charts/LineChart';
import { CLAUDE_HEX } from '../utils';

interface SessionDetailProps {
  sessionId: string;
  source: SessionSource;
  onBack: () => void;
}

export function SessionDetail({ sessionId, source, onBack }: SessionDetailProps) {
  const [data, setData] = useState<SessionDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/claude/sessions/${encodeURIComponent(sessionId)}?source=${source}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [sessionId, source]);

  if (loading) return <div className="claude-loading">Loading…</div>;
  if (!data) return <div className="claude-empty">Session not found.</div>;

  const { session } = data;
  const isCode = isCodeSessionDetail(data);

  return (
    <div className="claude-page">
      <button className="claude-back-link" onClick={onBack}>← Back to Sessions</button>

      <div className="claude-page-header">
        <h1>{session.title}</h1>
        <div className="claude-page-sub">
          {session.project}
          {session.model && <> · <span style={{ color: modelColor(session.model) }}>{modelShortName(session.model)}</span></>}
          {session.branch && <> · ⎇ {session.branch}</>}
          {' · '}{fmtDateTime(session.timestamp)}
        </div>
      </div>

      <div className="claude-stat-grid claude-stat-grid-6">
        <StatCard label="Duration" value={session.duration} icon="⏱" />
        <StatCard label="Messages" value={session.messageCount} icon="📨" />
        <StatCard label="Tool Calls" value={session.toolCallCount} icon="🛠" />
        <StatCard label="Tokens" value={fmtTokens(session.tokens)} icon="🔢" />
        <StatCard label="Est. Cost" value={fmtCost(session.estimatedCostUSD)} icon="💵" />
        <StatCard label="Compactions" value={session.compactions} icon="📦" />
      </div>

      {isCode ? (
        <div className="claude-grid-detail">
          <div className="claude-card claude-conversation-card">
            <div className="claude-card-title">Conversation</div>
            <div className="claude-conversation">
              {data.messages.length === 0 ? (
                <div className="claude-empty">No conversation text recorded for this session.</div>
              ) : (
                data.messages.map((m, i) => (
                  <div className={`claude-bubble claude-bubble-${m.role}`} key={i}>
                    <div className="claude-bubble-role">{m.role}</div>
                    {m.text && <div className="claude-bubble-text">{m.text.slice(0, 4000)}</div>}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div className="claude-bubble-tools">
                        {m.toolCalls.map((t, ti) => (
                          <span className="claude-tool-badge" key={ti}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="claude-detail-side">
            <div className="claude-card">
              <div className="claude-card-title">Token Breakdown</div>
              <table className="claude-kv-table">
                <tbody>
                  <tr><td>Input</td><td>{fmtTokens(data.tokenBreakdown.input)}</td></tr>
                  <tr><td>Output</td><td>{fmtTokens(data.tokenBreakdown.output)}</td></tr>
                  <tr><td>Cache Read</td><td>{fmtTokens(data.tokenBreakdown.cacheRead)}</td></tr>
                  <tr><td>Cache Write</td><td>{fmtTokens(data.tokenBreakdown.cacheWrite)}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="claude-card">
              <div className="claude-card-title">Tools Used</div>
              {data.toolsUsed.length === 0 ? (
                <div className="claude-empty">No tool calls.</div>
              ) : (
                <div className="claude-tools-used">
                  {data.toolsUsed.map((t) => {
                    const max = data.toolsUsed[0]?.count ?? 1;
                    return (
                      <div className="claude-tool-used-row" key={t.name}>
                        <span className="claude-tool-used-name">{t.name}</span>
                        <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(t.count / max) * 100}%`, background: CLAUDE_HEX.blue }} /></div>
                        <span className="claude-tool-used-count">{t.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="claude-card">
          <div className="claude-card-title">Token Usage Over Time</div>
          {data.tokenTrajectory.length === 0 ? (
            <div className="claude-empty">No recorded turns for this session.</div>
          ) : (
            <LineChart
              labels={data.tokenTrajectory.map((t) => `#${t.msgIndex}`)}
              series={[{ name: 'Cumulative tokens', color: CLAUDE_HEX.cowork, data: data.tokenTrajectory.map((t) => t.cumTokens) }]}
              formatValue={fmtTokens}
            />
          )}
        </div>
      )}
    </div>
  );
}
