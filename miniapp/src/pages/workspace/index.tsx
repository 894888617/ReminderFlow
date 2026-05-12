import { View } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { deleteWorkspace, getWorkspaces, type Workspace } from '../../api/workspace'
import { getStoredToken } from '../../utils/auth'
import './index.scss'

function roleText(role: string) {
  switch (role) {
    case 'owner':
      return '所有者'
    case 'member':
      return '成员'
    case 'viewer':
      return '只读'
    default:
      return role || '-'
  }
}

export default function WorkspacePage() {
  const [list, setList] = useState<Workspace[]>([])
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadData = async () => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    try {
      const data = await getWorkspaces()
      setList(data || [])
    } catch (err) {
      console.error(err)
    }
  }

  usePullDownRefresh(async () => {
    await loadData()
    Taro.stopPullDownRefresh()
  })

  useDidShow(() => {
    loadData()
  })


  const handleDeleteWorkspace = (item: Workspace) => {
    if (item.role !== 'owner') {
      Taro.showToast({
        title: '只有所有者可以删除空间',
        icon: 'none',
      })
      return
    }

    Taro.showModal({
      title: '确认删除空间',
      content: '空间内记录、提醒将一并删除，确认继续吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return

        try {
          setDeletingId(item.id)
          Taro.showLoading({
            title: '删除中',
            mask: true,
          })

          await deleteWorkspace(item.id)

          Taro.hideLoading()
          Taro.showToast({
            title: '删除成功',
            icon: 'success',
          })

          await loadData()
        } catch (err) {
          console.error(err)
          Taro.hideLoading()
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  return (
    <View className='container'>
      <View className='workspace-header'>
        <View>
          <View className='page-title'>协作空间</View>
          <View className='page-desc'>查看你参与的空间和项目记录。</View>
        </View>

        <View
          className='create-space-btn'
          onClick={() => {
            Taro.navigateTo({
              url: '/pages/workspace-create/index',
            })
          }}
        >
          创建
        </View>
      </View>

      {list.length === 0 ? (
        <View className='onboarding-empty'>
          <View className='onboarding-title'>还没有协作空间</View>

          <View className='onboarding-desc'>
            空间用于管理一个项目、客户、团队或个人任务。创建空间后，可以添加记录、设置提醒、邀请成员协作。
          </View>

          <View
            className='onboarding-primary-btn'
            onClick={() => {
              Taro.navigateTo({
                url: '/pages/workspace-create/index',
              })
            }}
          >
            创建第一个空间
          </View>

          <View className='onboarding-tip'>
            也可以通过好友分享的邀请码加入已有空间。
          </View>
        </View>
      ) : (
        <View className='workspace-list'>
          {list.map((item) => (
            <View
              key={item.id}
              className='workspace-card'
              onClick={() => {
                Taro.navigateTo({
                  url: `/pages/workspace-detail/index?id=${item.id}&name=${encodeURIComponent(item.name)}&role=${item.role}`,
                })
              }}
            >
              <View className='workspace-main'>
                <View className='workspace-name'>{item.name}</View>
                <View className='workspace-meta'>空间 ID：{item.id}</View>
                <View className='workspace-meta'>更新时间：{formatDateTime(item.updated_at)}</View>
              </View>

              <View className='workspace-side'>
                <View className={`role-tag ${item.role}`}>
                  {roleText(item.role)}
                </View>

                {item.role === 'owner' && (
                  <View
                    className={deletingId === item.id ? 'delete-space-btn disabled' : 'delete-space-btn'}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteWorkspace(item)
                    }}
                  >
                    {deletingId === item.id ? '删除中' : '删除'}
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}
