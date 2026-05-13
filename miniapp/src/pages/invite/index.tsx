import { View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'

export default function InvitePage() {
  const router = useRouter()
  const code = String(router.params.code || '')
  const autoAccept = String(router.params.auto_accept || '')

  useDidShow(() => {
    const query = [
      code ? `code=${encodeURIComponent(code)}` : '',
      autoAccept ? `auto_accept=${encodeURIComponent(autoAccept)}` : '',
    ]
      .filter(Boolean)
      .join('&')

    Taro.redirectTo({
      url: `/pages/invite-accept/index${query ? `?${query}` : ''}`,
    })
  })

  return <View />
}
