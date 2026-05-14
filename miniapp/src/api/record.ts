import { request } from './request'

export type RecordStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'OVERDUE'
  | 'CANCELLED'

export interface RecordItem {
  id: number
  workspace_id: number
  title: string
  content?: string
  creator_id: number
  assignee_id?: number | null
  assignee_name?: string
  status: RecordStatus
  due_at?: string | null
  created_at: string
  updated_at: string
  current_user_role?: 'owner' | 'member' | 'viewer' | ''
}

export interface PageResult<T> {
  items: T[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface RecordQueryParams {
  workspace_id: number
  page?: number
  page_size?: number
  status?: RecordStatus | ''
  assignee_id?: number
  keyword?: string
}

function buildQuery(params: RecordQueryParams) {
  const query: string[] = []

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  })

  return query.join('&')
}

export function getRecords(params: RecordQueryParams) {
  const query = buildQuery(params)

  return request<PageResult<RecordItem>>({
    url: `/api/records?${query}`,
    method: 'GET',
  })
}

export interface CreateRecordParams {
  workspace_id: number
  title: string
  content?: string
  assignee_id?: number
  due_at?: string

  calendar_start_at?: string
  calendar_end_at?: string | null
  calendar_all_day?: boolean
}

export function createRecord(data: CreateRecordParams) {
  return request<RecordItem>({
    url: '/api/records',
    method: 'POST',
    data,
  })
}

export interface OperationLog {
  id: number
  workspace_id?: number | null
  record_id?: number | null
  user_id?: number | null
  username: string
  action: string
  detail: string
  created_at: string
}

export function getRecordDetail(id: number) {
  return request<RecordItem>({
    url: `/api/records/${id}`,
    method: 'GET',
  })
}

export function updateRecordStatus(id: number, status: RecordStatus) {
  return request<RecordItem>({
    url: `/api/records/${id}/status`,
    method: 'PUT',
    data: {
      status,
    },
  })
}

export function getRecordLogs(id: number) {
  return request<OperationLog[]>({
    url: `/api/records/${id}/logs`,
    method: 'GET',
  })
}

export interface UpdateRecordParams {
  title: string
  content?: string
  assignee_id?: number
  due_at?: string
}

export function updateRecord(id: number, data: UpdateRecordParams) {
  return request<RecordItem>({
    url: `/api/records/${id}`,
    method: 'PUT',
    data,
  })
}

export function deleteRecord(id: number) {
  return request({
    url: `/api/records/${id}`,
    method: 'DELETE',
  })
}
