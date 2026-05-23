import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { createAppointmentProject, deleteAppointmentProject, listAppointmentProjects, type AppointmentProject, updateAppointmentProject } from '../../api/appointmentProject'
import './index.scss'

interface ProjectSelectProps {
  calendarId: number
  value: string
  projectId?: number | null
  onChange: (v: { projectName: string; projectId: number | null }) => void
  placeholder?: string
  disabled?: boolean
}

export default function ProjectSelect({ calendarId, value, projectId, onChange, placeholder = '请选择或输入项目', disabled = false }: ProjectSelectProps) {
  const [items, setItems] = useState<AppointmentProject[]>([])
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState(value || '')
  const [editingId, setEditingId] = useState<number>()
  const [editingName, setEditingName] = useState('')

  useEffect(() => setKeyword(value || ''), [value])

  const load = async (k = '') => {
    if (!calendarId) return
    const list = await listAppointmentProjects(calendarId, k)
    setItems(list || [])
  }

  useEffect(() => {
    load('')
  }, [calendarId])

  const normalizedKeyword = keyword.trim().toLowerCase()
  const filtered = useMemo(() => items.filter((i) => i.name.toLowerCase().includes(normalizedKeyword)), [items, normalizedKeyword])
  const displayItems = useMemo(() => (normalizedKeyword ? filtered : items), [filtered, items, normalizedKeyword])
  const createName = keyword.trim()

  const select = (p: AppointmentProject) => {
    onChange({ projectId: p.id, projectName: p.name })
    setKeyword(p.name)
    setOpen(false)
  }

  const remove = async (p: AppointmentProject) => {
    const ok = await Taro.showModal({ title: '确认删除', content: '确认删除该服务项目吗？删除后不会影响历史预约记录。' })
    if (!ok.confirm) return
    await deleteAppointmentProject(p.id)
    if (projectId === p.id) onChange({ projectId: null, projectName: '' })
    await load(keyword)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const name = editingName.trim()
    if (!name) {
      Taro.showToast({ title: '名称不能为空', icon: 'none' })
      return
    }
    try {
      const updated = await updateAppointmentProject(editingId, name)
      if (projectId === editingId) onChange({ projectId: editingId, projectName: updated.name })
      setEditingId(undefined)
      setEditingName('')
      await load(keyword)
    } catch {
      Taro.showToast({ title: '该服务项目已存在', icon: 'none' })
    }
  }

  const createProject = async () => {
    const name = createName
    if (!name || !calendarId) return
    const normalized = name.toLowerCase()
    const exist = items.find((i) => i.name.trim().toLowerCase() === normalized)
    if (exist) {
      select(exist)
      return
    }
    try {
      const created = await createAppointmentProject(calendarId, name)
      onChange({ projectId: created.id, projectName: created.name })
      setKeyword(created.name)
      setOpen(false)
      await load('')
    } catch {
      Taro.showToast({ title: '新增项目失败', icon: 'none' })
    }
  }

  return (
    <View className='project-select'>
      <View className={`select-input-wrap ${disabled ? 'disabled' : ''}`}>
        <Input
          className='form-input project-input'
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => {
            if (disabled) return
            setOpen(true)
            load('')
          }}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          onInput={(e) => {
            const v = e.detail.value
            setKeyword(v)
            onChange({ projectId: null, projectName: v })
            setOpen(true)
          }}
        />
        <Text className='arrow'>▾</Text>
      </View>
      {open ? (
        <View className='project-dropdown'>
          {displayItems.slice(0, 6).map((p) => (
            <View key={p.id} className='project-item'>
              {editingId === p.id ? (
                <Input
                  className='edit-input'
                  value={editingName}
                  onInput={(e) => setEditingName(e.detail.value)}
                  onBlur={saveEdit}
                />
              ) : (
                <Text className='project-name' onClick={() => select(p)}>{p.name}</Text>
              )}
              <View className='actions'>
                <Text className='act' onClick={() => { setEditingId(p.id); setEditingName(p.name) }}>编辑</Text>
                <Text className='act delete' onClick={() => remove(p)}>删除</Text>
              </View>
            </View>
          ))}
          {filtered.length === 0 && !createName ? <View className='empty'>暂无项目，可新增</View> : null}
          {filtered.length === 0 && createName ? <View className='create-item' onClick={createProject}>新增项目：{createName}</View> : null}
        </View>
      ) : null}
    </View>
  )
}
