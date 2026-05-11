import { View, Text } from '@tarojs/components'
import './index.scss'

interface Props {
  text?: string
}

export default function LoadingBox({ text = '加载中...' }: Props) {
  return (
    <View className='loading-box'>
      <Text>{text}</Text>
    </View>
  )
}
