import { useState } from "react";
import { Task } from "../types";
import { PRIORITIES } from "../constants";

type AddTaskFormProps = {
    titleRef: React.RefObject<HTMLInputElement>;
    setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
    setAdding: React.Dispatch<React.SetStateAction<boolean>>;
};


const AddTaskForm = (props: AddTaskFormProps) => {
    const { titleRef, setTasks, setAdding } = props;

    // New-task form state
    const [newTitle, setNewTitle] = useState('');
    const [newPriority, setNewPriority] = useState<Task['priority']>('Medium');
    const [newArea, setNewArea] = useState('');
    const [newDue, setNewDue] = useState('');
    const [newDesc, setNewDesc] = useState('');


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

    return <>
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
    </>;
};

export default AddTaskForm;