import { Input, Picker, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'

import {
  addCalendarMember,
  getCalendarDetail,
  listCalendarMembers,
  normalizeCalendarRole,
  removeCalendarMember,
  updateCalendarMemberRole,
  type CalendarMember,
  type CalendarRole,
} from '../../api/calendar'
import { canManageMembers } from '../../utils/permission'
import { getStoredToken } from '../../utils/auth'
import PageRefresh from '../../components/PageRefresh'
import { getWechatDisplayName } from '../../utils/userDisplay'

import './index.scss'

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

function roleIndex(role: CalendarRole | 'member' | 'viewer') {
  if (role === 'viewer') return 1
  return 0
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

export default function CalendarMembersPage() {
  const router = useRouter()
  const calendarId = Number(router.params.calendar_id || router.params.id || 0)

  const [calendarName, setCalendarName] = useState('')
  const [currentRole, setCurrentRole] = useState('')
  const [members, setMembers] = useState<CalendarMember[]>([])
  const [loading, setLoading] = useState(false)
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member')
  const [inviteAccount, setInviteAccount] = useState('')
  const [addingMember, setAddingMember] = useState(false)

  const manageable = canManageMembers(currentRole)
  const currentUser = Taro.getStorageSync('user')
  const currentUserId = Number(currentUser?.id || 0)

  const loadData = async () => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }

    if (!calendarId) {
      Taro.showToast({ title: '日历 ID 缺失', icon: 'none' })
      return
    }

    try {
      setLoading(true)
      const detail = await getCalendarDetail(calendarId)
      setCalendarName(detail.name)
      setCurrentRole(normalizeCalendarRole(detail))

      const data = await listCalendarMembers(calendarId)
      setMembers(data || [])
    } catch (err) {
      console.error(err)
      Taro.showToast({ title: '未加入该日历或日历不存在', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadData()
  })

  const handleAddMember = async () => {
    if (!manageable || addingMember) return

    const account = inviteAccount.trim()

    if (!account) {
      Taro.showToast({
        title: '请输入对方账号',
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

      await addCalendarMember(calendarId, {
        account,
        role: inviteRole,
      })

      Taro.hideLoading()

      Taro.showToast({
        title: '添加成功',
        icon: 'success',
      })

      setInviteAccount('')
      await loadData()
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setAddingMember(false)
    }
  }

  const handleChangeRole = async (member: CalendarMember, nextRole: 'member' | 'viewer') => {
    if (!manageable) return

    if (member.role === 'owner') {
      Taro.showToast({ title: '不能修改所有者角色', icon: 'none' })
      return
    }

    try {
      Taro.showLoading({ title: '修改中', mask: true })
      await updateCalendarMemberRole(calendarId, member.user_id, nextRole)
      Taro.hideLoading()
      Taro.showToast({ title: '角色已更新', icon: 'success' })
      await loadData()
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    }
  }

  const handleRemove = async (member: CalendarMember) => {
    if (!manageable) return

    if (member.role === 'owner') {
      Taro.showToast({ title: '不能移除所有者', icon: 'none' })
      return
    }

    if (member.user_id === currentUserId) {
      Taro.showToast({ title: '不能移除自己', icon: 'none' })
      return
    }

    Taro.showModal({
      title: '确认移除成员',
      content: `确定要移除 ${getWechatDisplayName(member)} 吗？`,
      success: async (res) => {
        if (!res.confirm) return

        try {
          Taro.showLoading({ title: '移除中', mask: true })
          await removeCalendarMember(calendarId, member.user_id)
          Taro.hideLoading()
          Taro.showToast({ title: '已移除', icon: 'success' })
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
          <View className='page-title'>日历成员</View>
          <View className='page-desc'>{calendarName || '共享日历'} ｜ 共 {members.length} 人</View>
        </View>
        <PageRefresh onClick={loadData} />
      </View>

      {!manageable && <View className='readonly-tip'>当前角色为 {roleText(currentRole)}，只能查看成员列表。</View>}

      {manageable && (
        <View className='add-member-card'>
          <View className='add-member-title'>添加日历成员</View>
          <View className='add-member-desc'>
            输入对方账号添加成员。支持用户名、邮箱或微信昵称。
          </View>

          <View className='member-account-input-wrap'>
            <Input
              className='member-account-input'
              value={inviteAccount}
              placeholder='请输入对方账号'
              maxlength={128}
              onInput={(e) => setInviteAccount(e.detail.value)}
            />

            <View
              className='paste-btn'
              onClick={() => {
                Taro.getClipboardData({
                  success: (res) => {
                    const text = String(res.data || '').trim()

                    if (!text) {
                      Taro.showToast({
                        title: '剪贴板为空',
                        icon: 'none',
                      })
                      return
                    }

                    setInviteAccount(text)

                    Taro.showToast({
                      title: '已粘贴',
                      icon: 'success',
                    })
                  },
                  fail: () => {
                    Taro.showToast({
                      title: '读取剪贴板失败',
                      icon: 'none',
                    })
                  },
                })
              }}
            >
              粘贴
            </View>
          </View>

          <View className='add-member-row'>
            <Picker
              mode='selector'
              range={roleOptions.map((role) => role.label)}
              value={roleIndex(inviteRole)}
              onChange={(e) => {
                const selected = roleOptions[Number(e.detail.value)]
                if (selected) setInviteRole(selected.value)
              }}
            >
              <View className={`role-tag ${inviteRole}`}>
                {roleText(inviteRole)}
              </View>
            </Picker>
          </View>

          <View
            className={addingMember ? 'add-member-btn disabled' : 'add-member-btn'}
            onClick={handleAddMember}
          >
            {addingMember ? '添加中...' : '添加成员'}
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
                <View className='member-meta'>加入时间：{formatDateTime(item.joined_at || item.created_at)}</View>
              </View>

              <View className='member-actions'>
                {manageable && item.role !== 'owner' ? (
                  <Picker
                    mode='selector'
                    range={roleOptions.map((role) => role.label)}
                    value={roleIndex(item.role)}
                    onChange={(e) => {
                      const selected = roleOptions[Number(e.detail.value)]
                      if (selected) handleChangeRole(item, selected.value)
                    }}
                  >
                    <View className={`role-tag ${item.role}`}>{roleText(item.role)}</View>
                  </Picker>
                ) : (
                  <View className={`role-tag ${item.role}`}>{roleText(item.role)}</View>
                )}

                {manageable && item.role !== 'owner' && item.user_id !== currentUserId && (
                  <View className='remove-btn' onClick={() => handleRemove(item)}>移除</View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
