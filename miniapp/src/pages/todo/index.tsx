import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { getTodayTodos, type TodayTodoResult, type TodoRecord, type TodoReminder } from '../../api/todo'
import { getStoredToken } from '../../utils/auth'
import { getRecordStatusText } from '../../utils/recordStatus'
import './index.scss'

type TabKey = 'due_today' | 'reminders_today' | 'unfinished'

const statusText = getRecordStatusText


function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

export default function TodoPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('due_today')
  const [data, setData] = useState<TodayTodoResult | null>(null)

  const loadData = async () => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    try {
      const res = await getTodayTodos()
      setData(res)
    } catch (err) {
      console.error(err)
    }
  }

  usePullDownRefresh(async () => {
    await loadData()
    Taro.stopPullDownRefresh()
  })

  useDidShow(() => {
    loadData()
  })

  const dueToday = data?.due_today || []
  const remindersToday = data?.reminders_today || []
  const unfinished = data?.unfinished || []

  const renderRecordCard = (item: TodoRecord) => {
    return (
      <View
        key={item.id}
        className='todo-card'
        onClick={() => {
          Taro.navigateTo({
            url: `/pages/record-detail/index?id=${item.id}`,
          })
        }}
      >
        <View className='todo-title'>{item.title}</View>

        <View className='todo-meta'>
          <Text>状态：{statusText(item.status)}</Text>
        </View>

        <View className='todo-meta'>
          <Text>负责人：{item.assignee_name || '-'}</Text>
        </View>

        <View className='todo-meta'>
          <Text>截止：{formatDateTime(item.due_at)}</Text>
        </View>
      </View>
    )
  }

  const renderReminderCard = (item: TodoReminder) => {
    return (
      <View
        key={item.id}
        className='todo-card'
        onClick={() => {
          Taro.navigateTo({
            url: `/pages/record-detail/index?id=${item.record_id}`,
          })
        }}
      >
        <View className='todo-title'>{item.record_title}</View>

        <View className='todo-meta'>
          <Text>提醒时间：{formatDateTime(item.remind_at)}</Text>
        </View>

        <View className='todo-meta'>
          <Text>重复类型：{item.repeat_type}</Text>
        </View>

        <View className='todo-meta'>
          <Text>{item.notified ? '已通知' : '未通知'}</Text>
        </View>
      </View>
    )
  }

  const renderCurrentList = () => {
    if (activeTab === 'due_today') {
      if (dueToday.length === 0) {
        return <View className='empty-box'>暂无今日截止任务</View>
      }

      return dueToday.map(renderRecordCard)
    }

    if (activeTab === 'reminders_today') {
      if (remindersToday.length === 0) {
        return <View className='empty-box'>暂无今日提醒</View>
      }

      return remindersToday.map(renderReminderCard)
    }

    if (unfinished.length === 0) {
      return <View className='empty-box'>暂无未完成任务</View>
    }

    return unfinished.map(renderRecordCard)
  }

  return (
    <View className='container'>
      <View className='todo-summary'>
        <View className='summary-item'>
          <Text className='summary-value'>{dueToday.length}</Text>
          <Text className='summary-label'>今日截止</Text>
        </View>

        <View className='summary-item'>
          <Text className='summary-value'>{remindersToday.length}</Text>
          <Text className='summary-label'>今日提醒</Text>
        </View>

        <View className='summary-item'>
          <Text className='summary-value'>{unfinished.length}</Text>
          <Text className='summary-label'>未完成</Text>
        </View>
      </View>

      <View className='tab-bar'>
        <View
          className={activeTab === 'due_today' ? 'tab-item active' : 'tab-item'}
          onClick={() => setActiveTab('due_today')}
        >
          今日截止
        </View>

        <View
          className={activeTab === 'reminders_today' ? 'tab-item active' : 'tab-item'}
          onClick={() => setActiveTab('reminders_today')}
        >
          今日提醒
        </View>

        <View
          className={activeTab === 'unfinished' ? 'tab-item active' : 'tab-item'}
          onClick={() => setActiveTab('unfinished')}
        >
          未完成
        </View>
      </View>

      <View className='todo-list'>{renderCurrentList()}</View>
    </View>
  )
}
