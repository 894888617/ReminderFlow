export type WorkspaceRole = 'owner' | 'member' | 'viewer' | ''

export function canCreateRecord(role?: WorkspaceRole | string) {
  return role === 'owner' || role === 'member'
}

export function canEditRecord(role?: WorkspaceRole | string) {
  return role === 'owner' || role === 'member'
}

export function canUpdateRecordStatus(role?: WorkspaceRole | string) {
  return role === 'owner' || role === 'member'
}

export function canCreateReminder(role?: WorkspaceRole | string) {
  return role === 'owner' || role === 'member'
}

export function canDeleteRecord(
  role?: WorkspaceRole | string,
  currentUserId?: number,
  creatorId?: number
) {
  if (role === 'owner') return true
  if (role === 'member' && currentUserId && creatorId) {
    return currentUserId === creatorId
  }
  return false
}

export function canInviteMember(role?: WorkspaceRole | string) {
  return role === 'owner'
}

export function canManageMembers(role?: WorkspaceRole | string) {
  return role === 'owner'
}

export function canViewMembers(role?: WorkspaceRole | string) {
  return role === 'owner' || role === 'member' || role === 'viewer'
}

export function isReadonly(role?: WorkspaceRole | string) {
  return role === 'viewer'
}
