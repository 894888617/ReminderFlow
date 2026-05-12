import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { getMe, type MiniUser } from '../../api/auth'
import { recordSubscription, SUBSCRIBE_SCENE } from '../../api/subscription'
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

  const TASK_REMINDER_TEMPLATE_ID = '你的任务提醒模板ID'
  const OVERDUE_TEMPLATE_ID = '你的逾期提醒模板ID'
  const ASSIGNEE_TEMPLATE_ID = '你的负责人变更模板ID'

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

  const handleSubscribeMessage = async () => {
    const templateIds = [
      TASK_REMINDER_TEMPLATE_ID,
      OVERDUE_TEMPLATE_ID,
      ASSIGNEE_TEMPLATE_ID,
    ].filter((item) => item && !item.includes('你的'))

    if (templateIds.length === 0) {
      Taro.showToast({
        title: '请先配置订阅消息模板ID',
        icon: 'none',
      })
      return
    }

    try {
      const res = await Taro.requestSubscribeMessage({
        entityIds: [],
        tmplIds: templateIds
      })

      const tasks: Promise<any>[] = []

      if (TASK_REMINDER_TEMPLATE_ID && res[TASK_REMINDER_TEMPLATE_ID] === 'accept') {
        tasks.push(recordSubscription({
          template_id: TASK_REMINDER_TEMPLATE_ID,
          scene: SUBSCRIBE_SCENE.TASK_REMINDER,
          accepted: true,
        }))
      }

      if (OVERDUE_TEMPLATE_ID && res[OVERDUE_TEMPLATE_ID] === 'accept') {
        tasks.push(recordSubscription({
          template_id: OVERDUE_TEMPLATE_ID,
          scene: SUBSCRIBE_SCENE.OVERDUE,
          accepted: true,
        }))
      }

      if (ASSIGNEE_TEMPLATE_ID && res[ASSIGNEE_TEMPLATE_ID] === 'accept') {
        tasks.push(recordSubscription({
          template_id: ASSIGNEE_TEMPLATE_ID,
          scene: SUBSCRIBE_SCENE.ASSIGNEE_CHANGED,
          accepted: true,
        }))
      }

      await Promise.all(tasks)

      Taro.showToast({
        title: '订阅完成',
        icon: 'success',
      })
    } catch (err) {
      console.error(err)

      Taro.showToast({
        title: '订阅失败',
        icon: 'none',
      })
    }
  }

  return (
    <View className='container'>
      <View className='page-title'>我的</View>
      <View className='page-desc'>账号信息和系统设置。</View>

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

      <View className='secondary-btn' onClick={handleSubscribeMessage}>
        开启提醒通知
      </View>

      <View className='secondary-btn' onClick={handleLogout}>
        退出登录
      </View>
    </View>
  )
}
