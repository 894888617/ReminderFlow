import { request } from './request'

export const SUBSCRIBE_SCENE = {
  TASK_REMINDER: 'TASK_REMINDER',
  OVERDUE: 'OVERDUE',
  ASSIGNEE_CHANGED: 'ASSIGNEE_CHANGED',
} as const

export function recordSubscription(data: {
  template_id: string
  scene: string
  accepted: boolean
}) {
  return request({
    url: '/api/wechat/mini/subscriptions',
    method: 'POST',
    data,
  })
}
