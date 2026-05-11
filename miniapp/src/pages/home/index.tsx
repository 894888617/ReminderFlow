import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { getMobileHome, type MobileHomeSummary } from '../../api/home'
import './index.scss'

export default function HomePage() {
  const [data, setData] = useState<MobileHomeSummary | null>(null)



  const loadData = async () => {
    const token = Taro.getStorageSync('token')

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    try {
      const res = await getMobileHome()
      setData(res)
    } catch (err) {
      console.error(err)
    }
  }

  useDidShow(() => {
    loadData()
  })

  usePullDownRefresh(async () => {
    await loadData()
    Taro.stopPullDownRefresh()
  })

  const isNewbie =
    data &&
    data.today_due_count === 0 &&
    data.today_reminder_count === 0 &&
    data.unfinished_count === 0 &&
    data.overdue_count === 0 &&
    (data.recent_records || []).length === 0

  return (
    <View className='container'>
      <View className='home-header'>
        <View>
          <View className='page-title'>首页</View>
          <View className='page-desc'>查看今日待办、逾期任务和最新通知。</View>
        </View>

        <View
          className='notice-entry'
          onClick={() => {
            Taro.navigateTo({
              url: '/pages/notification/index',
            })
          }}
        >
          通知
          {(data?.unread_notification_count || 0) > 0 && (
            <Text className='notice-badge'>{data?.unread_notification_count}</Text>
          )}
        </View>
      </View>

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

      {isNewbie && (
        <View className='newbie-card'>
          <View className='newbie-title'>开始使用轻记协同</View>
          <View className='newbie-desc'>
            你还没有开始协作记录。建议先创建一个空间，再创建第一条记录。
          </View>

          <View
            className='newbie-primary-btn'
            onClick={() => {
              Taro.navigateTo({
                url: '/pages/workspace-create/index',
              })
            }}
          >
            创建第一个空间
          </View>

          <View
            className='newbie-secondary-btn'
            onClick={() => {
              Taro.switchTab({
                url: '/pages/workspace/index',
              })
            }}
          >
            查看我的空间
          </View>
        </View>
      )}

      {!isNewbie && (
        <View
          className='primary-btn'
          onClick={() => {
            Taro.navigateTo({
              url: '/pages/record-create/index',
            })
          }}
        >
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
