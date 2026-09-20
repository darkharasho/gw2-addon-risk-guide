# GW2 Addon Risk Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static GitHub Pages site where a scheduled Action scrapes GW2-related GitHub repos, auto-scores each from observable risk signals, and the site presents a searchable catalog whose every score expands into the signals that fired and the ArenaNet/NCSoft policy text they bump against.

**Architecture:** A Node 22 ESM pipeline (no runtime dependencies) discovers repos via the GitHub Search API, enriches each with metadata plus shallow README/root-tree inspection, runs a pure additive signal scorer, merges a thin hand-written override layer, and commits `data/catalog.json`. The site is plain HTML/CSS/ES modules with no build step: it fetches the JSON and does token search and filtering in the browser. Pages is deployed by an Action that stages `site/` + `data/` into `_site`.

**Tech Stack:** Node 22 (ESM, built-in `fetch`, no deps), Vitest for tests, GitHub REST + Search API, vanilla HTML/CSS/JS, GitHub Actions (cron scrape + Pages deploy).

**Spec:** `docs/brief.md`

## Global Constraints

- Node 22+, ESM only (`"type": "module"`). Scripts have **zero runtime dependencies**; Vitest is the only devDependency.
- Run tests as `npm test` / `npx vitest run`. Test parallelism is capped at 2 forks by `vitest.config.mjs` (`pool: forks`, `minForks: 1`, `maxForks: 2`) — this machine is memory-constrained, per `~/.claude/CLAUDE.md`. Do not raise the cap and do not pass `--maxWorkers`, which vitest 2.1.9 rejects.
- No build step for the site. No bundler, no framework, no CDN script tags — the site must work when opened from a static file server.
- All GitHub API calls go through `scripts/github.mjs`, which honours `GITHUB_TOKEN`, paginates, and backs off on rate limits. No `fetch()` to api.github.com anywhere else.
- The scorer is a **pure function**: `score(repo) -> {points, band, signals[]}`. No I/O, no clock reads — "now" is passed in.
- Copy rule: never use the words "safe", "approved", "allowed", or "endorsed" about an addon in UI copy or data. Use "risk", "signals", "tolerated", "at your own risk". Every page carries the disclaimer string from Task 7 verbatim.
- Policy quotes in `data/policies.json` are **verbatim** and every entry carries `source_url` and `retrieved` (ISO date). Never paraphrase into the `quote` field.
- Data files are pretty-printed JSON with 2-space indent and a trailing newline, keys sorted at the top level, so scheduled commits produce readable diffs.

---

## Decisions made (previously open questions)

These were the spec's open questions. They are resolved as follows; changing one changes Tasks 3, 5, or 6.

1. **Scoring inputs:** metadata **plus shallow inspection** — README (first 20 KB), topics, description, root tree filenames, language map, release asset names. No cloning, no deep source reads.
2. **Manual override layer:** yes, but thin and auditable — `data/overrides.json` may only adjust/suppress signals and must carry a `reason` and `source_url`. It cannot set a band directly.
3. **Framework:** none. Plain HTML + ES modules + hand-rolled token search over a ~KB-scale JSON index. No Astro/Eleventy/Fuse.

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | ESM marker, `test` / `catalog` scripts, vitest devDependency |
| `scripts/github.mjs` | Authenticated fetch wrapper: pagination, rate-limit backoff, 404→null |
| `scripts/discover.mjs` | Search-API queries → deduped list of repo full_names |
| `scripts/enrich.mjs` | Per-repo metadata + README + root tree + releases → `RepoFacts` |
| `scripts/signals.mjs` | Signal definitions and pure detection over `RepoFacts` |
| `scripts/score.mjs` | Pure additive scoring, band thresholds, override merge |
| `scripts/build-catalog.mjs` | Orchestrator; writes `data/catalog.json` |
| `data/policies.json` | Hand-curated verbatim policy clauses (checked in) |
| `data/overrides.json` | Thin manual override layer (checked in) |
| `data/catalog.json` | Generated catalog (committed by the Action) |
| `site/index.html` | Catalog page shell |
| `site/policy.html` | Policy page shell |
| `site/app.js` | Wiring: load data, bind controls, render |
| `site/search.js` | Token index + filter predicates (pure, testable) |
| `site/render.js` | Card + breakdown DOM rendering (pure → HTML strings) |
| `site/style.css` | All styling |
| `.github/workflows/refresh-catalog.yml` | Cron scrape + commit |
| `.github/workflows/pages.yml` | Stage `site/` + `data/` → deploy Pages |
| `tests/*.test.mjs` | Vitest suites, one per script module |

---

### Task 1: Project skeleton and GitHub API client

**Files:**
- Create: `package.json`, `vitest.config.mjs`, `scripts/github.mjs`, `tests/github.test.mjs`, `.gitignore` (modify)

**Interfaces:**
- Consumes: nothing.
- Produces: `ghFetch(path, {token}) -> Promise<any|null>`, `ghPaginate(path, {token, max}) -> Promise<any[]>`. `path` is an api.github.com path like `/repos/foo/bar`. Returns `null` on 404. Throws on other non-2xx after retries.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "gw2-addon-risk-guide",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "catalog": "node scripts/build-catalog.mjs"
  },
  "devDependencies": { "vitest": "^2.1.0" }
}
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

`tests/github.test.mjs`:

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/github.test.mjs`
Expected: FAIL — "Failed to resolve import ../scripts/github.mjs"

- [ ] **Step 4: Implement `scripts/github.mjs`**

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/github.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
printf 'node_modules/\n.DS_Store\n' >> .gitignore
git add package.json package-lock.json .gitignore scripts/github.mjs tests/github.test.mjs
git commit -m "feat: add GitHub API client with pagination and rate-limit backoff"
```

---

### Task 2: Repo discovery and enrichment

**Files:**
- Create: `scripts/discover.mjs`, `scripts/enrich.mjs`, `tests/discover.test.mjs`, `tests/enrich.test.mjs`

**Interfaces:**
- Consumes: `ghFetch`, `ghPaginate` from Task 1.
- Produces:
  - `QUERIES: string[]` and `discover({token, perQuery=100}) -> Promise<string[]>` (deduped, lowercased `owner/name`).
  - `enrich(fullName, {token}) -> Promise<RepoFacts|null>` where
    ```
    RepoFacts = {
      full_name, name, owner, html_url, description,
      topics: string[], language, languages: string[],
      stars: number, forks: number, archived: boolean, fork: boolean,
      pushed_at: string /* ISO */, created_at: string,
      license: string|null /* SPDX id */,
      readme: string /* '' when absent, truncated to 20000 chars */,
      root_files: string[] /* lowercased filenames+dirs at repo root */,
      release_assets: string[] /* lowercased asset names, latest release */
    }
    ```

