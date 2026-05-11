import { View } from '@tarojs/components'
import './index.scss'

interface Props {
  onClick: () => void
  text?: string
}

export default function PageRefresh({
                                      onClick,
                                      text = '刷新',
                                    }: Props) {
  return (
    <View className='page-refresh-btn' onClick={onClick}>
      {text}
    </View>
  )
}
