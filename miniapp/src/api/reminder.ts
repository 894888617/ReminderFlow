import { request } from './request'

export type RepeatType = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

export interface ReminderItem {
  id: number
  record_id: number
  workspace_id?: number
  record_title?: string
  assignee_id?: number | null
  remind_at: string
  repeat_type: RepeatType
  notified: boolean
  created_at: string
}

export interface CreateReminderParams {
  remind_at: string
  repeat_type: RepeatType
}

export function createReminder(recordId: number, data: CreateReminderParams) {
  return request({
    url: `/api/records/${recordId}/reminders`,
    method: 'POST',
    data,
  })
}


export function getRecordReminders(recordId: number) {
  return request<ReminderItem[]>({
    url: `/api/records/${recordId}/reminders`,
    method: 'GET',
  })
}
