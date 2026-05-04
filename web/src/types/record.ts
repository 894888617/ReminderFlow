export type RecordStatus =
    | "PENDING"
    | "IN_PROGRESS"
    | "DONE"
    | "OVERDUE"
    | "CANCELLED";

export interface RecordItem {
    id: number;
    workspace_id: number;
    title: string;
    content: string;
    creator_id: number;
    assignee_id?: number | null;
    assignee_name: string;
    status: RecordStatus;
    due_at?: string | null;
    created_at: string;
    updated_at: string;
}

export interface PageResult<T> {
    items: T[];
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
}