// Client-side search and filter over an already-parsed catalog.
// Plain ESM, no DOM access, no Node built-ins, no runtime dependencies —
// runs unmodified in the browser and is importable by Vitest.

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

// Sorting is presentation, not scoring: the catalog ships sorted by risk, and
// every other order is derived here so the data file stays canonical. Ties
// always fall back to name, so a given filter+sort pair renders identically
// on every load rather than depending on the engine's sort stability.
const BY_NAME = (a, b) => a.full_name.localeCompare(b.full_name)
const ORDERINGS = {
  risk: (a, b) => b.points - a.points || BY_NAME(a, b),
  'risk-asc': (a, b) => a.points - b.points || BY_NAME(a, b),
  stars: (a, b) => (b.stars ?? 0) - (a.stars ?? 0) || BY_NAME(a, b),
  recent: (a, b) => String(b.pushed_at ?? '').localeCompare(String(a.pushed_at ?? '')) || BY_NAME(a, b),
  name: BY_NAME,
}

export function sortRepos(repos, order = 'risk') {
  return repos.slice().sort(ORDERINGS[order] ?? ORDERINGS.risk)
}
