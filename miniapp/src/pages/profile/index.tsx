import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getMe, type MiniUser } from '../../api/auth'
import { recordSubscription, SUBSCRIBE_SCENE } from '../../api/subscription'
import { getCollaborationID, getMaskedWechatID, getWechatDisplayName } from '../../utils/userDisplay'
import './index.scss'
import { useState } from 'react'

export default function ProfilePage() {
  const [user, setUser] = useState<MiniUser | null>(() => Taro.getStorageSync('user') || null)

  useDidShow(() => {
    const token = Taro.getStorageSync('token')

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
    Taro.removeStorageSync('token')
    Taro.removeStorageSync('user')

    Taro.redirectTo({
      url: '/pages/login/index',
    })
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
        {user?.nickname && user?.username && user.nickname !== user.username && (
          <Text className='account-line'>账号：{user.username}</Text>
        )}
        <Text className='account-line'>协作 ID：{getCollaborationID(user) || '-'}</Text>
        {getMaskedWechatID(user) && (
          <Text className='account-line'>微信标识：{getMaskedWechatID(user)}</Text>
        )}
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
