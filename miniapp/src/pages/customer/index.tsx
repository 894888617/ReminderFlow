import { View, Input, Text } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { deleteCustomer, listCustomers, type Customer } from '../../api/customer'
import './select.scss'

export default function CustomerPage() {
  const r = useRouter()
  const cid = Number(r.params.calendar_id || 0)
  const [k, setK] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const customerList = useMemo(() => (Array.isArray(customers) ? customers : []), [customers])

  const load = async () => {
    if (!cid) {
      setCustomers([])
      setLoadError('请先选择日历空间')
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const res = await listCustomers(cid, k)
      const raw = (res as any)?.data?.data || (res as any)?.data?.list || (res as any)?.data?.items || res
      const list = Array.isArray(raw) ? raw : []
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

  return <View className='customer-select-page'>
    <View className='safe-top' />
    <View className='content-card'>
      <Input className='search-input' placeholder='搜索姓名/手机号/备注' value={k} onInput={(e) => setK(e.detail.value)} onConfirm={load} />
      <View className='item' onClick={() => Taro.navigateTo({ url: `/pages/customer/edit?calendar_id=${cid}` })}><Text>新增客户</Text></View>
      {!cid ? <Text className='empty'>请先选择日历空间</Text> : null}
      {cid && loading ? <Text className='empty'>客户加载中...</Text> : null}
      {cid && !loading && !!loadError ? <Text className='empty'>{loadError}</Text> : null}
      {cid && !loading && !loadError && !filteredCustomers[0] ? <Text className='empty'>暂无客户档案，新增后创建预约可快速填写客户信息</Text> : null}
      {cid && !loading && !loadError && filteredCustomers.map((i) => (
        <View key={i.id} className='item'>
          <Text>{i.name || '-'}</Text>
          <Text>{i.phone || '-'}</Text>
          <Text>{i.remark || '-'}</Text>
          <Text onClick={() => Taro.navigateTo({ url: `/pages/customer/edit?id=${i.id}&calendar_id=${cid}` })}>编辑</Text>
          <Text onClick={() => Taro.showModal({ title: '确认删除', success: (res) => { if (res.confirm) deleteCustomer(i.id).then(load) } })}>删除</Text>
        </View>
      ))}
    </View>
  </View>
}
