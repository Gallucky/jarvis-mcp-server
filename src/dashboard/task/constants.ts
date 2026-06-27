import { Task } from "./types";

export const STATUSES: Task['status'][] = [
    'Not Started', 'WIP', 'Struggling', 'Near Complete', 'Completed', 'Archived',
];

export const PRIORITIES: Task['priority'][] = ['Low', 'Medium', 'High'];

export const PRIORITY_LABEL: Record<Task['priority'], string> = {
    'Low': '🟢 Low',
    'Medium': '🟡 Medium',
    'High': '🔴 High',
};

export const STATUS_COLOR: Record<Task['status'], string> = {
    'Not Started': '#767c92',
    'WIP': '#8b7bff',
    'Struggling': '#f87171',
    'Near Complete': '#fbbf24',
    'Completed': '#34d399',
    'Archived': '#3d4255',
};

export const PRIORITY_COLOR: Record<Task['priority'], string> = {
    'Low': '#2dd4bf',
    'Medium': '#fbbf24',
    'High': '#f87171',
};
