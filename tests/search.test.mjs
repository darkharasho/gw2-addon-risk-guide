import { describe, it, expect } from 'vitest'
import { tokenize, indexRepos, filterRepos, sortRepos } from '../site/search.js'

const repo = (full_name, over = {}) => ({
  full_name, name: full_name.split('/')[1], description: '', topics: [],
  band: 'low', signals: [], archived: false, ...over,
})
const repos = [
  repo('deltaconnected/arcdps', { band: 'elevated', signals: [{ id: 'injection' }], description: 'dps meter' }),
  repo('someone/gw2-api-viewer', { band: 'low', signals: [{ id: 'api_only' }] }),
  repo('old/dead-tool', { band: 'moderate', signals: [{ id: 'stale_24m' }], archived: true }),
]
const idx = indexRepos(repos)
const names = (opts) => filterRepos(idx, opts).map((r) => r.full_name)

describe('tokenize', () => {
  it('splits on non-alphanumerics and lowercases', () => {
    expect(tokenize('GW2-API_viewer/x')).toEqual(['gw2', 'api', 'viewer', 'x'])
  })
})

describe('filterRepos', () => {
  it('returns everything for an empty filter', () => {
    expect(names({}).length).toBe(3)
  })

  it('matches query terms as prefixes across name and description', () => {
    expect(names({ query: 'arc' })).toEqual(['deltaconnected/arcdps'])
    expect(names({ query: 'dps met' })).toEqual(['deltaconnected/arcdps'])
  })

  it('ANDs query terms', () => {
    expect(names({ query: 'arcdps viewer' })).toEqual([])
  })

  it('filters by band', () => {
    expect(names({ bands: ['low'] })).toEqual(['someone/gw2-api-viewer'])
  })

  it('requires all selected signals', () => {
    expect(names({ signals: ['injection'] })).toEqual(['deltaconnected/arcdps'])
    expect(names({ signals: ['injection', 'api_only'] })).toEqual([])
  })

  it('filters by maintenance state', () => {
    expect(names({ maintenance: 'archived' })).toEqual(['old/dead-tool'])
    expect(names({ maintenance: 'active' }).sort())
      .toEqual(['deltaconnected/arcdps', 'someone/gw2-api-viewer'])
  })
})

describe('sortRepos', () => {
  const repos = [
    { full_name: 'b/two', points: 10, stars: 5, pushed_at: '2026-01-01T00:00:00Z' },
    { full_name: 'a/one', points: 40, stars: 1, pushed_at: '2026-06-01T00:00:00Z' },
    { full_name: 'c/three', points: 10, stars: 90, pushed_at: '2025-01-01T00:00:00Z' },
  ]
  const names = (order) => sortRepos(repos, order).map((r) => r.full_name)

  it('orders by risk, then by name so equal scores are stable', () => {
    expect(names('risk')).toEqual(['a/one', 'b/two', 'c/three'])
  })

  it('reverses for lowest risk first', () => {
    expect(names('risk-asc')).toEqual(['b/two', 'c/three', 'a/one'])
  })

  it('orders by stars and by recency', () => {
    expect(names('stars')).toEqual(['c/three', 'b/two', 'a/one'])
    expect(names('recent')).toEqual(['a/one', 'b/two', 'c/three'])
  })

  it('falls back to the risk ordering for an unknown sort key', () => {
    expect(names('nonsense')).toEqual(names('risk'))
  })

  it('does not mutate the array it was given', () => {
    const before = repos.map((r) => r.full_name)
    sortRepos(repos, 'stars')
    expect(repos.map((r) => r.full_name)).toEqual(before)
  })
})
