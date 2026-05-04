import type { RecordItem } from "./record";

export interface TodoReminder {
    id: number;
    record_id: number;
    workspace_id: number;
    record_title: string;
    assignee_id?: number | null;
    remind_at: string;
    repeat_type: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
    notified: boolean;
    created_at: string;
}

export interface TodayTodoResult {
    date: string;
    due_today: RecordItem[];
    reminders_today: TodoReminder[];
    unfinished: RecordItem[];
}