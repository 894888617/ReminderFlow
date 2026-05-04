import request from "./request";
import type { NotificationItem } from "../types/notification";

export function getNotifications() {
    return request.get<NotificationItem[], NotificationItem[]>("/api/notifications");
}

export function markNotificationRead(id: number) {
    return request.put(`/api/notifications/${id}/read`);
}