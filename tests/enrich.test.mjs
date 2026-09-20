import { describe, it, expect, vi } from 'vitest'

const repo = {
  full_name: 'Deltaconnected/ArcDPS', name: 'ArcDPS', owner: { login: 'Deltaconnected' },
  html_url: 'https://github.com/Deltaconnected/ArcDPS', description: 'dps meter',
  topics: ['gw2'], language: 'C++', stargazers_count: 100, forks_count: 5,
  archived: false, fork: false, pushed_at: '2026-01-02T00:00:00Z',
  created_at: '2016-01-02T00:00:00Z', license: { spdx_id: 'MIT' },
}

vi.mock('../scripts/github.mjs', () => ({
  ghFetch: vi.fn(async (p) => {
    if (p === '/repos/deltaconnected/arcdps') return repo
    if (p.endsWith('/languages')) return { 'C++': 900, C: 100 }
    if (p.endsWith('/readme')) return { content: Buffer.from('Hooks d3d11').toString('base64') }
    if (p.endsWith('/contents/')) return [{ name: 'DllMain.cpp' }, { name: 'src' }]
    if (p.endsWith('/releases/latest')) return { assets: [{ name: 'd3d11.DLL' }] }
    return null
  }),
  ghPaginate: vi.fn(),
}))

const { enrich } = await import('../scripts/enrich.mjs')

describe('enrich', () => {
  it('flattens the API responses into RepoFacts', async () => {
    const f = await enrich('Deltaconnected/ArcDPS', { token: 't' })
    expect(f.full_name).toBe('Deltaconnected/ArcDPS')
    expect(f.owner).toBe('Deltaconnected')
    expect(f.languages).toEqual(['C++', 'C'])
    expect(f.license).toBe('MIT')
    expect(f.readme).toBe('Hooks d3d11')
    expect(f.root_files).toEqual(['dllmain.cpp', 'src'])
    expect(f.release_assets).toEqual(['d3d11.dll'])
    expect(f.stars).toBe(100)
  })

  it('returns null for a missing repo', async () => {
    const { ghFetch } = await import('../scripts/github.mjs')
    ghFetch.mockResolvedValueOnce(null)
    expect(await enrich('gone/repo', { token: 't' })).toBeNull()
  })
})
