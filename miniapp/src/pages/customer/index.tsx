import { View, Input, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { archiveCustomer, listCustomers, unarchiveCustomer, updateCustomer, type Customer } from '../../api/customer'
import './index.scss'

type EditableField = 'name' | 'phone' | 'remark'

export default function CustomerPage() {
  const r = useRouter()
  const [cid, setCid] = useState(0)
  const [k, setK] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [editingCell, setEditingCell] = useState<{ customerId: number; field: EditableField } | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [archivedMode, setArchivedMode] = useState(false)

  const customerList = useMemo(() => (Array.isArray(customers) ? customers : []), [customers])

  const load = async () => {
    const currentCid = Number(r.params.calendar_id || Taro.getStorageSync('current_calendar_id') || 0)
    setCid(currentCid)
    if (!currentCid) {
      setCustomers([])
      setLoadError('请先选择日历空间')
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const res = await listCustomers(currentCid, k, archivedMode)
      const list = Array.isArray(res) ? res : []
      setCustomers(list)
    } catch (err) {
      console.error(err)
      setCustomers([])
      setLoadError('客户列表加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useDidShow(load)
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivedMode])

  const filteredCustomers = useMemo(() => {
    const kw = k.trim().toLowerCase()
    if (!kw) return customerList
    return customerList.filter((i) => {
      const name = String(i.name || '').toLowerCase()
      const phone = String(i.phone || '').toLowerCase()
      const remark = String(i.remark || '').toLowerCase()
      return name.includes(kw) || phone.includes(kw) || remark.includes(kw)
    })
  }, [customerList, k])

  const beginEdit = (customer: Customer, field: EditableField) => {
    if (archivedMode) return
    setEditingCell({ customerId: customer.id, field })
    setEditingValue(String(customer[field] || ''))
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditingValue('')
  }

  const saveEdit = async (customer: Customer) => {
    if (!editingCell || editingCell.customerId !== customer.id || saving) return
    const field = editingCell.field
    const nextValue = editingValue.trim()
    const prevValue = String(customer[field] || '').trim()
    if (nextValue === prevValue) {
      cancelEdit()
      return
    }

    if (field === 'phone' && nextValue) {
      const existed = customerList.some((item) => item.id !== customer.id && String(item.phone || '').trim() === nextValue)
      if (existed) {
        Taro.showToast({ title: '该手机号客户已存在', icon: 'none' })
        return
      }
    }

    setSaving(true)
    try {
      if (field === 'name' && !nextValue) {
        Taro.showToast({ title: '姓名不能为空', icon: 'none' })
        return
      }
      await updateCustomer(customer.id, {
        calendar_id: cid,
        name: field === 'name' ? nextValue : String(customer.name || '').trim(),
        phone: field === 'phone' ? nextValue : String(customer.phone || '').trim(),
        remark: field === 'remark' ? nextValue : String(customer.remark || '').trim(),
      })
      setCustomers((prev) => prev.map((item) => (item.id === customer.id ? { ...item, [field]: nextValue } : item)))
      cancelEdit()
      Taro.showToast({ title: '修改成功', icon: 'success' })
    } catch (err: any) {
      console.error(err)
      const message = String(err?.message || '')
      if (field === 'phone' && (message.includes('exist') || message.includes('已存在') || message.includes('duplicate'))) {
        Taro.showToast({ title: '该手机号客户已存在', icon: 'none' })
      } else {
        Taro.showToast({ title: '修改失败，请稍后重试', icon: 'none' })
      }
    } finally {
      setSaving(false)
    }
  }

  const renderEditableCell = (customer: Customer, field: EditableField) => {
    const isEditing = editingCell?.customerId === customer.id && editingCell.field === field
    if (isEditing) {
      return (
        <Input
          className='edit-input'
          value={editingValue}
          maxlength={field === 'phone' ? 20 : 100}
          focus
          onInput={(e) => setEditingValue(e.detail.value)}
          onBlur={() => saveEdit(customer)}
          onConfirm={() => saveEdit(customer)}
        />
      )
    }
    return (
      <Text
        className={`customer-table-text ${field === 'remark' ? 'customer-table-remark' : ''}`}
        onLongPress={() => beginEdit(customer, field)}
        onDoubleClick={() => beginEdit(customer, field)}
      >
        {String(customer[field] || '-')}
      </Text>
    )
  }

  const onArchive = (id: number) => {
    Taro.showModal({
      title: '确认归档',
      content: '确认归档该客户吗？归档后默认列表将不再显示，但可以在归档列表中恢复。',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await archiveCustomer(id)
          Taro.showToast({ title: '归档成功', icon: 'success' })
          await load()
        } catch (err) {
          console.error(err)
          Taro.showToast({ title: '操作失败，请稍后重试', icon: 'none' })
        }
      },
    })
  }

  const onUnarchive = (id: number) => {
    Taro.showModal({
      title: '确认取消归档',
      content: '确认将该客户恢复到客户列表吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await unarchiveCustomer(id)
          Taro.showToast({ title: '已恢复', icon: 'success' })
          await load()
        } catch (err) {
          console.error(err)
          Taro.showToast({ title: '操作失败，请稍后重试', icon: 'none' })
        }
      },
    })
  }

  const showNoSearchResult = cid && !loading && !loadError && !!k.trim() && filteredCustomers.length === 0
  const showEmpty = cid && !loading && !loadError && !k.trim() && customerList.length === 0

  const currentCountLabel = archivedMode ? '归档客户' : '客户数量'

  return <View className='customer-page'>
    <View className='safe-top' />
    <View className='customer-content-card'>
      <View className='customer-search-row'>
        <Input className='customer-search-input' placeholder='搜索姓名/手机号/备注' value={k} onInput={(e) => setK(e.detail.value)} onConfirm={load} />
        <Text
          className='customer-archive-pill'
          onClick={() => {
            setArchivedMode((prev) => !prev)
            setEditingCell(null)
            setEditingValue('')
          }}
        >
          {archivedMode ? '返回列表' : '查看归档'}
        </Text>
      </View>
      {!loading && !loadError && cid ? <Text className='customer-mode-count'>{currentCountLabel}：{customerList.length}</Text> : null}
      {!cid ? <Text className='customer-empty'>请先选择日历空间</Text> : null}
      {cid && loading ? <Text className='customer-loading'>客户加载中...</Text> : null}
      {cid && !loading && !!loadError ? <Text className='customer-error'>{loadError}</Text> : null}
      {showEmpty ? <Text className='customer-empty'>{archivedMode ? '暂无归档客户' : '暂无客户档案，创建预约时保存客户后会自动出现在这里'}</Text> : null}
      {showNoSearchResult ? <Text className='customer-empty'>未找到匹配客户</Text> : null}
      {cid && !loading && !loadError && filteredCustomers.length > 0 ? <View className='customer-table-card'>
        <View className='customer-table'>
          <View className='customer-table-header'>
            <Text className='customer-table-cell'>姓名</Text>
            <Text className='customer-table-cell'>手机号</Text>
            <Text className='customer-table-cell'>备注</Text>
            <Text className='customer-table-cell'>操作</Text>
          </View>
          <View className='customer-table-body'>
            {filteredCustomers.map((i) => (
              <View key={i.id} className='customer-table-row'>
                <View className='customer-table-cell'>{renderEditableCell(i, 'name')}</View>
                <View className='customer-table-cell customer-table-phone'>{renderEditableCell(i, 'phone')}</View>
                <View className='customer-table-cell'>{renderEditableCell(i, 'remark')}</View>
                <View className='customer-table-cell'>
                  {archivedMode ? (
                    <Text className='customer-delete-btn' onClick={() => onUnarchive(i.id)}>取消归档</Text>
                  ) : (
                    <Text className='customer-delete-btn' onClick={() => onArchive(i.id)}>归档</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      </View> : null}
    </View>
  </View>
}
