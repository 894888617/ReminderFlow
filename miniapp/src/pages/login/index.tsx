import { View, Text } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { wechatMiniLogin } from '../../api/auth'
import './index.scss'

export default function LoginPage() {
  const handleWechatLogin = async () => {
    let loadingShown = false

    try {
      const loginRes = await Taro.login()

      if (!loginRes.code) {
        Taro.showToast({
          title: '获取微信登录凭证失败',
          icon: 'none',
        })
        return
      }

      Taro.showLoading({
        title: '登录中',
        mask: true,
      })
      loadingShown = true

      const result = await wechatMiniLogin({
        code: loginRes.code,
      })

      Taro.setStorageSync('token', result.token)
      Taro.setStorageSync('user', result.user)

      Taro.showToast({
        title: '登录成功',
        icon: 'success',
      })

      const params = getCurrentInstance().router?.params || {}
      const redirect = params.redirect
        ? decodeURIComponent(String(params.redirect))
        : ''

      if (redirect) {
        Taro.redirectTo({
          url: redirect,
        })
      } else {
        Taro.switchTab({
          url: '/pages/home/index',
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (loadingShown) {
        Taro.hideLoading()
      }
    }
  }

  return (
    <View className='login-page'>
      <View className='login-card'>
        <Text className='login-title'>轻记协同</Text>

        <Text className='login-desc'>
          协同记录、定时提醒、状态跟踪，适合个人和小团队使用。
        </Text>

        <View className='wechat-btn' onClick={handleWechatLogin}>
          微信一键登录
        </View>

        <Text className='login-tip'>
          登录后即可创建空间、记录任务并设置提醒。
        </Text>
      </View>
    </View>
  )
}
