import { View, Text, Input, Picker, Button } from '@tarojs/components'
import Taro, {
  useDidShow,
  useRouter,
  useShareAppMessage,
} from '@tarojs/taro'
import { useState } from 'react'

import {
  deleteRecord,
  getRecords,
  type RecordItem,
  type RecordStatus,
} from '../../api/record'
import { createWorkspaceInvite } from '../../api/invite'
import { deleteWorkspace, getWorkspaces } from '../../api/workspace'
import {
  canCreateRecord,
  canDeleteRecord,
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
  const initialWorkspaceName = decodeURIComponent(String(router.params.name || ''))
  const initialRole = String(router.params.role || '')
  const currentUser = Taro.getStorageSync('user')
  const currentUserId = Number(currentUser?.id || 0)

  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName)
  const [role, setRole] = useState(initialRole)

  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member')
  const [inviteExpireIndex, setInviteExpireIndex] = useState(1)

  const [invitePath, setInvitePath] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteVisible, setInviteVisible] = useState(false)
  const [invitePanelVisible, setInvitePanelVisible] = useState(false)

  const [records, setRecords] = useState<RecordItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<RecordStatus | ''>('')
  const [page] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [deletingWorkspace, setDeletingWorkspace] = useState(false)
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null)

  // const [inviteTitle, setInviteTitle] = useState('')

  const writable = canCreateRecord(role)
  const showInvite = canInviteMember(role)
  const showMembers = canViewMembers(role)
  const deletableWorkspace = role === 'owner'

  const inviteRoleOptions = [
    { label: '成员，可创建和处理记录', value: 'member' },
    { label: '只读，仅查看记录', value: 'viewer' },
  ]

  const inviteExpireOptions = [
    { label: '24 小时', value: 24 },
    { label: '7 天', value: 24 * 7 },
    { label: '30 天', value: 24 * 30 },
  ]

  const loadWorkspaceMeta = async () => {
    const workspaces = await getWorkspaces()
    const currentWorkspace = (workspaces || []).find((item) => item.id === workspaceId)

    if (!currentWorkspace) {
      Taro.showToast({
        title: '未加入该空间或空间不存在',
        icon: 'none',
      })
      return false
    }

    setWorkspaceName(currentWorkspace.name)
    setRole(currentWorkspace.role)
    return true
  }

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
      const hasWorkspace = await loadWorkspaceMeta()
      if (!hasWorkspace) return

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


  const resetInviteCard = () => {
    setInvitePanelVisible(false)
    setInviteVisible(false)
    setInviteCode('')
    setInvitePath('')
  }

  const openInvitePanel = () => {
    setInvitePanelVisible(true)

    Taro.nextTick(() => {
      Taro.pageScrollTo({
        scrollTop: 0,
        duration: 300,
      })
    })
  }

  useShareAppMessage(() => {
    const sharePath = invitePath || `/pages/workspace/index`

    if (invitePanelVisible && inviteVisible) {
      setTimeout(() => {
        resetInviteCard()
      }, 800)
    }

    return {
      title: `邀请你加入「${workspaceName || '协作空间'}」`,
      path: sharePath,
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
      setInvitePanelVisible(true)

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



  const handleDeleteRecord = (item: RecordItem) => {
    if (deletingRecordId) return

    if (!canDeleteRecord(role, currentUserId, item.creator_id)) {
      Taro.showToast({
        title: '无删除权限',
        icon: 'none',
      })
      return
    }

    Taro.showModal({
      title: '确认删除记录',
      content: '删除后不可恢复，确认继续吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return

        try {
          setDeletingRecordId(item.id)
          Taro.showLoading({
            title: '删除中',
            mask: true,
          })

          await deleteRecord(item.id)

          Taro.hideLoading()
          Taro.showToast({
            title: '删除成功',
            icon: 'success',
          })

          await loadData(keyword, status)
        } catch (err) {
          console.error(err)
          Taro.hideLoading()
        } finally {
          setDeletingRecordId(null)
        }
      },
    })
  }

  const handleDeleteWorkspace = () => {
    if (!workspaceId || deletingWorkspace) return

    if (!deletableWorkspace) {
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
          setDeletingWorkspace(true)
          Taro.showLoading({
            title: '删除中',
            mask: true,
          })

          await deleteWorkspace(workspaceId)

          Taro.hideLoading()
          Taro.showToast({
            title: '删除成功',
            icon: 'success',
          })

          setTimeout(() => {
            Taro.switchTab({
              url: '/pages/workspace/index',
            })
          }, 500)
        } catch (err) {
          console.error(err)
          Taro.hideLoading()
        } finally {
          setDeletingWorkspace(false)
        }
      },
    })
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
          {deletableWorkspace && (
            <View
              className={deletingWorkspace ? 'delete-space-btn disabled' : 'delete-space-btn'}
              onClick={handleDeleteWorkspace}
            >
              {deletingWorkspace ? '删除中' : '删除'}
            </View>
          )}

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
            <View
              className={invitePanelVisible ? 'invite-btn active' : 'invite-btn'}
              onClick={() => {
                if (invitePanelVisible) {
                  resetInviteCard()
                  return
                }

                openInvitePanel()
              }}
            >
              {invitePanelVisible ? '收起' : '邀请'}
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

      {showInvite && invitePanelVisible && (
        <View className='invite-panel'>
          <View className='invite-panel-head'>
            <View>
              <View className='invite-panel-title'>邀请成员</View>
              <View className='invite-panel-subtitle'>设置角色和有效期后生成分享卡片。</View>
            </View>

            <View className='invite-panel-close' onClick={resetInviteCard}>
              隐藏
            </View>
          </View>

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
              onClick={openInvitePanel}
            >
              邀请成员一起协作
            </View>
          )}

          {deletableWorkspace && (
            <View
              className={deletingWorkspace ? 'delete-space-btn disabled' : 'delete-space-btn'}
              onClick={handleDeleteWorkspace}
            >
              {deletingWorkspace ? '删除中' : '删除'}
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
                <View className='record-actions'>
                  <View className={`status-tag ${item.status}`}>{statusText(item.status)}</View>

                  {canDeleteRecord(role, currentUserId, item.creator_id) && (
                    <View
                      className={deletingRecordId === item.id ? 'delete-record-btn disabled' : 'delete-record-btn'}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteRecord(item)
                      }}
                    >
                      {deletingRecordId === item.id ? '删除中' : '删除'}
                    </View>
                  )}
                </View>
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
