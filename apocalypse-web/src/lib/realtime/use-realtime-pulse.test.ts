import { afterEach, describe, expect, it, vi } from 'vitest'

import { authorizationDeadline as computeAuthorizationDeadline } from '@/lib/query/authorization-snapshot'
import { useAuthStore } from '@/stores/auth'

import {
  computeBackoffDelay,
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
})
