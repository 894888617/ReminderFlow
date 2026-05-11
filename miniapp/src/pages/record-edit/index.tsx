import { View, Text, Input, Textarea, Picker } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useMemo, useState } from 'react'

import {
  deleteRecord,
  getRecordDetail,
  updateRecord,
  type RecordItem,
} from '../../api/record'
import {
  getWorkspaceMembers,
  type WorkspaceMember,
} from '../../api/workspace'
import {
  canEditRecord,
  canDeleteRecord,
} from '../../utils/permission'

import './index.scss'

function buildDateTime(date: string, time: string) {
  if (!date || !time) return undefined
  return `${date}T${time}:00+08:00`
}

function splitDateTime(value?: string | null) {
  if (!value) {
    return {
      date: '',
      time: '',
    }
  }

  const normalized = value.replace('T', ' ')
  return {
    date: normalized.slice(0, 10),
    time: normalized.slice(11, 16),
  }
}

function todayDate() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function currentTime() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function RecordEditPage() {
  const router = useRouter()
  const recordId = Number(router.params.id || 0)

  const currentUser = Taro.getStorageSync('user')
  const currentUserId = Number(currentUser?.id || 0)


  const [record, setRecord] = useState<RecordItem | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])

  const role = record?.current_user_role || ''
  const editable = canEditRecord(role)
  const deletable = canDeleteRecord(role, currentUserId, record?.creator_id)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [assigneeId, setAssigneeId] = useState<number | undefined>()

  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const memberOptions = useMemo(() => {
    return members.map((item) => ({
      label: item.username || `用户 ${item.user_id}`,
      value: item.user_id,
    }))
  }, [members])

  const selectedAssigneeIndex = useMemo(() => {
    if (!assigneeId) return -1
    return memberOptions.findIndex((item) => item.value === assigneeId)
  }, [memberOptions, assigneeId])

  const selectedAssigneeName = useMemo(() => {
    if (!assigneeId) return '未分配'
    const selected = memberOptions.find((item) => item.value === assigneeId)
    return selected?.label || '未分配'
  }, [memberOptions, assigneeId])

  const loadData = async () => {
    const token = Taro.getStorageSync('token')

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    if (!recordId) {
      Taro.showToast({
        title: '记录 ID 缺失',
        icon: 'none',
      })
      return
    }

    try {
      Taro.showLoading({
        title: '加载中',
        mask: true,
      })

      const detail = await getRecordDetail(recordId)
      setRecord(detail)

      setTitle(detail.title || '')
      setContent(detail.content || '')
      setAssigneeId(detail.assignee_id || undefined)

      const due = splitDateTime(detail.due_at)
      setDueDate(due.date)
      setDueTime(due.time)

      const memberList = await getWorkspaceMembers(detail.workspace_id)
      setMembers(memberList || [])

      Taro.hideLoading()
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    }
  }

  useDidShow(() => {
    loadData()
  })

  const handleSubmit = async () => {
    if (!editable) {
      Taro.showToast({
        title: '无编辑权限',
        icon: 'none',
      })
      return
    }

    if (submitting) return

    if (!recordId) {
      Taro.showToast({
        title: '记录 ID 缺失',
        icon: 'none',
      })
      return
    }

    if (!title.trim()) {
      Taro.showToast({
        title: '请输入标题',
        icon: 'none',
      })
      return
    }

    if ((dueDate && !dueTime) || (!dueDate && dueTime)) {
      Taro.showToast({
        title: '请完整选择截止日期和时间',
        icon: 'none',
      })
      return
    }

    const dueAt = buildDateTime(dueDate, dueTime)

    try {
      setSubmitting(true)

      Taro.showLoading({
        title: '保存中',
        mask: true,
      })

      await updateRecord(recordId, {
        title: title.trim(),
        content: content.trim(),
        assignee_id: assigneeId,
        due_at: dueAt,
      })

      Taro.hideLoading()

      Taro.showToast({
        title: '保存成功',
        icon: 'success',
      })

      setTimeout(() => {
        Taro.redirectTo({
          url: `/pages/record-detail/index?id=${recordId}`,
        })
      }, 500)
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = () => {
    if (!recordId || deleting) return

    if (!deletable) {
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
          setDeleting(true)

          Taro.showLoading({
            title: '删除中',
            mask: true,
          })

          await deleteRecord(recordId)

          Taro.hideLoading()

          Taro.showToast({
            title: '删除成功',
            icon: 'success',
          })

          setTimeout(() => {
            if (record?.workspace_id) {
              Taro.redirectTo({
                url: `/pages/workspace-detail/index?id=${record.workspace_id}`,
              })
            } else {
              Taro.switchTab({
                url: '/pages/workspace/index',
              })
            }
          }, 500)
        } catch (err) {
          console.error(err)
          Taro.hideLoading()
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  return (
    <View className='container'>
      <View className='edit-header'>
        <View>
          <View className='page-title'>编辑记录</View>
          <View className='page-desc'>
            修改标题、内容、负责人和截止时间。
          </View>
        </View>

        <View
          className='back-btn'
          onClick={() => {
            Taro.navigateBack()
          }}
        >
          返回
        </View>
      </View>

      {!editable && (
        <View className='readonly-tip'>
          当前角色无编辑权限，仅可查看记录。
        </View>
      )}

      <View className='form-card'>

        <View className='form-item'>
          <Text className='form-label'>标题</Text>
          <Input
            className='form-input'
            value={title}
            placeholder='请输入记录标题'
            maxlength={200}
            onInput={(e) => setTitle(e.detail.value)}
          />
        </View>

        <View className='form-item'>
          <Text className='form-label'>内容</Text>
          <Textarea
            className='form-textarea'
            value={content}
            placeholder='补充说明、处理要求、注意事项等'
            maxlength={1000}
            onInput={(e) => setContent(e.detail.value)}
          />
        </View>

        <View className='form-item'>
          <Text className='form-label'>负责人</Text>

          {memberOptions.length === 0 ? (
            <View className='empty-member'>暂无成员可选</View>
          ) : (
            <Picker
              mode='selector'
              range={memberOptions.map((item) => item.label)}
              value={selectedAssigneeIndex >= 0 ? selectedAssigneeIndex : 0}
              onChange={(e) => {
                const index = Number(e.detail.value)
                const selected = memberOptions[index]
                if (selected) {
                  setAssigneeId(selected.value)
                }
              }}
            >
              <View className='picker-value'>
                {selectedAssigneeName}
              </View>
            </Picker>
          )}

          {assigneeId && (
            <View
              className='clear-action'
              onClick={() => {
                setAssigneeId(undefined)
              }}
            >
              清除负责人
            </View>
          )}
        </View>

        <View className='form-item'>
          <Text className='form-label'>截止时间</Text>

          <View className='datetime-row'>
            <Picker
              mode='date'
              value={dueDate || todayDate()}
              onChange={(e) => setDueDate(String(e.detail.value))}
            >
              <View className='datetime-picker'>
                {dueDate || '选择日期'}
              </View>
            </Picker>

            <Picker
              mode='time'
              value={dueTime || currentTime()}
              onChange={(e) => setDueTime(String(e.detail.value))}
            >
              <View className='datetime-picker'>
                {dueTime || '选择时间'}
              </View>
            </Picker>
          </View>

          {(dueDate || dueTime) && (
            <View
              className='clear-action'
              onClick={() => {
                setDueDate('')
                setDueTime('')
              }}
            >
              清除截止时间
            </View>
          )}
        </View>
      </View>

      <View
        className={submitting ? 'submit-btn disabled' : 'submit-btn'}
        onClick={handleSubmit}
      >
        {submitting ? '保存中...' : '保存修改'}
      </View>

      {deletable && (
        <View
          className={deleting ? 'delete-btn disabled' : 'delete-btn'}
          onClick={handleDelete}
        >
          {deleting ? '删除中...' : '删除记录'}
        </View>
      )}
    </View>
  )
}
