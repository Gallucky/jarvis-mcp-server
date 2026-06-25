export type Task = {
    id: Number;
    title: string;
    description?: string;
    status: "Not Started" | "WIP" | "Struggling" | "Near Complete" | "Completed" | "Archived";
    priority: "Low" | "Medium" | "High";
    area?: string;
    due_date?: string;
    created_at: string;
    updated_at: string;
};