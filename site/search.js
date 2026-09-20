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
