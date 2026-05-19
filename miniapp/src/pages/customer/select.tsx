import { View, Input, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { listCustomers, type Customer } from '../../api/customer'

export default function CustomerSelectPage() {
  const r = useRouter()
  const cid = Number(r.params.calendar_id || 0)
  const [k, setK] = useState('')
  const [list, setList] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!cid) return
    setLoading(true)
    try {
      const data = await listCustomers(cid, k)
      setList(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setList([])
      Taro.showToast({ title: '加载客户失败', icon: 'none' })
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

  return <View style='padding:24rpx'>
    <Input value={k} onInput={e => setK(e.detail.value)} onConfirm={load} placeholder='搜索姓名/手机号/备注' />
    {(filtered || []).length === 0 && !loading ? <Text>暂无客户档案，可手动填写客户信息。</Text> : null}
    {(filtered || []).map(i => <View key={i.id} onClick={() => {
      const ch = (getCurrentPages().slice(-2)[0] as any)
      const evt = ch?.getOpenerEventChannel?.()
      evt?.emit('customerSelected', {
        customer_id: i.id,
        customer_name: i.name || '',
        customer_phone: i.phone || '',
        customer_remark: i.remark || '',
      })
      Taro.navigateBack()
    }}>{i.name || '-'} {i.phone || ''} {i.remark || ''}</View>)}
  </View>
}
