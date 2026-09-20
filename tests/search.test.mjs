import { describe, it, expect } from 'vitest'
import { tokenize, indexRepos, filterRepos } from '../site/search.js'

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
