import { Input, Picker, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'

import {
  addWorkspaceMember,
  getWorkspaceMembers,
  getWorkspaces,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type WorkspaceMember,
  type WorkspaceRole,
} from '../../api/workspace'
import {
  canManageMembers,
} from '../../utils/permission'

import { getStoredToken } from '../../utils/auth'
import './index.scss'
import PageRefresh from '../../components/PageRefresh'
import { getCollaborationID, getMaskedWechatID, getWechatDisplayName } from '../../utils/userDisplay'

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
  const initialWorkspaceName = decodeURIComponent(String(router.params.name || ''))
  const initialRole = String(router.params.role || '')

  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName)
  const [currentRole, setCurrentRole] = useState(initialRole)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(false)
  const [memberKeyword, setMemberKeyword] = useState('')
  const [memberRole, setMemberRole] = useState<'member' | 'viewer'>('member')
  const [addingMember, setAddingMember] = useState(false)

  const manageable = canManageMembers(currentRole)

  const currentUser = Taro.getStorageSync('user')
  const currentUserId = Number(currentUser?.id || 0)

  const loadData = async () => {
    const token = getStoredToken()

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

      const workspaces = await getWorkspaces()
      const currentWorkspace = (workspaces || []).find((item) => item.id === workspaceId)

      if (!currentWorkspace) {
        Taro.showToast({
          title: '未加入该空间或空间不存在',
          icon: 'none',
        })
        return
      }

      setWorkspaceName(currentWorkspace.name)
      setCurrentRole(currentWorkspace.role)

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

  const handleAddMember = async () => {
    const keyword = memberKeyword.trim()

    if (!manageable || addingMember) return

    if (!keyword) {
      Taro.showToast({
        title: '请输入成员协作 ID',
        icon: 'none',
      })
      return
    }

    try {
      setAddingMember(true)
      Taro.showLoading({
        title: '添加中',
        mask: true,
      })

      await addWorkspaceMember(workspaceId, {
        keyword,
        role: memberRole,
      })

      Taro.hideLoading()
      Taro.showToast({
        title: '成员已添加',
        icon: 'success',
      })

      setMemberKeyword('')
      await loadData()
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setAddingMember(false)
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
      content: `确定要移除 ${getWechatDisplayName(member)} 吗？`,
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

      {manageable && (
        <View className='add-member-card'>
          <View className='add-member-title'>通过协作 ID 添加成员</View>
          <View className='add-member-desc'>让对方在“我的”页面复制协作 ID（如 U000123），即可准确添加同一个微信登录账号。</View>

          <View className='add-member-row'>
            <Input
              className='add-member-input'
              value={memberKeyword}
              placeholder='输入协作 ID / 用户 ID / 账号'
              confirmType='done'
              onInput={(e) => setMemberKeyword(e.detail.value)}
              onConfirm={handleAddMember}
            />

            <Picker
              mode='selector'
              range={roleOptions.map((role) => role.label)}
              value={roleIndex(memberRole)}
              onChange={(e) => {
                const index = Number(e.detail.value)
                const selected = roleOptions[index]
                if (selected) {
                  setMemberRole(selected.value)
                }
              }}
            >
              <View className={`role-tag ${memberRole}`}>
                {roleText(memberRole)}
              </View>
            </Picker>
          </View>

          <View
            className={addingMember ? 'add-member-btn disabled' : 'add-member-btn'}
            onClick={handleAddMember}
          >
            {addingMember ? '添加中...' : '直接添加成员'}
          </View>
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
                <View className='member-name'>{getWechatDisplayName(item)}</View>
                <View className='member-meta'>协作 ID：{getCollaborationID(item) || '-'}</View>
                {item.nickname && item.username && item.nickname !== item.username && (
                  <View className='member-meta'>账号：{item.username}</View>
                )}
                {getMaskedWechatID(item) && (
                  <View className='member-meta'>微信标识：{getMaskedWechatID(item)}</View>
                )}
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
