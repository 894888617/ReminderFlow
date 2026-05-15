import { Input, Picker, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'

import {
  deleteCalendar,
  getCalendarDetail,
  normalizeCalendarRole,
  updateCalendar,
  type Calendar,
} from '../../api/calendar'
import { canCreateRecord, canViewMembers } from '../../utils/permission'
import { getStoredToken } from '../../utils/auth'

import './index.scss'

const colorOptions = [
  { label: '蓝色', value: '#1677ff' },
  { label: '绿色', value: '#10b981' },
  { label: '橙色', value: '#f97316' },
  { label: '紫色', value: '#8b5cf6' },
  { label: '红色', value: '#ef4444' },
]

function roleText(role?: string) {
  switch (role) {
    case 'owner':
      return '所有者'
    case 'member':
      return '成员'
    case 'viewer':
      return '只读'
    default:
      return role || '-'
  }
}

export default function CalendarDetailPage() {
  const router = useRouter()
  const calendarId = Number(router.params.calendar_id || router.params.id || 0)

  const [calendar, setCalendar] = useState<Calendar | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [colorIndex, setColorIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const role = normalizeCalendarRole(calendar || undefined)
  const owner = role === 'owner'
  const writable = canCreateRecord(role)
  const showMembers = canViewMembers(role)
  const selectedColor = colorOptions[colorIndex]

  const loadData = async () => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }

    if (!calendarId) {
      Taro.showToast({ title: '日历 ID 缺失', icon: 'none' })
      return
    }

    try {
      const data = await getCalendarDetail(calendarId)
      setCalendar(data)
      setName(data.name || '')
      setDescription(data.description || '')
      const index = colorOptions.findIndex((item) => item.value === data.color)
      setColorIndex(index >= 0 ? index : 0)
    } catch (err) {
      console.error(err)
      Taro.showToast({ title: '未加入该日历或日历不存在', icon: 'none' })
    }
  }

  useDidShow(() => {
    loadData()
  })

  const handleSave = async () => {
    if (!owner || saving) return

    if (!name.trim()) {
      Taro.showToast({ title: '请输入日历名称', icon: 'none' })
      return
    }

    try {
      setSaving(true)
      Taro.showLoading({ title: '保存中', mask: true })
      const data = await updateCalendar(calendarId, {
        name: name.trim(),
        description: description.trim(),
        color: selectedColor.value,
        timezone: calendar?.timezone || 'Asia/Shanghai',
      })
      setCalendar(data)
      Taro.hideLoading()
      Taro.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!owner || deleting) return

    Taro.showModal({
      title: '确认删除日历',
      content: '日历内记录、提醒将一并删除，确认继续吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return

        try {
          setDeleting(true)
          Taro.showLoading({ title: '删除中', mask: true })
          await deleteCalendar(calendarId)
          Taro.hideLoading()
          Taro.showToast({ title: '删除成功', icon: 'success' })
          setTimeout(() => Taro.redirectTo({ url: '/pages/calendar/index' }), 500)
        } catch (err) {
          console.error(err)
          Taro.hideLoading()
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  return (
    <View className='container'>
      <View className='form-card'>
        <View className='form-item'>
          <Text className='form-label'>日历名称</Text>
          <Input className='form-input' value={name} disabled={!owner} maxlength={50} onInput={(e) => setName(e.detail.value)} />
        </View>

        <View className='form-item'>
          <Text className='form-label'>描述</Text>
          <Textarea className='form-textarea' value={description} disabled={!owner} maxlength={300} onInput={(e) => setDescription(e.detail.value)} />
        </View>

        <View className='form-item'>
          <Text className='form-label'>颜色</Text>
          <Picker mode='selector' disabled={!owner} range={colorOptions.map((item) => item.label)} value={colorIndex} onChange={(e) => setColorIndex(Number(e.detail.value))}>
            <View className='color-picker'>
              <View className='color-dot' style={{ backgroundColor: selectedColor.value }} />
              <Text>{selectedColor.label}</Text>
            </View>
          </Picker>
        </View>
      </View>

      <View className='detail-actions'>
        <View className='action-btn' onClick={() => { Taro.setStorageSync('selected_calendar_id', calendarId); Taro.redirectTo({ url: '/pages/calendar/index' }) }}>进入日历</View>
        {writable && <View className='action-btn' onClick={() => Taro.navigateTo({ url: `/pages/record-create/index?calendar_id=${calendarId}` })}>新建记录</View>}
        {showMembers && <View className='action-btn green' onClick={() => Taro.navigateTo({ url: `/pages/calendar-members/index?calendar_id=${calendarId}` })}>日历成员</View>}
      </View>

      {owner && (
        <>
          <View className={saving ? 'submit-btn disabled' : 'submit-btn'} onClick={handleSave}>{saving ? '保存中...' : '保存设置'}</View>
          <View className={deleting ? 'delete-btn disabled' : 'delete-btn'} onClick={handleDelete}>{deleting ? '删除中...' : '删除日历'}</View>
        </>
      )}
    </View>
  )
}
