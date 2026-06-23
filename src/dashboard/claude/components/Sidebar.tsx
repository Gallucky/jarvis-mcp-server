import type { View } from './ClaudeApp';

interface SidebarProps {
  view: View;
  onNavigate: (v: View) => void;
}

const NAV_ITEMS: { view: View; icon: string; label: string }[] = [
  { view: 'overview', icon: '📊', label: 'Overview' },
  { view: 'projects', icon: '📁', label: 'Projects' },
  { view: 'sessions', icon: '💬', label: 'Sessions' },
  { view: 'costs', icon: '💰', label: 'Costs' },
];

export function Sidebar({ view, onNavigate }: SidebarProps) {
  return (
    <div className="claude-sidebar">
      <a className="claude-sidebar-home" href="/dashboard">🏠 Jarvis</a>
      <div className="claude-sidebar-title">Claude Analytics</div>
      <nav className="claude-sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const active = view === item.view || (item.view === 'projects' && view === 'project') || (item.view === 'sessions' && view === 'session');
          return (
            <button
              key={item.view}
              className={`claude-nav-item${active ? ' active' : ''}`}
              onClick={() => onNavigate(item.view)}
            >
              <span className="claude-nav-icon">{item.icon}</span>
              <span className="claude-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
