import { request } from './request'

export type WorkspaceRole = 'owner' | 'member' | 'viewer'

export interface Workspace {
  id: number
  name: string
  owner_id: number
  role: WorkspaceRole
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  id: number
  workspace_id: number
  user_id: number
  username: string
  email?: string
  role: WorkspaceRole
  created_at: string
}

export function getWorkspaces() {
  return request<Workspace[]>({
    url: '/api/workspaces',
    method: 'GET',
  })
}

export function getWorkspaceMembers(workspaceId: number) {
  return request<WorkspaceMember[]>({
    url: `/api/workspaces/${workspaceId}/members`,
    method: 'GET',
  })
}

export function updateWorkspaceMemberRole(
  workspaceId: number,
  userId: number,
  role: 'member' | 'viewer'
) {
  return request({
    url: `/api/workspaces/${workspaceId}/members/${userId}/role`,
    method: 'PUT',
    data: {
      role,
    },
  })
}

export function removeWorkspaceMember(workspaceId: number, userId: number) {
  return request({
    url: `/api/workspaces/${workspaceId}/members/${userId}`,
    method: 'DELETE',
  })
}

export interface CreateWorkspaceParams {
  name: string
}

export function createWorkspace(data: CreateWorkspaceParams) {
  return request<Workspace>({
    url: '/api/workspaces',
    method: 'POST',
    data,
  })
}
