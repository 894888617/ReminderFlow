import { View, Input, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { listCustomers, type Customer } from '../../api/customer'
import './select.scss'

export default function CustomerSelectPage() {
  const r = useRouter()
  const cid = Number(r.params.calendar_id || 0)
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

  return <View className='customer-select-page'>
    <View className='safe-top' />
    <View className='content-card'>
      <Input className='search-input' value={k} onInput={e => setK(e.detail.value)} onConfirm={load} placeholder='搜索姓名/手机号/备注' />
      {!cid ? <Text className='empty'>请先选择日历空间</Text> : null}
      {cid && loading ? <Text className='empty'>客户加载中...</Text> : null}
      {cid && !loading && !!loadError ? <Text className='empty'>{loadError}</Text> : null}
      {cid && !loading && !loadError && !filtered[0] ? <Text className='empty'>暂无客户档案，可手动填写客户信息</Text> : null}
      {(filtered || []).map(i => <View className='item' key={i.id} onClick={() => {
      const ch = (getCurrentPages().slice(-2)[0] as any)
      const evt = ch?.getOpenerEventChannel?.()
      evt?.emit('customerSelected', {
        customer_id: i.id,
        customer_name: i.name || '',
        customer_phone: i.phone || '',
        customer_remark: i.remark || '',
      })
      Taro.navigateBack()
      }}><Text>{i.name || '-'}</Text><Text>{i.phone || ''}</Text><Text>{i.remark || ''}</Text></View>)}
    </View>
  </View>
}
