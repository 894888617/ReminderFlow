import { Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useMemo, useState } from 'react'

import {
  createRecord,
  getRecords,
  updateRecordStatus,
  type RecordStatus,
} from '../../api/record'
import {
  addWorkspaceMember,
  getWorkspaceMembers,
  getWorkspaces,
  type Workspace,
  type WorkspaceMember,
} from '../../api/workspace'
import { getStoredToken } from '../../utils/auth'
import { canCreateRecord, canManageMembers } from '../../utils/permission'
import { getWechatDisplayName } from '../../utils/userDisplay'
import './index.scss'

type AssistantMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
}

type PendingAction =
  | {
      type: 'create_record'
      workspaceId: number
      workspaceName: string
      title: string
      content?: string
      assigneeId?: number
      assigneeName?: string
      dueAt?: string
    }
  | {
      type: 'add_member'
      workspaceId: number
      workspaceName: string
      keyword: string
      role: 'member' | 'viewer'
    }
  | {
      type: 'update_record_status'
      workspaceId: number
      workspaceName: string
      keyword: string
      status: RecordStatus
    }
  | {
      type: 'navigate_members'
      workspaceId: number
      workspaceName: string
      role: string
    }

const defaultTips = [
  '说“创建记录 明天 18 点前让小王跟进报价”。',
  '说“把报价单记录标记完成”。',
  '说“给项目空间添加成员 U000123 只读”。',
  '说“管理项目空间人员”。',
]

function safeRequireWechatSI() {
  if (typeof requirePlugin !== 'function') return null

  try {
    return requirePlugin('WechatSI')
  } catch (err) {
    console.warn('WechatSI plugin unavailable', err)
    return null
  }
}

