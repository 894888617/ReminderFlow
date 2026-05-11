import { request } from './request'

export interface NotificationItem {
  id: number
  user_id: number
  record_id?: number | null
  title: string
  content: string
  read: boolean
  created_at: string
}

export function getNotifications() {
  return request<NotificationItem[]>({
    url: '/api/notifications',
    method: 'GET',
  })
}

export function markNotificationRead(id: number) {
  return request({
    url: `/api/notifications/${id}/read`,
    method: 'PUT',
  })
}


export function deleteNotification(id: number) {
  return request({
    url: `/api/notifications/${id}`,
    method: 'DELETE',
  })
}
