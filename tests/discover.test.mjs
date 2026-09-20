import { describe, it, expect, vi } from 'vitest'
import { QUERIES, discover } from '../scripts/discover.mjs'

vi.mock('../scripts/github.mjs', () => ({
  ghPaginate: vi.fn(async (path) =>
    path.includes('arcdps')
      ? [
          { full_name: 'Deltaconnected/ArcDPS', pushed_at: '2026-09-01T00:00:00Z',
            stargazers_count: 900, archived: false, license: { spdx_id: 'MIT' } },
          { full_name: 'a/b', pushed_at: '2026-01-01T00:00:00Z' },
        ]
      : [{ full_name: 'A/B', pushed_at: '2026-01-01T00:00:00Z' }]),
  ghFetch: vi.fn(),
}))

describe('discover', () => {
  it('covers the spec search terms', () => {
    const joined = QUERIES.join(' | ').toLowerCase()
    for (const t of ['gw2', 'guild wars 2', 'arcdps']) expect(joined).toContain(t)
  })

  it('dedupes case-insensitively and returns sorted lowercase names', async () => {
    const out = await discover({ token: 't' })
    expect(out.map((r) => r.full_name)).toEqual(['a/b', 'deltaconnected/arcdps'])
  })

  it('carries the metadata search already gives us, so re-scoring costs nothing', async () => {
    const out = await discover({ token: 't' })
    expect(out.find((r) => r.full_name === 'deltaconnected/arcdps')).toEqual({
      full_name: 'deltaconnected/arcdps',
      pushed_at: '2026-09-01T00:00:00Z',
      stars: 900,
      archived: false,
      license: 'MIT',
    })
  })

  it('defaults the fields a sparse search result omits', async () => {
    const out = await discover({ token: 't' })
    expect(out.find((r) => r.full_name === 'a/b'))
      .toMatchObject({ stars: 0, archived: false, license: null })
  })
})
