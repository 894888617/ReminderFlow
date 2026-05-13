import Taro from '@tarojs/taro'
import type { MiniLoginResult, MiniUser } from '../api/auth'

export const TOKEN_STORAGE_KEY = 'token'
export const USER_STORAGE_KEY = 'user'

const TAB_BAR_URLS = new Set([
  '/pages/calendar/index',
  '/pages/todo/index',
  '/pages/notification/index',
  '/pages/profile/index',
])

export function getStoredToken() {
  return Taro.getStorageSync<string>(TOKEN_STORAGE_KEY)
}

export function getStoredUser() {
  return Taro.getStorageSync<MiniUser | undefined>(USER_STORAGE_KEY)
}

export function saveLoginSession(result: MiniLoginResult) {
  Taro.setStorageSync(TOKEN_STORAGE_KEY, result.token)
  Taro.setStorageSync(USER_STORAGE_KEY, result.user)
}

export function clearLoginSession() {
  Taro.removeStorageSync(TOKEN_STORAGE_KEY)
  Taro.removeStorageSync(USER_STORAGE_KEY)
}

export function isTabBarUrl(url: string) {
  const path = url.split('?')[0]
  return TAB_BAR_URLS.has(path)
}

export function navigateAfterLogin(url?: string) {
  const targetUrl = url || '/pages/calendar/index'

  if (isTabBarUrl(targetUrl)) {
    return Taro.switchTab({
      url: targetUrl.split('?')[0],
    })
  }

  return Taro.redirectTo({
    url: targetUrl,
  })
}
