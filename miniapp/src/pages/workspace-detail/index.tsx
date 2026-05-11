import { View, Text, Input, Picker, Button } from '@tarojs/components'
import Taro, {
  useDidShow,
  useRouter,
  useShareAppMessage,
} from '@tarojs/taro'
import { useState } from 'react'

import { getRecords, type RecordItem, type RecordStatus } from '../../api/record'
import { createWorkspaceInvite } from '../../api/invite'
import {
  canCreateRecord,
  canInviteMember,
  canViewMembers,
} from '../../utils/permission'

import './index.scss'

function statusText(status: string) {
  switch (status) {
    case 'PENDING':
      return '待处理'
    case 'IN_PROGRESS':
      return '进行中'
    case 'DONE':
      return '已完成'
    case 'OVERDUE':
      return '已逾期'
    case 'CANCELLED':
      return '已取消'
    default:
      return status || '-'
  }
}

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

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

export default function WorkspaceDetailPage() {
  const router = useRouter()

  const workspaceId = Number(router.params.id)
  const workspaceName = decodeURIComponent(router.params.name || '')
  const role = router.params.role || ''

  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member')
  const [inviteExpireIndex, setInviteExpireIndex] = useState(1)

  const [invitePath, setInvitePath] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteVisible, setInviteVisible] = useState(false)

  const [records, setRecords] = useState<RecordItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<RecordStatus | ''>('')
  const [page] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)

  // const [inviteTitle, setInviteTitle] = useState('')

  const writable = canCreateRecord(role)
  const showInvite = canInviteMember(role)
  const showMembers = canViewMembers(role)

  const inviteRoleOptions = [
    { label: '成员，可创建和处理记录', value: 'member' },
    { label: '只读，仅查看记录', value: 'viewer' },
  ]

  const inviteExpireOptions = [
    { label: '24 小时', value: 24 },
    { label: '7 天', value: 24 * 7 },
    { label: '30 天', value: 24 * 30 },
  ]

  const loadData = async (nextKeyword = keyword, nextStatus = status) => {
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
      const data = await getRecords({
        workspace_id: workspaceId,
        page,
        page_size: pageSize,
        keyword: nextKeyword.trim() || undefined,
        status: nextStatus,
      })

      setRecords(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error(err)
    }
  }

  useDidShow(() => {
    loadData()
  })


  useShareAppMessage(() => {
    return {
      title: `邀请你加入「${workspaceName || '协作空间'}」`,
      path: invitePath || `/pages/workspace/index`,
    }
  })

  const handleStatusFilter = (nextStatus: RecordStatus | '') => {
    setStatus(nextStatus)
    loadData(keyword, nextStatus)
  }

  const handleCreateInvite = async () => {
    if (!workspaceId) {
      Taro.showToast({
        title: '空间 ID 缺失',
        icon: 'none',
      })
      return
    }

    if (role !== 'owner') {
      Taro.showToast({
        title: '只有所有者可以邀请成员',
        icon: 'none',
      })
      return
    }

    try {
      Taro.showLoading({
        title: '生成中',
        mask: true,
      })

      const res = await createWorkspaceInvite(workspaceId, {
        role: inviteRole,
        expire_hours: inviteExpireOptions[inviteExpireIndex].value,
        max_use_count: 20,
      })

      Taro.hideLoading()

      setInviteCode(res.invite_code)
      setInvitePath(res.path)
      setInviteVisible(true)

      Taro.showToast({
        title: '邀请已生成',
        icon: 'success',
      })
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    }
  }

  const handleSearch = () => {
    loadData(keyword, status)
  }

  return (
    <View className='container'>
      <View className='detail-header'>
        <View>
          <View className='page-title'>{workspaceName || '空间详情'}</View>
          <View className='page-desc'>
            角色：{roleText(role)} ｜ 共 {total} 条记录
          </View>
        </View>

        <View className='header-actions'>
          {showMembers && (
            <View
              className='members-btn'
              onClick={() => {
                Taro.navigateTo({
                  url: `/pages/workspace-members/index?workspace_id=${workspaceId}&name=${encodeURIComponent(
                    workspaceName
                  )}&role=${role}`,
                })
              }}
            >
              成员
            </View>
          )}

          {showInvite && (
            <View className='invite-btn' onClick={handleCreateInvite}>
              邀请
            </View>
          )}

          {writable && (
            <View
              className='create-btn'
              onClick={() => {
                Taro.navigateTo({
                  url: `/pages/record-create/index?workspace_id=${workspaceId}`,
                })
              }}
            >
              新建
            </View>
          )}
        </View>
      </View>

      {showInvite && (
        <View className='invite-panel'>
          <View className='invite-panel-title'>邀请成员</View>

          <View className='invite-form-row'>
            <Text className='invite-label'>加入角色</Text>

            <Picker
              mode='selector'
              range={inviteRoleOptions.map((item) => item.label)}
              value={inviteRole === 'member' ? 0 : 1}
              onChange={(e) => {
                const index = Number(e.detail.value)
                const selected = inviteRoleOptions[index]
                if (selected) {
                  setInviteRole(selected.value as 'member' | 'viewer')
                  setInviteVisible(false)
                  setInviteCode('')
                  setInvitePath('')
                }
              }}
            >
              <View className='invite-picker'>
                {inviteRole === 'member' ? '成员' : '只读'}
              </View>
            </Picker>
          </View>

          <View className='invite-form-row'>
            <Text className='invite-label'>有效期</Text>

            <Picker
              mode='selector'
              range={inviteExpireOptions.map((item) => item.label)}
              value={inviteExpireIndex}
              onChange={(e) => {
                setInviteExpireIndex(Number(e.detail.value))
                setInviteVisible(false)
                setInviteCode('')
                setInvitePath('')
              }}
            >
              <View className='invite-picker'>
                {inviteExpireOptions[inviteExpireIndex].label}
              </View>
            </Picker>
          </View>

          {!inviteVisible ? (
            <View className='generate-invite-btn' onClick={handleCreateInvite}>
              生成邀请链接
            </View>
          ) : (
            <View className='invite-result'>
              <View className='invite-code'>
                邀请码：{inviteCode}
              </View>

              <Button className='share-btn' openType='share'>
                分享给好友
              </Button>

              <View className='invite-tip'>
                好友点击分享卡片后，可一键加入该协作空间。
              </View>
            </View>
          )}
        </View>
      )}

      <View className='search-box'>
        <Input
          className='search-input'
          value={keyword}
          placeholder='搜索标题/内容'
          confirmType='search'
          onInput={(e) => {
            setKeyword(e.detail.value)
          }}
          onConfirm={handleSearch}
        />

        <View className='search-btn' onClick={handleSearch}>
          搜索
        </View>
      </View>

      <View className='filter-row'>
        <View
          className={status === '' ? 'filter-item active' : 'filter-item'}
          onClick={() => handleStatusFilter('')}
        >
          全部
        </View>

        <View
          className={status === 'PENDING' ? 'filter-item active' : 'filter-item'}
          onClick={() => handleStatusFilter('PENDING')}
        >
          待处理
        </View>

        <View
          className={status === 'IN_PROGRESS' ? 'filter-item active' : 'filter-item'}
          onClick={() => handleStatusFilter('IN_PROGRESS')}
        >
          进行中
        </View>

        <View
          className={status === 'DONE' ? 'filter-item active' : 'filter-item'}
          onClick={() => handleStatusFilter('DONE')}
        >
          已完成
        </View>
      </View>

      {records.length === 0 ? (
        <View className='empty-record-guide'>
          <View className='empty-record-title'>这个空间还没有记录</View>

          <View className='empty-record-desc'>
            可以先创建第一条记录，用来安排任务、跟进事项、设置负责人和截止时间。
          </View>

          {writable && (
            <View
              className='empty-record-primary'
              onClick={() => {
                Taro.navigateTo({
                  url: `/pages/record-create/index?workspace_id=${workspaceId}`,
                })
              }}
            >
              创建第一条记录
            </View>
          )}

          {showInvite && (
            <View
              className='empty-record-secondary'
              onClick={handleCreateInvite}
            >
              邀请成员一起协作
            </View>
          )}

          {showMembers && (
            <View
              className='empty-record-link'
              onClick={() => {
                Taro.navigateTo({
                  url: `/pages/workspace-members/index?workspace_id=${workspaceId}&name=${encodeURIComponent(
                    workspaceName
                  )}&role=${role}`,
                })
              }}
            >
              查看空间成员
            </View>
          )}
        </View>
      ) : (
        <View className='record-list'>
          {records.map((item) => (
            <View
              key={item.id}
              className='record-card'
              onClick={() => {
                Taro.navigateTo({
                  url: `/pages/record-detail/index?id=${item.id}`,
                })
              }}
            >
              <View className='record-top'>
                <View className='record-title'>{item.title}</View>
                <View className={`status-tag ${item.status}`}>{statusText(item.status)}</View>
              </View>

              {item.content ? (
                <View className='record-content'>{item.content}</View>
              ) : null}

              <View className='record-meta'>
                <Text>负责人：{item.assignee_name || '-'}</Text>
              </View>

              <View className='record-meta'>
                <Text>截止：{formatDateTime(item.due_at)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
