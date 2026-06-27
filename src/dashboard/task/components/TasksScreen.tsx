import { useEffect, useState, useRef } from 'react';
import { RingChart } from '../../shared/RingChart';
import type { Task } from '../types';
import TasksScreenHeader from './TasksScreenHeader';
import StatsRow from './StatsRow';
import AddTaskForm from './AddTaskForm';
import { STATUS_COLOR, PRIORITY_COLOR, STATUSES } from '../constants';
import TasksList from './TasksList';

// TODO:
// 0. Re-order the tasks screen area. ✓
// 1. Re-Add the date picker dialog.
// 2. Style the dropdown dialog.
// 3. A custom pop up for deletion confirmation.
// 4. A bank of pre-determined tasks to add
// 5. Searchbar
// 6. Filters & Groupings
// 7. Making sure data is secured + fake data option
// 8. Making sure claude and jarvis can create tasks, query, modify, group, filter them.
// 9. To make each daily note be taking information from the tasks route
// 10. Making sure the big 3 tasks of the day are unique and their style is different as well as the Complete Big 3 Tasks task is styled unique.
// 11. Bonus: grouping them further by groups.

export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [lastSync, setLastSync] = useState('—');

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

  // Returns the the precentage of tasks complete.
  const pctDone = (tasks: Task[]): number => {
    const active = tasks.filter(t => t.status !== 'Archived');
    if (!active.length) return 0;
    return Math.round(active.filter(t => t.status === 'Completed').length / active.length * 100);
  }

  const pct = pctDone(tasks);
  const active = tasks.filter(t => t.status !== 'Archived');
  const done = active.filter(t => t.status === 'Completed');
  const wip = active.filter(t => t.status === 'WIP');
  const stuck = active.filter(t => t.status === 'Struggling');

  if (loading) return (
    <div className="task-loader">טוען...</div>
  );

  return (
    <div className="task-viewport">
      <div className="dashboard">

        {/* Header */}
        <TasksScreenHeader adding={adding} setAdding={setAdding} titleRef={titleRef} lastSync={lastSync} load={load} />

        {/* Stats row */}
        <StatsRow active={active} done={done} wip={wip} stuck={stuck} pct={pct} />

        {/* Add task form */}
        {adding && (
          <AddTaskForm titleRef={titleRef} setTasks={setTasks} setAdding={setAdding} />
        )}

        {/* Task list */}
        <TasksList tasks={tasks} patch={patch} remove={remove} />

      </div>
    </div>
  );
}
