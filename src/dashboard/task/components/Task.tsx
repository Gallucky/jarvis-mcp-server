import { useEffect, useState, useRef } from 'react';
import { RingChart } from '../../shared/RingChart';
import type { Task } from '../types';

const STATUSES: Task['status'][] = [
  'Not Started', 'WIP', 'Struggling', 'Near Complete', 'Completed', 'Archived',
];

const PRIORITIES: Task['priority'][] = ['Low', 'Medium', 'High'];

// TODO:
// 1. Re-Add the date picker dialog.
// 2. Style the dropdown dialog.
// 3. A custom pop up for deletion confirmation.

const STATUS_COLOR: Record<Task['status'], string> = {
  'Not Started': '#767c92',
  'WIP': '#8b7bff',
  'Struggling': '#f87171',
  'Near Complete': '#fbbf24',
  'Completed': '#34d399',
  'Archived': '#3d4255',
};

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  'Low': '#2dd4bf',
  'Medium': '#fbbf24',
  'High': '#f87171',
};

function pctDone(tasks: Task[]): number {
  const active = tasks.filter(t => t.status !== 'Archived');
  if (!active.length) return 0;
  return Math.round(active.filter(t => t.status === 'Completed').length / active.length * 100);
}

export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [lastSync, setLastSync] = useState('—');

  // New-task form state
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('Medium');
  const [newArea, setNewArea] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const data: Task[] = await fetch('/api/tasks').then(r => r.json());
      setTasks(data);
      setLastSync(new Date().toLocaleTimeString('he-IL'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const patch = async (id: number, body: Partial<Task>) => {
    const updated: Task = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    setTasks(prev => prev.map(t => t.id === id ? updated : t));
  };

  const remove = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    const body: Partial<Task> & { title: string } = {
      title: newTitle.trim(),
      priority: newPriority,
      status: 'Not Started',
      ...(newArea.trim() && { area: newArea.trim() }),
      ...(newDue.trim() && { due_date: newDue.trim() }),
      ...(newDesc.trim() && { description: newDesc.trim() }),
    };
    const created: Task = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    setTasks(prev => [created, ...prev]);
    setNewTitle(''); setNewPriority('Medium'); setNewArea('');
    setNewDue(''); setNewDesc('');
    setAdding(false);
  };

  const openAdd = () => {
    setAdding(true);
    setTimeout(() => titleRef.current?.focus(), 50);
  };

  const pct = pctDone(tasks);
  const active = tasks.filter(t => t.status !== 'Archived');
  const done = active.filter(t => t.status === 'Completed').length;
  const wip = active.filter(t => t.status === 'WIP').length;
  const stuck = active.filter(t => t.status === 'Struggling').length;

  if (loading) return (
    <div className="task-loader">טוען...</div>
  );

  return (
    <div className="task-viewport">
      <div className="dashboard">

        {/* Header */}
        <div className="header">
          <div>
            <a className="back-link" href="/dashboard">🏠 לוח בקרה</a>
            <div className="header-title">✅ משימות</div>
            <div className="header-sync">עדכון: {lastSync}</div>
          </div>
          <div className="task-header-actions">
            <button className="refresh-btn" onClick={load}>⟳ רענן</button>
            <button className="add-btn" onClick={openAdd}>+ משימה</button>
          </div>
        </div>

        {/* Stats row */}
        <div className="task-stats-row">
          <div className="card task-stat-card">
            <div className="task-stat-label">פעילות</div>
            <div className="task-stat-value">{active.length}</div>
          </div>
          <div className="card task-stat-card">
            <div className="task-stat-label">הושלמו</div>
            <div className="task-stat-value" style={{ color: '#34d399' }}>{done}</div>
          </div>
          <div className="card task-stat-card">
            <div className="task-stat-label">בעבודה</div>
            <div className="task-stat-value" style={{ color: '#8b7bff' }}>{wip}</div>
          </div>
          <div className="card task-stat-card">
            <div className="task-stat-label">תקוע</div>
            <div className="task-stat-value" style={{ color: '#f87171' }}>{stuck}</div>
          </div>
          <div className="card task-ring-card">
            <RingChart pct={pct} size={80} />
            <div className="task-ring-label">{pct}%</div>
          </div>
        </div>

        {/* Add task form */}
        {adding && (
          <div className="card task-add-form">
            <div className="task-add-row">
              <input
                ref={titleRef}
                className="task-input task-input-title"
                placeholder="כותרת משימה..."
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAdding(false); }}
              />
              <select className="task-select" value={newPriority}
                onChange={e => setNewPriority(e.target.value as Task['priority'])}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input className="task-input" placeholder="אזור (לימודים, עבודה...)"
                value={newArea} onChange={e => setNewArea(e.target.value)} />
              <input className="task-input" type="text" placeholder="תאריך יעד (YYYY-MM-DD)"
                value={newDue} onChange={e => setNewDue(e.target.value)} />
            </div>
            <input className="task-input task-input-desc" placeholder="תיאור (אופציונלי)..."
              value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <div className="task-add-actions">
              <button className="add-btn" onClick={addTask}>הוסף</button>
              <button className="cancel-btn" onClick={() => setAdding(false)}>ביטול</button>
            </div>
          </div>
        )}

        {/* Task list */}
        <div className="task-list">
          {tasks.length === 0 && (
            <div className="task-empty">אין משימות עדיין. לחץ + משימה כדי להתחיל.</div>
          )}
          {tasks.map(task => (
            <div key={String(task.id)}
              className={`card task-card ${task.status === 'Archived' ? 'task-card-archived' : ''}`}>
              <div className="task-card-top">
                <div className="task-card-left">
                  <span className="task-status-dot"
                    style={{ background: STATUS_COLOR[task.status] }} />
                  <span className="task-title">{task.title}</span>
                  {task.area && <span className="task-badge task-area">{task.area}</span>}
                  <span className="task-badge task-priority"
                    style={{ color: PRIORITY_COLOR[task.priority], borderColor: PRIORITY_COLOR[task.priority] }}>
                    {task.priority}
                  </span>
                </div>
                <div className="task-card-right">
                  {task.due_date && (
                    <span className="task-due">{task.due_date}</span>
                  )}
                  <select className="task-status-select"
                    value={task.status}
                    style={{ color: STATUS_COLOR[task.status] }}
                    onChange={e => patch(Number(task.id), { status: e.target.value as Task['status'] })}>
                    {STATUSES.map(s => (
                      <option key={s} value={s} style={{ color: STATUS_COLOR[s] }}>{s}</option>
                    ))}
                  </select>
                  <button className="task-delete-btn"
                    onClick={() => { if (window.confirm(`למחוק את "${task.title}"?`)) remove(Number(task.id)); }}
                    title="מחק משימה">✕</button>
                </div>
              </div>
              {task.description && (
                <div className="task-desc">{task.description}</div>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
