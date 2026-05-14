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

function parseDate(date: string) {
  const [yyyy, mm, dd] = date.split('-').map(Number)
  return new Date(yyyy, (mm || 1) - 1, dd || 1)
}

function formatMonth(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${yyyy}年${mm}月`
}

function getMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)

  return {
    start: formatDate(start),
    end: formatDate(end),
  }
}

function getMonthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const leading = first.getDay()
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()

  const result: Array<{
    key: string
    day?: number
    date?: string
  }> = []

  for (let i = 0; i < leading; i += 1) {
    result.push({
      key: `empty-${i}`,
    })
  }

  for (let day = 1; day <= days; day += 1) {
    const current = new Date(date.getFullYear(), date.getMonth(), day)
    result.push({
      key: formatDate(current),
      day,
      date: formatDate(current),
    })
  }

  return result
}

function getEventDate(event: CalendarEvent) {
  return (event.start_at || '').slice(0, 10)
}

// function formatDateTime(value?: string | null, emptyText = '未设置') {
//   if (!value) return emptyText

//   const normalized = value.replace('T', ' ')
//   return normalized.slice(0, 16)
// }

// function getEventExtraField(event: CalendarEvent, field: string) {
//   return (event as unknown as Record<string, string | null | undefined>)[field]
// }

function normalizeStatus(status?: string | null) {
  return String(status || 'pending').toUpperCase()
}

function getStatusText(status?: string | null) {
  const normalized = normalizeStatus(status)

  const map: Record<string, string> = {
    PENDING: '待处理',
    IN_PROGRESS: '进行中',
    DONE: '已完成',
    OVERDUE: '已逾期',
    CANCELLED: '已取消',
  }

  return map[normalized] || '待处理'
}

export default function CalendarPage() {
  const router = useRouter()

  const routeCalendarId = Number(router.params.calendar_id || router.params.id || 0)
  const routeSelectedDate = router.params.selected_date
    ? String(router.params.selected_date)
    : ''

  const today = useMemo(() => new Date(), [])
  const todayText = useMemo(() => formatDate(today), [today])

  const initialSelectedDate = routeSelectedDate || todayText

  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [currentCalendarId, setCurrentCalendarId] = useState<number>(routeCalendarId || 0)
  const [currentDate, setCurrentDate] = useState<Date>(parseDate(initialSelectedDate))
  const [selectedDate, setSelectedDate] = useState<string>(initialSelectedDate)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const selectedCalendar = useMemo(() => {
    return calendars.find((item) => item.id === currentCalendarId)
  }, [calendars, currentCalendarId])

  const currentUserRole = normalizeCalendarRole(selectedCalendar)
  const writable = canCreateRecord(currentUserRole)
  const showMembers = canViewMembers(currentUserRole)

  const calendarNames = useMemo(() => {
    return calendars.map((item) => item.name)
  }, [calendars])

  const selectedCalendarIndex = useMemo(() => {
    return calendars.findIndex((item) => item.id === currentCalendarId)
  }, [calendars, currentCalendarId])

  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((map, item) => {
      const key = getEventDate(item)
      if (!key) return map

      if (!map[key]) {
        map[key] = []
      }

      map[key].push(item)
      return map
    }, {})
  }, [events])

  const selectedDateEvents = useMemo(() => {
    return eventsByDate[selectedDate] || []
  }, [eventsByDate, selectedDate])

  const loadEvents = async (calendarId: number, baseDate = currentDate) => {
    if (!calendarId) {
      setEvents([])
      return
    }

    const range = getMonthRange(baseDate)
    const data = await listCalendarEvents(calendarId, range)
    setEvents(data.items || [])
  }

  const loadData = async (preferredId = currentCalendarId) => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    try {
      setLoading(true)

      const data = await listCalendars()
      const items = data || []

      setCalendars(items)

      const storedId = Number(Taro.getStorageSync(SELECTED_CALENDAR_KEY) || 0)

      const nextId =
        [preferredId, routeCalendarId, storedId, items[0]?.id || 0].find((id) =>
          items.some((item) => item.id === id)
        ) || 0

      setCurrentCalendarId(nextId)

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
    if (routeSelectedDate) {
      const nextDate = parseDate(routeSelectedDate)
      setSelectedDate(routeSelectedDate)
      setCurrentDate(nextDate)
    }

    loadData(routeCalendarId || currentCalendarId)
  })

  const changeCalendar = async (calendarId: number) => {
    setCurrentCalendarId(calendarId)
    Taro.setStorageSync(SELECTED_CALENDAR_KEY, calendarId)
    await loadEvents(calendarId)
  }

  const changeMonth = async (offset: number) => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1)
    const nextSelectedDate = formatDate(next)

    setCurrentDate(next)
    setSelectedDate(nextSelectedDate)

    if (currentCalendarId) {
      await loadEvents(currentCalendarId, next)
    }
  }

  const selectDate = (date: string) => {
    setSelectedDate(date)
    setCurrentDate(parseDate(date))
  }

  const goCreateRecord = () => {
    if (!currentCalendarId) return

    if (!writable) {
      Taro.showToast({
        title: '你只有查看权限',
        icon: 'none',
      })
      return
    }

    Taro.navigateTo({
      url: `/pages/record-create/index?calendar_id=${currentCalendarId}&selected_date=${selectedDate}`,
    })
  }

  const handleDeleteCalendar = (calendar: Calendar) => {
    if (normalizeCalendarRole(calendar) !== 'owner') {
      Taro.showToast({
        title: '只有所有者可以删除日历',
        icon: 'none',
      })
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
          Taro.showLoading({
            title: '删除中',
            mask: true,
          })

          await deleteCalendar(calendar.id)

          Taro.hideLoading()
          Taro.showToast({
            title: '删除成功',
            icon: 'success',
          })

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

  const renderRecordList = () => {
    if (selectedDateEvents.length === 0) {
      return (
        <View className='empty-box'>
          <View className='empty-title'>这一天还没有记录</View>

          {writable && (
            <View className='empty-create-btn' onClick={goCreateRecord}>
              创建第一条记录
            </View>
          )}
        </View>
      )
    }

    return (
      <View className='record-list'>
        {selectedDateEvents.map((item) => (
          <View
            key={item.id}
            className='record-card compact'
            onClick={() => {
              if (item.record_id) {
                Taro.navigateTo({
                  url: `/pages/record-detail/index?id=${item.record_id}`,
                })
              }
            }}
          >
            <View className='record-card-top'>
              <View className='record-title'>{item.title}</View>

              <View className='record-right'>
                <View className={`record-status status-${normalizeStatus(item.status)}`}>
                  {getStatusText(item.status)}
                </View>

                <View className='record-assignee-name'>
                  {item.assignee_name || '未分配'}
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
    )
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
          <View className='onboarding-desc'>
            创建共享日历后，可以添加记录、设置提醒、邀请成员协作。
          </View>

          <View
            className='onboarding-primary-btn'
            onClick={() => {
              Taro.navigateTo({
                url: '/pages/calendar-create/index',
              })
            }}
          >
            创建第一个日历
          </View>

          <View className='onboarding-tip'>
            也可以通过好友分享的邀请码加入已有日历。
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='container'>
      <View className='calendar-header'>
        <View>
          <View className='page-title'>{selectedCalendar?.name || '日历'}</View>
          <View className='page-desc'>
            选中日期：{selectedDate} ｜ 当天 {selectedDateEvents.length} 条记录
          </View>
        </View>

        <View
          className='create-calendar-btn'
          onClick={() => {
            Taro.navigateTo({
              url: '/pages/calendar-create/index',
            })
          }}
        >
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
            if (selected) {
              changeCalendar(selected.id)
            }
          }}
        >
          <View className='calendar-picker'>
            切换我的日历：{selectedCalendar?.name || '请选择'}
          </View>
        </Picker>

        <View className='calendar-actions'>
          <View
            className='action-btn'
            onClick={() => {
              Taro.navigateTo({
                url: `/pages/calendar-detail/index?id=${currentCalendarId}`,
              })
            }}
          >
            设置
          </View>

          {showMembers && (
            <View
              className='action-btn green'
              onClick={() => {
                Taro.navigateTo({
                  url: `/pages/calendar-members/index?calendar_id=${currentCalendarId}`,
                })
              }}
            >
              邀请成员
            </View>
          )}

          {currentUserRole === 'owner' && selectedCalendar && (
            <View
              className={
                deletingId === selectedCalendar.id
                  ? 'action-btn danger disabled'
                  : 'action-btn danger'
              }
              onClick={() => handleDeleteCalendar(selectedCalendar)}
            >
              {deletingId === selectedCalendar.id ? '删除中' : '删除'}
            </View>
          )}
        </View>
      </View>

      <View className='month-card'>
        <View className='month-head'>
          <View className='month-btn' onClick={() => changeMonth(-1)}>
            上月
          </View>
          <View className='month-title'>{formatMonth(currentDate)}</View>
          <View className='month-btn' onClick={() => changeMonth(1)}>
            下月
          </View>
        </View>

        <View className='weekday-row'>
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
            <View key={day} className='weekday'>
              {day}
            </View>
          ))}
        </View>

        <View className='day-grid'>
          {getMonthDays(currentDate).map((item) => (
            <View
              key={item.key}
              className={`day-cell ${item.date === selectedDate ? 'active' : ''} ${
                item.date === todayText ? 'today' : ''
              }`}
              onClick={() => item.date && selectDate(item.date)}
            >
              {item.day ? <Text>{item.day}</Text> : null}

              {item.date && eventsByDate[item.date]?.length ? (
                <View className='event-dot'>
                  {eventsByDate[item.date].length}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </View>

      <View className='record-section-head'>
        <View className='section-title'>当天记录</View>

        {writable && (
          <View className='new-record-btn' onClick={goCreateRecord}>
            新建记录
          </View>
        )}
      </View>

      {renderRecordList()}
    </View>
  )
}
