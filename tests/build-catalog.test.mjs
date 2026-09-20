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
