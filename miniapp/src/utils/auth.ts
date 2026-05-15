import Taro from '@tarojs/taro'
import type { MiniLoginResult, MiniUser } from '../api/auth'

export const TOKEN_STORAGE_KEY = 'token'
export const USER_STORAGE_KEY = 'user'

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

export function navigateAfterLogin(url?: string) {
  const targetUrl = url || '/pages/calendar/index'

  return Taro.redirectTo({
    url: targetUrl,
  })
}