- [ ] **Step 1: Write the failing discovery test**

`tests/discover.test.mjs`:

```js
import { describe, it, expect, vi } from 'vitest'
import { QUERIES, discover } from '../scripts/discover.mjs'

vi.mock('../scripts/github.mjs', () => ({
  ghPaginate: vi.fn(async (path) =>
    path.includes('arcdps')
      ? [{ full_name: 'Deltaconnected/ArcDPS' }, { full_name: 'a/b' }]
      : [{ full_name: 'A/B' }]),
  ghFetch: vi.fn(),
}))

describe('discover', () => {
  it('covers the spec search terms', () => {
    const joined = QUERIES.join(' | ').toLowerCase()
    for (const t of ['gw2', 'guild wars 2', 'arcdps']) expect(joined).toContain(t)
  })

  it('dedupes case-insensitively and returns sorted lowercase names', async () => {
    const out = await discover({ token: 't' })
    expect(out).toEqual(['a/b', 'deltaconnected/arcdps'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/discover.test.mjs`
Expected: FAIL — cannot resolve `../scripts/discover.mjs`

- [ ] **Step 3: Implement `scripts/discover.mjs`**

```js
import { ghPaginate } from './github.mjs'

export const QUERIES = [
  'gw2 addon', 'gw2 overlay', 'gw2 api', 'guild wars 2 addon',
  'guild wars 2 overlay', 'guild wars 2 tool', 'arcdps', 'arcdps plugin',
  'guildwars2', 'gw2 in:name', 'guild wars 2 in:description',
  'topic:guild-wars-2', 'topic:gw2', 'topic:arcdps',
]

export async function discover({ token, perQuery = 100 } = {}) {
  const seen = new Set()
  for (const q of QUERIES) {
    const path = `/search/repositories?q=${encodeURIComponent(q)}&per_page=100&sort=updated`
    const items = await ghPaginate(path, { token, max: perQuery })
    for (const r of items) seen.add(r.full_name.toLowerCase())
  }
  return [...seen].sort()
}
```

- [ ] **Step 4: Write the failing enrichment test**

`tests/enrich.test.mjs`:

```js
import { describe, it, expect, vi } from 'vitest'

const repo = {
  full_name: 'Deltaconnected/ArcDPS', name: 'ArcDPS', owner: { login: 'Deltaconnected' },
  html_url: 'https://github.com/Deltaconnected/ArcDPS', description: 'dps meter',
  topics: ['gw2'], language: 'C++', stargazers_count: 100, forks_count: 5,
  archived: false, fork: false, pushed_at: '2026-01-02T00:00:00Z',
  created_at: '2016-01-02T00:00:00Z', license: { spdx_id: 'MIT' },
}

vi.mock('../scripts/github.mjs', () => ({
  ghFetch: vi.fn(async (p) => {
    if (p === '/repos/deltaconnected/arcdps') return repo
    if (p.endsWith('/languages')) return { 'C++': 900, C: 100 }
    if (p.endsWith('/readme')) return { content: Buffer.from('Hooks d3d11').toString('base64') }
    if (p.endsWith('/contents/')) return [{ name: 'DllMain.cpp' }, { name: 'src' }]
    if (p.endsWith('/releases/latest')) return { assets: [{ name: 'd3d11.DLL' }] }
    return null
  }),
  ghPaginate: vi.fn(),
}))

const { enrich } = await import('../scripts/enrich.mjs')

describe('enrich', () => {
  it('flattens the API responses into RepoFacts', async () => {
    const f = await enrich('Deltaconnected/ArcDPS', { token: 't' })
    expect(f.full_name).toBe('Deltaconnected/ArcDPS')
    expect(f.owner).toBe('Deltaconnected')
    expect(f.languages).toEqual(['C++', 'C'])
    expect(f.license).toBe('MIT')
    expect(f.readme).toBe('Hooks d3d11')
    expect(f.root_files).toEqual(['dllmain.cpp', 'src'])
    expect(f.release_assets).toEqual(['d3d11.dll'])
    expect(f.stars).toBe(100)
  })

  it('returns null for a missing repo', async () => {
    const { ghFetch } = await import('../scripts/github.mjs')
    ghFetch.mockResolvedValueOnce(null)
    expect(await enrich('gone/repo', { token: 't' })).toBeNull()
  })
})
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run tests/enrich.test.mjs`
Expected: FAIL — cannot resolve `../scripts/enrich.mjs`

- [ ] **Step 6: Implement `scripts/enrich.mjs`**

```js
import { ghFetch } from './github.mjs'

const README_MAX = 20_000

const safe = async (p, opts) => { try { return await ghFetch(p, opts) } catch { return null } }

export async function enrich(fullName, opts = {}) {
  const slug = fullName.toLowerCase()
  const repo = await ghFetch(`/repos/${slug}`, opts)
  if (!repo) return null
  const [languages, readme, contents, release] = await Promise.all([
    safe(`/repos/${slug}/languages`, opts),
    safe(`/repos/${slug}/readme`, opts),
    safe(`/repos/${slug}/contents/`, opts),
    safe(`/repos/${slug}/releases/latest`, opts),
  ])
  return {
    full_name: repo.full_name,
    name: repo.name,
    owner: repo.owner?.login ?? slug.split('/')[0],
    html_url: repo.html_url,
    description: repo.description ?? '',
    topics: repo.topics ?? [],
    language: repo.language ?? null,
    languages: Object.keys(languages ?? {}),
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    archived: !!repo.archived,
    fork: !!repo.fork,
    pushed_at: repo.pushed_at,
    created_at: repo.created_at,
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION'
      ? repo.license.spdx_id : null,
    readme: readme?.content
      ? Buffer.from(readme.content, 'base64').toString('utf8').slice(0, README_MAX) : '',
    root_files: Array.isArray(contents) ? contents.map((c) => c.name.toLowerCase()) : [],
    release_assets: (release?.assets ?? []).map((a) => a.name.toLowerCase()),
  }
}
```

- [ ] **Step 7: Run both tests to verify they pass**

