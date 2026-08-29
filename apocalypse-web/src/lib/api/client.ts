/**
 * axios 封装：baseURL `/api`（dev 经 vite proxy 剥前缀转发到 :8080）、
 * 响应拦截器统一解包 R、401/40100 → refresh → 重放原请求一次、错误统一抛 ApiError。
 *
 * 与 auth store 的耦合用注册式回调解开（client 不 import store，避免循环依赖）：
 * 应用启动时由 stores/auth.ts 调 configureClient 注入 token 获取、刷新、登出回调。
 */

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { CODE_SUCCESS, CODE_UNAUTHORIZED, type R } from './types'

/** 业务/系统统一错误。message 一律来自后端 R.message（中文直出），network 层给兜底文案。 */
export class ApiError extends Error {
  readonly code: number
  readonly traceId: string | null

  constructor(code: number, message: string, traceId: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.traceId = traceId
  }
}

// 自定义请求配置标记（anonymous=白名单端点不挂 token；_retried=401 重放标记）
declare module 'axios' {
  interface AxiosRequestConfig {
    /** 跳过 Authorization 头（登录/刷新等白名单端点）。 */
    anonymous?: boolean
    /** 内部：401/40100 已重放标记，禁止外部传。 */
    _retried?: boolean
  }
}

interface ClientHooks {
  /** 取当前 accessToken。 */
  getAccessToken: () => string | null
  /** 尝试刷新令牌（POST /auth/refresh，旋转机制）；返回是否成功。 */
  tryRefresh: () => Promise<boolean>
  /** 刷新失败或 401/40100 不可恢复时的登出+跳转处理。 */
  onUnauthorized: () => void
}

let hooks: ClientHooks = {
  getAccessToken: () => null,
  tryRefresh: () => Promise.resolve(false),
  onUnauthorized: () => {},
}

export function configureClient(next: ClientHooks): void {
  hooks = next
}

export const http = axios.create({
  baseURL: '/api',
  timeout: 15_000,
})

// 请求拦截：挂 Authorization（白名单除外）+ X-Trace-Id 透传
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!config.anonymous) {
    const token = hooks.getAccessToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  config.headers['X-Trace-Id'] = crypto.randomUUID()
  return config
})

/** 401/40100 统一处理链：tryRefresh 成功则重放原请求一次，否则登出。返回 null 表示已处理完（继续抛业务错）。 */
async function handleUnauthorized(
  config: InternalAxiosRequestConfig | undefined,
): Promise<unknown | null> {
  if (!config || config.anonymous) return null
  if (!config._retried && (await hooks.tryRefresh())) {
    return http.request({ ...config, _retried: true })
  }
  hooks.onUnauthorized()
  return null
}

// 响应拦截：解包 R；code!==0 转 ApiError；40100 走刷新重放链。
// 返回值用 `as never` 收窄——拦截器把 R.data 拍平为请求返回值，而 axios 静态类型仍以 AxiosResponse 表述。
http.interceptors.response.use(
  async (response) => {
    const envelope = response.data as R<unknown>
    if (envelope.code === CODE_SUCCESS) {
      return envelope.data as never
    }
    if (envelope.code === CODE_UNAUTHORIZED) {
      const retried = await handleUnauthorized(response.config)
      if (retried !== null) return retried as never
    }
    throw new ApiError(envelope.code, envelope.message || '请求失败', envelope.traceId ?? null)
  },
  async (error: AxiosError) => {
    if (error.response) {
      if (error.response.status === 401) {
        // HTTP 层未认证（过滤器直接拒绝，未走 R 包装）：按 40100 语义处理
        const retried = await handleUnauthorized(error.config)
        if (retried !== null) return retried as never
        throw new ApiError(CODE_UNAUTHORIZED, '未认证或凭证无效')
      }
      throw new ApiError(error.response.status, `服务异常（HTTP ${error.response.status}）`)
    }
    throw new ApiError(-1, '网络异常，请检查网络连接')
  },
)

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** JSON body。 */
  body?: unknown
  /** query 参数；undefined 值会被丢弃。 */
  query?: Record<string, string | number | undefined>
  /** 跳过 Authorization 头（登录等白名单端点）。 */
  anonymous?: boolean
}

/**
 * 发起请求并解包 R（响应拦截器已把 R.data 拍平为返回值）。
 * - code === 0：返回 data。
 * - 40100/HTTP 401：拦截器内先 tryRefresh，成功则原样重放一次；仍失败走 onUnauthorized 并抛错。
 * - 其他非 0：抛 ApiError（message 即后端中文文案）。
 */
export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // 响应拦截器已把 R.data 拍平为请求返回值；axios 1.19 的 AxiosResponseResult
  // 条件类型无法对泛型求值，这里显式收窄（仅类型层，运行行为不变）。
  return http.request({
    url: path,
    method: options.method ?? 'GET',
    data: options.body,
    params: options.query,
    anonymous: options.anonymous,
  }) as unknown as Promise<T>
}
