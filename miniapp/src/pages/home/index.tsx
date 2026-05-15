import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { getMobileHome, type MobileHomeSummary } from '../../api/home'
import { listCalendars, normalizeCalendarRole, type Calendar } from '../../api/calendar'
import { getStoredToken } from '../../utils/auth'
import { canCreateRecord } from '../../utils/permission'
import './index.scss'

export default function HomePage() {
  const [data, setData] = useState<MobileHomeSummary | null>(null)
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [calendarsLoaded, setCalendarsLoaded] = useState(false)

  const loadData = async () => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    setCalendarsLoaded(false)

    try {
      const homeRes = await getMobileHome()
      setData(homeRes)
    } catch (err) {
      console.error(err)
    }

    try {
      const calendarRes = await listCalendars()
      setCalendars(calendarRes || [])
    } catch (err) {
      console.error(err)
      setCalendars([])
    } finally {
      setCalendarsLoaded(true)
    }
  }

  useDidShow(() => {
    loadData()
  })

  usePullDownRefresh(async () => {
    await loadData()
    Taro.stopPullDownRefresh()
  })

  const hasCalendar = calendars.length > 0
  const writableCalendar = calendars.find((item) => canCreateRecord(normalizeCalendarRole(item)))
  const hasAnyRecord = (data?.recent_records || []).length > 0
  const hasNoTasks =
    (data?.today_due_count || 0) === 0 &&
    (data?.today_reminder_count || 0) === 0 &&
    (data?.unfinished_count || 0) === 0 &&
    (data?.overdue_count || 0) === 0 &&
    !hasAnyRecord
  const shouldShowCalendarActions = Boolean(
    data && calendarsLoaded && hasNoTasks
  )
  const shouldShowQuickCreate = Boolean(data && calendarsLoaded && !hasNoTasks)

  const navigateToCreateRecord = () => {
    if (!writableCalendar) {
      Taro.showToast({
        title: '暂无可创建记录的日历',
        icon: 'none',
      })
      return
    }

    Taro.navigateTo({
      url: `/pages/record-create/index?calendar_id=${writableCalendar.id}`,
    })
  }

  return (
    <View className='container'>
      <View className='summary-grid'>
        <View className='summary-card'>
          <Text className='summary-value'>{data?.today_due_count || 0}</Text>
          <Text className='summary-label'>今日截止</Text>
        </View>

        <View className='summary-card'>
          <Text className='summary-value'>{data?.today_reminder_count || 0}</Text>
          <Text className='summary-label'>今日提醒</Text>
        </View>

        <View className='summary-card'>
          <Text className='summary-value'>{data?.unfinished_count || 0}</Text>
          <Text className='summary-label'>未完成</Text>
        </View>

        <View className='summary-card danger'>
          <Text className='summary-value'>{data?.overdue_count || 0}</Text>
          <Text className='summary-label'>逾期任务</Text>
        </View>
      </View>

      {shouldShowCalendarActions && (
        <View className='newbie-card'>
          <View className='newbie-title'>
            {hasCalendar ? '日历已准备好' : '开始使用轻记协同'}
          </View>
          <View className='newbie-desc'>
            {hasCalendar
              ? '你已经创建或加入日历，可以查看日历详情，也可以马上创建第一条协作记录。'
              : '你还没有开始协作记录。建议先创建一个日历，再创建第一条记录。'}
          </View>

          {!hasCalendar && (
            <View
              className='newbie-primary-btn'
              onClick={() => {
                Taro.navigateTo({
                  url: '/pages/calendar-create/index',
                })
              }}
            >
              创建第一个日历
            </View>
          )}

          {hasCalendar && (
            <View className='newbie-actions'>
              <View
                className='newbie-secondary-btn'
                onClick={() => {
                  Taro.redirectTo({
                    url: '/pages/calendar/index',
                  })
                }}
              >
                查看我的日历
              </View>

              <View
                className={
                  writableCalendar
                    ? 'newbie-primary-btn'
                    : 'newbie-primary-btn disabled'
                }
                onClick={navigateToCreateRecord}
              >
                创建新记录
              </View>
            </View>
          )}

          {!hasCalendar && (
            <View
              className='newbie-secondary-btn'
              onClick={() => {
                Taro.redirectTo({
                  url: '/pages/calendar/index',
                })
              }}
            >
              查看我的日历
            </View>
          )}
        </View>
      )}

      {shouldShowQuickCreate && (
        <View className='primary-btn' onClick={navigateToCreateRecord}>
          快速创建记录
        </View>
      )}

      <View className='section-title'>最近任务</View>

      {(data?.recent_records || []).length === 0 ? (
        <View className='empty-box'>暂无最近任务</View>
      ) : (
        data?.recent_records.map((item) => (
          <View
            key={item.id}
            className='record-card'
            onClick={() => {
              Taro.navigateTo({
                url: `/pages/record-detail/index?id=${item.id}`,
              })
            }}
          >
            <View className='record-title'>{item.title}</View>
            <View className='record-meta'>
              状态：{item.status} {item.due_at ? `｜截止：${item.due_at}` : ''}
            </View>
          </View>
        ))
      )}

      <View className='section-title'>最近通知</View>

      {(data?.recent_notifications || []).length === 0 ? (
        <View className='empty-box'>暂无通知</View>
      ) : (
        data?.recent_notifications.map((item) => (
          <View
            key={item.id}
            className='notice-card'
            onClick={() => {
              if (item.record_id) {
                Taro.navigateTo({
                  url: `/pages/record-detail/index?id=${item.record_id}`,
                })
              }
            }}
          >
            <View className='notice-title'>
              {!item.read && <Text className='dot' />}
              {item.title}
            </View>
            <View className='notice-content'>{item.content || '-'}</View>
          </View>
        ))
      )}
    </View>
  )
}
