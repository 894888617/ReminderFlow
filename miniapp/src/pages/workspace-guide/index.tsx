import { View, Text, Button } from '@tarojs/components'
import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'

import { createCalendarInvite } from '../../api/invite'

import './index.scss'

export default function WorkspaceGuidePage() {
  const router = useRouter()

  const workspaceId = Number(router.params.workspace_id || 0)
  const workspaceName = decodeURIComponent(String(router.params.name || ''))

  const [invitePath, setInvitePath] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [creatingInvite, setCreatingInvite] = useState(false)

  useShareAppMessage(() => {
    return {
      title: `邀请加入日历「${workspaceName || '共享日历'}」`,
      path: invitePath || `/pages/workspace/index`,
    }
  })

  const handleCreateFirstRecord = () => {
    if (!workspaceId) {
      Taro.showToast({
        title: '空间 ID 缺失',
        icon: 'none',
      })
      return
    }

    Taro.navigateTo({
      url: `/pages/record-create/index?workspace_id=${workspaceId}`,
    })
  }

  const handleGoWorkspace = () => {
    if (!workspaceId) {
      Taro.switchTab({
        url: '/pages/workspace/index',
      })
      return
    }

    Taro.redirectTo({
      url: `/pages/workspace-detail/index?id=${workspaceId}&name=${encodeURIComponent(
        workspaceName
      )}&role=owner`,
    })
  }

  const handleCreateInvite = async () => {
    if (!workspaceId || creatingInvite) return

    try {
      setCreatingInvite(true)

      Taro.showLoading({
        title: '生成中',
        mask: true,
      })

      const res = await createCalendarInvite(workspaceId, {
        role: 'member',
        expire_days: 7,
        max_uses: 20,
      })

      setInvitePath(res.share_path)
      setInviteCode(res.code)

      Taro.hideLoading()

      Taro.showToast({
        title: '邀请已生成',
        icon: 'success',
      })
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setCreatingInvite(false)
    }
  }

  const handleSubscribeMessage = async () => {
    const templateIds = [
      '你的任务提醒模板ID',
      '你的逾期提醒模板ID',
      '你的负责人变更模板ID',
    ].filter((item) => item && !item.includes('你的'))

    if (templateIds.length === 0) {
      Taro.showToast({
        title: '请先配置订阅消息模板ID',
        icon: 'none',
      })
      return
    }

    try {
      await Taro.requestSubscribeMessage({
        entityIds: [],
        tmplIds: templateIds
      })

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
      <View className='guide-hero'>
        <Text className='guide-title'>空间创建成功</Text>
        <Text className='guide-name'>{workspaceName || '新的协作空间'}</Text>
        <Text className='guide-desc'>
          接下来可以创建第一条记录、邀请加入日历，或者开启提醒通知。
        </Text>
      </View>

      <View className='guide-card primary-card'>
        <View className='step-index'>1</View>

        <View className='step-content'>
          <Text className='step-title'>创建第一条记录</Text>
          <Text className='step-desc'>
            记录任务、负责人、截止时间和提醒时间，让空间真正开始运转。
          </Text>
        </View>

        <View className='step-btn primary' onClick={handleCreateFirstRecord}>
          去创建
        </View>
      </View>

      <View className='guide-card'>
        <View className='step-index green'>2</View>

        <View className='step-content'>
          <Text className='step-title'>邀请加入日历</Text>
          <Text className='step-desc'>
            生成邀请链接后，好友接受邀请即可加入日历。
          </Text>
        </View>

        {!invitePath ? (
          <View
            className={creatingInvite ? 'step-btn green disabled' : 'step-btn green'}
            onClick={handleCreateInvite}
          >
            {creatingInvite ? '生成中' : '生成邀请'}
          </View>
        ) : (
          <Button className='share-btn' openType='share'>
            分享邀请加入日历
          </Button>
        )}
      </View>

      {inviteCode && (
        <View className='invite-code-box'>
          邀请码：{inviteCode}
        </View>
      )}

      <View className='guide-card'>
        <View className='step-index orange'>3</View>

        <View className='step-content'>
          <Text className='step-title'>开启提醒通知</Text>
          <Text className='step-desc'>
            开启后，任务到期、逾期和负责人变更时可以收到提醒。
          </Text>
        </View>

        <View className='step-btn orange' onClick={handleSubscribeMessage}>
          去开启
        </View>
      </View>

      <View className='bottom-actions'>
        <View className='secondary-action' onClick={handleGoWorkspace}>
          先进入空间
        </View>

        <View
          className='link-action'
          onClick={() => {
            Taro.switchTab({
              url: '/pages/workspace/index',
            })
          }}
        >
          返回空间列表
        </View>
      </View>
    </View>
  )
}
