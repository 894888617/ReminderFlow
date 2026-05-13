import { Picker, View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh, useRouter } from '@tarojs/taro'
import { useMemo, useState } from 'react'

import {
  deleteCalendar,
  listCalendarEvents,
  listCalendars,
  normalizeCalendarRole,
  type Calendar,
  type CalendarEvent,
} from '../../api/calendar'
import { canCreateRecord, canViewMembers } from '../../utils/permission'
import { getStoredToken } from '../../utils/auth'

import './index.scss'

const SELECTED_CALENDAR_KEY = 'selected_calendar_id'

function formatDate(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatMonth(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

function monthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start: formatDate(start), end: formatDate(end) }
}

function monthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const leading = first.getDay()
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const result: Array<{ key: string; day?: number; date?: string }> = []

  for (let i = 0; i < leading; i += 1) {
    result.push({ key: `empty-${i}` })
  }

  for (let day = 1; day <= days; day += 1) {
    const current = new Date(date.getFullYear(), date.getMonth(), day)
    result.push({ key: formatDate(current), day, date: formatDate(current) })
  }

  return result
}

function eventDate(event: CalendarEvent) {
  return (event.start_at || '').slice(0, 10)
}

function formatEventTime(value?: string | null) {
  if (!value) return '全天'
  return value.replace('T', ' ').slice(11, 16) || '全天'
}

