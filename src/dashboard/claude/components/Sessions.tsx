import { useEffect, useMemo, useState } from 'react';
import type { SessionListItem, SessionSource } from '../types';
import { fmtTokens, fmtCost, fmtRelTime, modelShortName, modelColor } from '../utils';

interface SessionsProps {
  onOpenSession: (id: string, source: SessionSource) => void;
}

type SourceFilter = 'all' | SessionSource;

export function Sessions({ onOpenSession }: SessionsProps) {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    fetch('/api/claude/sessions?limit=500')
      .then((r) => r.json())
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!sessions) return [];
    let list = sessions;
    if (sourceFilter !== 'all') list = list.filter((s) => s.source === sourceFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.project.toLowerCase().includes(q));
    }
    return list;
  }, [sessions, search, sourceFilter]);

  return (
    <div className="claude-page">
      <div className="claude-page-header">
        <h1>Sessions</h1>
      </div>

      <div className="claude-session-filters">
        <input
          className="claude-search-input"
          placeholder="Search sessions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="claude-toggle-group">
          {(['all', 'code', 'cowork'] as SourceFilter[]).map((s) => (
            <button key={s} className={`claude-toggle${sourceFilter === s ? ' active' : ''}`} onClick={() => setSourceFilter(s)}>
              {s === 'all' ? 'All' : s === 'code' ? 'Claude Code' : 'Cowork'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="claude-loading">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="claude-empty">No sessions match.</div>
      ) : (
        <div className="claude-session-list">
          {filtered.map((s) => (
            <button className="claude-session-row" key={`${s.source}:${s.id}`} onClick={() => onOpenSession(s.id, s.source)}>
              <span className="claude-session-project">{s.project}</span>
              <span className="claude-session-title">{s.title}</span>
              {s.model && (
                <span className="claude-chip" style={{ color: modelColor(s.model), borderColor: modelColor(s.model) }}>
                  {modelShortName(s.model)}
                </span>
              )}
              {s.branch && <span className="claude-session-branch">⎇ {s.branch}</span>}
              <span className="claude-session-meta">{s.duration}</span>
              <span className="claude-session-meta">{s.messageCount} msgs</span>
              <span className="claude-session-meta">{s.toolCallCount} tools</span>
              <span className="claude-session-meta">{fmtTokens(s.tokens)}</span>
              <span className="claude-session-meta">{fmtCost(s.estimatedCostUSD)}</span>
              <span className="claude-session-time">{fmtRelTime(s.timestamp)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
