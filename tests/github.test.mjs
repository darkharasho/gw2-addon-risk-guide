import { describe, it, expect, vi, afterEach } from 'vitest'
import { ghFetch, ghPaginate } from '../scripts/github.mjs'

const res = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers })

afterEach(() => vi.restoreAllMocks())

describe('ghFetch', () => {
  it('sends the token and returns parsed JSON', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { id: 1 }))
    vi.stubGlobal('fetch', f)
    expect(await ghFetch('/repos/a/b', { token: 't' })).toEqual({ id: 1 })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/a/b')
    expect(init.headers.authorization).toBe('Bearer t')
  })

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(404, {})))
    expect(await ghFetch('/repos/a/b', { token: 't' })).toBeNull()
  })

  it('retries once after a 403 with x-ratelimit-remaining: 0', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }))
      .mockResolvedValueOnce(res(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    expect(await ghFetch('/x', { token: 't', sleep: async () => {} })).toEqual({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on plain 403 without rate-limit headers', async () => {
    const f = vi.fn().mockResolvedValue(res(403, {}))
    vi.stubGlobal('fetch', f)
    await expect(ghFetch('/x', { token: 't' })).rejects.toThrow('GitHub 403')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 with retry-after and waits the specified time', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const f = vi.fn()
      .mockResolvedValueOnce(res(429, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(res(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    expect(await ghFetch('/x', { token: 't', sleep })).toEqual({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(2000)
  })
})

describe('ghRaw rate-limit waiting', () => {
  const NOW = 1_000_000_000_000

  it('waits until x-ratelimit-reset instead of clamping to 60s', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const reset = String((NOW + 40 * 60_000) / 1000)
    const f = vi.fn()
      .mockResolvedValueOnce(res(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }))
      .mockResolvedValueOnce(res(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    expect(await ghFetch('/x', { token: 't', sleep, now: () => NOW })).toEqual({ ok: true })
    // 40 minutes out, capped by the 15-minute absolute ceiling.
    expect(sleep).toHaveBeenCalledWith(15 * 60_000)
  })

  it('tracks a reset that is inside the ceiling exactly', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const reset = String((NOW + 7 * 60_000) / 1000)
    const f = vi.fn()
      .mockResolvedValueOnce(res(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }))
      .mockResolvedValueOnce(res(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    await ghFetch('/x', { token: 't', sleep, now: () => NOW })
    expect(sleep).toHaveBeenCalledWith(7 * 60_000)
  })

  it('keeps the secondary-limit retry-after path clamped to 60s', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const f = vi.fn()
      .mockResolvedValueOnce(res(429, {}, { 'retry-after': '3600' }))
      .mockResolvedValueOnce(res(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    await ghFetch('/x', { token: 't', sleep, now: () => NOW })
    expect(sleep).toHaveBeenCalledWith(60_000)
  })

  it('does not let rate-limit waits consume the retry attempts', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const reset = String((NOW + 60_000) / 1000)
    const limited = () => res(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset })
    const f = vi.fn()
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(res(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    // attempts: 1 — three rate-limit waits still leave the single attempt intact.
    expect(await ghFetch('/x', { token: 't', sleep, now: () => NOW, attempts: 1 }))
      .toEqual({ ok: true })
    expect(sleep).toHaveBeenCalledTimes(3)
  })

  it('bounds how many rate-limit waits it tolerates', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const reset = String((NOW + 60_000) / 1000)
    const f = vi.fn().mockResolvedValue(
      res(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }))
    vi.stubGlobal('fetch', f)
    await expect(ghFetch('/x', { token: 't', sleep, now: () => NOW, rateLimitWaits: 2 }))
      .rejects.toThrow('GitHub 403')
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('never sleeps less than a second on a stale or missing reset header', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const f = vi.fn()
      .mockResolvedValueOnce(res(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }))
      .mockResolvedValueOnce(res(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    await ghFetch('/x', { token: 't', sleep, now: () => NOW })
    expect(sleep).toHaveBeenCalledWith(1000)
  })
})

describe('ghPaginate', () => {
  it('follows rel=next and concatenates pages', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(200, [1, 2], { link: '<https://api.github.com/x?page=2>; rel="next"' }))
      .mockResolvedValueOnce(res(200, [3]))
    vi.stubGlobal('fetch', f)
    expect(await ghPaginate('/x', { token: 't' })).toEqual([1, 2, 3])
  })

  it('stops at max items', async () => {
    const f = vi.fn().mockResolvedValue(
      res(200, [1, 2], { link: '<https://api.github.com/x?page=2>; rel="next"' }))
    vi.stubGlobal('fetch', f)
    expect(await ghPaginate('/x', { token: 't', max: 2 })).toEqual([1, 2])
  })
})
