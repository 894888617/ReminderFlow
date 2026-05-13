export interface WechatUserDisplayFields {
  id?: number
  user_id?: number
  username?: string
  nickname?: string
  wechat_openid?: string
  wechat_unionid?: string
}

export function getUserNumericID(user?: WechatUserDisplayFields | null) {
  return user?.user_id || user?.id || 0
}

export function getCollaborationID(user?: WechatUserDisplayFields | null) {
  const username = user?.username?.trim()

  if (username && isGeneratedWechatUsername(username)) return username

  const id = getUserNumericID(user)

  if (!id) return ''

  return `U${String(id).padStart(6, '0')}`
}

export function getWechatDisplayName(user?: WechatUserDisplayFields | null) {
  if (!user) return '-'

  return user.nickname || getCollaborationID(user) || user.username || getMaskedWechatID(user) || '-'
}

export function getUserNameDisplay(user?: WechatUserDisplayFields | null) {
  if (!user) return '未命名用户'

  const nickname = user.nickname?.trim()
  if (nickname) return nickname

  const username = user.username?.trim()
  if (username && !isGeneratedWechatUsername(username)) return username

  return '未命名用户'
}

function isGeneratedWechatUsername(username: string) {
  return username.startsWith('wx_')
}

export function getMaskedWechatID(user?: WechatUserDisplayFields | null) {
  const id = user?.wechat_unionid || user?.wechat_openid || ''

  if (!id) return ''

  if (id.length <= 8) return id

  return `${id.slice(0, 4)}...${id.slice(-4)}`
}
