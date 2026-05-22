import { View, Input, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { listCustomers, type Customer } from '../../api/customer'
import './select.scss'

export default function CustomerSelectPage() {
  const r = useRouter()
  const cid = Number(r.params.calendar_id || Taro.getStorageSync('current_calendar_id') || 0)
  const [k, setK] = useState('')
  const [list, setList] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const load = async () => {
    if (!cid) {
      setList([])
      setLoadError('请先选择日历空间')
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const data = await listCustomers(cid, k)
      const raw = (data as any)?.data?.data || (data as any)?.data?.list || (data as any)?.data?.items || data
      const safeList = Array.isArray(raw) ? raw : []
      setList(safeList)
    } catch (e) {
      console.error(e)
      setList([])
      setLoadError('客户列表加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useDidShow(load)

  const keyword = useMemo(() => k.trim().toLowerCase(), [k])
  const filtered = useMemo(() => (list || []).filter((i) => {
    if (!keyword) return true
    return `${i.name || ''}${i.phone || ''}${i.remark || ''}`.toLowerCase().includes(keyword)
  }), [list, keyword])

  const handleSelectCustomer = (customer: Customer) => {
    const customerId = Number(customer?.id || 0)
    if (!customerId) {
      Taro.showToast({ title: '客户数据异常，无法选择', icon: 'none' })
      return
    }
    Taro.setStorageSync('record_selected_customer', {
      id: customerId,
      name: customer.name || '',
      phone: customer.phone || '',
      remark: customer.remark || '',
    })
    Taro.navigateBack()
  }

  return <View className='customer-select-page'>
    <View className='safe-top' />
    <View className='customer-select-card'>
      <Input className='customer-select-search' value={k} onInput={e => setK(e.detail.value)} onConfirm={load} placeholder='搜索姓名/手机号/备注' />
      {!cid ? <Text className='customer-select-empty'>请先选择日历空间</Text> : null}
      {cid && loading ? <Text className='customer-select-loading'>客户加载中...</Text> : null}
      {cid && !loading && !!loadError ? <Text className='customer-select-error'>{loadError}</Text> : null}
      {cid && !loading && !loadError && !filtered[0] ? <Text className='customer-select-empty'>暂无客户档案，可手动填写客户信息</Text> : null}

      {cid && !loading && !loadError && filtered.length > 0 ? (
        <View className='customer-select-table-card'>
          <View className='customer-select-table'>
            <View className='customer-select-header'>
              <Text className='customer-select-cell'>姓名</Text>
              <Text className='customer-select-cell'>手机号</Text>
              <Text className='customer-select-cell'>备注</Text>
              <Text className='customer-select-cell'>操作</Text>
            </View>
            <View className='customer-select-body'>
              {filtered.map(i => (
                <View className='customer-select-row' key={i.id}>
                  <Text className='customer-select-cell'>{i.name || '-'}</Text>
                  <Text className='customer-select-cell customer-select-phone'>{i.phone || '-'}</Text>
                  <Text className='customer-select-cell customer-select-remark'>{i.remark || '-'}</Text>
                  <View className='customer-select-cell'>
                    <Text className='customer-select-action-btn' onClick={() => handleSelectCustomer(i)}>选择</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  </View>
}
