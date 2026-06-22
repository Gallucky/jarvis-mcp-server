import { useEffect, useState } from 'react';
import { HomeBlock } from './HomeBlock';

const IDEA_BLOCKS = [
  { icon: '✅', name: 'משימות' },
  { icon: '💰', name: 'כספים' },
  { icon: '🔁', name: 'הרגלים' },
  { icon: '📅', name: 'יומן' },
];

export function Home() {
  const [studyPct, setStudyPct] = useState(0);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => {
        const { total, done } = data.overall;
        setStudyPct(total ? Math.round(done / total * 100) : 0);
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
        {IDEA_BLOCKS.map(b => (
          <HomeBlock key={b.name} icon={b.icon} name={b.name} />
        ))}
      </div>
    </div>
  );
}
