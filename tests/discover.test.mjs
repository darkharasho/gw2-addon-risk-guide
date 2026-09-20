import { describe, it, expect, vi } from 'vitest'
import { QUERIES, SEEDS, discover, isGeneratedReportRepo } from '../scripts/discover.mjs'

vi.mock('../scripts/github.mjs', () => ({
  ghPaginate: vi.fn(async (path) =>
    path.includes('arcdps')
      ? [
          { full_name: 'Deltaconnected/ArcDPS', pushed_at: '2026-09-01T00:00:00Z',
            stargazers_count: 900, archived: false, license: { spdx_id: 'MIT' } },
          { full_name: 'a/b', pushed_at: '2026-01-01T00:00:00Z' },
        ]
      : [
          { full_name: 'A/B', pushed_at: '2026-01-01T00:00:00Z' },
          { full_name: 'someone/gw2logs', description: 'AxiBridge Reports' },
        ]),
  ghFetch: vi.fn(async (path) => FETCHED[path] ?? null),
}))

// Keyed by the path discover builds for a seed, so a test asserting a seed
// landed is also asserting the URL it was fetched from.
const FETCHED = {
  '/repos/darkharasho/axipulse': {
    full_name: 'darkharasho/axipulse', pushed_at: '2026-09-10T00:00:00Z',
    stargazers_count: 7, description: 'Personal GW2 combat analysis dashboard',
  },
  '/repos/darkharasho/axidps': { full_name: 'darkharasho/axidps', private: true },
}

describe('discover', () => {
  it('covers the spec search terms', () => {
    const joined = QUERIES.join(' | ').toLowerCase()
    for (const t of ['gw2', 'guild wars 2', 'arcdps']) expect(joined).toContain(t)
  })

  it('dedupes case-insensitively and returns sorted lowercase names', async () => {
    const out = await discover({ token: 't', seeds: [] })
    expect(out.map((r) => r.full_name)).toEqual(['a/b', 'deltaconnected/arcdps'])
  })

  it('carries the metadata search already gives us, so re-scoring costs nothing', async () => {
    const out = await discover({ token: 't', seeds: [] })
    expect(out.find((r) => r.full_name === 'deltaconnected/arcdps')).toEqual({
      full_name: 'deltaconnected/arcdps',
      pushed_at: '2026-09-01T00:00:00Z',
      stars: 900,
      archived: false,
      license: 'MIT',
    })
  })

  it('defaults the fields a sparse search result omits', async () => {
    const out = await discover({ token: 't', seeds: [] })
    expect(out.find((r) => r.full_name === 'a/b'))
      .toMatchObject({ stars: 0, archived: false, license: null })
  })
})

describe('the axi suite seeds', () => {
  it('names only repos under the catalog author', () => {
    for (const s of SEEDS) expect(s.startsWith('darkharasho/')).toBe(true)
  })

  it('fetches a seed that no search query turned up', async () => {
    const out = await discover({ token: 't', seeds: ['darkharasho/axipulse'] })
    expect(out.find((r) => r.full_name === 'darkharasho/axipulse'))
      .toMatchObject({ stars: 7, pushed_at: '2026-09-10T00:00:00Z' })
  })

  it('drops a seed that has gone private rather than publishing its metadata', async () => {
    const out = await discover({ token: 't', seeds: ['darkharasho/axidps'] })
    expect(out.some((r) => r.full_name === 'darkharasho/axidps')).toBe(false)
  })

  it('survives a seed that no longer exists', async () => {
    const out = await discover({ token: 't', seeds: ['darkharasho/deleted'] })
    expect(out.map((r) => r.full_name)).toEqual(['a/b', 'deltaconnected/arcdps'])
  })

  it('does not spend a call on a seed the search already found', async () => {
    const { ghFetch } = await import('../scripts/github.mjs')
    ghFetch.mockClear()
    await discover({ token: 't', seeds: ['a/b'] })
    expect(ghFetch).not.toHaveBeenCalled()
  })
})

describe('generated report repos', () => {
  it('matches every description AxiBridge has stamped on one', () => {
    for (const d of ['GW2 Arc Log Reports', 'ArcBridge Reports', 'AxiBridge Reports'])
      expect(isGeneratedReportRepo({ description: d })).toBe(true)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(isGeneratedReportRepo({ description: '  axibridge reports ' })).toBe(true)
  })

  it('leaves a real tool that merely mentions reports alone', () => {
    for (const d of ['An arcdps log uploader and report formatter', 'GW2 Arc Log Reports viewer', '', null, undefined])
      expect(isGeneratedReportRepo({ description: d })).toBe(false)
  })

  it('keeps them out of discovery entirely', async () => {
    const out = await discover({ token: 't', seeds: [] })
    expect(out.some((r) => r.full_name === 'someone/gw2logs')).toBe(false)
  })
})
