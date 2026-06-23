import { useEffect, useState } from 'react';
import type { ProjectSummary } from '../types';
import { fmtTokens, fmtCost, fmtRelTime, modelShortName, modelColor } from '../utils';

interface ProjectsProps {
  onOpenProject: (id: string) => void;
}

export function Projects({ onOpenProject }: ProjectsProps) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/claude/projects')
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="claude-loading">Loading…</div>;
  if (!projects) return <div className="claude-empty">Failed to load projects.</div>;

  return (
    <div className="claude-page">
      <div className="claude-page-header">
        <h1>Projects</h1>
        <div className="claude-page-sub">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</div>
      </div>

      {projects.length === 0 ? (
        <div className="claude-empty">No Claude Code sessions found yet.</div>
      ) : (
        <div className="claude-project-grid">
          {projects.map((p) => (
            <button className="claude-project-card" key={p.id} onClick={() => onOpenProject(p.id)}>
              <div className="claude-project-name">{p.name}</div>
              <div className="claude-project-path" title={p.path}>{p.path}</div>
              <div className="claude-project-chips">
                {p.models.map((m) => (
                  <span key={m} className="claude-chip" style={{ color: modelColor(m), borderColor: modelColor(m) }}>
                    {modelShortName(m)}
                  </span>
                ))}
              </div>
              <div className="claude-project-stats">
                <div><span className="claude-project-stat-value">{p.sessions}</span> sessions</div>
                <div><span className="claude-project-stat-value">{fmtTokens(p.totalTokens)}</span> tokens</div>
                <div><span className="claude-project-stat-value">{p.totalMessages}</span> messages</div>
                <div><span className="claude-project-stat-value">{fmtCost(p.estimatedCostUSD)}</span></div>
              </div>
              <div className="claude-project-footer">{p.lastActive ? `Active ${fmtRelTime(p.lastActive)}` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
