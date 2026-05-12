import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { getMe, MiniLoginParams, wechatMiniLogin } from '../../api/auth'
import { getStoredToken, navigateAfterLogin, saveLoginSession } from '../../utils/auth'
import { openPrivacyContract, requestPrivacyAuthorize } from '../../utils/wechatPrivacy'
import './index.scss'

const DEFAULT_LOGIN_NAME_TIP = '不填写将使用默认名称'

function getRedirectUrl() {
  const params = getCurrentInstance().router?.params || {}
  const redirect = params.redirect ? String(params.redirect) : ''

  if (!redirect) {
    return ''
  }

  try {
    return decodeURIComponent(redirect)
  } catch (err) {
    console.error('decode redirect failed', err)
    return ''
  }
}

export default function LoginPage() {
  const [nickname, setNickname] = useState('')
  const [privacyAgreed, setPrivacyAgreed] = useState(false)

  useEffect(() => {
    let canceled = false

    async function restoreSession() {
      const token = getStoredToken()

      if (!token) {
        return
      }

      try {
        const user = await getMe({ silent: true })

        if (canceled) {
          return
        }

        saveLoginSession({
          token,
          user,
        })

        navigateAfterLogin(getRedirectUrl())
      } catch (err) {
        console.error('restore login session failed', err)
      }
    }

    restoreSession()

    return () => {
      canceled = true
    }
  }, [])

  const handleNicknameInput = (event) => {
    setNickname(String(event.detail?.value || '').slice(0, 32))
  }

  const handlePrivacyClick = () => {
    setPrivacyAgreed((value) => !value)
  }

  const handleOpenPrivacy = async () => {
    try {
      await openPrivacyContract()
    } catch (err) {
      console.error('open privacy contract failed', err)
      Taro.showToast({
        title: '隐私协议暂时无法打开',
        icon: 'none',
      })
    }
  }

  const ensurePrivacyAuthorized = async () => {
    if (!privacyAgreed) {
      Taro.showToast({
        title: '请先同意隐私协议',
        icon: 'none',
      })
      return false
    }

    try {
      await requestPrivacyAuthorize()
      return true
    } catch (err) {
      console.error('privacy authorization denied', err)
      Taro.showToast({
        title: '需要同意隐私协议后登录',
        icon: 'none',
      })
      return false
    }
  }

  const handleWechatLogin = async () => {
    let loadingShown = false

    try {
      const privacyReady = await ensurePrivacyAuthorized()
      if (!privacyReady) return

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

      const trimmedNickname = nickname.trim()
      const loginParams: MiniLoginParams = {
        code: loginRes.code,
      }

      if (trimmedNickname) {
        loginParams.nickname = trimmedNickname
      }

      const result = await wechatMiniLogin(loginParams)

      saveLoginSession(result)

      Taro.showToast({
        title: '登录成功',
        icon: 'success',
      })

      navigateAfterLogin(getRedirectUrl())
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

        <View className='profile-form'>
          <Text className='field-label'>登录昵称（选填）</Text>
          <Input
            className='nickname-input'
            type='nickname'
            maxlength={32}
            placeholder={DEFAULT_LOGIN_NAME_TIP}
            value={nickname}
            onInput={handleNicknameInput}
          />
          <Text className='field-help'>
            微信登录不再自动返回头像昵称，可手动填写昵称；留空将使用系统默认名称。
          </Text>
        </View>

        <View className='privacy-row'>
          <View
            className={`privacy-checkbox ${privacyAgreed ? 'privacy-checkbox-checked' : ''}`}
            onClick={handlePrivacyClick}
          >
            {privacyAgreed ? '✓' : ''}
          </View>
          <Text className='privacy-text' onClick={handlePrivacyClick}>我已阅读并同意</Text>
          <Text className='privacy-link' onClick={handleOpenPrivacy}>《用户隐私保护指引》</Text>
        </View>

        <Button className='wechat-btn' onClick={handleWechatLogin}>
          微信登录
        </Button>

        <Text className='login-tip'>
          登录后即可创建空间、记录任务并设置提醒。
        </Text>
      </View>
    </View>
  )
}
