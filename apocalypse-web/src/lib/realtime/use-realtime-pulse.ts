import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useAuthStore } from '@/stores/auth'

export const DEFAULT_REALTIME_SSE_URL = '/api/system/realtime/stream'

export interface SseFrame {
  event: string
  data: string
}

export interface RealtimePulseOptions {
  /** 需要随实时脉冲自动刷新的 React Query Key 列表。 */
  queryKeys: readonly QueryKey[]
  /** 可选 SSE 端点（默认 '/api/system/realtime/stream'）；传空串时仅启用可见性脉冲与心跳。 */
  sseUrl?: string
  /** 监听的 SSE 事件名列表（默认 ['message', 'pulse', 'invalidate']）。 */
  eventNames?: readonly string[]
  /** 是否启用订阅（默认 true）。 */
  enabled?: boolean
  /** 切回前台标签页时的最小刷新间隔（毫秒，默认 15_000）。 */
  minVisibilityIntervalMs?: number
  /** 可选轮询兜底间隔（毫秒，0 表示关闭轮询兜底）。 */
  pollIntervalMs?: number
  /** SSE 断线重连基础退避时间（毫秒，默认 2_000）。 */
  baseRetryMs?: number
  /** SSE 断线重连最大退避时间（毫秒，默认 30_000）。 */
  maxRetryMs?: number
}

export function computeBackoffDelay(
  attempt: number,
  baseRetryMs = 2_000,
  maxRetryMs = 30_000,
): number {
  const safeAttempt = Math.max(0, Math.min(attempt, 10))
  return Math.min(maxRetryMs, baseRetryMs * 2 ** safeAttempt)
}

/**
 * 解析增量 SSE 文本块（支持 LF 与 CRLF 分帧）。
 */
export function parseSseChunk(
  buffer: string,
  chunk: string,
): { events: SseFrame[]; remainder: string } {
  const combined = (buffer + chunk).replace(/\r\n/g, '\n')
  const blocks = combined.split('\n\n')
  const remainder = blocks.pop() ?? ''
  const events: SseFrame[] = []

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of trimmed.split('\n')) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim() || 'message'
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart())
      }
    }
    if (dataLines.length > 0 || eventName !== 'message') {
      events.push({ event: eventName, data: dataLines.join('\n') })
    }
  }

  return { events, remainder }
}

export interface RealtimePulseSubscriptionContext extends RealtimePulseOptions {
  queryClient: Pick<ReturnType<typeof useQueryClient>, 'invalidateQueries'>
  accessToken: string | null
  sessionEpoch: number
  authorizationDeadline: number
  fetchImpl?: typeof fetch
}

