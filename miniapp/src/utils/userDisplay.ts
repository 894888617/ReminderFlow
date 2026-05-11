export interface WechatUserDisplayFields {
  id?: number
  user_id?: number
  username?: string
  nickname?: string
  wechat_openid?: string
  wechat_unionid?: string
}

export function getWechatDisplayName(user?: WechatUserDisplayFields | null) {
  if (!user) return '-'

  return user.nickname || user.username || getMaskedWechatID(user) || '-'
}

export function getMaskedWechatID(user?: WechatUserDisplayFields | null) {
  const id = user?.wechat_unionid || user?.wechat_openid || ''

  if (!id) return ''

  if (id.length <= 8) return id

  return `${id.slice(0, 4)}...${id.slice(-4)}`
}

export function getUserNumericID(user?: WechatUserDisplayFields | null) {
  return user?.user_id || user?.id || 0
}
