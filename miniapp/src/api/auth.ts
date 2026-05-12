import { request } from './request'

export interface MiniLoginParams {
  code: string
  nickname?: string
  avatar_url?: string
}

export interface MiniUser {
  id: number
  username: string
  email?: string
  wechat_openid?: string
  wechat_unionid?: string
  nickname?: string
  avatar_url?: string
  created_at?: string
}

export interface MiniLoginResult {
  token: string
  user: MiniUser
}

export function wechatMiniLogin(data: MiniLoginParams) {
  return request<MiniLoginResult>({
    url: '/api/wechat/mini/login',
    method: 'POST',
    data,
    auth: false,
  })
}

export function getMe(options: { silent?: boolean } = {}) {
  return request<MiniUser>({
    url: '/api/users/me',
    method: 'GET',
    silent: options.silent,
  })
}
