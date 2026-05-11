import { request } from './request'

export interface RecentNotification {
  id: number
  record_id?: number | null
  title: string
  content: string
  read: boolean
  created_at: string
}

export interface RecentRecord {
  id: number
  workspace_id: number
  title: string
  status: string
  due_at?: string | null
  assignee_id?: number | null
  assignee_name: string
  created_at: string
}

export interface MobileHomeSummary {
  today_due_count: number
  today_reminder_count: number
  unfinished_count: number
  overdue_count: number
  unread_notification_count: number
  recent_notifications: RecentNotification[]
  recent_records: RecentRecord[]
}

export function getMobileHome() {
  return request<MobileHomeSummary>({
    url: '/api/mobile/home',
    method: 'GET',
  })
}
