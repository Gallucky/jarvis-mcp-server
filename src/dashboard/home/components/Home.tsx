import { useEffect, useState } from 'react';
import { HomeBlock } from './HomeBlock';
import { CLAUDE_LIMITS } from '../../../constants';

const IDEA_BLOCKS = [
  { icon: '✅', name: 'משימות' },
  { icon: '💰', name: 'כספים' },
  { icon: '🔁', name: 'הרגלים' },
  { icon: '📅', name: 'יומן' },
];

export function Home() {
  const [studyPct, setStudyPct] = useState(0);
  const [claudePct, setClaudePct] = useState(0);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => {
        const { total, done } = data.overall;
        setStudyPct(total ? Math.round(done / total * 100) : 0);
      })
      .catch(() => {});

    fetch('/api/claude-usage?days=7')
      .then(r => r.json())
      .then(data => {
        setClaudePct(Math.round(data.totals.all.tokens / CLAUDE_LIMITS.weekly.tokens * 100));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="dashboard">
      <div className="header">
        <div>
          <div className="header-title">🏠 לוח בקרה</div>
          <div className="header-sync">Jarvis</div>
        </div>
      </div>

      <div className="home-grid">
        <HomeBlock icon="📚" name="לימודים" href="/dashboard/study" pct={studyPct} />
        <HomeBlock icon="🤖" name="Claude" href="/dashboard/claude" pct={claudePct} />
        {IDEA_BLOCKS.map(b => (
          <HomeBlock key={b.name} icon={b.icon} name={b.name} />
        ))}
      </div>
    </div>
  );
}
