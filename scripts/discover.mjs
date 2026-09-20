import { ghPaginate } from './github.mjs'

export const QUERIES = [
  'gw2 addon', 'gw2 overlay', 'gw2 api', 'guild wars 2 addon',
  'guild wars 2 overlay', 'guild wars 2 tool', 'arcdps', 'arcdps plugin',
  'guildwars2', 'gw2 in:name', 'guild wars 2 in:description',
  'topic:guild-wars-2', 'topic:gw2', 'topic:arcdps',
]

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

export async function discover({ token, perQuery = 100 } = {}) {
  const seen = new Map()
  for (const q of QUERIES) {
    const path = `/search/repositories?q=${encodeURIComponent(q)}&per_page=100&sort=updated`
    const items = await ghPaginate(path, { token, max: perQuery })
    for (const r of items) {
      const key = r.full_name.toLowerCase()
      if (!seen.has(key)) seen.set(key, summarize(r, key))
    }
  }
  return [...seen.values()].sort((a, b) => a.full_name.localeCompare(b.full_name))
}
