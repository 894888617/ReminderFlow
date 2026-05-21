import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useMemo, useState } from 'react'

import { getRecordDetail, type RecordItem } from '../../api/record'
import { canEditRecord } from '../../utils/permission'
import { getRecordStatusText, normalizeRecordStatus } from '../../utils/recordStatus'
import { getStoredToken } from '../../utils/auth'
import { returnToCalendar } from '../../utils/calendarReturn'
import './index.scss'

const getText = (value?: string | null, fallback = '-') => (value && String(value).trim()) || fallback

export default function RecordDetailPage() {
  const router = useRouter()
  const recordId = Number(router.params.id)

  const [record, setRecord] = useState<RecordItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState('')

  const editable = canEditRecord(record?.current_user_role || '')
  const normalizedStatus = normalizeRecordStatus(record?.status)

  const remark = useMemo(() => {
    if (record?.content?.trim()) return record.content.trim()
    return '-'
  }, [record])

  const loadData = async () => {
    const token = getStoredToken()
    if (!token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }
    if (!recordId) return

    try {
      setLoading(true)
      setLoadError('')
      setNotFound(false)
      const detail = await getRecordDetail(recordId)
      setRecord(detail)
    } catch (err: any) {
      console.error(err)
      setRecord(null)
      if (err?.code === 4000 || err?.statusCode === 404) {
        setNotFound(true)
      } else {
        setLoadError('记录加载失败，请稍后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  useDidShow(loadData)

  const goBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) {
      Taro.navigateBack()
      return
    }
    returnToCalendar({ currentCalendarId: record?.calendar_id })
  }

  if (loading) return <View className='container'><View className='empty-box'>加载中...</View></View>
  if (notFound) return <View className='container'><View className='empty-box'>记录不存在或已被删除</View><View className='pill-btn' onClick={goBack}>返回</View></View>
  if (!record) return <View className='container'><View className='empty-box'>{loadError || '记录加载失败，请稍后重试'}</View></View>

  return (
    <View className='container'>
      <View className='header-row'>
        <View className='pill-btn' onClick={goBack}>返回</View>
        {editable ? <View className='pill-btn primary' onClick={() => Taro.navigateTo({ url: `/pages/record-edit/index?id=${record.id}` })}>编辑</View> : <View />}
      </View>

      <View className='record-detail-card'>
        <View className='title'>{getText(record.title)}</View>

        <View className='record-detail-row'>
          <View className='record-detail-item'><Text className='record-detail-label'>客户姓名</Text><Text className='record-detail-value'>{getText(record.customer_name)}</Text></View>
          <View className='record-detail-item'><Text className='record-detail-label'>客户手机号</Text><Text className='record-detail-value'>{getText(record.customer_phone)}</Text></View>
        </View>

        <View className='record-detail-row'>
          <View className='record-detail-item'><Text className='record-detail-label'>服务项目</Text><Text className='record-detail-value'>{getText(record.project_name || record.service_name)}</Text></View>
          <View className='record-detail-item'><Text className='record-detail-label'>客户备注</Text><Text className='record-detail-value'>{getText(record.customer_remark)}</Text></View>
        </View>

        <View className='record-detail-row'>
          <View className='record-detail-item'><Text className='record-detail-label'>负责人</Text><Text className='record-detail-value'>{getText(record.assignee_name, '未分配')}</Text></View>
          <View className='record-detail-item'><Text className='record-detail-label'>状态</Text><Text className='record-status-pill'>{getRecordStatusText(normalizedStatus)}</Text></View>
        </View>

        <View className='record-detail-row'>
          <View className='record-detail-item'><Text className='record-detail-label'>预约日期</Text><Text className='record-detail-value'>{getText(record.due_at?.slice(0, 10) || record.calendar_start_at?.slice(0, 10))}</Text></View>
          <View className='record-detail-item'><Text className='record-detail-label'>开始时间</Text><Text className='record-detail-value'>{getText(record.calendar_start_at?.slice(11, 16))}</Text></View>
        </View>

        <View className='record-detail-item'><Text className='record-detail-label'>备注</Text><Text className='record-detail-value'>{remark}</Text></View>
      </View>
    </View>
  )
}
