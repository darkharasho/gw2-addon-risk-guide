import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { discover as realDiscover } from './discover.mjs'
import { enrich as realEnrich } from './enrich.mjs'
import { score as realScore, rescore as realRescore, BANDS } from './score.mjs'
import { SIGNALS } from './signals.mjs'
import { indexAssessments, assessmentFor } from '../site/conduct.mjs'

const FAILURE_CEILING = 0.2

// Enriching one repo costs five REST calls (/repos, /languages, /readme,
// /contents, /releases/latest). A workflow GITHUB_TOKEN gets 1,000 REST calls
// per hour, so a full 678-repo pass needs ~3,400 and cannot finish. The budget
// caps how many repos a single run is willing to re-read; everything else is
// served from cache, which costs nothing and stays accurate for all the
// metadata signals.
export const CALLS_PER_REPO = 5

export function scorerFingerprint() {
  const h = createHash('sha256')
  for (const f of ['signals.mjs', 'score.mjs']) {
    h.update(readFileSync(fileURLToPath(new URL(f, import.meta.url))))
  }
  return h.digest('hex').slice(0, 16)
}

export async function buildCatalog({
  discover = realDiscover, enrich = realEnrich, score = realScore, rescore = realRescore,
  now, overrides = {}, assessments = {}, token, previous = null, budget = Infinity,
  fingerprint = scorerFingerprint(),
} = {}) {
  if (!now) throw new Error('buildCatalog requires an explicit `now`')
  const summaries = await discover({ token })
  const cache = new Map((previous?.repos ?? []).map((r) => [r.full_name.toLowerCase(), r]))
  // Cached content signals are only meaningful if the code that produced them
  // is the code running now. A scorer edit invalidates every one of them.
  const cacheUsable = !!previous && previous.scorer_fingerprint === fingerprint

  // A repo carrying a manual override is always re-read. Its cached signal list
  // has already had the override applied - suppressed signals are simply absent
  // - so re-scoring from it would make the suppression permanent and invisible.
  const reusable = (s) => {
    if (!cacheUsable || overrides[s.full_name]) return null
    const prev = cache.get(s.full_name)
    if (!prev || prev.override) return null
    return prev.pushed_at === s.pushed_at ? prev : null
  }

  const reuse = new Map()
  const needed = []
  for (const s of summaries) {
    const prev = reusable(s)
    if (prev) reuse.set(s.full_name, prev)
    else needed.push(s)
  }

  // Under a budget, spend it on repos the catalog cannot describe at all before
  // repos it can describe from a stale cache; within each group, most recently
  // pushed first.
  needed.sort((a, b) => {
    const known = (x) => (cache.has(x.full_name) ? 1 : 0)
    return known(a) - known(b) || String(b.pushed_at).localeCompare(String(a.pushed_at))
  })
  const refresh = new Set(needed.slice(0, budget).map((s) => s.full_name))

  const repos = []
  const entry = (facts, s) => ({
    full_name: facts.full_name, name: facts.name, owner: facts.owner,
    html_url: facts.html_url, description: facts.description, topics: facts.topics,
    language: facts.language, stars: facts.stars, archived: facts.archived,
    pushed_at: facts.pushed_at, license: facts.license,
    points: s.points, band: s.band, signals: s.signals, override: s.override,
  })
  // A cached entry re-scored in place: its content fields are last run's, but
  // stars, archived and license are refreshed from the free search summary so
  // the card never disagrees with the signals computed from them.
  const cachedEntry = (prev, summary, s) => ({
    ...prev,
    stars: summary.stars, archived: summary.archived, license: summary.license,
    pushed_at: summary.pushed_at ?? prev.pushed_at,
    points: s.points, band: s.band, signals: s.signals, override: s.override,
  })

  let attempted = 0
  let failures = 0
  let deferred = 0
  for (const s of summaries) {
    const override = overrides[s.full_name] ?? null
    const prev = reuse.get(s.full_name)
    if (prev) {
      repos.push(cachedEntry(prev, s, rescore(prev, s, { now, override })))
      continue
    }
    const stale = cache.get(s.full_name)
    if (!refresh.has(s.full_name)) {
      // Out of budget. Serving last run's content beats dropping the repo, and
      // beats tripping the shrink guard on a catalog that is merely behind.
      if (stale) {
        deferred += 1
        repos.push(cachedEntry(stale, s, rescore(stale, s, { now, override })))
      }
      continue
    }
    attempted += 1
    try {
      const facts = await enrich(s.full_name, { token })
      if (!facts) continue
      repos.push(entry(facts, score(facts, { now, override })))
    } catch (err) {
      failures += 1
      console.warn(`skipping ${s.full_name}: ${err.message}`)
      if (stale) repos.push(cachedEntry(stale, s, rescore(stale, s, { now, override })))
    }
  }
  if (attempted > 0 && failures > attempted * FAILURE_CEILING) {
    throw new Error(`too many enrichment failures: ${failures}/${attempted}`)
  }
  // Applied in one pass after scoring rather than inside entry()/cachedEntry(),
  // so a verdict reaches fresh, cached and deferred entries identically and
  // there is exactly one place where the two axes meet. Additive only: nothing
  // here reads or writes points, band or signals.
  const conduct = indexAssessments(assessments)
  for (const r of repos) r.assessment = assessmentFor(conduct, r.full_name)

  repos.sort((a, b) => b.points - a.points || a.full_name.localeCompare(b.full_name))
  return {
    bands: BANDS,
    generated_at: now.toISOString(),
    scorer_fingerprint: fingerprint,
    stats: { discovered: summaries.length, reused: reuse.size, enriched: attempted, deferred, failures },
    repos,
    signal_definitions: SIGNALS,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const overrides = JSON.parse(readFileSync('data/overrides.json', 'utf8')).overrides ?? {}
  const assessments = existsSync('data/conduct.json')
    ? JSON.parse(readFileSync('data/conduct.json', 'utf8')) : {}
  const previous = existsSync('data/catalog.json')
    ? JSON.parse(readFileSync('data/catalog.json', 'utf8')) : null
  const budget = Number(process.env.ENRICH_BUDGET ?? Infinity)
  const now = new Date()
  const catalog = await buildCatalog({
    token: process.env.GITHUB_TOKEN, overrides, assessments, now, previous, budget,
  })
  writeFileSync('data/catalog.json', JSON.stringify(catalog, null, 2) + '\n')
  const { discovered, reused, enriched, deferred, failures } = catalog.stats
  console.log(
    `wrote ${catalog.repos.length} repos to data/catalog.json ` +
    `(discovered ${discovered}, reused ${reused}, enriched ${enriched} ` +
    `≈${enriched * CALLS_PER_REPO} calls, deferred ${deferred}, failures ${failures})`
  )
  if (deferred > 0) console.log(`${deferred} repos are serving stale content; raise ENRICH_BUDGET or wait for the next run.`)
}
