import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useMemo, useState } from 'react'

import {
  deleteNotification,
  getNotifications,
  markNotificationRead,
  type NotificationItem,
} from '../../api/notification'

import { getStoredToken } from '../../utils/auth'
import './index.scss'
import PageRefresh from "../../components/PageRefresh";

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

function getNotificationType(title?: string) {
  const text = title || ''

  if (text.includes('逾期')) {
    return {
      label: '逾期',
      className: 'danger',
    }
  }

  if (text.includes('提醒')) {
    return {
      label: '提醒',
      className: 'primary',
    }
  }

  if (text.includes('负责人')) {
    return {
      label: '负责人',
      className: 'info',
    }
  }

  return {
    label: '系统',
    className: 'default',
  }
}

export default function NotificationPage() {
  const [list, setList] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)

  const unreadCount = useMemo(() => {
    return list.filter((item) => !item.read).length
  }, [list])

  const loadData = async () => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    try {
      setLoading(true)
      const data = await getNotifications()
      setList(data || [])
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
    loadData()
  })

  const handleMarkRead = async (item: NotificationItem) => {
    if (item.read) return

    try {
      await markNotificationRead(item.id)

      Taro.showToast({
        title: '已标记已读',
        icon: 'success',
      })

      await loadData()
    } catch (err) {
      console.error(err)
    }
  }


  const handleDeleteNotification = (item: NotificationItem) => {
    Taro.showModal({
      title: '确认删除通知',
      content: '删除后不可恢复，确认继续吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return

        try {
          await deleteNotification(item.id)

          Taro.showToast({
            title: '删除成功',
            icon: 'success',
          })

          await loadData()
        } catch (err) {
          console.error(err)
        }
      },
    })
  }

  const handleOpenNotification = async (item: NotificationItem) => {
    try {
      if (!item.read) {
        await markNotificationRead(item.id)
      }

      if (item.record_id) {
        Taro.navigateTo({
          url: `/pages/record-detail/index?id=${item.record_id}`,
        })
        return
      }

      await loadData()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <View className='container'>
      <View className='notification-header'>
        <PageRefresh onClick={loadData} />
      </View>

      <View className='summary-card'>
        <View>
          <Text className='summary-value'>{list.length}</Text>
          <Text className='summary-label'>全部通知</Text>
        </View>

        <View>
          <Text className='summary-value unread'>{unreadCount}</Text>
          <Text className='summary-label'>未读通知</Text>
        </View>
      </View>

      {loading ? (
        <View className='empty-box'>加载中...</View>
      ) : list.length === 0 ? (
        <View className='empty-box'>暂无通知</View>
      ) : (
        <View className='notification-list'>
          {list.map((item) => {
            const type = getNotificationType(item.title)

            return (
              <View
                key={item.id}
                className={item.read ? 'notification-card read' : 'notification-card unread-card'}
                onClick={() => handleOpenNotification(item)}
              >
                <View className='notification-top'>
                  <View className='title-wrap'>
                    {!item.read && <Text className='unread-dot' />}
                    <Text className='notification-title'>{item.title}</Text>
                  </View>

                  <Text className={`type-tag ${type.className}`}>
                    {type.label}
                  </Text>
                </View>

                <View className='notification-content'>
                  {item.content || '-'}
                </View>

                <View className='notification-footer'>
                  <Text className='notification-time'>
                    {formatDateTime(item.created_at)}
                  </Text>

                  <View className='action-group'>
                    {!item.read && (
                      <Text
                        className='read-action'
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMarkRead(item)
                        }}
                      >
                        标记已读
                      </Text>
                    )}

                    {item.record_id && (
                      <Text className='open-action'>
                        查看记录
                      </Text>
                    )}

                    <Text
                      className='delete-action'
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteNotification(item)
                      }}
                    >
                      删除
                    </Text>
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
