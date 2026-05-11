import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'

import { createWorkspace } from '../../api/workspace'

import './index.scss'

export default function WorkspaceCreatePage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (submitting) return

    if (!name.trim()) {
      Taro.showToast({
        title: '请输入空间名称',
        icon: 'none',
      })
      return
    }

    if (name.trim().length > 50) {
      Taro.showToast({
        title: '空间名称不能超过 50 个字',
        icon: 'none',
      })
      return
    }

    try {
      setSubmitting(true)

      Taro.showLoading({
        title: '创建中',
        mask: true,
      })

      const workspace = await createWorkspace({
        name: name.trim(),
      })

      Taro.hideLoading()

      Taro.showToast({
        title: '创建成功',
        icon: 'success',
      })

      setTimeout(() => {
        Taro.redirectTo({
          url: `/pages/workspace-guide/index?workspace_id=${workspace.id}&name=${encodeURIComponent(
            workspace.name || name.trim()
          )}`,
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
          <View className='page-title'>创建空间</View>
          <View className='page-desc'>
            创建一个协作空间，用于管理任务、记录、提醒和成员。
          </View>
        </View>

        <View
          className='back-btn'
          onClick={() => {
            Taro.navigateBack()
          }}
        >
          返回
        </View>
      </View>

      <View className='form-card'>
        <View className='form-item'>
          <Text className='form-label'>空间名称</Text>
          <Input
            className='form-input'
            value={name}
            placeholder='例如：客户项目协作空间'
            maxlength={50}
            onInput={(e) => setName(e.detail.value)}
          />
        </View>

        <View className='form-item'>
          <Text className='form-label'>空间说明</Text>
          <Textarea
            className='form-textarea'
            value={description}
            placeholder='可选：简单说明这个空间用于什么项目或团队'
            maxlength={300}
            onInput={(e) => setDescription(e.detail.value)}
          />
          <View className='form-tip'>
            当前后端暂未保存空间说明，此字段先作为后续扩展预留。
          </View>
        </View>
      </View>

      <View
        className={submitting ? 'submit-btn disabled' : 'submit-btn'}
        onClick={handleSubmit}
      >
        {submitting ? '创建中...' : '创建空间'}
      </View>
    </View>
  )
}
