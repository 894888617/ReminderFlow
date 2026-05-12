type WechatPrivacyAPI = {
  openPrivacyContract?: (options: {
    success?: () => void
    fail?: (err: unknown) => void
  }) => void
  requirePrivacyAuthorize?: (options: {
    success?: () => void
    fail?: (err: unknown) => void
  }) => void
}

function getWechatPrivacyAPI(): WechatPrivacyAPI | undefined {
  return (globalThis as unknown as { wx?: WechatPrivacyAPI }).wx
}

export function openPrivacyContract() {
  const wxAPI = getWechatPrivacyAPI()

  return new Promise<void>((resolve, reject) => {
    if (!wxAPI?.openPrivacyContract) {
      resolve()
      return
    }

    wxAPI.openPrivacyContract({
      success: () => resolve(),
      fail: (err) => reject(err),
    })
  })
}

export function requestPrivacyAuthorize() {
  const wxAPI = getWechatPrivacyAPI()

  return new Promise<void>((resolve, reject) => {
    if (!wxAPI?.requirePrivacyAuthorize) {
      resolve()
      return
    }

    wxAPI.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: (err) => reject(err),
    })
  })
}