Run: `npx vitest run tests/discover.test.mjs tests/enrich.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 8: Commit**

```bash
git add scripts/discover.mjs scripts/enrich.mjs tests/discover.test.mjs tests/enrich.test.mjs
git commit -m "feat: add repo discovery and enrichment"
```

---

### Task 3: Signal detection

**Files:**
- Create: `scripts/signals.mjs`, `tests/signals.test.mjs`

**Interfaces:**
- Consumes: `RepoFacts` from Task 2.
- Produces:
  - `SIGNALS: Signal[]` where `Signal = { id, label, weight, policy, explain }` — `policy` is a policy clause id defined in Task 4, `weight` may be negative (mitigator).
  - `detect(facts, now) -> Detected[]` where `Detected = { id, label, weight, policy, explain, evidence: string[] }`. `now` is a `Date`. Evidence strings are short human-readable phrases like `readme matches /inject/` or `last push 31 months ago`.

**Signal table (weights are the scoring model; changing them changes the site's numbers):**

| id | weight | fires when |
|---|---|---|
| `automation` | +40 | text matches bot/autoplay/autofarm/macro/SendInput/AutoHotkey |
| `memory` | +35 | text matches ReadProcessMemory/WriteProcessMemory/memory scan/pattern scan/offsets |
| `packet` | +30 | text matches packet/pcap/sniff/MITM/proxy the game |
| `injection` | +25 | text matches inject/dll hook/d3d9/d3d11/detour, or root/release files include a `.dll` |
| `unsigned_binaries` | +5 | latest release ships `.dll`/`.exe` assets |
| `archived` | +10 | `facts.archived` |
| `stale_24m` | +10 | pushed > 24 months before `now` |
| `stale_12m` | +5 | pushed 12–24 months before `now` |
| `no_license` | +5 | `facts.license === null` |
| `obscure` | +5 | stars < 10 |
| `api_only` | −15 | text matches official-API usage and no injection/memory/packet/automation signal fired |
| `popular_maintained` | −5 | stars ≥ 200 and pushed within 6 months |

Bands (Task 4): `low` 0–19, `moderate` 20–44, `elevated` 45–69, `high` 70–100.

- [ ] **Step 1: Write the failing test**

`tests/signals.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { SIGNALS, detect } from '../scripts/signals.mjs'

const NOW = new Date('2026-09-19T00:00:00Z')
const base = {
  full_name: 'a/b', description: '', topics: [], languages: [], readme: '',
  root_files: [], release_assets: [], stars: 50, archived: false,
  pushed_at: '2026-08-01T00:00:00Z', license: 'MIT',
}
const ids = (facts) => detect({ ...base, ...facts }, NOW).map((s) => s.id).sort()

describe('signal table', () => {
  it('has unique ids and a policy clause on every signal', () => {
    expect(new Set(SIGNALS.map((s) => s.id)).size).toBe(SIGNALS.length)
    for (const s of SIGNALS) expect(typeof s.policy).toBe('string')
  })
})

