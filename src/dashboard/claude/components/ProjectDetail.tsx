import { useEffect, useState } from 'react';
import type { ProjectSummary, SessionListItem, SessionSource } from '../types';
import { fmtTokens, fmtCost, fmtRelTime, modelShortName, modelColor } from '../utils';
import { StatCard } from './StatCard';

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
  onOpenSession: (id: string, source: SessionSource) => void;
}

export function ProjectDetail({ projectId, onBack, onOpenSession }: ProjectDetailProps) {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/claude/projects').then((r) => r.json()),
      fetch(`/api/claude/sessions?project=${encodeURIComponent(projectId)}`).then((r) => r.json()),
    ])
      .then(([projects, sess]: [ProjectSummary[], SessionListItem[]]) => {
        setProject(projects.find((p) => p.id === projectId) ?? null);
        setSessions(sess);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="claude-loading">Loading…</div>;
  if (!project) return <div className="claude-empty">Project not found.</div>;

  return (
    <div className="claude-page">
      <button className="claude-back-link" onClick={onBack}>← Back to Projects</button>

      <div className="claude-page-header">
        <h1>{project.name}</h1>
        <div className="claude-page-sub" title={project.path}>{project.path}</div>
      </div>

      <div className="claude-chip-row">
        {project.models.map((m) => (
          <span key={m} className="claude-chip" style={{ color: modelColor(m), borderColor: modelColor(m) }}>
            {modelShortName(m)}
          </span>
        ))}
      </div>

      <div className="claude-stat-grid">
        <StatCard label="Sessions" value={project.sessions} icon="💬" />
        <StatCard label="Messages" value={project.totalMessages} icon="📨" />
        <StatCard label="Tokens" value={fmtTokens(project.totalTokens)} icon="🔢" />
        <StatCard label="Est. Cost" value={fmtCost(project.estimatedCostUSD)} icon="💵" sub={project.lastActive ? `Last active ${fmtRelTime(project.lastActive)}` : undefined} />
      </div>

      <div className="claude-card">
        <div className="claude-card-title">Sessions</div>
        {!sessions || sessions.length === 0 ? (
          <div className="claude-empty">No sessions in this project.</div>
        ) : (
          <div className="claude-session-list">
            {sessions.map((s) => (
              <button className="claude-session-row" key={s.id} onClick={() => onOpenSession(s.id, s.source)}>
                <span className="claude-session-title">{s.title}</span>
                <span className="claude-chip" style={{ color: modelColor(s.model), borderColor: modelColor(s.model) }}>
                  {modelShortName(s.model)}
                </span>
                <span className="claude-session-meta">{s.duration}</span>
                <span className="claude-session-meta">{s.messageCount} msgs</span>
                <span className="claude-session-meta">{fmtTokens(s.tokens)}</span>
                <span className="claude-session-meta">{fmtCost(s.estimatedCostUSD)}</span>
                <span className="claude-session-time">{fmtRelTime(s.timestamp)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
