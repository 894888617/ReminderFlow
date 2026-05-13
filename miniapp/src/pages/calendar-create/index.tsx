import { View, Text, Input, Textarea, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'

import { createCalendar } from '../../api/calendar'

import './index.scss'

const colorOptions = [
  { label: '蓝色', value: '#1677ff' },
  { label: '绿色', value: '#10b981' },
  { label: '橙色', value: '#f97316' },
  { label: '紫色', value: '#8b5cf6' },
  { label: '红色', value: '#ef4444' },
]

export default function CalendarCreatePage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [colorIndex, setColorIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const selectedColor = colorOptions[colorIndex]

  const handleSubmit = async () => {
    if (submitting) return

    if (!name.trim()) {
      Taro.showToast({ title: '请输入日历名称', icon: 'none' })
      return
    }

    if (name.trim().length > 50) {
      Taro.showToast({ title: '日历名称不能超过 50 个字', icon: 'none' })
      return
    }

    try {
      setSubmitting(true)
      Taro.showLoading({ title: '创建中', mask: true })

      const calendar = await createCalendar({
        name: name.trim(),
        description: description.trim(),
        color: selectedColor.value,
        timezone: 'Asia/Shanghai',
      })

      Taro.hideLoading()
      Taro.showToast({ title: '创建成功', icon: 'success' })

      setTimeout(() => {
        Taro.redirectTo({
          url: `/pages/calendar-detail/index?id=${calendar.id}`,
        })
      }, 500)
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className='container'>
      <View className='create-header'>
        <View>
          <View className='page-title'>创建日历</View>
          <View className='page-desc'>创建一个共享日历，用于管理记录、提醒和成员。</View>
        </View>

        <View className='back-btn' onClick={() => Taro.navigateBack()}>
          返回
        </View>
      </View>

      <View className='form-card'>
        <View className='form-item'>
          <Text className='form-label'>日历名称</Text>
          <Input
            className='form-input'
            value={name}
            placeholder='例如：客户项目日历'
            maxlength={50}
            onInput={(e) => setName(e.detail.value)}
          />
        </View>

        <View className='form-item'>
          <Text className='form-label'>描述</Text>
          <Textarea
            className='form-textarea'
            value={description}
            placeholder='可选：简单说明这个日历用于什么项目或团队'
            maxlength={300}
            onInput={(e) => setDescription(e.detail.value)}
          />
        </View>

        <View className='form-item'>
          <Text className='form-label'>颜色</Text>
          <Picker
            mode='selector'
            range={colorOptions.map((item) => item.label)}
            value={colorIndex}
            onChange={(e) => setColorIndex(Number(e.detail.value))}
          >
            <View className='color-picker'>
              <View className='color-dot' style={{ backgroundColor: selectedColor.value }} />
              <Text>{selectedColor.label}</Text>
            </View>
          </Picker>
        </View>
      </View>

      <View className={submitting ? 'submit-btn disabled' : 'submit-btn'} onClick={handleSubmit}>
        {submitting ? '创建中...' : '创建日历'}
      </View>
    </View>
  )
}
