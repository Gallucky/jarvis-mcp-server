import { useCallback, useEffect, useState } from 'react';
import type { Stats } from '../types';
import { RingChart } from '../../shared/RingChart';
import { StatCard } from './StatCard';
import { ProgressBar } from './ProgressBar';
import { Card } from './Card';

const COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171'];

const VAULT_NAME = "Gal's Obsidian Vault";

function obsidianUri(notePath: string): string {
  const withoutExt = notePath.replace(/\.md$/, '');
  return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(withoutExt)}`;
}

export function Study() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState('—');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/stats').then(r => r.json());
      setStats(data);
      setLastSync(new Date().toLocaleTimeString('he-IL'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!stats) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
      {loading ? 'טוען...' : 'שגיאה בטעינת הנתונים'}
    </div>
  );

  const { overall, bySection, byTopic, byLesson } = stats;
  const pct = overall.total ? Math.round(overall.done / overall.total * 100) : 0;

  return (
    <div className="dashboard">

      {/* Header */}
      <div className="header">
        <div>
          <a className="back-link" href="/dashboard">🏠 לוח בקרה</a>
          <div className="header-title">📊 Study Dashboard</div>
          <div className="header-sync">עדכון: {lastSync}</div>
        </div>
        <button className="refresh-btn" onClick={load}>⟳ רענן</button>
      </div>

      {/* Stats row */}
      <div className="stats-row">
        <StatCard label="סה״כ תרגילים" value={overall.total} />
        <StatCard label="הושלם" value={overall.done} color="#34d399" />
        <StatCard label="נותר" value={overall.total - overall.done} color="#f87171" />
        <div className="ring-card">
          <RingChart pct={pct} />
        </div>
      </div>

      {/* Section + Weak topics */}
      <div className="grid-section">
        <Card title="לפי מקטע">
          {bySection.map((s, i) => (
            <ProgressBar key={s.section} label={s.section || 'לא מסווג'}
              done={s.done} total={s.total} color={COLORS[i % COLORS.length]} />
          ))}
        </Card>

        <Card title="נושאים — מה נשאר">
          <table className="topics-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'right' }}>נושא</th>
                <th style={{ textAlign: 'right' }}>מקטע</th>
                <th style={{ textAlign: 'left' }}>נותר</th>
              </tr>
            </thead>
            <tbody>
              {byTopic.slice(0, 9).map(t => {
                const tp = t.total ? Math.round(t.done / t.total * 100) : 0;
                return (
                  <tr key={t.topic}>
                    <td className="topic-name">{t.topic || '—'}</td>
                    <td className="topic-section">{t.section}</td>
                    <td>
                      <div className="topic-remaining">
                        <span className="topic-remaining-count"
                          style={{ color: t.remaining > 0 ? '#f87171' : '#34d399' }}>
                          {t.remaining}
                        </span>
                        <div className="topic-remaining-track">
                          <div className="topic-remaining-fill" style={{ width: tp + '%' }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Lessons */}
      <Card title="לפי שיעור">
        <div className="lessons-row">
          {byLesson.map(l => {
            const lp = l.total ? Math.round(l.done / l.total * 100) : 0;
            const inner = (
              <>
                <div className="lesson-bar">
                  <div className="lesson-bar-fill" style={{ height: lp + '%' }} />
                </div>
                <div className="lesson-number">{l.lesson_number}</div>
                <div className="lesson-pct">{lp}%</div>
              </>
            );
            return l.note_path ? (
              <a key={l.lesson_number} className="lesson-chip" href={obsidianUri(l.note_path)}>
                {inner}
              </a>
            ) : (
              <div key={l.lesson_number} className="lesson-chip">{inner}</div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