export function startRealtimePulseSubscription({
  queryClient,
  accessToken,
  sessionEpoch,
  authorizationDeadline,
  queryKeys,
  sseUrl = DEFAULT_REALTIME_SSE_URL,
  eventNames = ['message', 'pulse', 'invalidate'],
  enabled = true,
  minVisibilityIntervalMs = 15_000,
  pollIntervalMs = 0,
  baseRetryMs = 2_000,
  maxRetryMs = 30_000,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : undefined,
}: RealtimePulseSubscriptionContext): () => void {
  if (!enabled || !accessToken || queryKeys.length === 0) return () => {}
  if (Number.isFinite(authorizationDeadline) && performance.now() >= authorizationDeadline) {
    return () => {}
  }

  let disposed = false
  let abortController: AbortController | null = null
  let source: EventSource | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null
  let retryAttempt = 0
  let lastPulseAt = performance.now()

  const isSessionValid = () => {
    if (disposed) return false
    const state = useAuthStore.getState()
    if (!state.tokens?.accessToken || state.sessionEpoch !== sessionEpoch) return false
    if (
      Number.isFinite(state.authorizationDeadline) &&
      performance.now() >= state.authorizationDeadline
    ) {
      return false
    }
    return true
  }

  const triggerPulse = () => {
    if (!isSessionValid()) return
    lastPulseAt = performance.now()
    for (const queryKey of queryKeys) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }

  const closeSource = () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    if (source) {
      source.close()
      source = null
    }
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  const scheduleReconnect = () => {
    closeSource()
    if (!isSessionValid()) return
    const delay = computeBackoffDelay(retryAttempt++, baseRetryMs, maxRetryMs)
    retryTimer = setTimeout(connectSse, delay)
  }

  const connectFetchStream = async (controller: AbortController) => {
    if (!fetchImpl) return
    try {
      const response = await fetchImpl(sseUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        scheduleReconnect()
        return
      }
      retryAttempt = 0
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (!controller.signal.aborted && isSessionValid()) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const parsed = parseSseChunk(buffer, chunk)
        buffer = parsed.remainder
        for (const frame of parsed.events) {
          if (eventNames.includes(frame.event)) {
            triggerPulse()
          }
        }
      }
      if (!controller.signal.aborted && isSessionValid()) {
        scheduleReconnect()
      }
    } catch {
      if (!controller.signal.aborted && isSessionValid()) {
        scheduleReconnect()
      }
    }
  }

  const connectSse = () => {
    if (!sseUrl || !isSessionValid()) return
    closeSource()
    if (fetchImpl) {
      const controller = new AbortController()
      abortController = controller
      void connectFetchStream(controller)
      return
    }
    if (typeof EventSource !== 'undefined') {
      try {
        const instance = new EventSource(sseUrl, { withCredentials: true })
        source = instance
        instance.onopen = () => {
          retryAttempt = 0
        }
        const handleEvent = () => {
          triggerPulse()
        }
        for (const eventName of eventNames) {
          instance.addEventListener(eventName, handleEvent)
        }
        instance.onerror = () => {
          scheduleReconnect()
        }
      } catch {
        closeSource()
      }
    }
  }

  connectSse()

  const unsubscribeAuth = useAuthStore.subscribe(() => {
    if (!isSessionValid()) {
      closeSource()
    }
  })

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
    if (performance.now() - lastPulseAt >= minVisibilityIntervalMs) {
      triggerPulse()
    }
  }

  if (typeof document !== 'undefined' && minVisibilityIntervalMs > 0) {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  if (pollIntervalMs > 0) {
    pollTimer = setInterval(triggerPulse, pollIntervalMs)
  }

  if (Number.isFinite(authorizationDeadline)) {
    const remaining = Math.max(
      0,
      Math.min(authorizationDeadline - performance.now(), 2_147_483_647),
    )
    deadlineTimer = setTimeout(() => {
      closeSource()
    }, remaining)
  }

  return () => {
    disposed = true
    unsubscribeAuth()
    closeSource()
    if (pollTimer !== null) clearInterval(pollTimer)
    if (deadlineTimer !== null) clearTimeout(deadlineTimer)
    if (typeof document !== 'undefined' && minVisibilityIntervalMs > 0) {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
}

/**
 * 实时活水订阅源（FE-W7 / M1）：
 * - 将 Bearer 鉴权 SSE 推送、标签页前台唤醒脉冲与可选轮询收敛为统一的 Query 失效触发器；
 * - 严格受 sessionEpoch 与 authorizationDeadline 约束：登出、切换身份或授权到期时立即物理断开，防止跨会话串流；
 * - 内置指数退避重连，避免网络抖动引发重连风暴。
 */
export function useRealtimePulse({
  queryKeys,
  sseUrl = DEFAULT_REALTIME_SSE_URL,
  eventNames = ['message', 'pulse', 'invalidate'],
  enabled = true,
  minVisibilityIntervalMs = 15_000,
  pollIntervalMs = 0,
  baseRetryMs = 2_000,
  maxRetryMs = 30_000,
}: RealtimePulseOptions): void {
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null)
  const sessionEpoch = useAuthStore((state) => state.sessionEpoch)
  const authorizationEpoch = useAuthStore((state) => state.authorizationEpoch)
  const authorizationDeadline = useAuthStore((state) => state.authorizationDeadline)

  useEffect(
    () =>
      startRealtimePulseSubscription({
        queryClient,
        accessToken,
        sessionEpoch,
        authorizationDeadline,
        queryKeys,
        sseUrl,
        eventNames,
        enabled,
        minVisibilityIntervalMs,
        pollIntervalMs,
        baseRetryMs,
        maxRetryMs,
      }),
    [
      accessToken,
      authorizationDeadline,
      authorizationEpoch,
      baseRetryMs,
      enabled,
      eventNames,
      maxRetryMs,
      minVisibilityIntervalMs,
      pollIntervalMs,
      queryClient,
      queryKeys,
      sessionEpoch,
      sseUrl,
    ],
  )
}
