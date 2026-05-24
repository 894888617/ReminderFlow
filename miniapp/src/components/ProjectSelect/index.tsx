import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createAppointmentProject, deleteAppointmentProject, listAppointmentProjects, type AppointmentProject } from '../../api/appointmentProject'
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
  const [loading, setLoading] = useState(false)
  const requestSeqRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setKeyword(value || ''), [value])

  const load = async (k = '') => {
    if (!calendarId) return
    const seq = ++requestSeqRef.current
    setLoading(true)
    try {
      const list = await listAppointmentProjects(calendarId, k)
      if (seq !== requestSeqRef.current) return
      setItems(list || [])
    } finally {
      if (seq === requestSeqRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    load('')
  }, [calendarId])

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }, [])

  const normalizedKeyword = keyword.trim().toLowerCase()
  const filtered = useMemo(() => items.filter((i) => i.name.toLowerCase().includes(normalizedKeyword)), [items, normalizedKeyword])
  const displayItems = useMemo(() => (normalizedKeyword ? filtered : items), [filtered, items, normalizedKeyword])
  const createName = keyword.trim()

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const select = (p: AppointmentProject) => {
    clearCloseTimer()
    onChange({ projectId: p.id, projectName: p.name })
    setKeyword(p.name)
    setOpen(false)
  }

  const remove = async (p: AppointmentProject) => {
    clearCloseTimer()
    const ok = await Taro.showModal({ title: '确认删除', content: '确认删除该服务项目吗？删除后不会影响历史预约记录。' })
    if (!ok.confirm) return
    await deleteAppointmentProject(p.id)
    setItems((prev) => prev.filter((item) => item.id !== p.id))
    if (projectId === p.id) {
      onChange({ projectId: null, projectName: '' })
      setKeyword('')
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
      setItems((prev) => [created, ...prev.filter((item) => item.id !== created.id)])
      onChange({ projectId: created.id, projectName: created.name })
      setKeyword(created.name)
      setOpen(false)
    } catch {
      Taro.showToast({ title: '新增项目失败', icon: 'none' })
    }
  }

  const selectedNames = value
    ? value.split(',').map((item) => item.trim()).filter(Boolean).join('、')
    : ''

  return (
    <View className='project-select-wrap' onClick={() => setOpen(false)}>
      <View
        className={`select-input-wrap ${disabled ? 'disabled' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (disabled) return
          clearCloseTimer()
          setOpen(true)
        }}
      >
        <View className={`form-input project-select-box ${!selectedNames ? 'placeholder' : ''}`}>
          <Text className='project-select-text'>{selectedNames || placeholder}</Text>
          <Text className='arrow'>⌄</Text>
        </View>
      </View>
      <View
        className={`project-dropdown-root ${open ? 'show' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <View
          className='project-dropdown-panel'
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <Input
            className='project-search-input'
            value={keyword}
            placeholder='输入搜索或新增项目'
            adjustPosition={false}
            cursorSpacing={0}
            alwaysEmbed
            onFocus={(e) => {
              e.stopPropagation()
              clearCloseTimer()
              setOpen(true)
            }}
            onBlur={() => {
              clearCloseTimer()
              closeTimerRef.current = setTimeout(() => setOpen(false), 180)
            }}
            onInput={(e) => {
              const v = e.detail.value
              setKeyword(v)
              onChange({ projectId: null, projectName: v })
              clearCloseTimer()
              setOpen(true)
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
              debounceTimerRef.current = setTimeout(() => {
                if (!calendarId) return
                load(v.trim())
              }, 300)
            }}
          />
          {displayItems.slice(0, 6).map((p) => (
            <View key={p.id} className='project-item' onClick={() => select(p)}
             
            >
              <Text className='project-name'>{p.name}</Text>
              <View className='actions'>
                <Text className='act delete' onClick={(e) => { e.stopPropagation(); remove(p) }}>删除</Text>
              </View>
            </View>
          ))}
          {loading ? <View className='empty'>加载中...</View> : null}
          {filtered.length === 0 && !createName ? <View className='empty'>暂无项目，可新增</View> : null}
          {filtered.length === 0 && createName ? <View className='create-item' onClick={createProject}>新增项目：{createName}</View> : null}
        </View>
      </View>
    </View>
  )
}
