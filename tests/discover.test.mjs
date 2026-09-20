import { describe, it, expect, vi } from 'vitest'
import { QUERIES, discover } from '../scripts/discover.mjs'

vi.mock('../scripts/github.mjs', () => ({
  ghPaginate: vi.fn(async (path) =>
    path.includes('arcdps')
      ? [{ full_name: 'Deltaconnected/ArcDPS' }, { full_name: 'a/b' }]
      : [{ full_name: 'A/B' }]),
  ghFetch: vi.fn(),
}))

describe('discover', () => {
  it('covers the spec search terms', () => {
    const joined = QUERIES.join(' | ').toLowerCase()
    for (const t of ['gw2', 'guild wars 2', 'arcdps']) expect(joined).toContain(t)
  })

  it('dedupes case-insensitively and returns sorted lowercase names', async () => {
    const out = await discover({ token: 't' })
    expect(out).toEqual(['a/b', 'deltaconnected/arcdps'])
  })
})
