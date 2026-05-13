export type CalendarRole = 'owner' | 'member' | 'viewer' | ''

export function canCreateRecord(role?: CalendarRole | string) {
  return role === 'owner' || role === 'member'
}

export function canEditRecord(role?: CalendarRole | string) {
  return role === 'owner' || role === 'member'
}

export function canUpdateRecordStatus(role?: CalendarRole | string) {
  return role === 'owner' || role === 'member'
}

export function canCreateReminder(role?: CalendarRole | string) {
  return role === 'owner' || role === 'member'
}

export function canDeleteRecord(
  role?: CalendarRole | string,
  currentUserId?: number,
  creatorId?: number
) {
  if (role === 'owner') return true
  if (role === 'member' && currentUserId && creatorId) {
    return currentUserId === creatorId
  }
  return false
}

export function canInviteMember(role?: CalendarRole | string) {
  return role === 'owner'
}

export function canManageMembers(role?: CalendarRole | string) {
  return role === 'owner'
}

export function canViewMembers(role?: CalendarRole | string) {
  return role === 'owner' || role === 'member' || role === 'viewer'
}

export function isReadonly(role?: CalendarRole | string) {
  return role === 'viewer'
}
