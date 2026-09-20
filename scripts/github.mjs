const API = 'https://api.github.com'
const UA = 'gw2-addon-risk-guide'

const headers = (token) => ({
  accept: 'application/vnd.github+json',
  'user-agent': UA,
  'x-github-api-version': '2022-11-28',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
})

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A secondary-limit `retry-after` is always short, so it stays clamped. A
// primary-limit reset can legitimately be up to an hour out; clamping it to
// 60s just burned every attempt and threw. Waiting for a reset is not a
// failed attempt, so it does not consume one of `attempts` — it is bounded
// separately by `rateLimitWaits`.
const MIN_WAIT = 1000
const MAX_RETRY_AFTER = 60_000
const MAX_RESET_WAIT = 15 * 60_000

export async function ghRaw(
  path,
  { token, sleep = defaultSleep, attempts = 3, rateLimitWaits = 3, now = () => Date.now() } = {}
) {
  const url = path.startsWith('http') ? path : API + path
  let waits = 0
  for (let i = 0; i < attempts; ) {
    const r = await fetch(url, { headers: headers(token) })
    if (r.status === 404) return { res: r, body: null }
    if (r.ok) return { res: r, body: await r.json() }
    const retryAfter = r.headers.get('retry-after')
    const ratelimitRemaining = r.headers.get('x-ratelimit-remaining')
    const limited = retryAfter || r.status === 429 || (r.status === 403 && ratelimitRemaining === '0')
    if (limited && waits < rateLimitWaits) {
      waits += 1
      // `retry-after` may legally be an HTTP-date rather than seconds; that
      // yields NaN, and sleep(NaN) returns immediately, burning a wait
      // without waiting. Fall through to the reset header in that case.
      const retryAfterMs = Number(retryAfter) * 1000
      const wait = Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? Math.min(Math.max(retryAfterMs, MIN_WAIT), MAX_RETRY_AFTER)
        : Math.min(
            Math.max(Number(r.headers.get('x-ratelimit-reset') || 0) * 1000 - now(), MIN_WAIT),
            MAX_RESET_WAIT
          )
      await sleep(wait)
      continue
    }
    i += 1
    if (r.status >= 500 && i < attempts) { await sleep(2000 * i); continue }
    throw new Error(`GitHub ${r.status} for ${url}`)
  }
  throw new Error(`GitHub retries exhausted for ${url}`)
}

export async function ghFetch(path, opts = {}) {
  const { body } = await ghRaw(path, opts)
  return body
}

const nextLink = (link) => {
  const m = /<([^>]+)>;\s*rel="next"/.exec(link || '')
  return m ? m[1] : null
}

export async function ghPaginate(path, { max = Infinity, ...opts } = {}) {
  let url = path
  const out = []
  while (url && out.length < max) {
    const { res, body } = await ghRaw(url, opts)
    const items = Array.isArray(body) ? body : body?.items ?? []
    out.push(...items)
    url = nextLink(res.headers.get('link'))
  }
  return out.slice(0, max === Infinity ? undefined : max)
}
