import { Button, View, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'

import {
  acceptInvite,
  getInviteDetail,
  type CalendarInviteDetail,
} from '../../api/calendar'

import { getStoredToken } from '../../utils/auth'
import './index.scss'

function roleText(role?: string) {
  switch (role) {
    case 'member':
      return '成员'
    case 'viewer':
      return '只读'
    default:
      return role || '-'
  }
}

export default function InviteAcceptPage() {
  const router = useRouter()
  const code = String(router.params.code || '')
  const autoAccept = String(router.params.auto_accept || '') === '1'

  const [invite, setInvite] = useState<CalendarInviteDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [loginPromptShown, setLoginPromptShown] = useState(false)

  const redirectToLogin = () => {
    const redirectUrl = encodeURIComponent(`/pages/invite-accept/index?code=${code}&auto_accept=1`)

    Taro.redirectTo({
      url: `/pages/login/index?redirect=${redirectUrl}`,
    })
  }

  const showLoginPrompt = () => {
    if (!code || loginPromptShown) return

    setLoginPromptShown(true)

    Taro.showModal({
      title: '请先登录',
      content: '登录后接受邀请，你将加入共享日历。',
      confirmText: '微信登录',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) {
          redirectToLogin()
        } else {
          setLoginPromptShown(false)
        }
      },
    })
  }

  const redirectToCalendar = (calendarId: number) => {
    Taro.setStorageSync('selected_calendar_id', calendarId)
    Taro.redirectTo({
      url: `/pages/calendar/index?calendar_id=${calendarId}`,
    })
  }

  const handleAccept = async () => {
    const token = getStoredToken()

    if (!token) {
      showLoginPrompt()
      return
    }

    if (!code || joining) return

    try {
      setJoining(true)

      Taro.showLoading({
        title: '接受中',
        mask: true,
      })

      const res = await acceptInvite(code)

      Taro.hideLoading()

      Taro.showToast({
        title: '接受邀请成功',
        icon: 'success',
      })

      setTimeout(() => {
        redirectToCalendar(res.calendar_id)
      }, 500)
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setJoining(false)
    }
  }

  const loadInvite = async () => {
    if (!code) {
      Taro.showToast({
        title: '邀请码缺失',
        icon: 'none',
      })
      return
    }

    try {
      setLoading(true)
      const data = await getInviteDetail(code)
      setInvite(data)

      const token = getStoredToken()
      if (!token) {
        showLoginPrompt()
        return
      }

      if (autoAccept) {
        await handleAccept()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadInvite()
  })

  if (loading && !invite) {
    return (
      <View className='container'>
        <View className='empty-box'>邀请信息加载中...</View>
      </View>
    )
  }

  if (!invite) {
    return (
      <View className='container'>
        <View className='empty-box'>邀请不存在或已失效</View>
      </View>
    )
  }

  return (
    <View className='container'>
      <View className='invite-card'>
        <View className='invite-title'>邀请加入日历</View>

        <View className='calendar-name'>{invite.calendar_name}</View>

        <View className='invite-row'>
          <Text className='label'>邀请人</Text>
          <Text className='value'>{invite.inviter_name}</Text>
        </View>

        <View className='invite-row'>
          <Text className='label'>加入角色</Text>
          <Text className='value'>{roleText(invite.role)}</Text>
        </View>

        <View className='invite-tip'>
          你将加入 {invite.calendar_name} 日历，加入后可查看共享记录。
        </View>

        {invite.expired || invite.accepted ? (
          <View className='empty-box'>{invite.expired ? '邀请已过期' : '邀请次数已用完'}</View>
        ) : (
          <Button className='accept-btn' loading={joining} disabled={joining} onClick={handleAccept}>
            {joining ? '接受中...' : '接受邀请'}
          </Button>
        )}
      </View>
    </View>
  )
}
