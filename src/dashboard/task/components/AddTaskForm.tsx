import { useEffect, useRef, useState } from "react";
import { IoCalendarOutline, IoChevronBack, IoChevronDown, IoChevronForward, IoClose } from "react-icons/io5";
import { Task } from "../types";
import { PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL } from "../constants";

type AddTaskFormProps = {
    titleRef: React.RefObject<HTMLInputElement>;
    setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
    setAdding: React.Dispatch<React.SetStateAction<boolean>>;
};

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const toIsoDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string): Date | null => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
};

const monthLabel = (date: Date): string => (
    new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(date)
);

const shiftMonth = (date: Date, offset: number): Date => (
    new Date(date.getFullYear(), date.getMonth() + offset, 1)
);

const AddTaskForm = (props: AddTaskFormProps) => {
    const { titleRef, setTasks, setAdding } = props;

    // New-task form state
    const [newTitle, setNewTitle] = useState('');
    const [newPriority, setNewPriority] = useState<Task['priority']>('Medium');
    const [newArea, setNewArea] = useState('');
    const [newDue, setNewDue] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [priorityOpen, setPriorityOpen] = useState(false);
    const [dateOpen, setDateOpen] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

    const priorityRef = useRef<HTMLDivElement>(null);
    const dateRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const closeMenus = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!priorityRef.current?.contains(target)) setPriorityOpen(false);
            if (!dateRef.current?.contains(target)) setDateOpen(false);
        };

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setPriorityOpen(false);
                setDateOpen(false);
            }
        };

        document.addEventListener('mousedown', closeMenus);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeMenus);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, []);

    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const leadingDays = firstDay.getDay();
    const calendarCells = [
        ...Array.from({ length: leadingDays }, () => null),
        ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];


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

    const openDatePicker = () => {
        setDateOpen(open => !open);
        setPriorityOpen(false);
        const baseDate = parseIsoDate(newDue) ?? new Date();
        setCalendarMonth(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
    };

    const chooseDate = (day: number) => {
        setNewDue(toIsoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)));
        setDateOpen(false);
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
                <div className="task-priority-picker" ref={priorityRef}>
                    <button
                        className="task-priority-trigger"
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={priorityOpen}
                        onClick={() => {
                            setPriorityOpen(open => !open);
                            setDateOpen(false);
                        }}
                    >
                        <span className="task-priority-value" style={{ color: PRIORITY_COLOR[newPriority] }}>
                            <span className="task-priority-swatch" />
                            {PRIORITY_LABEL[newPriority]}
                        </span>
                        <IoChevronDown aria-hidden="true" />
                    </button>
                    {priorityOpen && (
                        <div className="task-priority-menu" role="listbox">
                            {PRIORITIES.map(priority => (
                                <button
                                    className={`task-priority-option ${newPriority === priority ? 'task-priority-option-active' : ''}`}
                                    type="button"
                                    key={priority}
                                    role="option"
                                    aria-selected={newPriority === priority}
                                    style={{ color: PRIORITY_COLOR[priority] }}
                                    onClick={() => {
                                        setNewPriority(priority);
                                        setPriorityOpen(false);
                                    }}
                                >
                                    <span className="task-priority-swatch" />
                                    {PRIORITY_LABEL[priority]}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <input className="task-input" placeholder="אזור (לימודים, עבודה...)"
                    value={newArea} onChange={e => setNewArea(e.target.value)} />
                <div className="task-date-picker" ref={dateRef}>
                    <button
                        className={`task-date-trigger ${newDue ? '' : 'task-date-trigger-empty'}`}
                        type="button"
                        aria-haspopup="dialog"
                        aria-expanded={dateOpen}
                        onClick={openDatePicker}
                    >
                        <IoCalendarOutline aria-hidden="true" />
                        <span>{newDue || 'תאריך יעד'}</span>
                    </button>
                    {dateOpen && (
                        <div className="task-date-popover" role="dialog" aria-label="בחירת תאריך יעד">
                            <div className="task-date-popover-header">
                                <button type="button" className="task-icon-btn" onClick={() => setCalendarMonth(month => shiftMonth(month, -1))}>
                                    <IoChevronBack aria-hidden="true" />
                                </button>
                                <span>{monthLabel(calendarMonth)}</span>
                                <button type="button" className="task-icon-btn" onClick={() => setCalendarMonth(month => shiftMonth(month, 1))}>
                                    <IoChevronForward aria-hidden="true" />
                                </button>
                            </div>
                            <div className="task-date-grid">
                                {WEEKDAYS.map((weekday, index) => (
                                    <span className="task-date-weekday" key={`${weekday}-${index}`}>{weekday}</span>
                                ))}
                                {calendarCells.map((day, index) => {
                                    if (!day) return <span className="task-date-empty-day" key={`empty-${index}`} />;

                                    const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                                    const iso = toIsoDate(date);
                                    const isSelected = newDue === iso;
                                    const isToday = toIsoDate(new Date()) === iso;

                                    return (
                                        <button
                                            className={`task-date-day ${isSelected ? 'task-date-day-selected' : ''} ${isToday ? 'task-date-day-today' : ''}`}
                                            type="button"
                                            key={iso}
                                            onClick={() => chooseDate(day)}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="task-date-actions">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const today = new Date();
                                        setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                                        setNewDue(toIsoDate(today));
                                        setDateOpen(false);
                                    }}
                                >
                                    היום
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewDue('');
                                        setDateOpen(false);
                                    }}
                                >
                                    <IoClose aria-hidden="true" />
                                    נקה
                                </button>
                            </div>
                        </div>
                    )}
                </div>
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
