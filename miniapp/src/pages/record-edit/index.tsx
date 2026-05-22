import { View, Text, Input, Textarea, Picker, Checkbox, CheckboxGroup } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useMemo, useState } from 'react'

import { getRecordDetail, updateRecord, type RecordItem } from '../../api/record'
import { listCalendarMembers, type CalendarMember } from '../../api/calendar'
import { canEditRecord } from '../../utils/permission'
import { getStoredToken } from '../../utils/auth'
import { getUserNameDisplay } from '../../utils/userDisplay'
import { normalizeRecordStatus, type RecordStatus } from '../../utils/recordStatus'
import { returnToCalendar, saveCalendarReturnContext } from '../../utils/calendarReturn'
import './index.scss'

function buildDateTime(date: string, time = '00:00') { if (!date) return undefined; return `${date}T${time}:00+08:00` }
function splitDateTime(value?: string | null) { if (!value) return { date: '', time: '' }; const n = value.replace('T', ' '); return { date: n.slice(0, 10), time: n.slice(11, 16) } }

export default function RecordEditPage() {
  const router = useRouter(); const recordId = Number(router.params.id || 0)
  const [record, setRecord] = useState<RecordItem | null>(null); const [members, setMembers] = useState<CalendarMember[]>([])
  const [title, setTitle] = useState(''); const [content, setContent] = useState(''); const [assigneeId, setAssigneeId] = useState<number | undefined>()
  const [status, setStatus] = useState<RecordStatus>('PENDING'); const [appointmentDate, setAppointmentDate] = useState(''); const [startTime, setStartTime] = useState('')
  const [customerId, setCustomerId] = useState<number | undefined>(); const [customerName, setCustomerName] = useState(''); const [customerPhone, setCustomerPhone] = useState(''); const [projectName, setProjectName] = useState(''); const [saveToCustomer, setSaveToCustomer] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const editable = canEditRecord(record?.current_user_role || '')
  const memberOptions = useMemo(() => members.map((item) => ({ label: getUserNameDisplay(item), value: item.user_id })), [members])
  const selectedAssigneeIndex = useMemo(() => !assigneeId ? -1 : memberOptions.findIndex((item) => item.value === assigneeId), [memberOptions, assigneeId])
  const selectedAssigneeName = useMemo(() => !assigneeId ? '选择负责人' : (memberOptions.find((item) => item.value === assigneeId)?.label || '选择负责人'), [memberOptions, assigneeId])
  const statusOptions = [{ label: '待处理', value: 'PENDING' }, { label: '已完成', value: 'COMPLETED' }, { label: '已取消', value: 'CANCELLED' }] as const
  const statusIndex = Math.max(0, statusOptions.findIndex((item) => item.value === status))

  const loadData = async () => {
    const token = getStoredToken(); if (!token) { Taro.redirectTo({ url: '/pages/login/index' }); return }
    if (!recordId) return
    try {
      const detail = await getRecordDetail(recordId); setRecord(detail)
      setTitle(detail.title || ''); setContent(detail.content || ''); setAssigneeId(detail.assignee_id || undefined); setStatus(normalizeRecordStatus(detail.status))
      const start = splitDateTime(detail.calendar_start_at || detail.due_at); setAppointmentDate(start.date); setStartTime(start.time)
      setCustomerId(detail.customer_id || undefined); setCustomerName(detail.customer_name || ''); setCustomerPhone(detail.customer_phone || ''); setProjectName(detail.project_name || detail.service_name || '')
      setSaveToCustomer(false)
      const memberList = await listCalendarMembers(detail.calendar_id || 0); setMembers(memberList || [])
    } catch (err: any) {
      console.error(err); Taro.showToast({ title: err?.statusCode === 404 ? '记录不存在或已被删除' : '记录加载失败，请稍后重试', icon: 'none' })
    }
  }
  useDidShow(loadData)

  const handleSubmit = async () => {
    if (!editable || submitting || !record) return
    setSubmitting(true)
    const normalizedStatus = normalizeRecordStatus(status)
    const payloadBase: any = {
      calendar_id: record.calendar_id,
      title: title.trim() || '预约记录',
      customer_id: customerId ?? null,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_remark: null,
      save_customer_to_library: customerId ? false : saveToCustomer,
      project_id: record.project_id || null,
      project_name: projectName.trim(),
      assignee_id: assigneeId,
      appointment_date: appointmentDate || undefined,
      start_time: startTime || undefined,
      status: normalizedStatus,
      content: content.trim(),
      due_at: buildDateTime(appointmentDate, startTime),
      calendar_start_at: buildDateTime(appointmentDate, startTime),
      calendar_end_at: null,
      calendar_all_day: !startTime,
    }
    try {
      await updateRecord(recordId, payloadBase)
      Taro.showToast({ title: '保存成功', icon: 'success' })
      saveCalendarReturnContext({ currentCalendarId: record.calendar_id, current_date: appointmentDate, selected_date: appointmentDate })
      setTimeout(() => returnToCalendar({ currentCalendarId: record.calendar_id, currentDate: appointmentDate, selectedDate: appointmentDate }), 300)
    } catch (err: any) {
      console.error(err)
      if (err?.code === 'CUSTOMER_PHONE_EXISTS') {
        const customer = err?.customer || {}
        const modal = await Taro.showModal({ title: '手机号重复', content: '该手机号客户已存在，是否使用已有客户信息？', confirmText: '使用已有客户', cancelText: '不使用' })
        if (modal.confirm) {
          await updateRecord(recordId, { ...payloadBase, customer_id: Number(customer.id || 0) || null, customer_name: customer.name || customerName.trim(), customer_phone: customer.phone || customerPhone.trim(), customer_remark: null, save_customer_to_library: false })
          Taro.showToast({ title: '保存成功', icon: 'success' })
          setTimeout(() => returnToCalendar({ currentCalendarId: record.calendar_id, currentDate: appointmentDate, selectedDate: appointmentDate }), 300)
        }
      } else { Taro.showToast({ title: '保存失败，请稍后重试', icon: 'none' }) }
    } finally { setSubmitting(false) }
  }

  return <View className='container'><View className='form-card'>
    <View className='record-title-row'><Text className='form-label no-margin'>标题</Text>
      <View className='customer-file-btn' onClick={() => { if (!record?.calendar_id) return; const eventChannel = Taro.navigateTo({ url: `/pages/customer/select?calendar_id=${record.calendar_id}` } as any); Promise.resolve(eventChannel).then((res: any) => { res?.eventChannel?.on?.('customerSelected', (payload: any) => { setCustomerId(Number(payload?.customer_id || 0) || undefined); setCustomerName(payload?.customer_name || ''); setCustomerPhone(payload?.customer_phone || ''); setSaveToCustomer(false) }) }) }}>客户档案</View></View>
    <View className='form-item'><Input className='form-input title-input' value={title} onInput={(e) => setTitle(e.detail.value)} maxlength={200} placeholder='可留空自动生成 客户姓名 + 服务项目' /></View>
    <View className='grid-two'><View className='form-item compact-item'><Text className='form-label'>客户姓名</Text><Input className='form-input' value={customerName} onInput={(e) => setCustomerName(e.detail.value)} /></View><View className='form-item compact-item'><Text className='form-label'>客户手机号</Text><Input className='form-input' value={customerPhone} onInput={(e) => setCustomerPhone(e.detail.value)} /></View></View>
    <View className='grid-two'><View className='form-item compact-item'><Text className='form-label'>服务项目</Text><Input className='form-input' value={projectName} onInput={(e) => setProjectName(e.detail.value)} /></View><View className='form-item compact-item'><Text className='form-label'>负责人</Text><View className='assignee-box-wrap'>{memberOptions.length === 0 ? <View className='assignee-select-box placeholder'>暂无成员可选</View> : <Picker mode='selector' range={memberOptions.map((item) => item.label)} value={selectedAssigneeIndex >= 0 ? selectedAssigneeIndex : 0} onChange={(e) => { const selected = memberOptions[Number(e.detail.value)]; if (selected) setAssigneeId(selected.value) }}><View className={assigneeId ? 'assignee-select-box' : 'assignee-select-box placeholder'}>{selectedAssigneeName}</View></Picker>}{assigneeId ? <View className='assignee-clear' onClick={() => setAssigneeId(undefined)}>×</View> : null}</View></View></View>
    {customerId ? null : <View className='form-item compact-checkbox'><CheckboxGroup onChange={(e) => setSaveToCustomer((e.detail.value || []).includes('1'))}><Checkbox value='1' checked={saveToCustomer}>保存到客户库</Checkbox></CheckboxGroup></View>}
    <View className='grid-two'><View className='form-item compact-item'><Text className='form-label'>预约日期</Text><Picker mode='date' value={appointmentDate} onChange={(e) => setAppointmentDate(String(e.detail.value))}><View className='datetime-picker'>{appointmentDate || '选择预约日期'}</View></Picker></View><View className='form-item compact-item'><Text className='form-label'>开始时间（可选）</Text><Picker mode='time' value={startTime || '10:00'} onChange={(e) => setStartTime(String(e.detail.value))}><View className='datetime-picker'>{startTime || '选择开始时间'}</View></Picker></View></View>
    <View className='form-item'><Text className='form-label'>状态</Text><Picker mode='selector' range={statusOptions.map((i) => i.label)} value={statusIndex} onChange={(e) => setStatus(statusOptions[Number(e.detail.value)]?.value || 'PENDING')}><View className='picker-value'>{statusOptions[statusIndex].label}</View></Picker></View>
    <View className='form-item'><Text className='form-label'>备注</Text><Textarea className='form-textarea' value={content} onInput={(e) => setContent(e.detail.value)} maxlength={1000} /></View>
  </View><View className={submitting ? 'submit-btn disabled' : 'submit-btn'} onClick={handleSubmit}>{submitting ? '保存中...' : '保存修改'}</View></View>
}
