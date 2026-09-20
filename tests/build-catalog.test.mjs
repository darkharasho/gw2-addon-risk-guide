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
    // b/hooked scores 25 (injection); the two 0-point repos then tiebreak by name.
    const cat = await buildCatalog({
      ...deps,
      discover: async () => ['b/hooked', 'z/clean', 'a/clean'],
      enrich: async (n) => (n === 'b/hooked' ? facts(n, { readme: 'a d3d11 hook' }) : facts(n)),
    })
    const got = cat.repos.map((r) => [r.full_name, r.points])
    expect(got).toEqual([['b/hooked', 25], ['a/clean', 0], ['z/clean', 0]])
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

  it('fails rather than silently using the live clock when now is omitted', async () => {
    await expect(buildCatalog({ ...deps, now: undefined })).rejects.toThrow(/now/i)
  })

  it('skips a repo whose enrich throws and still builds the rest of the catalog', async () => {
    const cat = await buildCatalog({
      ...deps,
      discover: async () => [
        'z/injector', 'boom/repo', 'a/clean', 'c/three', 'd/four', 'e/five',
      ],
      enrich: async (n) => {
        if (n === 'boom/repo') throw new Error('502 bad gateway')
        return n === 'z/injector' ? facts(n, { readme: 'a d3d11 hook' }) : facts(n)
      },
    })
    expect(cat.repos.map((r) => r.full_name)).toEqual([
      'z/injector', 'a/clean', 'c/three', 'd/four', 'e/five',
    ])
  })

  it('throws when failures exceed the 20% ceiling', async () => {
    const names = Array.from({ length: 10 }, (_, i) => `owner/repo${i}`)
    await expect(
      buildCatalog({
        ...deps,
        discover: async () => names,
        enrich: async (n) => {
          if (Number(n.replace('owner/repo', '')) < 3) throw new Error('boom')
          return facts(n)
        },
      })
    ).rejects.toThrow(/failures/i)
  })
})
