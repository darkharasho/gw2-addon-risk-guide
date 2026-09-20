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

export function filterRepos(indexed, { query = '', bands = [], signals = [], maintenance = 'any', conduct = [] } = {}) {
  const terms = tokenize(query)
  const want = new Set(signals)
  const bandSet = new Set(bands)
  // Tiers are matched against the verdict only. A repo with no assessment is
  // unexamined, which is a different claim from one judged to have no bearing
  // on play - so it never answers a conduct filter, not even for 'none'.
  const conductSet = new Set(conduct)
  return indexed
    .filter(({ repo, haystack }) => {
      if (!terms.every((t) => haystack.some((h) => h.startsWith(t)))) return false
      if (bandSet.size && !bandSet.has(repo.band)) return false
      const ids = new Set((repo.signals ?? []).map((s) => s.id))
      for (const s of want) if (!ids.has(s)) return false
      if (maintenance === 'archived' && !repo.archived) return false
      if (maintenance === 'stale' && !(ids.has('stale_12m') || ids.has('stale_24m'))) return false
      if (maintenance === 'active' && [...ids].some((id) => STALE.has(id))) return false
      if (conductSet.size && !conductSet.has(repo.assessment?.conduct)) return false
      return true
    })
    .map(({ repo }) => repo)
}

// Sorting is presentation, not scoring: the catalog ships sorted by risk, and
// every other order is derived here so the data file stays canonical. Ties
// always fall back to name, so a given filter+sort pair renders identically
// on every load rather than depending on the engine's sort stability.
const BY_NAME = (a, b) => a.full_name.localeCompare(b.full_name)
const BY_STARS = (a, b) => (b.stars ?? 0) - (a.stars ?? 0)

// Band ids are the scorer's own point thresholds in ascending order, so a
// repo's rank is its index here. An unrecognised band sorts last: a band added
// to the scorer should never silently land at the top of the default view.
const BAND_RANK = ['low', 'moderate', 'elevated', 'high']
const bandRank = (r) => {
  const i = BAND_RANK.indexOf(r.band)
  return i < 0 ? BAND_RANK.length : i
}

const ORDERINGS = {
  // The default. Leading with the highest scores turned the front page into a
  // list of the most invasive things anyone has written for the game, which
  // reads as a directory of them rather than a warning about them. Safest
  // first, most-used first within a band: the things a player is most likely
  // to already be running are what they see.
  safest: (a, b) => bandRank(a) - bandRank(b) || BY_STARS(a, b) || BY_NAME(a, b),
  risk: (a, b) => b.points - a.points || BY_NAME(a, b),
  stars: (a, b) => BY_STARS(a, b) || BY_NAME(a, b),
  recent: (a, b) => String(b.pushed_at ?? '').localeCompare(String(a.pushed_at ?? '')) || BY_NAME(a, b),
  name: BY_NAME,
}

export function sortRepos(repos, order = 'safest') {
  return repos.slice().sort(ORDERINGS[order] ?? ORDERINGS.safest)
}
