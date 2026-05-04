import request from "./request";

export type RepeatType = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";

export interface CreateReminderParams {
    remind_at: string;
    repeat_type: RepeatType;
}

export function createReminder(recordId: number, data: CreateReminderParams) {
    return request.post(`/api/records/${recordId}/reminders`, data);
}