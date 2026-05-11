import { View, Picker } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'

import {
  getWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type WorkspaceMember,
  type WorkspaceRole,
} from '../../api/workspace'
import {
  canManageMembers,
} from '../../utils/permission'

import './index.scss'
import PageRefresh from "../../components/PageRefresh";

const roleOptions: { label: string; value: 'member' | 'viewer' }[] = [
  { label: '成员', value: 'member' },
  { label: '只读', value: 'viewer' },
]

function roleText(role?: string) {
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

function roleIndex(role: WorkspaceRole) {
  if (role === 'viewer') return 1
  return 0
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

export default function WorkspaceMembersPage() {
  const router = useRouter()

  const workspaceId = Number(router.params.workspace_id || router.params.id || 0)
  const workspaceName = decodeURIComponent(String(router.params.name || ''))
  const currentRole = String(router.params.role || '')

  const manageable = canManageMembers(currentRole)

  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(false)

  const currentUser = Taro.getStorageSync('user')
  const currentUserId = Number(currentUser?.id || 0)

  const loadData = async () => {
    const token = Taro.getStorageSync('token')

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    if (!workspaceId) {
      Taro.showToast({
        title: '空间 ID 缺失',
        icon: 'none',
      })
      return
    }

    try {
      setLoading(true)
      const data = await getWorkspaceMembers(workspaceId)
      setMembers(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadData()
  })

  const handleChangeRole = async (
    member: WorkspaceMember,
    nextRole: 'member' | 'viewer'
  ) => {
    if (!manageable) return

    if (member.role === 'owner') {
      Taro.showToast({
        title: '不能修改所有者角色',
        icon: 'none',
      })
      return
    }

    try {
      Taro.showLoading({
        title: '修改中',
        mask: true,
      })

      await updateWorkspaceMemberRole(workspaceId, member.user_id, nextRole)

      Taro.hideLoading()

      Taro.showToast({
        title: '角色已更新',
        icon: 'success',
      })

      await loadData()
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    }
  }

  const handleRemove = async (member: WorkspaceMember) => {
    if (!manageable) return

    if (member.role === 'owner') {
      Taro.showToast({
        title: '不能移除所有者',
        icon: 'none',
      })
      return
    }

    if (member.user_id === currentUserId) {
      Taro.showToast({
        title: '不能移除自己',
        icon: 'none',
      })
      return
    }

    Taro.showModal({
      title: '确认移除成员',
      content: `确定要移除 ${member.username} 吗？`,
      success: async (res) => {
        if (!res.confirm) return

        try {
          Taro.showLoading({
            title: '移除中',
            mask: true,
          })

          await removeWorkspaceMember(workspaceId, member.user_id)

          Taro.hideLoading()

          Taro.showToast({
            title: '已移除',
            icon: 'success',
          })

          await loadData()
        } catch (err) {
          console.error(err)
          Taro.hideLoading()
        }
      },
    })
  }

  return (
    <View className='container'>
      <View className='members-header'>
        <View>
          <View className='page-title'>成员管理</View>
          <View className='page-desc'>
            {workspaceName || '协作空间'} ｜ 共 {members.length} 人
          </View>
        </View>

        <PageRefresh onClick={loadData} />
      </View>

      {!manageable && (
        <View className='readonly-tip'>
          当前角色为 {roleText(currentRole)}，只能查看成员列表。
        </View>
      )}

      {loading ? (
        <View className='empty-box'>加载中...</View>
      ) : members.length === 0 ? (
        <View className='empty-box'>暂无成员</View>
      ) : (
        <View className='member-list'>
          {members.map((item) => (
            <View key={item.id} className='member-card'>
              <View className='member-main'>
                <View className='member-name'>{item.username}</View>
                <View className='member-meta'>用户 ID：{item.user_id}</View>
                <View className='member-meta'>
                  加入时间：{formatDateTime(item.created_at)}
                </View>
              </View>

              <View className='member-actions'>
                {manageable && item.role !== 'owner' ? (
                  <Picker
                    mode='selector'
                    range={roleOptions.map((role) => role.label)}
                    value={roleIndex(item.role)}
                    onChange={(e) => {
                      const index = Number(e.detail.value)
                      const selected = roleOptions[index]
                      if (selected) {
                        handleChangeRole(item, selected.value)
                      }
                    }}
                  >
                    <View className={`role-tag ${item.role}`}>
                      {roleText(item.role)}
                    </View>
                  </Picker>
                ) : (
                  <View className={`role-tag ${item.role}`}>
                    {roleText(item.role)}
                  </View>
                )}

                {manageable && item.role !== 'owner' && item.user_id !== currentUserId && (
                  <View className='remove-btn' onClick={() => handleRemove(item)}>
                    移除
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
