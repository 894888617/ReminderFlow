import Taro from '@tarojs/taro'
import { API_BASE_URL } from './config'
import { clearLoginSession, getStoredToken } from '../utils/auth'

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  auth?: boolean
  silent?: boolean
}

export async function request<T = any>(options: RequestOptions): Promise<T> {
  const token = getStoredToken()

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.auth !== false && token) {
    header.Authorization = `Bearer ${token}`
  }

  try {
    const res = await Taro.request({
      url: `${API_BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header,
      timeout: 15000,
    })

    const body: any = res.data

    if (res.statusCode === 401 || body?.code === 401) {
      clearLoginSession()

      if (!options.silent) {
        Taro.showToast({
          title: '登录已过期，请重新登录',
          icon: 'none',
        })
      }

      setTimeout(() => {
        Taro.redirectTo({
          url: '/pages/login/index',
        })
      }, 500)

      return Promise.reject(body)
    }

    if (body?.code !== 0) {
      if (!options.silent) {
        Taro.showToast({
          title: body?.msg || '请求失败',
          icon: 'none',
        })
      }

      return Promise.reject(body)
    }

    return body.data as T
  } catch (err) {
    if (!options.silent) {
      Taro.showToast({
        title: '网络异常',
        icon: 'none',
      })
    }

    return Promise.reject(err)
  }
}