describe('detect', () => {
  it('fires automation on bot language', () => {
    expect(ids({ readme: 'An auto-farm bot for gw2' })).toContain('automation')
  })

  it('fires injection on a d3d11 proxy dll', () => {
    expect(ids({ readme: 'drop d3d11.dll next to the exe', root_files: ['d3d11.dll'] }))
      .toContain('injection')
  })

  it('fires memory and packet on the respective terms', () => {
    expect(ids({ readme: 'uses ReadProcessMemory' })).toContain('memory')
    expect(ids({ readme: 'a packet sniffer for the map protocol' })).toContain('packet')
  })

  it('fires api_only for an official-API consumer and not for an injector', () => {
    expect(ids({ readme: 'Uses the official Guild Wars 2 API at api.guildwars2.com' }))
      .toContain('api_only')
    expect(ids({ readme: 'api.guildwars2.com plus a d3d11 hook' })).not.toContain('api_only')
  })

  it('grades staleness into one bucket only', () => {
    expect(ids({ pushed_at: '2023-01-01T00:00:00Z' })).toContain('stale_24m')
    expect(ids({ pushed_at: '2025-03-01T00:00:00Z' })).toContain('stale_12m')
    expect(ids({ pushed_at: '2025-03-01T00:00:00Z' })).not.toContain('stale_24m')
    expect(ids({})).not.toContain('stale_12m')
  })

  it('fires archived, no_license and obscure from metadata', () => {
    expect(ids({ archived: true, license: null, stars: 3 }))
      .toEqual(expect.arrayContaining(['archived', 'no_license', 'obscure']))
  })

  it('records evidence for every detected signal', () => {
    for (const s of detect({ ...base, readme: 'auto-farm bot', archived: true }, NOW)) {
      expect(s.evidence.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/signals.test.mjs`
Expected: FAIL — cannot resolve `../scripts/signals.mjs`

- [ ] **Step 3: Implement `scripts/signals.mjs`**

```js
const MONTH = 1000 * 60 * 60 * 24 * 30.44

export const SIGNALS = [
  { id: 'automation', label: 'Gameplay automation', weight: 40, policy: 'ua-automation',
    explain: 'Plays the game for you — bots, autofarming, or simulated input.' },
  { id: 'memory', label: 'Game memory access', weight: 35, policy: 'ua-modify-client',
    explain: 'Reads or writes the game client’s memory.' },
  { id: 'packet', label: 'Network/packet handling', weight: 30, policy: 'ua-modify-client',
    explain: 'Inspects or alters traffic between the client and the servers.' },
  { id: 'injection', label: 'Client injection or hooking', weight: 25, policy: 'ua-third-party-programs',
    explain: 'Loads code into the game process, typically via a proxy DLL or graphics hook.' },
  { id: 'unsigned_binaries', label: 'Ships prebuilt binaries', weight: 5, policy: 'support-own-risk',
    explain: 'Releases contain executables or DLLs you must trust without building them yourself.' },
  { id: 'archived', label: 'Archived repository', weight: 10, policy: 'support-own-risk',
    explain: 'The project is archived and will not be updated after game patches.' },
  { id: 'stale_24m', label: 'Unmaintained (2+ years)', weight: 10, policy: 'support-own-risk',
    explain: 'No pushes in over two years.' },
  { id: 'stale_12m', label: 'Slow maintenance (1-2 years)', weight: 5, policy: 'support-own-risk',
    explain: 'No pushes in over a year.' },
  { id: 'no_license', label: 'No license', weight: 5, policy: 'support-own-risk',
    explain: 'No declared license, so redistribution and auditing terms are unclear.' },
  { id: 'obscure', label: 'Little public scrutiny', weight: 5, policy: 'support-own-risk',
    explain: 'Few stars, so few people have looked at the code.' },
  { id: 'api_only', label: 'Official API only', weight: -15, policy: 'api-terms',
    explain: 'Appears to use only the official Guild Wars 2 API, outside the game process.' },
  { id: 'popular_maintained', label: 'Popular and actively maintained', weight: -5, policy: 'support-own-risk',
    explain: 'Widely used and pushed recently, so problems surface fast.' },
]

const byId = Object.fromEntries(SIGNALS.map((s) => [s.id, s]))

const PATTERNS = {
  automation: /\b(bot|botting|auto-?farm|auto-?play|auto-?cast|auto-?loot|macro|autohotkey|sendinput|input simulation|clicker)\b/i,
  memory: /\b(readprocessmemory|writeprocessmemory|memory (read|scan|edit)|pattern scan|mumble link offsets|process memory)\b/i,
  packet: /\b(packet|pcap|sniff(er|ing)?|man-in-the-middle|mitm|intercept(s|ing)? traffic)\b/i,
  injection: /\b(inject(ion|or|s|ed)?|dll hook|hooks? (d3d|directx|the client)|d3d9|d3d11|dxgi|detour|proxy dll|addon loader)\b/i,
  api_only: /\b(api\.guildwars2\.com|official (gw2|guild wars 2) api|wiki\.guildwars2\.com\/wiki\/api)\b/i,
}

const text = (f) =>
  [f.description, f.readme, (f.topics ?? []).join(' '), f.full_name].filter(Boolean).join('\n')

const hit = (id, ev) => ({ ...byId[id], evidence: ev })

export function detect(facts, now = new Date()) {
  const body = text(facts)
  const out = []
  const fired = new Set()
  const push = (id, ev) => { out.push(hit(id, ev)); fired.add(id) }

  for (const id of ['automation', 'memory', 'packet', 'injection']) {
    const m = PATTERNS[id].exec(body)
    if (m) push(id, [`text mentions "${m[0]}"`])
  }
  const dlls = [...(facts.root_files ?? []), ...(facts.release_assets ?? [])]
    .filter((n) => n.endsWith('.dll'))
  if (dlls.length && !fired.has('injection')) push('injection', [`ships ${dlls[0]}`])

  const bins = (facts.release_assets ?? []).filter((n) => /\.(dll|exe)$/.test(n))
  if (bins.length) push('unsigned_binaries', [`release asset ${bins[0]}`])

  if (facts.archived) push('archived', ['repository is archived on GitHub'])

  const months = (now - new Date(facts.pushed_at)) / MONTH
  if (months >= 24) push('stale_24m', [`last push ${Math.round(months)} months ago`])
  else if (months >= 12) push('stale_12m', [`last push ${Math.round(months)} months ago`])

  if (!facts.license) push('no_license', ['no license detected by GitHub'])
  if ((facts.stars ?? 0) < 10) push('obscure', [`${facts.stars ?? 0} stars`])

  const invasive = ['automation', 'memory', 'packet', 'injection'].some((id) => fired.has(id))
  const api = PATTERNS.api_only.exec(body)
  if (api && !invasive) push('api_only', [`text mentions "${api[0]}"`])
  if ((facts.stars ?? 0) >= 200 && months < 6) {
    push('popular_maintained', [`${facts.stars} stars, last push ${Math.round(months)} months ago`])
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/signals.test.mjs`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/signals.mjs tests/signals.test.mjs
git commit -m "feat: add risk signal detection"
```

---

### Task 4: Policy data and the scorer with overrides

**Files:**
- Create: `data/policies.json`, `data/overrides.json`, `scripts/score.mjs`, `tests/score.test.mjs`, `tests/policies.test.mjs`

**Interfaces:**
- Consumes: `detect`, `SIGNALS` (Task 3).
- Produces:
  - `BANDS = [{id:'low',min:0},{id:'moderate',min:20},{id:'elevated',min:45},{id:'high',min:70}]`
  - `bandFor(points) -> 'low'|'moderate'|'elevated'|'high'`
  - `score(facts, {now, override}) -> { points, band, signals: Detected[], override: {reason, source_url}|null }` — pure, clamps points to 0–100.
  - Policy clause shape: `{ id, title, source, source_url, quote, retrieved, applies_to: string[] }` where `applies_to` holds signal ids.
  - Override shape, keyed by lowercased `owner/name`: `{ suppress: string[], add: string[], reason, source_url }`.

- [ ] **Step 1: Write the failing policy-data test**

`tests/policies.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SIGNALS } from '../scripts/signals.mjs'

const policies = JSON.parse(readFileSync('data/policies.json', 'utf8')).clauses

describe('data/policies.json', () => {
  it('gives every clause a verbatim quote and a source', () => {
    expect(policies.length).toBeGreaterThan(0)
    for (const c of policies) {
      expect(c.quote.trim().length).toBeGreaterThan(20)
      expect(c.source_url).toMatch(/^https:\/\//)
      expect(c.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(c.source.length).toBeGreaterThan(0)
    }
  })

  it('has a clause for every policy id referenced by a signal', () => {
    const have = new Set(policies.map((c) => c.id))
    for (const s of SIGNALS) expect(have).toContain(s.policy)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/policies.test.mjs`
Expected: FAIL — ENOENT `data/policies.json`

- [ ] **Step 3: Populate `data/policies.json` from primary sources**

Fetch each source below (WebFetch or browser) and copy the relevant sentence(s) **verbatim** into a clause. Do not paraphrase, do not invent text, and if a source no longer contains matching language, drop that clause and say so rather than writing something plausible.

Sources to read, in order:
1. Guild Wars 2 User Agreement — https://www.arena.net/en/legal/user-agreement (clauses on third-party programs, modifying the client, automation/botting) → ids `ua-third-party-programs`, `ua-modify-client`, `ua-automation`
2. Guild Wars 2 Rules of Conduct — https://www.arena.net/en/legal/rules-of-conduct
3. ArenaNet support: policy on third-party programs / "Can I use add-ons?" — https://help.guildwars2.com/hc/en-us/articles/360013762153 (verify the live article; search help.guildwars2.com for "third-party programs" if it moved) → id `support-own-risk`
4. GW2 API terms of use — https://wiki.guildwars2.com/wiki/API:API_key and https://www.guildwars2.com/en/api/ → id `api-terms`

Shape (one object per clause, `applies_to` listing the signal ids from Task 3 it maps to):

```json
{
  "retrieved": "2026-09-19",
  "clauses": [
    {
      "id": "ua-third-party-programs",
      "title": "Third-party programs",
      "source": "Guild Wars 2 User Agreement",
      "source_url": "https://www.arena.net/en/legal/user-agreement",
      "retrieved": "2026-09-19",
      "quote": "<verbatim sentence(s) from the User Agreement>",
      "applies_to": ["injection"]
    }
  ]
}
```

Required ids after this step: `ua-third-party-programs`, `ua-modify-client`, `ua-automation`, `support-own-risk`, `api-terms`.

- [ ] **Step 4: Run the policy test to verify it passes**

Run: `npx vitest run tests/policies.test.mjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing scorer test**

`tests/score.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { score, bandFor } from '../scripts/score.mjs'

const NOW = new Date('2026-09-19T00:00:00Z')
const base = {
  full_name: 'a/b', description: '', topics: [], readme: '', root_files: [],
  release_assets: [], stars: 50, archived: false,
  pushed_at: '2026-08-01T00:00:00Z', license: 'MIT',
}

describe('bandFor', () => {
  it('maps points onto the four bands', () => {
    expect(bandFor(0)).toBe('low')
    expect(bandFor(19)).toBe('low')
    expect(bandFor(20)).toBe('moderate')
    expect(bandFor(44)).toBe('moderate')
    expect(bandFor(45)).toBe('elevated')
    expect(bandFor(70)).toBe('high')
    expect(bandFor(100)).toBe('high')
  })
})

describe('score', () => {
  it('sums signal weights', () => {
    const r = score({ ...base, readme: 'an auto-farm bot that uses ReadProcessMemory' }, { now: NOW })
    expect(r.points).toBe(75)
    expect(r.band).toBe('high')
  })

  it('clamps to 0 when mitigators outweigh', () => {
    const r = score({ ...base, readme: 'uses api.guildwars2.com only', stars: 500 }, { now: NOW })
    expect(r.points).toBe(0)
    expect(r.band).toBe('low')
  })

  it('clamps to 100', () => {
    const r = score({
      ...base, readme: 'bot with ReadProcessMemory, packet sniffing and a d3d11 hook',
      archived: true, license: null, stars: 0, pushed_at: '2020-01-01T00:00:00Z',
    }, { now: NOW })
    expect(r.points).toBe(100)
  })

  it('applies an override that suppresses a signal', () => {
    const r = score({ ...base, readme: 'auto-farm bot' }, {
      now: NOW,
      override: { suppress: ['automation'], reason: 'name collision', source_url: 'https://example.com' },
    })
    expect(r.signals.map((s) => s.id)).not.toContain('automation')
    expect(r.override.reason).toBe('name collision')
  })

  it('applies an override that adds a signal', () => {
    const r = score(base, {
      now: NOW,
      override: { add: ['injection'], reason: 'injects, undocumented in README', source_url: 'https://example.com' },
    })
    expect(r.signals.map((s) => s.id)).toContain('injection')
    expect(r.signals.find((s) => s.id === 'injection').evidence)
      .toContain('manual override: injects, undocumented in README')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/score.test.mjs`
Expected: FAIL — cannot resolve `../scripts/score.mjs`

- [ ] **Step 7: Implement `scripts/score.mjs`**

```js
import { SIGNALS, detect } from './signals.mjs'

export const BANDS = [
  { id: 'low', min: 0 }, { id: 'moderate', min: 20 },
  { id: 'elevated', min: 45 }, { id: 'high', min: 70 },
]

const byId = Object.fromEntries(SIGNALS.map((s) => [s.id, s]))

export function bandFor(points) {
  let band = 'low'
  for (const b of BANDS) if (points >= b.min) band = b.id
  return band
}

export function score(facts, { now = new Date(), override = null } = {}) {
  let signals = detect(facts, now)
  if (override) {
    const drop = new Set(override.suppress ?? [])
    signals = signals.filter((s) => !drop.has(s.id))
    for (const id of override.add ?? []) {
      if (!byId[id] || signals.some((s) => s.id === id)) continue
      signals.push({ ...byId[id], evidence: [`manual override: ${override.reason}`] })
    }
  }
  const raw = signals.reduce((n, s) => n + s.weight, 0)
  const points = Math.max(0, Math.min(100, raw))
  return {
    points,
    band: bandFor(points),
    signals,
    override: override ? { reason: override.reason, source_url: override.source_url } : null,
  }
}
```

- [ ] **Step 8: Create `data/overrides.json` (starts empty but documented)**

```json
{
  "_comment": "Thin manual layer. Each entry may only suppress or add signal ids and MUST carry a reason and a source_url. Bands are never set by hand.",
  "overrides": {}
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS (all suites)

- [ ] **Step 10: Commit**

```bash
git add data/policies.json data/overrides.json scripts/score.mjs tests/score.test.mjs tests/policies.test.mjs
git commit -m "feat: add policy clauses and risk scorer with override layer"
```

---

### Task 5: Catalog builder

**Files:**
- Create: `scripts/build-catalog.mjs`, `tests/build-catalog.test.mjs`

**Interfaces:**
- Consumes: `discover`, `enrich`, `score`, `SIGNALS`.
- Produces: `buildCatalog({discover, enrich, score, now, overrides}) -> Catalog` (dependency-injected so it is testable without network), and a CLI entrypoint writing `data/catalog.json`.
  ```
  Catalog = {
    generated_at: string,
    signal_definitions: Signal[],
    bands: {id,min}[],
    repos: [{ full_name, name, owner, html_url, description, topics, language,
              stars, archived, pushed_at, license, points, band,
              signals: [{id,label,weight,policy,explain,evidence}],
              override: {reason,source_url}|null }]
  }
  ```
  Repos are sorted by `points` descending, then `full_name` ascending.

- [ ] **Step 1: Write the failing test**

`tests/build-catalog.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { buildCatalog } from '../scripts/build-catalog.mjs'

const NOW = new Date('2026-09-19T00:00:00Z')
const facts = (full_name, over = {}) => ({
  full_name, name: full_name.split('/')[1], owner: full_name.split('/')[0],
  html_url: `https://github.com/${full_name}`, description: '', topics: [],
  language: 'C++', languages: ['C++'], readme: '', root_files: [], release_assets: [],
  stars: 50, forks: 1, archived: false, fork: false, license: 'MIT',
  pushed_at: '2026-08-01T00:00:00Z', created_at: '2020-01-01T00:00:00Z', ...over,
})

const deps = {
  discover: async () => ['z/injector', 'a/clean', 'ghost/gone'],
  enrich: async (n) =>
    n === 'ghost/gone' ? null
      : n === 'z/injector' ? facts(n, { readme: 'a d3d11 hook' }) : facts(n),
  now: NOW,
  overrides: {},
}

describe('buildCatalog', () => {
  it('skips repos that fail enrichment', async () => {
    const cat = await buildCatalog(deps)
    expect(cat.repos.map((r) => r.full_name)).toEqual(['z/injector', 'a/clean'])
  })

  it('sorts by points desc then name asc', async () => {
    const cat = await buildCatalog({ ...deps, discover: async () => ['b/one', 'a/two'] })
    expect(cat.repos.map((r) => r.full_name)).toEqual(['a/two', 'b/one'])
  })

  it('embeds signal definitions and bands for the UI', async () => {
    const cat = await buildCatalog(deps)
    expect(cat.signal_definitions.find((s) => s.id === 'injection').weight).toBe(25)
    expect(cat.bands.map((b) => b.id)).toEqual(['low', 'moderate', 'elevated', 'high'])
    expect(cat.generated_at).toBe(NOW.toISOString())
  })

  it('threads overrides through by lowercased full_name', async () => {
    const cat = await buildCatalog({
      ...deps,
      overrides: { 'z/injector': { suppress: ['injection'], reason: 'r', source_url: 'https://e.com' } },
    })
    const r = cat.repos.find((x) => x.full_name === 'z/injector')
    expect(r.signals.map((s) => s.id)).not.toContain('injection')
    expect(r.override.reason).toBe('r')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/build-catalog.test.mjs`
Expected: FAIL — cannot resolve `../scripts/build-catalog.mjs`

- [ ] **Step 3: Implement `scripts/build-catalog.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { discover as realDiscover } from './discover.mjs'
import { enrich as realEnrich } from './enrich.mjs'
import { score as realScore, BANDS } from './score.mjs'
import { SIGNALS } from './signals.mjs'

export async function buildCatalog({
  discover = realDiscover, enrich = realEnrich, score = realScore,
  now = new Date(), overrides = {}, token,
} = {}) {
  const names = await discover({ token })
  const repos = []
  for (const name of names) {
    const facts = await enrich(name, { token })
    if (!facts) continue
    const s = score(facts, { now, override: overrides[name.toLowerCase()] ?? null })
    repos.push({
      full_name: facts.full_name, name: facts.name, owner: facts.owner,
      html_url: facts.html_url, description: facts.description, topics: facts.topics,
      language: facts.language, stars: facts.stars, archived: facts.archived,
      pushed_at: facts.pushed_at, license: facts.license,
      points: s.points, band: s.band, signals: s.signals, override: s.override,
    })
  }
  repos.sort((a, b) => b.points - a.points || a.full_name.localeCompare(b.full_name))
  return { bands: BANDS, generated_at: now.toISOString(), repos, signal_definitions: SIGNALS }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const overrides = JSON.parse(readFileSync('data/overrides.json', 'utf8')).overrides ?? {}
  const catalog = await buildCatalog({ token: process.env.GITHUB_TOKEN, overrides })
  writeFileSync('data/catalog.json', JSON.stringify(catalog, null, 2) + '\n')
  console.log(`wrote ${catalog.repos.length} repos to data/catalog.json`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/build-catalog.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Generate a real catalog and sanity-check it**

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/build-catalog.mjs
node -e "const c=require('fs').readFileSync('data/catalog.json','utf8');const j=JSON.parse(c);console.log(j.repos.length, j.repos.slice(0,3).map(r=>[r.full_name,r.points,r.band]))"
```

Expected: a few hundred repos; the top entries are plausibly high-risk. If the counts look wrong, fix the query list in `scripts/discover.mjs` before continuing.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-catalog.mjs tests/build-catalog.test.mjs data/catalog.json
git commit -m "feat: add catalog builder and first generated catalog"
```

---

### Task 6: Search and filter module

**Files:**
- Create: `site/search.js`, `tests/search.test.mjs`

**Interfaces:**
- Consumes: `Catalog.repos` (Task 5).
- Produces (browser-compatible ES module, no DOM access):
  - `tokenize(s) -> string[]`
  - `indexRepos(repos) -> Indexed[]` (`{repo, haystack}`)
  - `filterRepos(indexed, {query, bands, signals, maintenance}) -> repo[]`
    - `bands`: array of band ids; empty = all.
    - `signals`: array of signal ids; a repo matches if it has **all** of them.
    - `maintenance`: `'any' | 'active' | 'stale' | 'archived'` (`active` = no `stale_*`/`archived` signal).
    - Query terms are ANDed; a term matches as a prefix of any haystack token.

- [ ] **Step 1: Write the failing test**

`tests/search.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { tokenize, indexRepos, filterRepos } from '../site/search.js'

const repo = (full_name, over = {}) => ({
  full_name, name: full_name.split('/')[1], description: '', topics: [],
  band: 'low', signals: [], archived: false, ...over,
})
const repos = [
  repo('deltaconnected/arcdps', { band: 'elevated', signals: [{ id: 'injection' }], description: 'dps meter' }),
  repo('someone/gw2-api-viewer', { band: 'low', signals: [{ id: 'api_only' }] }),
  repo('old/dead-tool', { band: 'moderate', signals: [{ id: 'stale_24m' }], archived: true }),
]
const idx = indexRepos(repos)
const names = (opts) => filterRepos(idx, opts).map((r) => r.full_name)

describe('tokenize', () => {
  it('splits on non-alphanumerics and lowercases', () => {
    expect(tokenize('GW2-API_viewer/x')).toEqual(['gw2', 'api', 'viewer', 'x'])
  })
})

describe('filterRepos', () => {
  it('returns everything for an empty filter', () => {
    expect(names({}).length).toBe(3)
  })

  it('matches query terms as prefixes across name and description', () => {
    expect(names({ query: 'arc' })).toEqual(['deltaconnected/arcdps'])
    expect(names({ query: 'dps met' })).toEqual(['deltaconnected/arcdps'])
  })

  it('ANDs query terms', () => {
    expect(names({ query: 'arcdps viewer' })).toEqual([])
  })

  it('filters by band', () => {
    expect(names({ bands: ['low'] })).toEqual(['someone/gw2-api-viewer'])
  })

  it('requires all selected signals', () => {
    expect(names({ signals: ['injection'] })).toEqual(['deltaconnected/arcdps'])
    expect(names({ signals: ['injection', 'api_only'] })).toEqual([])
  })

  it('filters by maintenance state', () => {
    expect(names({ maintenance: 'archived' })).toEqual(['old/dead-tool'])
    expect(names({ maintenance: 'active' }).sort())
      .toEqual(['deltaconnected/arcdps', 'someone/gw2-api-viewer'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/search.test.mjs`
Expected: FAIL — cannot resolve `../site/search.js`

- [ ] **Step 3: Implement `site/search.js`**

```js
export function tokenize(s) {
  return (s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

export function indexRepos(repos) {
  return repos.map((repo) => ({
    repo,
    haystack: tokenize([repo.full_name, repo.name, repo.description, (repo.topics ?? []).join(' ')].join(' ')),
  }))
}

const STALE = new Set(['stale_12m', 'stale_24m', 'archived'])

export function filterRepos(indexed, { query = '', bands = [], signals = [], maintenance = 'any' } = {}) {
  const terms = tokenize(query)
  const want = new Set(signals)
  const bandSet = new Set(bands)
  return indexed
    .filter(({ repo, haystack }) => {
      if (!terms.every((t) => haystack.some((h) => h.startsWith(t)))) return false
      if (bandSet.size && !bandSet.has(repo.band)) return false
      const ids = new Set((repo.signals ?? []).map((s) => s.id))
      for (const s of want) if (!ids.has(s)) return false
      if (maintenance === 'archived' && !repo.archived) return false
      if (maintenance === 'stale' && !(ids.has('stale_12m') || ids.has('stale_24m'))) return false
      if (maintenance === 'active' && [...ids].some((id) => STALE.has(id))) return false
      return true
    })
    .map(({ repo }) => repo)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/search.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add site/search.js tests/search.test.mjs
git commit -m "feat: add client-side search and filtering"
```

---

### Task 7: The site

**Files:**
- Create: `site/index.html`, `site/policy.html`, `site/render.js`, `site/app.js`, `site/style.css`, `tests/render.test.mjs`

**Interfaces:**
- Consumes: `filterRepos`, `indexRepos` (Task 6); `data/catalog.json`, `data/policies.json` fetched at `data/…` relative to the page (sibling dir; NOT `../data/…` — the site deploys under a project-pages base path).
- Produces: `escapeHtml(s)`, `repoCard(repo, policiesById) -> string`, `breakdown(repo, policiesById) -> string`.

**Disclaimer string — use verbatim on both pages:**

> ArenaNet does not approve or endorse third-party programs. This site reports observable risk signals from public repository data; a low score is not permission, and nothing here is legal advice. Running any third-party program is at your own risk and may put your account at risk.

- [ ] **Step 1: Write the failing render test**

`tests/render.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { escapeHtml, repoCard, breakdown } from '../site/render.js'

const policies = {
  'ua-third-party-programs': {
    id: 'ua-third-party-programs', title: 'Third-party programs',
    source: 'User Agreement', source_url: 'https://example.com/ua', quote: 'Quoted policy text here.',
  },
}
const repo = {
  full_name: 'a/b', name: 'b', html_url: 'https://github.com/a/b',
  description: 'a tool', band: 'elevated', points: 45, stars: 12,
  pushed_at: '2026-08-01T00:00:00Z', license: 'MIT', topics: [], archived: false,
  signals: [{ id: 'injection', label: 'Client injection or hooking', weight: 25,
              policy: 'ua-third-party-programs', explain: 'Loads code into the game process.',
              evidence: ['text mentions "d3d11"'] }],
  override: null,
}

describe('escapeHtml', () => {
  it('escapes angle brackets, quotes and ampersands', () => {
    expect(escapeHtml('<img src=x onerror="y">&')).toBe(
      '&lt;img src=x onerror=&quot;y&quot;&gt;&amp;')
  })
})

describe('repoCard', () => {
  it('shows the band, points and a link', () => {
    const html = repoCard(repo, policies)
    expect(html).toContain('elevated')
    expect(html).toContain('45')
    expect(html).toContain('https://github.com/a/b')
  })

  it('escapes repo-controlled text', () => {
    const html = repoCard({ ...repo, description: '<script>alert(1)</script>' }, policies)
    expect(html).not.toContain('<script>')
  })

  it('never calls an addon safe or approved', () => {
    expect(repoCard({ ...repo, band: 'low', points: 0 }, policies).toLowerCase())
      .not.toMatch(/\b(safe|approved|allowed|endorsed)\b/)
  })
})

describe('breakdown', () => {
  it('lists each signal with its evidence and its policy quote', () => {
    const html = breakdown(repo, policies)
    expect(html).toContain('Client injection or hooking')
    expect(html).toContain('text mentions &quot;d3d11&quot;')
    expect(html).toContain('Quoted policy text here.')
    expect(html).toContain('https://example.com/ua')
  })

  it('surfaces a manual override with its reason', () => {
    const html = breakdown({ ...repo, override: { reason: 'maintainer confirmed', source_url: 'https://e.com' } }, policies)
    expect(html).toContain('maintainer confirmed')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/render.test.mjs`
Expected: FAIL — cannot resolve `../site/render.js`

- [ ] **Step 3: Implement `site/render.js`**

```js
export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

const months = (iso) =>
  Math.round((Date.now() - new Date(iso)) / (1000 * 60 * 60 * 24 * 30.44))

export function breakdown(repo, policies) {
  const rows = repo.signals.map((s) => {
    const p = policies[s.policy]
    const cite = p
      ? `<blockquote class="quote">${escapeHtml(p.quote)}
           <cite><a href="${escapeHtml(p.source_url)}" rel="noopener">${escapeHtml(p.source)}</a></cite>
         </blockquote>`
      : ''
    return `<li class="signal ${s.weight < 0 ? 'mitigator' : 'risk'}">
      <div class="signal-head"><span class="signal-label">${escapeHtml(s.label)}</span>
        <span class="signal-weight">${s.weight > 0 ? '+' : ''}${s.weight}</span></div>
      <p class="signal-explain">${escapeHtml(s.explain)}</p>
      <p class="signal-evidence">Detected: ${s.evidence.map(escapeHtml).join('; ')}</p>
      ${cite}</li>`
  }).join('')
  const ov = repo.override
    ? `<p class="override">Manual override applied: ${escapeHtml(repo.override.reason)}
       (<a href="${escapeHtml(repo.override.source_url)}" rel="noopener">source</a>)</p>`
    : ''
  return `<div class="breakdown">${ov}<ul class="signals">${rows}</ul></div>`
}

export function repoCard(repo, policies) {
  return `<article class="card band-${escapeHtml(repo.band)}">
    <header>
      <h3><a href="${escapeHtml(repo.html_url)}" rel="noopener">${escapeHtml(repo.full_name)}</a></h3>
      <span class="band">${escapeHtml(repo.band)} risk</span>
      <span class="points" title="risk points out of 100">${repo.points}</span>
    </header>
    <p class="desc">${escapeHtml(repo.description)}</p>
    <p class="meta">${repo.stars} stars &middot; last push ${months(repo.pushed_at)} months ago
      &middot; ${escapeHtml(repo.license ?? 'no license')}</p>
    <details><summary>Why this score</summary>${breakdown(repo, policies)}</details>
  </article>`
}
```

- [ ] **Step 4: Run the render tests to verify they pass**

Run: `npx vitest run tests/render.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 5: Write `site/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GW2 Addon Risk Guide</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="site-head">
  <h1>GW2 Addon Risk Guide</h1>
  <nav><a href="index.html" aria-current="page">Catalog</a> <a href="policy.html">Policy</a></nav>
  <p class="disclaimer">ArenaNet does not approve or endorse third-party programs. This site reports
  observable risk signals from public repository data; a low score is not permission, and nothing
  here is legal advice. Running any third-party program is at your own risk and may put your account
  at risk.</p>
</header>
<main>
  <form id="controls" role="search">
    <input id="q" type="search" placeholder="Search addons&hellip;" autocomplete="off">
    <fieldset id="bands"><legend>Risk band</legend></fieldset>
    <fieldset id="signals"><legend>Signals</legend></fieldset>
    <label>Maintenance
      <select id="maintenance">
        <option value="any">Any</option><option value="active">Actively maintained</option>
        <option value="stale">Stale</option><option value="archived">Archived</option>
      </select>
    </label>
  </form>
  <p id="count" aria-live="polite"></p>
  <div id="results"></div>
  <p id="generated" class="meta"></p>
</main>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 6: Write `site/app.js`**

```js
import { indexRepos, filterRepos } from './search.js'
import { repoCard, escapeHtml } from './render.js'

const $ = (id) => document.getElementById(id)
const [catalog, policyDoc] = await Promise.all([
  fetch('data/catalog.json').then((r) => r.json()),
  fetch('data/policies.json').then((r) => r.json()),
])
const policies = Object.fromEntries(policyDoc.clauses.map((c) => [c.id, c]))
const indexed = indexRepos(catalog.repos)

const checkboxes = (host, items) => {
  host.insertAdjacentHTML('beforeend', items.map(({ value, label }) =>
    `<label><input type="checkbox" value="${escapeHtml(value)}"> ${escapeHtml(label)}</label>`).join(''))
}
checkboxes($('bands'), catalog.bands.map((b) => ({ value: b.id, label: b.id })))
checkboxes($('signals'), catalog.signal_definitions.map((s) => ({ value: s.id, label: s.label })))

const checked = (host) => [...host.querySelectorAll('input:checked')].map((i) => i.value)

function render() {
  const matches = filterRepos(indexed, {
    query: $('q').value,
    bands: checked($('bands')),
    signals: checked($('signals')),
    maintenance: $('maintenance').value,
  })
  $('count').textContent = `${matches.length} of ${catalog.repos.length} repositories`
  $('results').innerHTML = matches.map((r) => repoCard(r, policies)).join('')
}

$('controls').addEventListener('input', render)
$('generated').textContent = `Catalog generated ${new Date(catalog.generated_at).toUTCString()}`
render()
```

- [ ] **Step 7: Write `site/policy.html`**

Same `<head>`, header and disclaimer as `index.html` (with `aria-current` on the Policy link), plus:

```html
<main><div id="clauses"></div></main>
<script type="module">
  import { escapeHtml } from './render.js'
  const doc = await fetch('data/policies.json').then((r) => r.json())
  document.getElementById('clauses').innerHTML = doc.clauses.map((c) => `
    <section class="clause" id="${escapeHtml(c.id)}">
      <h2>${escapeHtml(c.title)}</h2>
      <blockquote class="quote">${escapeHtml(c.quote)}</blockquote>
      <p class="cite"><a href="${escapeHtml(c.source_url)}" rel="noopener">${escapeHtml(c.source)}</a>
        &middot; retrieved ${escapeHtml(c.retrieved)}</p>
    </section>`).join('')
</script>
```

- [ ] **Step 8: Write `site/style.css`**

A single dark stylesheet: system font stack, `max-width: 70rem` centred main, sticky `#controls`, cards as bordered blocks with a left border coloured by band (`--low: #4a9; --moderate: #cb4; --elevated: #e83; --high: #d45`), `.band` pill using the same colour, `.quote` indented with a left rule and italic `cite`, `.mitigator .signal-weight` green. Ensure focus outlines stay visible and text contrast is at least 4.5:1.

- [ ] **Step 9: Verify the site in a browser**

```bash
python3 -m http.server 8000 --directory . &
```

Open `http://localhost:8000/site/index.html`. Check: cards render, search narrows results, band and signal checkboxes filter, "Why this score" expands with evidence and a policy quote, policy page lists clauses with sources. Kill the server afterwards.

- [ ] **Step 10: Commit**

```bash
git add site tests/render.test.mjs
git commit -m "feat: add catalog and policy site"
```

---

### Task 8: Scheduled refresh and Pages deployment

**Files:**
- Create: `.github/workflows/refresh-catalog.yml`, `.github/workflows/pages.yml`; Modify: `README.md`

**Interfaces:**
- Consumes: `npm run catalog`, `npm test`, `site/`, `data/`.
- Produces: a weekly commit of `data/catalog.json` and a Pages deployment on every push to `main`.

- [ ] **Step 1: Write `.github/workflows/refresh-catalog.yml`**

```yaml
name: Refresh catalog
on:
  schedule: [{ cron: '17 4 * * 1' }]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run catalog
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Commit refreshed catalog
        run: |
          git config user.name  'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git add data/catalog.json
          git diff --staged --quiet || git commit -m "chore: refresh catalog"
          git push
```

- [ ] **Step 2: Write `.github/workflows/pages.yml`**

```yaml
name: Deploy Pages
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - name: Stage site
        run: |
          mkdir -p _site/data
          cp -r site/* _site/
          cp data/*.json _site/data/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: _site }
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Verify the staged layout matches the site's fetch paths**

```bash
mkdir -p /tmp/_site/data && cp -r site/* /tmp/_site/ && cp data/*.json /tmp/_site/data/
```

Do NOT serve `/tmp/_site` directly — that is the origin root, and it hides the base-path bug described below.

Serve it under the project-pages base path this repo actually deploys to, not the origin root:

```bash
mkdir -p /tmp/pages/gw2-addon-risk-guide && cp -r /tmp/_site/* /tmp/pages/gw2-addon-risk-guide/
python3 -m http.server 8001 --directory /tmp/pages &
```

Open `http://localhost:8001/gw2-addon-risk-guide/index.html`. The page must fetch `data/catalog.json` (relative, no leading `../` and no leading `/`), which resolves to `/gw2-addon-risk-guide/data/catalog.json`. Expected: catalog renders.

CORRECTION: an earlier draft of this plan asserted that `../data/catalog.json` resolves correctly from `/index.html`. That is true only for a user/org root site. This repo deploys as a PROJECT page, so the page lives at `/gw2-addon-risk-guide/index.html` and `..` climbs to the origin root, giving `/data/catalog.json` -> 404. Verified empirically. Serving from the origin root hides this bug entirely, which is why this step sets up the base path. Kill the server.

- [ ] **Step 4: Update `README.md`**

Document: what the site is, the disclaimer paragraph verbatim, how scoring works (link the signal table), how to run `npm test` and `npm run catalog` locally with `GITHUB_TOKEN`, and how to propose an override (edit `data/overrides.json` with a reason and source URL).

- [ ] **Step 5: Push and confirm both workflows are green**

```bash
git add .github README.md
git commit -m "ci: add scheduled catalog refresh and Pages deploy"
git push
gh run list --limit 5
```

Expected: the Pages workflow succeeds and the site is live. Trigger the scraper once by hand (`gh workflow run refresh-catalog.yml`) and confirm it commits or reports no change.

---

## Verification

Before calling this done:

```bash
npx vitest run
```

Expected: all suites pass. Then confirm on the deployed URL that search, band/signal filters, the score breakdown with policy quotes, and the policy page all work, and that the disclaimer appears on both pages.
