import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'

import {
  acceptInvite,
  getInviteDetail,
  type WorkspaceInvite,
} from '../../api/invite'
import { getWorkspaces } from '../../api/workspace'

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

function formatDateTime(value?: string | null) {
  if (!value) return '长期有效'
  return value.replace('T', ' ').slice(0, 16)
}

export default function InvitePage() {
  const router = useRouter()
  const code = String(router.params.code || '')
  const autoAccept = String(router.params.auto_accept || '') === '1'

  const [invite, setInvite] = useState<WorkspaceInvite | null>(null)
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [loginPromptShown, setLoginPromptShown] = useState(false)

  const redirectToLogin = () => {
    const redirectUrl = encodeURIComponent(`/pages/invite/index?code=${code}&auto_accept=1`)

    Taro.redirectTo({
      url: `/pages/login/index?redirect=${redirectUrl}`,
    })
  }

  const showLoginPrompt = () => {
    if (!code || loginPromptShown) return

    setLoginPromptShown(true)

    Taro.showModal({
      title: '请先登录',
      content: '登录后将自动加入邀请人的协作空间，并按邀请角色获取对应权限。',
      confirmText: '去登录',
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

  const redirectToWorkspace = async (workspaceId: number) => {
    let workspaceName = invite?.workspace_name || ''
    let workspaceRole = invite?.role || ''

    try {
      const workspaces = await getWorkspaces()
      const joinedWorkspace = (workspaces || []).find((item) => item.id === workspaceId)

      if (joinedWorkspace) {
        workspaceName = joinedWorkspace.name
        workspaceRole = joinedWorkspace.role
      }
    } catch (err) {
      console.error(err)
    }

    Taro.redirectTo({
      url: `/pages/workspace-detail/index?id=${workspaceId}&name=${encodeURIComponent(
        workspaceName
      )}&role=${workspaceRole}`,
    })
  }

  const handleAccept = async () => {
    const token = Taro.getStorageSync('token')

    if (!token) {
      showLoginPrompt()
      return
    }

    if (!code || joining) return

    try {
      setJoining(true)

      Taro.showLoading({
        title: '加入中',
        mask: true,
      })

      const res = await acceptInvite(code)

      Taro.hideLoading()

      Taro.showToast({
        title: res.message === 'already joined' ? '已加入空间' : '加入成功',
        icon: 'success',
      })

      setTimeout(() => {
        redirectToWorkspace(res.workspace_id)
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

      const token = Taro.getStorageSync('token')
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
        <View className='invite-title'>邀请你加入协作空间</View>

        <View className='workspace-name'>
          {invite.workspace_name}
        </View>

        <View className='invite-row'>
          <Text className='label'>邀请人</Text>
          <Text className='value'>{invite.inviter_name}</Text>
        </View>

        <View className='invite-row'>
          <Text className='label'>加入角色</Text>
          <Text className='value'>{roleText(invite.role)}</Text>
        </View>

        <View className='invite-row'>
          <Text className='label'>有效期</Text>
          <Text className='value'>{formatDateTime(invite.expire_at)}</Text>
        </View>

        <View className='invite-tip'>
          加入后，你可以在空间中查看协同记录、处理任务和接收提醒。
        </View>

        <View
          className={joining ? 'join-btn disabled' : 'join-btn'}
          onClick={handleAccept}
        >
          {joining ? '加入中...' : '一键加入空间'}
        </View>
      </View>
    </View>
  )
}
