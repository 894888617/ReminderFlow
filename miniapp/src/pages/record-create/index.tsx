import { View, Text, Input, Textarea, Picker } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'

import {
  getWorkspaceMembers,
  getWorkspaces,
  type Workspace,
  type WorkspaceMember,
} from '../../api/workspace'
import { createRecord } from '../../api/record'
import { canCreateRecord } from '../../utils/permission'
import { createReminder, type RepeatType } from '../../api/reminder'

import { getStoredToken } from '../../utils/auth'
import { getUserNameDisplay } from '../../utils/userDisplay'
import './index.scss'

const repeatOptions: { label: string; value: RepeatType }[] = [
  { label: '不重复', value: 'NONE' },
  { label: '每天', value: 'DAILY' },
  { label: '每周', value: 'WEEKLY' },
  { label: '每月', value: 'MONTHLY' },
]

function buildDateTime(date: string, time: string) {
  if (!date || !time) return undefined
  return `${date}T${time}:00+08:00`
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

export default function RecordCreatePage() {
  const router = useRouter()

  const routeWorkspaceId = Number(router.params.workspace_id || 0)

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState<number>(routeWorkspaceId || 0)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [assigneeId, setAssigneeId] = useState<number | undefined>()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')

  const [remindDate, setRemindDate] = useState('')
  const [remindTime, setRemindTime] = useState('')

  const [repeatIndex, setRepeatIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const workspaceNames = useMemo(() => {
    return workspaces.map((item) => item.name)
  }, [workspaces])

  const selectedWorkspaceIndex = useMemo(() => {
    if (!workspaceId) return -1
    return workspaces.findIndex((item) => item.id === workspaceId)
  }, [workspaces, workspaceId])

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((item) => item.id === workspaceId)
  }, [workspaces, workspaceId])

  const memberOptions = useMemo(() => {
    return members.map((item) => ({
      label: getUserNameDisplay(item),
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

  const loadWorkspaces = async () => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    try {
      const data = await getWorkspaces()
      const writableWorkspaces = (data || []).filter((item) =>
        canCreateRecord(item.role)
      )

      setWorkspaces(writableWorkspaces)

      if (!workspaceId && writableWorkspaces.length > 0) {
        setWorkspaceId(writableWorkspaces[0].id)
      }

      if (workspaceId) {
        const current = writableWorkspaces.find((item) => item.id === workspaceId)
        if (!current) {
          Taro.showToast({
            title: '当前空间无创建权限',
            icon: 'none',
          })
          setWorkspaceId(writableWorkspaces[0]?.id || 0)
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  useDidShow(() => {
    loadWorkspaces()
  })


  useEffect(() => {
    if (!workspaceId) {
      setMembers([])
      setAssigneeId(undefined)
      return
    }

    let active = true

    getWorkspaceMembers(workspaceId)
      .then((data) => {
        if (!active) return
        setMembers(data || [])
        setAssigneeId((current) => {
          if (!current) return current
          return (data || []).some((item) => item.user_id === current)
            ? current
            : undefined
        })
      })
      .catch((err) => {
        console.error(err)
        if (active) {
          setMembers([])
          setAssigneeId(undefined)
        }
      })

    return () => {
      active = false
    }
  }, [workspaceId])


  const handleSubmit = async () => {
    if (submitting) return

    if (workspaces.length === 0) {
      Taro.showToast({
        title: '暂无可创建记录的空间',
        icon: 'none',
      })
      return
    }

    if (!workspaceId) {
      Taro.showToast({
        title: '请选择空间',
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

    const dueAt = buildDateTime(dueDate, dueTime)
    const remindAt = buildDateTime(remindDate, remindTime)

    if ((dueDate && !dueTime) || (!dueDate && dueTime)) {
      Taro.showToast({
        title: '请完整选择截止日期和时间',
        icon: 'none',
      })
      return
    }

    if ((remindDate && !remindTime) || (!remindDate && remindTime)) {
      Taro.showToast({
        title: '请完整选择提醒日期和时间',
        icon: 'none',
      })
      return
    }

    try {
      setSubmitting(true)

      Taro.showLoading({
        title: '创建中',
        mask: true,
      })

      const record = await createRecord({
        workspace_id: workspaceId,
        title: title.trim(),
        content: content.trim(),
        assignee_id: assigneeId,
        due_at: dueAt,
      })

      if (remindAt) {
        await createReminder(record.id, {
          remind_at: remindAt,
          repeat_type: repeatOptions[repeatIndex].value,
        })
      }

      Taro.hideLoading()

      Taro.showToast({
        title: '创建成功',
        icon: 'success',
      })

      setTimeout(() => {
        Taro.redirectTo({
          url: `/pages/record-detail/index?id=${record.id}`,
        })
      }, 500)
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='container'>
      <View className='page-title'>创建记录</View>
      <View className='page-desc'>快速创建协同记录，可设置截止时间和提醒时间。</View>

      <View className='form-card'>
        <View className='form-item'>
          <Text className='form-label'>所属空间</Text>

          {workspaces.length === 0 ? (
            <View className='empty-workspace-guide'>
              <View className='empty-workspace-title'>暂无可创建记录的空间</View>
              <View className='empty-workspace-desc'>
                你需要先创建一个空间，或者加入有创建权限的空间，才能添加记录。
              </View>

              <View
                className='empty-workspace-btn'
                onClick={() => {
                  Taro.navigateTo({
                    url: '/pages/workspace-create/index',
                  })
                }}
              >
                去创建空间
              </View>
            </View>
          ) : (
            <Picker
              mode='selector'
              range={workspaceNames}
              value={selectedWorkspaceIndex >= 0 ? selectedWorkspaceIndex : 0}
              onChange={(e) => {
                const index = Number(e.detail.value)
                const selected = workspaces[index]
                if (selected) {
                  setWorkspaceId(selected.id)
                }
              }}
            >
              <View className='picker-value'>
                {selectedWorkspace?.name || '请选择空间'}
              </View>
            </Picker>
          )}
        </View>

        <View className='form-item'>
          <Text className='form-label'>标题</Text>
          <Input
            className='form-input'
            value={title}
            placeholder='例如：明天联系客户确认需求'
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
              className='clear-time'
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
              className='clear-time'
              onClick={() => {
                setDueDate('')
                setDueTime('')
              }}
            >
              清除截止时间
            </View>
          )}
        </View>

        <View className='form-item'>
          <Text className='form-label'>提醒时间</Text>

          <View className='datetime-row'>
            <Picker
              mode='date'
              value={remindDate || todayDate()}
              onChange={(e) => setRemindDate(String(e.detail.value))}
            >
              <View className='datetime-picker'>
                {remindDate || '选择日期'}
              </View>
            </Picker>

            <Picker
              mode='time'
              value={remindTime || currentTime()}
              onChange={(e) => setRemindTime(String(e.detail.value))}
            >
              <View className='datetime-picker'>
                {remindTime || '选择时间'}
              </View>
            </Picker>
          </View>

          {(remindDate || remindTime) && (
            <View
              className='clear-time'
              onClick={() => {
                setRemindDate('')
                setRemindTime('')
              }}
            >
              清除提醒时间
            </View>
          )}
        </View>

        <View className='form-item'>
          <Text className='form-label'>重复提醒</Text>

          <Picker
            mode='selector'
            range={repeatOptions.map((item) => item.label)}
            value={repeatIndex}
            onChange={(e) => setRepeatIndex(Number(e.detail.value))}
          >
            <View className='picker-value'>
              {repeatOptions[repeatIndex].label}
            </View>
          </Picker>
        </View>
      </View>

      <View
        className={submitting ? 'submit-btn disabled' : 'submit-btn'}
        onClick={handleSubmit}
      >
        {submitting ? '创建中...' : '创建记录'}
      </View>
    </View>
  )
}
