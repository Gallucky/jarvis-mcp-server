import { STATUS_COLOR, PRIORITY_COLOR, STATUSES } from "../constants";
import { Task } from "../types";

type TasksList = {
    tasks: Task[];
    patch: (id: number, body: Partial<Task>) => Promise<void>;
    remove: (id: number) => Promise<void>;
};

const TasksList = (props: TasksList) => {
    const { tasks, patch, remove } = props;
    return <>
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
    </>;
};

export default TasksList;