const API = 'https://api.github.com'
const UA = 'gw2-addon-risk-guide'

const headers = (token) => ({
  accept: 'application/vnd.github+json',
  'user-agent': UA,
  'x-github-api-version': '2022-11-28',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
})

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function ghRaw(path, { token, sleep = defaultSleep, attempts = 3 } = {}) {
  const url = path.startsWith('http') ? path : API + path
  for (let i = 0; i < attempts; i++) {
    const r = await fetch(url, { headers: headers(token) })
    if (r.status === 404) return { res: r, body: null }
    if (r.ok) return { res: r, body: await r.json() }
    const limited = r.status === 403 || r.status === 429
    if (limited && i < attempts - 1) {
      const reset = Number(r.headers.get('x-ratelimit-reset') || 0) * 1000
      const wait = Math.min(Math.max(reset - Date.now(), 1000), 60_000)
      await sleep(wait)
      continue
    }
    if (r.status >= 500 && i < attempts - 1) { await sleep(2000 * (i + 1)); continue }
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
