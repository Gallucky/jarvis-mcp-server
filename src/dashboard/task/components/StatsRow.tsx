import { RingChart } from "../../shared/RingChart";
import { Task } from "../types";

type StatsRowProps = {
    active: Task[];
    done: Task[];
    wip: Task[];
    stuck: Task[];
    pct: number;
};

const StatsRow = (props: StatsRowProps) => {
    const { active, done, wip, stuck, pct } = props;

    return <>
        <div className="task-stats-row">
            <div className="card task-stat-card">
                <div className="task-stat-label">פעילות</div>
                <div className="task-stat-value">{active.length}</div>
            </div>
            <div className="card task-stat-card">
                <div className="task-stat-label">הושלמו</div>
                <div className="task-stat-value" style={{ color: '#34d399' }}>{done.length}</div>
            </div>
            <div className="card task-stat-card">
                <div className="task-stat-label">בעבודה</div>
                <div className="task-stat-value" style={{ color: '#8b7bff' }}>{wip.length}</div>
            </div>
            <div className="card task-stat-card">
                <div className="task-stat-label">תקוע</div>
                <div className="task-stat-value" style={{ color: '#f87171' }}>{stuck.length}</div>
            </div>
            <div className="card task-ring-card">
                <RingChart pct={pct} size={80} />
                <div className="task-ring-label">{pct}%</div>
            </div>
        </div>
    </>;
};

export default StatsRow;