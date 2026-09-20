import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildCatalog, CALLS_PER_REPO } from '../scripts/build-catalog.mjs'

const NOW = new Date('2026-09-19T00:00:00Z')
const facts = (full_name, over = {}) => ({
  full_name, name: full_name.split('/')[1], owner: full_name.split('/')[0],
  html_url: `https://github.com/${full_name}`, description: '', topics: [],
  language: 'C++', languages: ['C++'], readme: '', root_files: [], release_assets: [],
  stars: 50, forks: 1, archived: false, fork: false, license: 'MIT',
  pushed_at: '2026-08-01T00:00:00Z', created_at: '2020-01-01T00:00:00Z', ...over,
})

const FP = 'test-fingerprint'
const sum = (full_name, over = {}) => ({
  full_name, pushed_at: '2026-08-01T00:00:00Z', stars: 50, archived: false, license: 'MIT', ...over,
})
const found = (...names) => names.map((n) => sum(n))

const deps = {
  discover: async () => found('z/injector', 'a/clean', 'ghost/gone'),
  fingerprint: FP,
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
      discover: async () => found('b/hooked', 'z/clean', 'a/clean'),
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
      discover: async () => found(
        'z/injector', 'boom/repo', 'a/clean', 'c/three', 'd/four', 'e/five',
      ),
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
        discover: async () => names.map((n) => sum(n)),
        enrich: async (n) => {
          if (Number(n.replace('owner/repo', '')) < 3) throw new Error('boom')
          return facts(n)
        },
      })
    ).rejects.toThrow(/failures/i)
  })
})

