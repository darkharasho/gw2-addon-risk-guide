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

  it('retries once after a rate-limit response', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }))
      .mockResolvedValueOnce(res(200, { ok: true }))
    vi.stubGlobal('fetch', f)
    expect(await ghFetch('/x', { token: 't', sleep: async () => {} })).toEqual({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
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
