import Taro from '@tarojs/taro'
import { requestPrivacyAuthorize } from './wechatPrivacy'

type ClipboardOptions<T = void> = {
  success?: (res: T) => void
  fail?: (err: unknown) => void
}

type ClipboardDataResult = {
  data?: string
}

type WechatClipboardAPI = {
  setClipboardData?: (options: { data: string } & ClipboardOptions) => void
  getClipboardData?: (options: ClipboardOptions<ClipboardDataResult>) => void
}

function getWechatClipboardAPI(): WechatClipboardAPI | undefined {
  return (globalThis as unknown as { wx?: WechatClipboardAPI }).wx
}

function normalizeClipboardText(data?: string) {
  return String(data || '').trim()
}

function setClipboardDataByTaro(data: string) {
  return new Promise<void>((resolve, reject) => {
    Taro.setClipboardData({
      data,
      success: () => resolve(),
      fail: (err) => reject(err),
    })
  })
}

function setClipboardDataByWechat(data: string) {
  const wxAPI = getWechatClipboardAPI()

  return new Promise<void>((resolve, reject) => {
    if (!wxAPI?.setClipboardData) {
      reject(new Error('setClipboardData API unavailable'))
      return
    }

    wxAPI.setClipboardData({
      data,
      success: () => resolve(),
      fail: (err) => reject(err),
    })
  })
}

function getClipboardDataByTaro() {
  return new Promise<string>((resolve, reject) => {
    Taro.getClipboardData({
      success: (res) => resolve(normalizeClipboardText(res.data)),
      fail: (err) => reject(err),
    })
  })
}

function getClipboardDataByWechat() {
  const wxAPI = getWechatClipboardAPI()

  return new Promise<string>((resolve, reject) => {
    if (!wxAPI?.getClipboardData) {
      reject(new Error('getClipboardData API unavailable'))
      return
    }

    wxAPI.getClipboardData({
      success: (res) => resolve(normalizeClipboardText(res.data)),
      fail: (err) => reject(err),
    })
  })
}

export async function copyTextToClipboard(data: string) {
  const text = normalizeClipboardText(data)

  if (!text) {
    throw new Error('clipboard data is empty')
  }

  await requestPrivacyAuthorize()

  try {
    await setClipboardDataByTaro(text)
  } catch (taroErr) {
    console.error('Taro.setClipboardData failed', taroErr)
    await setClipboardDataByWechat(text)
  }
}

export async function readTextFromClipboard() {
  await requestPrivacyAuthorize()

  try {
    return await getClipboardDataByTaro()
  } catch (taroErr) {
    console.error('Taro.getClipboardData failed', taroErr)
    return getClipboardDataByWechat()
  }
}
