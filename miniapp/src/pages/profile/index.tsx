import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { getMe, type MiniUser } from '../../api/auth'
import { getCollaborationID, getWechatDisplayName } from '../../utils/userDisplay'
import { clearLoginSession, getStoredToken, getStoredUser } from '../../utils/auth'
import { copyTextToClipboard } from '../../utils/clipboard'
import './index.scss'

export default function ProfilePage() {
  const [user, setUser] = useState<MiniUser | null>(() => getStoredUser() || null)

  useDidShow(() => {
    const token = getStoredToken()

    if (!token) return

    getMe()
      .then((data) => {
        setUser(data)
        Taro.setStorageSync('user', data)
      })
      .catch((err) => {
        console.error(err)
      })
  })

  const handleLogout = () => {
    clearLoginSession()

    Taro.redirectTo({
      url: '/pages/login/index',
    })
  }

  const accountID = getCollaborationID(user) || user?.username?.trim() || ''
  const handleCopy = async (label: string, value?: string) => {
    if (!value) {
      Taro.showToast({
        title: `${label}为空`,
        icon: 'none',
      })
      return
    }

    try {
      await copyTextToClipboard(value)

      Taro.showToast({
        title: `${label}已复制`,
        icon: 'success',
      })
    } catch (err) {
      console.error('copy account failed', err)
      Taro.showModal({
        title: '复制失败',
        content: `${label}：${value}，请长按账号手动复制`,
        showCancel: false,
      })
    }
  }

  return (
    <View className='container'>
      <View className='card account-card'>
        <Text className='account-name'>用户：{getWechatDisplayName(user)}</Text>

        <View className='account-copy-row'>
          <View className='account-copy-main'>
            <Text className='account-copy-label'>账号</Text>
            <Text className='account-copy-value' selectable>{accountID || '-'}</Text>
          </View>

          <View
            className={accountID ? 'copy-btn' : 'copy-btn disabled'}
            onClick={() => handleCopy('账号', accountID)}
          >
            复制
          </View>
        </View>

      </View>

      <View className='secondary-btn' onClick={handleLogout}>
        退出登录
      </View>
    </View>
  )
}
