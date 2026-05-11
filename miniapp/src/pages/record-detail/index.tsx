import { View, Text, Picker } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'

import {
  getRecordDetail,
  getRecordLogs,
  updateRecordStatus,
  type OperationLog,
  type RecordItem,
  type RecordStatus,
} from '../../api/record'
import {
  canEditRecord,
  canUpdateRecordStatus,
  canCreateReminder,
} from '../../utils/permission'
import { createReminder, type RepeatType } from '../../api/reminder'

import './index.scss'

const statusOptions: { label: string; value: RecordStatus }[] = [
  { label: '待处理', value: 'PENDING' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '已完成', value: 'DONE' },
  { label: '已取消', value: 'CANCELLED' },
]

const repeatOptions: { label: string; value: RepeatType }[] = [
  { label: '不重复', value: 'NONE' },
  { label: '每天', value: 'DAILY' },
  { label: '每周', value: 'WEEKLY' },
  { label: '每月', value: 'MONTHLY' },
]

function statusText(status?: string) {
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

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

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

export default function RecordDetailPage() {
  const router = useRouter()
  const recordId = Number(router.params.id)

  const [record, setRecord] = useState<RecordItem | null>(null)
  const [logs, setLogs] = useState<OperationLog[]>([])

  const role = record?.current_user_role || ''
  const editable = canEditRecord(role)
  const canChangeStatus = canUpdateRecordStatus(role)
  const canSetReminder = canCreateReminder(role)

  const [remindDate, setRemindDate] = useState('')
  const [remindTime, setRemindTime] = useState('')
  const [repeatIndex, setRepeatIndex] = useState(0)
  const [submittingReminder, setSubmittingReminder] = useState(false)

  const statusIndex = statusOptions.findIndex((item) => item.value === record?.status)

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
      const [detail, logList] = await Promise.all([
        getRecordDetail(recordId),
        getRecordLogs(recordId),
      ])

      setRecord(detail)
      setLogs(logList || [])
    } catch (err) {
      console.error(err)
    }
  }

  useDidShow(() => {
    loadData()
  })

  const handleStatusChange = async (index: number) => {
    if (!record) return

    if (!canChangeStatus) {
      Taro.showToast({
        title: '无状态修改权限',
        icon: 'none',
      })
      return
    }

    const nextStatus = statusOptions[index]?.value
    if (!nextStatus) return

    try {
      Taro.showLoading({
        title: '更新中',
        mask: true,
      })

      await updateRecordStatus(record.id, nextStatus)

      Taro.hideLoading()
      Taro.showToast({
        title: '状态已更新',
        icon: 'success',
      })

      await loadData()
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    }
  }

  const handleCreateReminder = async () => {
    if (!record) return

    if (!canSetReminder) {
      Taro.showToast({
        title: '无设置提醒权限',
        icon: 'none',
      })
      return
    }
    
    if (submittingReminder) return

    if ((remindDate && !remindTime) || (!remindDate && remindTime)) {
      Taro.showToast({
        title: '请完整选择提醒日期和时间',
        icon: 'none',
      })
      return
    }

    const remindAt = buildDateTime(remindDate, remindTime)

    if (!remindAt) {
      Taro.showToast({
        title: '请选择提醒时间',
        icon: 'none',
      })
      return
    }

    try {
      setSubmittingReminder(true)

      Taro.showLoading({
        title: '保存中',
        mask: true,
      })

      await createReminder(record.id, {
        remind_at: remindAt,
        repeat_type: repeatOptions[repeatIndex].value,
      })

      Taro.hideLoading()

      Taro.showToast({
        title: '提醒已设置',
        icon: 'success',
      })

      setRemindDate('')
      setRemindTime('')
      setRepeatIndex(0)
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setSubmittingReminder(false)
    }
  }

  if (!record) {
    return (
      <View className='container'>
        <View className='empty-box'>记录加载中...</View>
      </View>
    )
  }

  return (
    <View className='container'>
      <View className='detail-header'>
        <View>
          <View className='page-title'>{record.title}</View>
          <View className='page-desc'>记录 ID：{record.id}</View>
        </View>

        <View className='header-actions'>
          {editable && (
            <View
              className='edit-btn'
              onClick={() => {
                Taro.navigateTo({
                  url: `/pages/record-edit/index?id=${record.id}`,
                })
              }}
            >
              编辑
            </View>
          )}

          <View
            className='back-btn'
            onClick={() => {
              Taro.navigateBack()
            }}
          >
            返回
          </View>
        </View>
      </View>

      <View className='info-card'>
        <View className='info-row'>
          <Text className='info-label'>标题</Text>
          <Text className='info-value'>{record.title}</Text>
        </View>

        <View className='info-row'>
          <Text className='info-label'>内容</Text>
          <Text className='info-value'>{record.content || '-'}</Text>
        </View>

        <View className='info-row'>
          <Text className='info-label'>状态</Text>

          {canChangeStatus ? (
            <Picker
              mode='selector'
              range={statusOptions.map((item) => item.label)}
              value={statusIndex >= 0 ? statusIndex : 0}
              onChange={(e) => handleStatusChange(Number(e.detail.value))}
            >
              <View className={`status-tag ${record.status}`}>
                {statusText(record.status)}
              </View>
            </Picker>
          ) : (
            <View className={`status-tag ${record.status}`}>
              {statusText(record.status)}
            </View>
          )}
        </View>

        <View className='info-row'>
          <Text className='info-label'>负责人</Text>
          <Text className='info-value'>{record.assignee_name || '-'}</Text>
        </View>

        <View className='info-row'>
          <Text className='info-label'>截止时间</Text>
          <Text className='info-value'>{formatDateTime(record.due_at)}</Text>
        </View>

        <View className='info-row'>
          <Text className='info-label'>创建时间</Text>
          <Text className='info-value'>{formatDateTime(record.created_at)}</Text>
        </View>

        <View className='info-row'>
          <Text className='info-label'>更新时间</Text>
          <Text className='info-value'>{formatDateTime(record.updated_at)}</Text>
        </View>
      </View>

      {canSetReminder ? (
        <>
          <View className='section-title'>设置提醒</View>

          <View className='reminder-card'>
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

            <Picker
              mode='selector'
              range={repeatOptions.map((item) => item.label)}
              value={repeatIndex}
              onChange={(e) => setRepeatIndex(Number(e.detail.value))}
            >
              <View className='picker-value'>
                重复：{repeatOptions[repeatIndex].label}
              </View>
            </Picker>

            <View
              className={submittingReminder ? 'submit-btn disabled' : 'submit-btn'}
              onClick={handleCreateReminder}
            >
              {submittingReminder ? '保存中...' : '保存提醒'}
            </View>
          </View>
        </>
      ) : (
        <View className='readonly-tip'>
          当前角色为只读，仅可查看记录，不能修改状态或设置提醒。
        </View>
      )}

      <View className='section-title'>操作日志</View>

      {logs.length === 0 ? (
        <View className='empty-box'>暂无操作日志</View>
      ) : (
        <View className='log-list'>
          {logs.map((item) => (
            <View key={item.id} className='log-item'>
              <View className='log-action'>{item.action}</View>
              <View className='log-detail'>{item.detail || '-'}</View>
              <View className='log-meta'>
                {item.username || '系统'} · {formatDateTime(item.created_at)}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
