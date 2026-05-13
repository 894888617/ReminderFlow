export interface NotificationItem {
    id: number;
    calendar_id?: number | null;
    calendar_name: string;
    user_id: number;
    record_id?: number | null;
    notification_type: string;
    title: string;
    content: string;
    read: boolean;
    read_at?: string | null;
    created_at: string;
}