function todayOffset(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function normalizeTimeText(input: string) {
  return input
    .replace(/半/g, ':30')
    .replace(/点/g, ':')
    .replace(/时/g, ':')
    .replace(/分/g, '')
}

function parseDueAt(input: string) {
  const normalized = normalizeTimeText(input)
  const dateOffset = input.includes('后天') ? 2 : input.includes('明天') ? 1 : input.includes('今天') ? 0 : -1
  const timeMatch = normalized.match(/(\d{1,2})(?::(\d{1,2}))?/) || []

  if (dateOffset < 0 || !timeMatch[1]) return undefined

  const hour = Math.min(23, Math.max(0, Number(timeMatch[1])))
  const minute = timeMatch[2] ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0

  return `${todayOffset(dateOffset)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`
}

function removeCommandWords(input: string) {
  return input
    .replace(/^(帮我|请|麻烦|小助手|AI助理|ai助理)/i, '')
    .replace(/(创建|新建|添加)(一条|一个)?(协作)?(记录|任务)/, '')
    .replace(/(今天|明天|后天)\s*\d{1,2}([点时:]\d{0,2}|点半|时半)?(前|之前)?/g, '')
    .replace(/负责人(是|为)?[^，。,.\s]+/g, '')
    .replace(/[，。,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesName(input: string, name?: string) {
  return Boolean(name && input.includes(name))
}

function matchWorkspace(input: string, workspaces: Workspace[], fallback?: Workspace) {
  return workspaces.find((item) => includesName(input, item.name)) || fallback || workspaces[0]
}

function matchMember(input: string, members: WorkspaceMember[]) {
  return members.find((item) => {
    const displayName = getWechatDisplayName(item)
    return [displayName, item.username, item.nickname, `U${String(item.user_id).padStart(6, '0')}`]
      .filter(Boolean)
      .some((name) => input.includes(String(name)))
  })
}

function parseMemberKeyword(input: string) {
  const cleaned = input
    .replace(/^(帮我|请|麻烦)/, '')
    .replace(/(添加|邀请|加入)(成员|人员)?/, '')
    .replace(/(为|到|进)?[^\s，。,.]*(空间|项目)/, '')
    .replace(/(角色)?(成员|只读|观察者|查看者|member|viewer)/gi, '')
    .replace(/[，。,.]/g, ' ')
    .trim()

  return cleaned.split(/\s+/).filter(Boolean)[0] || ''
}

function statusFromCommand(input: string): RecordStatus {
  if (/取消|作废|关闭/.test(input)) return 'CANCELLED'
  if (/进行中|开始/.test(input)) return 'IN_PROGRESS'
  return 'DONE'
}

function actionSummary(action: PendingAction) {
  switch (action.type) {
    case 'create_record':
      return `准备在「${action.workspaceName}」创建记录：${action.title}${action.assigneeName ? `，负责人：${action.assigneeName}` : ''}${action.dueAt ? `，截止：${action.dueAt.slice(0, 16).replace('T', ' ')}` : ''}`
    case 'add_member':
      return `准备向「${action.workspaceName}」添加成员 ${action.keyword}，角色：${action.role === 'viewer' ? '只读' : '成员'}`
    case 'update_record_status':
      return `准备把「${action.workspaceName}」中匹配“${action.keyword}”的记录更新为 ${action.status}`
    case 'navigate_members':
      return `准备打开「${action.workspaceName}」的人员管理页面。`
    default:
      return ''
  }
}

export default function AiAssistantPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(0)
  const [inputText, setInputText] = useState('')
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: Date.now(),
      role: 'assistant',
      content: '你好，我可以通过语音或文字帮你创建记录、更新记录状态、添加和管理空间人员。',
    },
  ])
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [recording, setRecording] = useState(false)
  const [executing, setExecuting] = useState(false)

  const writableWorkspaces = useMemo(
    () => workspaces.filter((item) => canCreateRecord(item.role)),
    [workspaces]
  )

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((item) => item.id === selectedWorkspaceId) || workspaces[0]
  }, [selectedWorkspaceId, workspaces])

  const workspaceNames = useMemo(() => workspaces.map((item) => item.name), [workspaces])
  const selectedWorkspaceIndex = useMemo(() => {
    if (!selectedWorkspace) return 0
    return Math.max(0, workspaces.findIndex((item) => item.id === selectedWorkspace.id))
  }, [selectedWorkspace, workspaces])

  const pushMessage = (role: AssistantMessage['role'], content: string) => {
    setMessages((current) => [
      ...current,
      {
        id: Date.now() + Math.random(),
        role,
        content,
      },
    ])
  }

  const loadData = async () => {
    const token = getStoredToken()

    if (!token) {
      Taro.redirectTo({
        url: '/pages/login/index',
      })
      return
    }

    try {
      const data = await getWorkspaces()
      setWorkspaces(data || [])
      const firstWorkspace = selectedWorkspaceId
        ? (data || []).find((item) => item.id === selectedWorkspaceId)
        : data?.[0]
      const nextWorkspaceId = firstWorkspace?.id || 0
      setSelectedWorkspaceId(nextWorkspaceId)

      if (nextWorkspaceId) {
        const memberData = await getWorkspaceMembers(nextWorkspaceId)
        setMembers(memberData || [])
      }
    } catch (err) {
      console.error(err)
    }
  }

  useDidShow(() => {
    loadData()
  })

  const parseCommand = (text: string): PendingAction | null => {
    const command = text.trim()

    if (!command) return null

    if (/管理.*(成员|人员)|查看.*(成员|人员)/.test(command)) {
      const workspace = matchWorkspace(command, workspaces, selectedWorkspace)
      if (!workspace) return null
      return {
        type: 'navigate_members',
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        role: workspace.role,
      }
    }

    if (/(添加|邀请|加入).*(成员|人员)|添加\s*U\d+/i.test(command)) {
      const workspace = matchWorkspace(command, workspaces, selectedWorkspace)
      const keyword = parseMemberKeyword(command)

      if (!workspace || !keyword) return null

      return {
        type: 'add_member',
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        keyword,
        role: /只读|观察者|查看者|viewer/i.test(command) ? 'viewer' : 'member',
      }
    }

    if (/(完成|标记|取消|作废|关闭|进行中|开始).*(记录|任务)/.test(command)) {
      const workspace = matchWorkspace(command, workspaces, selectedWorkspace)
      const keyword = command
        .replace(/(把|将|请|帮我)/g, '')
        .replace(/(记录|任务).*/g, '')
        .replace(/(完成|标记|取消|作废|关闭|进行中|开始)/g, '')
        .trim()

      if (!workspace || !keyword) return null

      return {
        type: 'update_record_status',
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        keyword,
        status: statusFromCommand(command),
      }
    }

    if (/(创建|新建|添加).*(记录|任务)/.test(command)) {
      const writableFallback = writableWorkspaces.find((item) => item.id === selectedWorkspace?.id) || writableWorkspaces[0]
      const workspace = matchWorkspace(command, writableWorkspaces, writableFallback)
      const assignee = matchMember(command, members)
      const title = removeCommandWords(command) || command

      if (!workspace || !title) return null

      return {
        type: 'create_record',
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        title,
        assigneeId: assignee?.user_id,
        assigneeName: assignee ? getWechatDisplayName(assignee) : undefined,
        dueAt: parseDueAt(command),
      }
    }

    return null
  }

  const handleAnalyze = (text = inputText) => {
    const command = text.trim()

    if (!command) {
      Taro.showToast({ title: '请先说出或输入指令', icon: 'none' })
      return
    }

    pushMessage('user', command)
    const action = parseCommand(command)

    if (!action) {
      setPendingAction(null)
      pushMessage('assistant', '我还没有理解这条指令。你可以尝试：“创建记录 明天 18 点前跟进报价”或“添加成员 U000123”。')
      return
    }

    setPendingAction(action)
    pushMessage('assistant', `${actionSummary(action)} 请确认后执行。`)
  }

  const handleExecute = async () => {
    if (!pendingAction || executing) return

    try {
      setExecuting(true)
      Taro.showLoading({ title: '执行中', mask: true })

      if (pendingAction.type === 'create_record') {
        const record = await createRecord({
          workspace_id: pendingAction.workspaceId,
          title: pendingAction.title,
          content: pendingAction.content || '由 AI 语音助理创建',
          assignee_id: pendingAction.assigneeId,
          due_at: pendingAction.dueAt,
        })
        Taro.hideLoading()
        pushMessage('assistant', `已创建记录「${record.title}」。`)
        setPendingAction(null)
        Taro.navigateTo({ url: `/pages/record-detail/index?id=${record.id}` })
        return
      }

      if (pendingAction.type === 'add_member') {
        const workspace = workspaces.find((item) => item.id === pendingAction.workspaceId)
        if (!canManageMembers(workspace?.role)) {
          Taro.hideLoading()
          pushMessage('assistant', `你没有「${pendingAction.workspaceName}」的人员管理权限。`)
          return
        }

        await addWorkspaceMember(pendingAction.workspaceId, {
          keyword: pendingAction.keyword,
          role: pendingAction.role,
        })
        Taro.hideLoading()
        pushMessage('assistant', `已向「${pendingAction.workspaceName}」添加成员 ${pendingAction.keyword}。`)
        setPendingAction(null)
        await loadData()
        return
      }

      if (pendingAction.type === 'update_record_status') {
        const result = await getRecords({
          workspace_id: pendingAction.workspaceId,
          keyword: pendingAction.keyword,
          page: 1,
          page_size: 1,
        })
        const record = result.items?.[0]

        if (!record) {
          Taro.hideLoading()
          pushMessage('assistant', `没有找到匹配“${pendingAction.keyword}”的记录。`)
          return
        }

        await updateRecordStatus(record.id, pendingAction.status)
        Taro.hideLoading()
        pushMessage('assistant', `已更新记录「${record.title}」的状态。`)
        setPendingAction(null)
        return
      }

      if (pendingAction.type === 'navigate_members') {
        Taro.hideLoading()
        Taro.navigateTo({
          url: `/pages/workspace-members/index?workspace_id=${pendingAction.workspaceId}&name=${encodeURIComponent(pendingAction.workspaceName)}&role=${pendingAction.role}`,
        })
      }
    } catch (err) {
      console.error(err)
      Taro.hideLoading()
    } finally {
      setExecuting(false)
    }
  }

  const handleVoice = () => {
    const plugin = safeRequireWechatSI()
    const manager = plugin?.getRecordRecognitionManager?.()

    if (!manager) {
      Taro.showToast({
        title: '当前环境不支持语音识别，请输入文字指令',
        icon: 'none',
      })
      return
    }

    if (recording) {
      manager.stop()
      setRecording(false)
      return
    }

    const bindManagerEvent = (eventName: string, callback: (...args: any[]) => void) => {
      if (typeof manager[eventName] === 'function') {
        manager[eventName](callback)
      } else {
        manager[eventName] = callback
      }
    }

    bindManagerEvent('onStart', () => {
      setRecording(true)
      pushMessage('assistant', '我正在听，请说出你想创建或管理的事项。')
    })

    bindManagerEvent('onRecognize', (res) => {
      if (res?.result) {
        setInputText(res.result)
      }
    })

    bindManagerEvent('onStop', (res) => {
      setRecording(false)
      const result = String(res?.result || '').trim()
      if (result) {
        setInputText(result)
        handleAnalyze(result)
      } else {
        pushMessage('assistant', '没有识别到清晰语音，请再试一次或改用文字输入。')
      }
    })

    bindManagerEvent('onError', (err) => {
      console.error(err)
      setRecording(false)
      Taro.showToast({ title: '语音识别失败', icon: 'none' })
    })

    manager.start({ duration: 60000, lang: 'zh_CN' })
  }

  return (
    <View className='container ai-page'>
      <View className='ai-hero'>
        <View>
          <View className='page-title'>AI 语音助理</View>
          <View className='page-desc'>用自然语言创建记录、更新进度、添加或管理协作人员。</View>
        </View>
        <View className={recording ? 'voice-orb listening' : 'voice-orb'} onClick={handleVoice}>
          {recording ? '听' : '说'}
        </View>
      </View>

      <View className='workspace-picker-card'>
        <Text className='picker-label'>默认空间</Text>
        {workspaces.length === 0 ? (
          <View className='empty-workspace'>暂无空间，请先创建或加入空间</View>
        ) : (
          <Picker
            mode='selector'
            range={workspaceNames}
            value={selectedWorkspaceIndex}
            onChange={async (e) => {
              const next = workspaces[Number(e.detail.value)]
              if (!next) return
              setSelectedWorkspaceId(next.id)
              const data = await getWorkspaceMembers(next.id)
              setMembers(data || [])
            }}
          >
            <View className='picker-value'>{selectedWorkspace?.name || '请选择空间'}</View>
          </Picker>
        )}
      </View>

      <ScrollView className='message-list' scrollY>
        {messages.map((item) => (
          <View key={item.id} className={`message-row ${item.role}`}>
            <View className='message-bubble'>{item.content}</View>
          </View>
        ))}
      </ScrollView>

      {pendingAction && (
        <View className='pending-card'>
          <View className='pending-title'>待确认操作</View>
          <View className='pending-desc'>{actionSummary(pendingAction)}</View>
          <View className='pending-actions'>
            <View className='secondary-btn' onClick={() => setPendingAction(null)}>取消</View>
            <View className={executing ? 'primary-btn disabled' : 'primary-btn'} onClick={handleExecute}>
              {executing ? '执行中' : '确认执行'}
            </View>
          </View>
        </View>
      )}

      <View className='tips-card'>
        <View className='tips-title'>你可以这样说</View>
        {defaultTips.map((tip) => (
          <View key={tip} className='tip-item' onClick={() => setInputText(tip.replace(/^说“|”。$/g, ''))}>
            {tip}
          </View>
        ))}
      </View>

      <View className='input-card'>
        <Input
          className='command-input'
          value={inputText}
          placeholder='输入或语音识别后的指令'
          onInput={(e) => setInputText(e.detail.value)}
        />
        <View className='send-btn' onClick={() => handleAnalyze()}>
          解析
        </View>
      </View>
    </View>
  )
}
