import { ghPaginate, ghFetch } from './github.mjs'

export const QUERIES = [
  'gw2 addon', 'gw2 overlay', 'gw2 api', 'guild wars 2 addon',
  'guild wars 2 overlay', 'guild wars 2 tool', 'arcdps', 'arcdps plugin',
  'guildwars2', 'gw2 in:name', 'guild wars 2 in:description',
  'topic:guild-wars-2', 'topic:gw2', 'topic:arcdps',
]

// The axi suite. Search finds a repo only when a query matches its name or
// description, and several of these carry neither "gw2" nor "arcdps" in either,
// so they are fetched by name every run instead. A catalog that scores other
// people's addons while quietly omitting its own author's is not being straight
// with anyone - the suite is scored by the same rules as everything else.
//
// Public repos only. Enrichment runs under a token that can read the author's
// private repos, and anything discovered here is committed to a public data
// file; `add` re-checks `private` in case one flips later.
export const SEEDS = [
  'darkharasho/axiam',
  'darkharasho/axibridge',
  'darkharasho/axicode',
  'darkharasho/axiforge',
  'darkharasho/axilog',
  'darkharasho/axiom',
  'darkharasho/axipulse',
  'darkharasho/axiroster',
  'darkharasho/axistream',
  'darkharasho/axitools',
  'darkharasho/axivale',
]

// AxiBridge creates a repo on its user's behalf to publish arcdps fight
// reports to GitHub Pages, stamping it with a fixed description. Those repos
// are log dumps, not addons, and there is one per AxiBridge user - left in,
// they grow without bound and drown the catalog in identical 10-point entries.
//
// The three strings are every description the app has ever set, oldest first.
// Matched exactly, not by substring: a real tool whose description happens to
// mention reports keeps its place.
const GENERATED_DESCRIPTIONS = new Set([
  'gw2 arc log reports',
  'arcbridge reports',
  'axibridge reports',
])

export const isGeneratedReportRepo = (r) =>
  GENERATED_DESCRIPTIONS.has((r.description ?? '').trim().toLowerCase())

// Search runs as the token's owner, so it returns that account's own private
// repos alongside the public ones - and everything discovered lands in a
// public data file. A repo that was public when first discovered and has since
// been made private must drop out of the catalog rather than keep publishing
// the name, description and score it had on the way in.
export const isPublishable = (r) => !r.private && !isGeneratedReportRepo(r)

// Search already returns a full repo object per hit, so every field here is
// free - it rides along on a call we were making anyway. Carrying it forward
// instead of discarding everything but the name is what lets the catalog
// decide, at no cost, which repos actually need re-reading.
const summarize = (r, full_name) => ({
  full_name,
  pushed_at: r.pushed_at ?? null,
  stars: r.stargazers_count ?? 0,
  archived: !!r.archived,
  license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
})

export async function discover({ token, perQuery = 100, seeds = SEEDS } = {}) {
  const seen = new Map()
  const add = (r) => {
    const key = r.full_name.toLowerCase()
    if (!seen.has(key) && isPublishable(r)) seen.set(key, summarize(r, key))
  }
  for (const q of QUERIES) {
    const path = `/search/repositories?q=${encodeURIComponent(q)}&per_page=100&sort=updated`
    const items = await ghPaginate(path, { token, max: perQuery })
    for (const r of items) add(r)
  }
  // Seeds run last so a seed the search already turned up costs no extra call.
  // A seed that has been renamed or deleted 404s, which ghFetch reports as
  // null: one missing repo should not fail a 672-repo refresh. A seed that has
  // gone private is dropped by `add`, same as any other private repo.
  for (const full_name of seeds) {
    if (seen.has(full_name.toLowerCase())) continue
    const r = await ghFetch(`/repos/${full_name}`, { token })
    if (r?.full_name) add(r)
  }
  return [...seen.values()].sort((a, b) => a.full_name.localeCompare(b.full_name))
}
