import { View, Text } from '@tarojs/components'
import './index.scss'

interface Props {
  text?: string
  tip?: string
}

export default function EmptyBox({
                                   text = '暂无数据',
                                   tip,
                                 }: Props) {
  return (
    <View className='empty-box'>
      <Text className='empty-title'>{text}</Text>
      {tip && <Text className='empty-tip'>{tip}</Text>}
    </View>
  )
}
