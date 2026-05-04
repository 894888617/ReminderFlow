export interface NotificationItem {
    id: number;
    user_id: number;
    record_id?: number | null;
    title: string;
    content: string;
    read: boolean;
    created_at: string;
}