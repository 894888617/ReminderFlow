import { request } from './request'

export interface TodoRecord {
  id: number
  workspace_id: number
  title: string
  content?: string
  creator_id: number
  assignee_id?: number | null
  assignee_name?: string
  status: string
  due_at?: string | null
  created_at: string
  updated_at: string
}

export interface TodoReminder {
  id: number
  record_id: number
  workspace_id: number
  record_title: string
  assignee_id?: number | null
  remind_at: string
  repeat_type: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
  notified: boolean
  created_at: string
}

export interface TodayTodoResult {
  date: string
  due_today: TodoRecord[]
  reminders_today: TodoReminder[]
  unfinished: TodoRecord[]
}

export function getTodayTodos() {
  return request<TodayTodoResult>({
    url: '/api/todos/today',
    method: 'GET',
  })
}
