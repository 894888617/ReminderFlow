import { request } from './request'

export interface CalendarInviteDetail {
  code: string
  calendar_id: number
  calendar_name: string
  inviter_name: string
  role: 'member' | 'viewer'
  expired: boolean
  accepted: boolean
}

export interface CreateCalendarInviteResult {
  code: string
  calendar_id: number
  calendar_name: string
  role: 'member' | 'viewer'
  expire_at: string
  share_path: string
}

export function createCalendarInvite(
  calendarId: number,
  data: {
    role: 'member' | 'viewer'
    expire_days?: number
    max_uses?: number
  }
) {
  return request<CreateCalendarInviteResult>({
    url: `/api/calendars/${calendarId}/invites`,
    method: 'POST',
    data,
  })
}

export function getInviteDetail(code: string) {
  return request<CalendarInviteDetail>({
    url: `/api/invites/${code}`,
    method: 'GET',
    auth: false,
  })
}

export interface AcceptInviteResult {
  calendar_id: number
}

export function acceptInvite(code: string) {
  return request<AcceptInviteResult>({
    url: `/api/invites/${code}/accept`,
    method: 'POST',
  })
}

export const createWorkspaceInvite = createCalendarInvite
export type WorkspaceInvite = CalendarInviteDetail