export default function CalendarPage() {
  const router = useRouter()
  const routeCalendarId = Number(router.params.calendar_id || router.params.id || 0)
  const today = useMemo(() => new Date(), [])

  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [selectedCalendarId, setSelectedCalendarId] = useState<number>(routeCalendarId || 0)
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(formatDate(today))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const selectedCalendar = useMemo(() => {
    return calendars.find((item) => item.id === selectedCalendarId)
  }, [calendars, selectedCalendarId])

  const selectedRole = normalizeCalendarRole(selectedCalendar)
  const writable = canCreateRecord(selectedRole)
  const showMembers = canViewMembers(selectedRole)

  const calendarNames = useMemo(() => calendars.map((item) => item.name), [calendars])
  const selectedCalendarIndex = useMemo(() => {
    return calendars.findIndex((item) => item.id === selectedCalendarId)
  }, [calendars, selectedCalendarId])

  const eventCountByDate = useMemo(() => {
    return events.reduce<Record<string, number>>((map, item) => {
      const key = eventDate(item)
      if (key) map[key] = (map[key] || 0) + 1
      return map
    }, {})
  }, [events])

  const dayEvents = useMemo(() => {
    return events.filter((item) => eventDate(item) === selectedDate)
  }, [events, selectedDate])

  const loadEvents = async (calendarId: number, month = currentMonth) => {
    if (!calendarId) {
      setEvents([])
      return
    }

    const range = monthRange(month)
    const data = await listCalendarEvents(calendarId, range)
    setEvents(data.items || [])
  }

  const loadData = async (preferredId = selectedCalendarId) => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }

    try {
      setLoading(true)
      const data = await listCalendars()
      const items = data || []
      setCalendars(items)

      const storedId = Number(Taro.getStorageSync(SELECTED_CALENDAR_KEY) || 0)
      const nextId = [preferredId, routeCalendarId, storedId, items[0]?.id || 0].find((id) =>
        items.some((item) => item.id === id)
      ) || 0

      setSelectedCalendarId(nextId)

      if (nextId) {
        Taro.setStorageSync(SELECTED_CALENDAR_KEY, nextId)
        await loadEvents(nextId)
      } else {
        setEvents([])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  usePullDownRefresh(async () => {
    await loadData()
    Taro.stopPullDownRefresh()
  })

  useDidShow(() => {
    loadData(routeCalendarId || selectedCalendarId)
  })

  const changeCalendar = async (calendarId: number) => {
    setSelectedCalendarId(calendarId)
    Taro.setStorageSync(SELECTED_CALENDAR_KEY, calendarId)
    await loadEvents(calendarId)
  }

  const changeMonth = async (offset: number) => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1)
    setCurrentMonth(next)
    setSelectedDate(formatDate(new Date(next.getFullYear(), next.getMonth(), 1)))
    if (selectedCalendarId) {
      await loadEvents(selectedCalendarId, next)
    }
  }

  const handleDeleteCalendar = (calendar: Calendar) => {
    if (normalizeCalendarRole(calendar) !== 'owner') {
      Taro.showToast({ title: '只有所有者可以删除日历', icon: 'none' })
      return
    }

    Taro.showModal({
      title: '确认删除日历',
      content: '日历内记录、提醒将一并删除，确认继续吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return

        try {
          setDeletingId(calendar.id)
          Taro.showLoading({ title: '删除中', mask: true })
          await deleteCalendar(calendar.id)
          Taro.hideLoading()
          Taro.showToast({ title: '删除成功', icon: 'success' })
          await loadData(0)
        } catch (err) {
          console.error(err)
          Taro.hideLoading()
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  if (!loading && calendars.length === 0) {
    return (
      <View className='container'>
        <View className='calendar-header'>
          <View>
            <View className='page-title'>日历</View>
            <View className='page-desc'>用日历管理记录、待办和提醒。</View>
          </View>
        </View>

        <View className='onboarding-empty'>
          <View className='onboarding-title'>还没有日历</View>
          <View className='onboarding-desc'>创建共享日历后，可以添加记录、设置提醒、邀请成员协作。</View>
          <View className='onboarding-primary-btn' onClick={() => Taro.navigateTo({ url: '/pages/calendar-create/index' })}>
            创建第一个日历
          </View>
          <View className='onboarding-tip'>也可以通过好友分享的邀请码加入已有日历。</View>
        </View>
      </View>
    )
  }

  return (
    <View className='container'>
      <View className='calendar-header'>
        <View>
          <View className='page-title'>{selectedCalendar?.name || '日历'}</View>
          <View className='page-desc'>选中日期：{selectedDate} ｜ 当天 {dayEvents.length} 条记录</View>
        </View>

        <View className='create-calendar-btn' onClick={() => Taro.navigateTo({ url: '/pages/calendar-create/index' })}>
          创建
        </View>
      </View>

      <View className='calendar-switch-card'>
        <Picker
          mode='selector'
          range={calendarNames}
          value={selectedCalendarIndex >= 0 ? selectedCalendarIndex : 0}
          onChange={(e) => {
            const selected = calendars[Number(e.detail.value)]
            if (selected) changeCalendar(selected.id)
          }}
        >
          <View className='calendar-picker'>切换我的日历：{selectedCalendar?.name || '请选择'}</View>
        </Picker>

        <View className='calendar-actions'>
          <View className='action-btn' onClick={() => Taro.navigateTo({ url: `/pages/calendar-detail/index?id=${selectedCalendarId}` })}>
            设置
          </View>
          {showMembers && (
            <View className='action-btn green' onClick={() => Taro.navigateTo({ url: `/pages/calendar-members/index?calendar_id=${selectedCalendarId}` })}>
              邀请成员
            </View>
          )}
          {selectedRole === 'owner' && selectedCalendar && (
            <View className={deletingId === selectedCalendar.id ? 'action-btn danger disabled' : 'action-btn danger'} onClick={() => handleDeleteCalendar(selectedCalendar)}>
              {deletingId === selectedCalendar.id ? '删除中' : '删除'}
            </View>
          )}
        </View>
      </View>

      <View className='month-card'>
        <View className='month-head'>
          <View className='month-btn' onClick={() => changeMonth(-1)}>上月</View>
          <View className='month-title'>{formatMonth(currentMonth)}</View>
          <View className='month-btn' onClick={() => changeMonth(1)}>下月</View>
        </View>

        <View className='weekday-row'>
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
            <View key={day} className='weekday'>{day}</View>
          ))}
        </View>

        <View className='day-grid'>
          {monthDays(currentMonth).map((item) => (
            <View
              key={item.key}
              className={`day-cell ${item.date === selectedDate ? 'active' : ''} ${item.date === formatDate(today) ? 'today' : ''}`}
              onClick={() => item.date && setSelectedDate(item.date)}
            >
              {item.day ? <Text>{item.day}</Text> : null}
              {item.date && eventCountByDate[item.date] ? <View className='event-dot'>{eventCountByDate[item.date]}</View> : null}
            </View>
          ))}
        </View>
      </View>

      <View className='record-section-head'>
        <View className='section-title'>当天记录</View>
        {writable && (
          <View className='new-record-btn' onClick={() => Taro.navigateTo({ url: `/pages/record-create/index?calendar_id=${selectedCalendarId}&date=${selectedDate}` })}>
            新建记录
          </View>
        )}
      </View>

      {dayEvents.length === 0 ? (
        <View className='empty-box'>当天暂无记录</View>
      ) : (
        <View className='record-list'>
          {dayEvents.map((item) => (
            <View key={item.id} className='record-card' onClick={() => item.record_id && Taro.navigateTo({ url: `/pages/record-detail/index?id=${item.record_id}` })}>
              <View className='record-title'>{item.title}</View>
              {item.content ? <View className='record-content'>{item.content}</View> : null}
              <View className='record-meta'>时间：{formatEventTime(item.start_at)}</View>
              {item.assignee_name ? <View className='record-meta'>负责人：{item.assignee_name}</View> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
