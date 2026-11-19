import { afterEach, describe, expect, it, vi } from 'vitest'

import { authorizationDeadline as computeAuthorizationDeadline } from '@/lib/query/authorization-snapshot'
import { useAuthStore } from '@/stores/auth'

import {
  computeBackoffDelay,
  getRealtimeConnectionStatus,
  parseSseChunk,
  startRealtimePulseSubscription,
} from './use-realtime-pulse'

describe('useRealtimePulse backoff and session contract (FE-W7 M1)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('computes exponential backoff capped at maxRetryMs', () => {
    expect(computeBackoffDelay(0, 2_000, 30_000)).toBe(2_000)
    expect(computeBackoffDelay(1, 2_000, 30_000)).toBe(4_000)
    expect(computeBackoffDelay(2, 2_000, 30_000)).toBe(8_000)
    expect(computeBackoffDelay(3, 2_000, 30_000)).toBe(16_000)
    expect(computeBackoffDelay(4, 2_000, 30_000)).toBe(30_000)
    expect(computeBackoffDelay(9, 2_000, 30_000)).toBe(30_000)
  })

  it('parses incremental SSE chunks across split boundaries and CRLF separators', () => {
    const first = parseSseChunk(
      '',
      'event: connected\r\ndata: {"topic":"connected"}\r\n\r\nevent: pulse\n',
    )
    expect(first.events).toEqual([{ event: 'connected', data: '{"topic":"connected"}' }])
    expect(first.remainder).toBe('event: pulse\n')

    const second = parseSseChunk(first.remainder, 'data: {"topic":"onlineChanged"}\n\n')
    expect(second.events).toEqual([{ event: 'pulse', data: '{"topic":"onlineChanged"}' }])
    expect(second.remainder).toBe('')
  })

  it('connects during a time-bounded grant (monotonic performance.now deadline << wall-clock Date.now), reconnects on disconnect, and aborts on deadline expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T05:45:00Z'))

    // Real authorizationDeadline uses performance.now() (monotonic ms, e.g. ~100ms << Date.now() 1.79e12)
    const requestStarted = performance.now()
    const receivedAt = requestStarted + 25
    const monotonicDeadline = computeAuthorizationDeadline(
      {
        authorizationSnapshotId: 'snap-time-bounded-1',
        evaluatedAt: '2026-11-10T05:45:00Z',
        nextTransitionAt: '2026-11-10T05:45:10Z',
      },
      requestStarted,
      receivedAt,
    )
    expect(monotonicDeadline).toBeLessThan(Date.now())

    useAuthStore.setState({
      tokens: {
        accessToken: 'test-token',
        refreshToken: '',
        expiresIn: 900,
        tokenType: 'Bearer',
      },
      sessionEpoch: 7,
      authorizationDeadline: monotonicDeadline,
    })

    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const signals: AbortSignal[] = []
    let callCount = 0

    const encoder = new TextEncoder()
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount++
      if (init?.signal) signals.push(init.signal)
      if (callCount === 1) {
        // First connection emits a pulse frame and then closes (simulating network drop)
        let sent = false
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!sent) {
              sent = true
              controller.enqueue(
                encoder.encode('event: pulse\ndata: {"topic":"authorizationChanged"}\n\n'),
              )
            } else {
              controller.close()
            }
          },
        })
        return new Response(stream, { status: 200 })
      }
      // Second connection stays open until aborted by deadline / session change
      const stream = new ReadableStream<Uint8Array>({
        start() {
          // keep open
        },
      })
      return new Response(stream, { status: 200 })
    }) as unknown as typeof fetch

    const queryKeys = [
      ['dyna', '/system/roles', 'system-role'],
      ['system', 'roles'],
      ['system', 'authorization', 'insights'],
    ] as const

    const stop = startRealtimePulseSubscription({
      queryClient: { invalidateQueries },
      accessToken: 'test-token',
      sessionEpoch: 7,
      authorizationDeadline: monotonicDeadline,
      queryKeys,
      baseRetryMs: 2_000,
      maxRetryMs: 30_000,
      fetchImpl,
    })

    // Allow first stream pull to complete
    await vi.advanceTimersByTimeAsync(10)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['system', 'authorization', 'insights'],
    })

    // Stream closed -> should schedule reconnect after 2000ms backoff (10ms already elapsed)
    await vi.advanceTimersByTimeAsync(1_980)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(signals[1]?.aborted).toBe(false)

    // Advance to monotonic authorizationDeadline (+10_000ms total) -> stream must abort immediately and not reconnect
    await vi.advanceTimersByTimeAsync(8_000)
    expect(signals[1]?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    stop()
  })

  it('aborts active SSE stream immediately when sessionEpoch changes', async () => {
    const monotonicDeadline = performance.now() + 60_000
    useAuthStore.setState({
      tokens: {
        accessToken: 'test-token',
        refreshToken: '',
        expiresIn: 900,
        tokenType: 'Bearer',
      },
      sessionEpoch: 11,
      authorizationDeadline: monotonicDeadline,
    })

    let activeSignal: AbortSignal | undefined
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      activeSignal = init?.signal ?? undefined
      const stream = new ReadableStream<Uint8Array>({
        start() {
          // keep open
        },
      })
      return new Response(stream, { status: 200 })
    }) as unknown as typeof fetch

    const stop = startRealtimePulseSubscription({
      queryClient: { invalidateQueries: vi.fn().mockResolvedValue(undefined) },
      accessToken: 'test-token',
      sessionEpoch: 11,
      authorizationDeadline: monotonicDeadline,
      queryKeys: [['system', 'online']],
      fetchImpl,
    })

    expect(activeSignal?.aborted).toBe(false)
    // Simulate account switch / logout incrementing sessionEpoch
    useAuthStore.setState({ sessionEpoch: 12 })
    expect(activeSignal?.aborted).toBe(true)

    stop()
  })

  it('filters pulse frames by subscribed topics and stops retry on HTTP 401/403', async () => {
    vi.useFakeTimers()
    const monotonicDeadline = performance.now() + 60_000
    useAuthStore.setState({
      tokens: {
        accessToken: 'topic-token',
        refreshToken: '',
        expiresIn: 900,
        tokenType: 'Bearer',
      },
      sessionEpoch: 21,
      authorizationDeadline: monotonicDeadline,
    })

    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const encoder = new TextEncoder()
    const fetchTopics = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'event: pulse\ndata: {"topic":"operationLogged"}\n\n' +
                'event: pulse\ndata: not-json\n\n' +
                'event: pulse\ndata: {"topic":"authorizationChanged"}\n\n',
            ),
          )
        },
      })
      return new Response(stream, { status: 200 })
    }) as unknown as typeof fetch

    const stopTopics = startRealtimePulseSubscription({
      queryClient: { invalidateQueries },
      accessToken: 'topic-token',
      sessionEpoch: 21,
      authorizationDeadline: monotonicDeadline,
      queryKeys: [['system', 'roles']],
      topics: ['authorizationChanged'],
      fetchImpl: fetchTopics,
    })

    await vi.advanceTimersByTimeAsync(10)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['system', 'roles'] })
    stopTopics()

    for (const status of [401, 403]) {
      const authFailureFetch = vi.fn(
        async () => new Response(JSON.stringify({ code: status * 100 }), { status }),
      ) as unknown as typeof fetch
      const stopAuthFail = startRealtimePulseSubscription({
        queryClient: { invalidateQueries: vi.fn().mockResolvedValue(undefined) },
        accessToken: 'topic-token',
        sessionEpoch: 21,
        authorizationDeadline: monotonicDeadline,
        queryKeys: [['system', 'roles']],
        baseRetryMs: 1_000,
        fetchImpl: authFailureFetch,
      })

      await vi.advanceTimersByTimeAsync(10)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(authFailureFetch).toHaveBeenCalledTimes(1)
      stopAuthFail()
    }
  })

  it('tracks passive stream status transitions without opening connections when sseUrl is empty', async () => {
    vi.useFakeTimers()
    expect(getRealtimeConnectionStatus()).toBe('idle')

    const monotonicDeadline = performance.now() + 60_000
    useAuthStore.setState({
      tokens: {
        accessToken: 'status-token',
        refreshToken: '',
        expiresIn: 900,
        tokenType: 'Bearer',
      },
      sessionEpoch: 31,
      authorizationDeadline: monotonicDeadline,
    })

    const stopVisibilityOnly = startRealtimePulseSubscription({
      queryClient: { invalidateQueries: vi.fn().mockResolvedValue(undefined) },
      accessToken: 'status-token',
      sessionEpoch: 31,
      authorizationDeadline: monotonicDeadline,
      queryKeys: [['system', 'roles']],
      sseUrl: '',
    })
    expect(getRealtimeConnectionStatus()).toBe('idle')
    stopVisibilityOnly()

    let resolveFetch: ((response: Response) => void) | null = null
    let attempt = 0
    const fetchStatus = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          attempt++
          if (attempt === 1) {
            resolveFetch = resolve
          } else {
            resolve(new Response(null, { status: 503 }))
          }
        }),
    ) as unknown as typeof fetch

    const stopLive = startRealtimePulseSubscription({
      queryClient: { invalidateQueries: vi.fn().mockResolvedValue(undefined) },
      accessToken: 'status-token',
      sessionEpoch: 31,
      authorizationDeadline: monotonicDeadline,
      queryKeys: [['system', 'roles']],
      baseRetryMs: 2_000,
      fetchImpl: fetchStatus,
    })
    expect(getRealtimeConnectionStatus()).toBe('connecting')

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })
    resolveFetch!(new Response(stream, { status: 200 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(getRealtimeConnectionStatus()).toBe('reconnecting')

    stopLive()
    expect(getRealtimeConnectionStatus()).toBe('idle')
  })
})
