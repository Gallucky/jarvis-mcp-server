import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Overview } from './Overview';
import { Projects } from './Projects';
import { ProjectDetail } from './ProjectDetail';
import { Sessions } from './Sessions';
import { SessionDetail } from './SessionDetail';
import { Costs } from './Costs';
import type { SessionSource } from '../types';

export type View = 'overview' | 'projects' | 'project' | 'sessions' | 'session' | 'costs';

export function ClaudeApp() {
  const [view, setView] = useState<View>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionSource, setSelectedSessionSource] = useState<SessionSource>('code');

  const navigate = (v: View) => {
    setView(v);
  };

  const openProject = (id: string) => {
    setSelectedProjectId(id);
    setView('project');
  };

  const openSession = (id: string, source: SessionSource) => {
    setSelectedSessionId(id);
    setSelectedSessionSource(source);
    setView('session');
  };

  return (
    <div className="claude-app">
      <Sidebar view={view} onNavigate={navigate} />
      <div className="claude-content">
        {view === 'overview' && <Overview />}
        {view === 'projects' && <Projects onOpenProject={openProject} />}
        {view === 'project' && selectedProjectId && (
          <ProjectDetail projectId={selectedProjectId} onBack={() => setView('projects')} onOpenSession={openSession} />
        )}
        {view === 'sessions' && <Sessions onOpenSession={openSession} />}
        {view === 'session' && selectedSessionId && (
          <SessionDetail
            sessionId={selectedSessionId}
            source={selectedSessionSource}
            onBack={() => setView('sessions')}
          />
        )}
        {view === 'costs' && <Costs />}
      </div>
    </div>
  );
}
