import { request } from './request'

export interface WorkspaceInvite {
  id: number
  workspace_id: number
  workspace_name: string
  inviter_id: number
  inviter_name: string
  invite_code: string
  role: 'member' | 'viewer'
  expire_at?: string | null
  used_count: number
  max_use_count?: number | null
  created_at: string
}

export interface CreateInviteResult {
  invite_code: string
  path: string
  invite: WorkspaceInvite
}

export function createWorkspaceInvite(
  workspaceId: number,
  data: {
    role: 'member' | 'viewer'
    expire_hours?: number
    max_use_count?: number
  }
) {
  return request<CreateInviteResult>({
    url: `/api/workspaces/${workspaceId}/invites`,
    method: 'POST',
    data,
  })
}

export function getInviteDetail(code: string) {
  return request<WorkspaceInvite>({
    url: `/api/invites/${code}`,
    method: 'GET',
    auth: false,
  })
}

export interface AcceptInviteResult {
  workspace_id: number
  workspace_name: string
  role: 'owner' | 'member' | 'viewer'
  message: string
}

export function acceptInvite(code: string) {
  return request<AcceptInviteResult>({
    url: `/api/invites/${code}/accept`,
    method: 'POST',
  })
}
