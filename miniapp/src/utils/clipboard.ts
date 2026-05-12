import Taro from '@tarojs/taro'
import { requestPrivacyAuthorize } from './wechatPrivacy'

type ClipboardOptions = {
  success?: () => void
  fail?: (err: unknown) => void
}

type WechatClipboardAPI = {
  setClipboardData?: (options: { data: string } & ClipboardOptions) => void
}

function getWechatClipboardAPI(): WechatClipboardAPI | undefined {
  return (globalThis as unknown as { wx?: WechatClipboardAPI }).wx
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

export async function copyTextToClipboard(data: string) {
  const text = String(data || '').trim()

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
