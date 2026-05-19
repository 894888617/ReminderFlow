import { View, Text, Picker } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'

import {
  deleteRecord,
  getRecordDetail,
  updateRecordStatus,
  type RecordItem,
} from '../../api/record'
import {
  canDeleteRecord,
  canEditRecord,
  canUpdateRecordStatus,
} from '../../utils/permission'
import {
  getRecordStatusText,
  normalizeRecordStatus,
  RECORD_STATUS_OPTIONS,
} from '../../utils/recordStatus'

import { getStoredToken } from '../../utils/auth'
import { returnToCalendar } from '../../utils/calendarReturn'
import './index.scss'

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

function formatAppointmentTime(record: RecordItem) {
  const start = record.calendar_start_at || record.due_at
  const end = record.calendar_end_at

  if (!start) return '未设置'

  const date = start.slice(0, 10)
  const startTime = start.slice(11, 16)

  if (record.calendar_all_day) {
    return `${date} 全天`
  }

  if (end) {
    return `${date} ${startTime} - ${end.slice(11, 16)}`
  }

  return `${date} ${startTime}`
}

export default function RecordDetailPage() {
  const router = useRouter()
  const recordId = Number(router.params.id)

  const [record, setRecord] = useState<RecordItem | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const currentUser = Taro.getStorageSync('user')
  const currentUserId = Number(currentUser?.id || 0)

  const role = record?.current_user_role || ''
  const editable = canEditRecord(role)
  const deletable = canDeleteRecord(role, currentUserId, record?.creator_id)
  const canChangeStatus = canUpdateRecordStatus(role)

  const normalizedStatus = normalizeRecordStatus(record?.status)
  const statusIndex = RECORD_STATUS_OPTIONS.findIndex((item) => item.value === normalizedStatus)

  const loadData = async () => {
    const token = getStoredToken()

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
      setLoading(true)
      setLoadError('')
      setNotFound(false)
      const detail = await getRecordDetail(recordId)

      setRecord(detail)
      setLogs([])
    } catch (err: any) {
      console.error(err)
      setRecord(null)
      setLogs([])
      if (err?.code === 4000 || err?.statusCode === 404) {
        setNotFound(true)
      } else {
        setLoadError('记录加载失败，请稍后重试')
      }
    } finally {
      setLoading(false)
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

    const nextStatus = RECORD_STATUS_OPTIONS[index]?.value
    if (!nextStatus || nextStatus === normalizedStatus) return

    try {
      Taro.showLoading({
        title: '更新中',
        mask: true,
      })

      await updateRecordStatus(record.id, nextStatus)

      Taro.showToast({
        title: '状态已更新',
        icon: 'success',
      })

      await loadData()
    } catch (err: any) {
      console.error(err)
      if (err?.code === 4000 || err?.statusCode === 404) {
        Taro.showToast({ title: '记录不存在，无法修改状态', icon: 'none' })
      } else {
        Taro.showToast({ title: '状态更新失败', icon: 'none' })
      }
    } finally {
      Taro.hideLoading()
    }
  }

  const handleDelete = () => {
    if (!record || deleting) return

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

          await deleteRecord(record.id)
          Taro.showToast({
            title: '删除成功',
            icon: 'success',
          })

          setTimeout(() => {
            if (record.calendar_id) {
              Taro.redirectTo({
                url: `/pages/calendar/index?calendar_id=${record.calendar_id}`,
              })
            } else {
              Taro.navigateBack()
            }
          }, 500)
        } catch (err) {
          console.error(err)
          Taro.showToast({ title: '删除失败，请稍后重试', icon: 'none' })
        } finally {
          Taro.hideLoading()
          setDeleting(false)
        }
      },
    })
  }

  if (loading) {
    return (
      <View className='container'>
        <View className='empty-box'>{loadError || '记录加载失败，请稍后重试'}</View>
      </View>
    )
  }

  if (notFound) {
    return (
      <View className='container'>
        <View className='empty-box'>记录不存在或已被删除</View>
        <View className='back-btn' onClick={() => returnToCalendar()}>返回</View>
      </View>
    )
  }

  if (!record) {
    return (
      <View className='container'>
        <View className='empty-box'>{loadError || '记录加载失败，请稍后重试'}</View>
      </View>
    )
  }

  return (
    <View className='container'>
      <View className='detail-header'>
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

          {deletable && (
            <View
              className={deleting ? 'delete-header-btn disabled' : 'delete-header-btn'}
              onClick={handleDelete}
            >
              {deleting ? '删除中' : '删除'}
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
              range={RECORD_STATUS_OPTIONS.map((item) => item.label)}
              value={statusIndex >= 0 ? statusIndex : 0}
              onChange={(e) => handleStatusChange(Number(e.detail.value))}
            >
              <View className={`status-tag ${normalizedStatus}`}>
                {getRecordStatusText(normalizedStatus)}
              </View>
            </Picker>
          ) : (
            <View className={`status-tag ${normalizedStatus}`}>
              {getRecordStatusText(normalizedStatus)}
            </View>
          )}
        </View>

        <View className='info-row'>
          <Text className='info-label'>负责人</Text>
          <Text className='info-value'>{record.assignee_name || '-'}</Text>
        </View>

        <View className='info-row'>
          <Text className='info-label'>预约时间</Text>
          <Text className='info-value'>{formatAppointmentTime(record)}</Text>
        </View>

        <View className='info-row'>
          <Text className='info-label'>客户姓名</Text>
          <Text className='info-value'>{record.customer_name || '-'}</Text>
        </View>

        <View className='info-row'>
          <Text className='info-label'>客户手机号</Text>
          <Text className='info-value'>{record.customer_phone || '-'}</Text>
        </View>

        <View className='info-row'>
          <Text className='info-label'>服务项目</Text>
          <Text className='info-value'>{record.service_name || '-'}</Text>
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

      {!canChangeStatus && (
        <View className='readonly-tip'>
          当前角色为只读，仅可查看记录，不能修改状态。
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
