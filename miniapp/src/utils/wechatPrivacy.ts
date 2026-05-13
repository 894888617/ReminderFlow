import Taro from '@tarojs/taro'

type PrivacySettingResult = {
  needAuthorization?: boolean
}

type PrivacyCallbackOptions<T = void> = {
  success?: (res: T) => void
  fail?: (err: unknown) => void
}

type PrivacyAPI = {
  getPrivacySetting?: (options: PrivacyCallbackOptions<PrivacySettingResult>) => void
  openPrivacyContract?: (options: PrivacyCallbackOptions) => void
  requirePrivacyAuthorize?: (options: PrivacyCallbackOptions) => void
}

function getTaroPrivacyAPI(): PrivacyAPI {
  return Taro as unknown as PrivacyAPI
}

function getWechatPrivacyAPI(): PrivacyAPI | undefined {
  return (globalThis as unknown as { wx?: PrivacyAPI }).wx
}

function getPrivacyAPIs() {
  const taroAPI = getTaroPrivacyAPI()
  const wxAPI = getWechatPrivacyAPI()

  return wxAPI ? [taroAPI, wxAPI] : [taroAPI]
}

function showPrivacyRequiredToast() {
  Taro.showToast({
    title: '需要同意隐私协议才能使用此功能',
    icon: 'none',
  })
}

export function openPrivacyContract() {
  const privacyAPI = getPrivacyAPIs().find((api) => api.openPrivacyContract)

  return new Promise<void>((resolve, reject) => {
    if (!privacyAPI?.openPrivacyContract) {
      resolve()
      return
    }

    privacyAPI.openPrivacyContract({
      success: () => resolve(),
      fail: (err) => {
        showPrivacyRequiredToast()
        reject(err)
      },
    })
  })
}

function getPrivacySetting() {
  const privacyAPI = getPrivacyAPIs().find((api) => api.getPrivacySetting)

  return new Promise<PrivacySettingResult>((resolve, reject) => {
    if (!privacyAPI?.getPrivacySetting) {
      resolve({ needAuthorization: false })
      return
    }

    privacyAPI.getPrivacySetting({
      success: (res) => resolve(res || { needAuthorization: false }),
      fail: (err) => reject(err),
    })
  })
}

function requirePrivacyAuthorizeFallback() {
  const privacyAPI = getPrivacyAPIs().find((api) => api.requirePrivacyAuthorize)

  return new Promise<void>((resolve, reject) => {
    if (!privacyAPI?.requirePrivacyAuthorize) {
      resolve()
      return
    }

    privacyAPI.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: (err) => {
        showPrivacyRequiredToast()
        reject(err)
      },
    })
  })
}

export async function requestPrivacyAuthorize() {
  let setting: PrivacySettingResult

  try {
    setting = await getPrivacySetting()
  } catch (err) {
    await requirePrivacyAuthorizeFallback()
    return
  }

  if (!setting.needAuthorization) return

  await openPrivacyContract()
}
