import { useState } from "react";

type TasksScreenHeaderProps = {
    adding: boolean;
    setAdding: React.Dispatch<React.SetStateAction<boolean>>;
    titleRef: React.RefObject<HTMLInputElement>;
    lastSync: string;
    load: () => {};
};

const TasksScreenHeader = (props: TasksScreenHeaderProps): React.ReactNode => {
    const { adding, setAdding, titleRef, lastSync, load } = props;

    const openAdd = () => {
        setAdding(true);
        setTimeout(() => titleRef.current?.focus(), 50);
    };

    return <>
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
    </>;
};

export default TasksScreenHeader;