describe('buildCatalog incremental refresh', () => {
  // `ghost/gone` is deliberately absent here: it enriches to null, so it never
  // enters the catalog, is never in the cache, and is correctly re-attempted
  // every run. Keeping it out isolates these tests to the caching decision.
  const live = { ...deps, discover: async () => found('z/injector', 'a/clean') }

  // A prior catalog is the cache. Building it through buildCatalog itself keeps
  // the fixture honest: it is exactly the shape a real previous run commits.
  const priorFor = async (over = {}) => buildCatalog({ ...live, ...over })

  const counting = (impl) => {
    const calls = []
    return { calls, fn: async (n, o) => { calls.push(n); return impl(n, o) } }
  }

  it('does not re-read a repo whose pushed_at is unchanged', async () => {
    const previous = await priorFor()
    const { calls, fn } = counting(deps.enrich)
    const cat = await buildCatalog({ ...live, enrich: fn, previous })
    expect(calls).toEqual([])
    expect(cat.stats.reused).toBe(2)
    expect(cat.repos.map((r) => r.full_name)).toEqual(['z/injector', 'a/clean'])
  })

  it('keeps the cached content signals rather than losing them', async () => {
    const previous = await priorFor()
    const cat = await buildCatalog({ ...live, enrich: async () => { throw new Error('no') }, previous })
    const r = cat.repos.find((x) => x.full_name === 'z/injector')
    expect(r.signals.map((s) => s.id)).toContain('injection')
    expect(r.points).toBe(25)
  })

  it('re-reads only the repo that was actually pushed to', async () => {
    const previous = await priorFor()
    const { calls, fn } = counting(deps.enrich)
    await buildCatalog({
      ...deps,
      discover: async () => [sum('z/injector', { pushed_at: '2026-09-10T00:00:00Z' }), sum('a/clean')],
      enrich: fn,
      previous,
    })
    expect(calls).toEqual(['z/injector'])
  })

  it('ages a cached repo into a staleness signal without any API call', async () => {
    const previous = await priorFor()
    const { calls, fn } = counting(deps.enrich)
    // Same pushed_at, clock moved 14 months on: stale_12m must appear anyway.
    const cat = await buildCatalog({
      ...live, enrich: fn, previous, now: new Date('2027-11-19T00:00:00Z'),
    })
    expect(calls).toEqual([])
    expect(cat.repos.find((r) => r.full_name === 'a/clean').signals.map((s) => s.id))
      .toContain('stale_12m')
  })

  it('refreshes stars from the free search summary, card and signals together', async () => {
    const previous = await priorFor()
    const cat = await buildCatalog({
      ...deps,
      discover: async () => [sum('a/clean', { stars: 900 })],
      enrich: async () => { throw new Error('should not be called') },
      previous,
    })
    const r = cat.repos.find((x) => x.full_name === 'a/clean')
    expect(r.stars).toBe(900)
    expect(r.signals.map((s) => s.id)).toContain('popular_maintained')
  })

  it('invalidates the whole cache when the scorer itself changed', async () => {
    const previous = await priorFor()
    const { calls, fn } = counting(deps.enrich)
    await buildCatalog({ ...live, enrich: fn, previous, fingerprint: 'scorer-was-edited' })
    expect(calls.sort()).toEqual(['a/clean', 'z/injector'])
  })

  it('re-reads an overridden repo instead of re-scoring its edited signal list', async () => {
    const overrides = { 'z/injector': { suppress: ['injection'], reason: 'r', source_url: 'https://e.com' } }
    const previous = await priorFor({ overrides })
    const { calls, fn } = counting(deps.enrich)
    await buildCatalog({ ...live, overrides, enrich: fn, previous })
    expect(calls).toEqual(['z/injector'])
  })

  it('re-reads a repo whose override was added since the cache was written', async () => {
    const previous = await priorFor()
    const { calls, fn } = counting(deps.enrich)
    await buildCatalog({
      ...live,
      overrides: { 'a/clean': { add: ['cheat'], reason: 'r', source_url: 'https://e.com' } },
      enrich: fn,
      previous,
    })
    expect(calls).toEqual(['a/clean'])
  })

  it('re-reads a repo whose override was removed since the cache was written', async () => {
    const overrides = { 'z/injector': { suppress: ['injection'], reason: 'r', source_url: 'https://e.com' } }
    const previous = await priorFor({ overrides })
    const { calls, fn } = counting(deps.enrich)
    await buildCatalog({ ...live, enrich: fn, previous })
    expect(calls).toEqual(['z/injector'])
  })

  it('spends a tight budget on repos it has never seen before', async () => {
    const previous = await priorFor()
    const { calls, fn } = counting((n) => facts(n))
    await buildCatalog({
      ...deps,
      discover: async () => [
        sum('z/injector', { pushed_at: '2026-09-10T00:00:00Z' }),
        sum('brand/new', { pushed_at: '2026-09-02T00:00:00Z' }),
      ],
      enrich: fn,
      previous,
      budget: 1,
    })
    expect(calls).toEqual(['brand/new'])
  })

  it('serves a budget-skipped repo from cache rather than dropping it', async () => {
    const previous = await priorFor()
    const cat = await buildCatalog({
      ...deps,
      discover: async () => [
        sum('z/injector', { pushed_at: '2026-09-10T00:00:00Z' }),
        sum('a/clean', { pushed_at: '2026-09-11T00:00:00Z' }),
      ],
      enrich: async (n) => facts(n),
      previous,
      budget: 1,
    })
    expect(cat.repos.map((r) => r.full_name).sort()).toEqual(['a/clean', 'z/injector'])
    expect(cat.stats.deferred).toBe(1)
  })

  it('stays inside the workflow token budget for a full-size catalog', async () => {
    const big = Array.from({ length: 700 }, (_, i) => sum(`owner/repo${i}`))
    const { calls, fn } = counting((n) => facts(n))
    await buildCatalog({
      ...deps, discover: async () => big, enrich: fn, budget: 150,
    })
    expect(calls.length * CALLS_PER_REPO).toBeLessThan(1000)
  })

  it('records the fingerprint so the next run can trust its own cache', async () => {
    const cat = await buildCatalog(deps)
    expect(cat.scorer_fingerprint).toBe(FP)
  })
})

describe('conduct assessments', () => {
  it('merges a verdict onto the matching repo, case-insensitively', async () => {
    const cat = await buildCatalog({
      ...deps,
      assessments: { assessments: { 'Z/Injector': { conduct: 'directive', advantage: 'some' } } },
    })
    expect(cat.repos.find((r) => r.full_name === 'z/injector').assessment)
      .toEqual({ conduct: 'directive', advantage: 'some' })
  })

  it('gives every unassessed repo an explicit null rather than a missing key', async () => {
    const cat = await buildCatalog(deps)
    for (const r of cat.repos) expect(r.assessment).toBe(null)
  })

  it('leaves points, band and signals byte-identical', async () => {
    // The axis is independent by construction, not by convention: if a verdict
    // can move a score, the number stops being falsifiable from the signals.
    const scored = (c) => JSON.stringify(
      c.repos.map((r) => [r.full_name, r.points, r.band, r.signals, r.override]))
    const without = await buildCatalog(deps)
    const with_ = await buildCatalog({
      ...deps,
      assessments: { assessments: { 'z/injector': { conduct: 'substitutive', advantage: 'strong' } } },
    })
    expect(scored(with_)).toBe(scored(without))
  })

  it('does not fold conduct.mjs into the scorer fingerprint', async () => {
    // Hashing it would invalidate every cached entry and force a 671-repo
    // re-enrichment that cannot finish inside the API budget.
    const src = readFileSync('scripts/build-catalog.mjs', 'utf8')
    expect(src).toContain("['signals.mjs', 'score.mjs']")
  })
})
