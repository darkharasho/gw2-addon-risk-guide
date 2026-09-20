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
