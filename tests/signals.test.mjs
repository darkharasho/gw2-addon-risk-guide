import { describe, it, expect } from 'vitest'
import { SIGNALS, detect } from '../scripts/signals.mjs'

const NOW = new Date('2026-09-19T00:00:00Z')
const base = {
  full_name: 'a/b', description: '', topics: [], languages: [], readme: '',
  root_files: [], release_assets: [], stars: 50, archived: false,
  pushed_at: '2026-08-01T00:00:00Z', license: 'MIT',
}
const ids = (facts) => detect({ ...base, ...facts }, NOW).map((s) => s.id).sort()

describe('signal table', () => {
  it('has unique ids and a policy clause on every signal', () => {
    expect(new Set(SIGNALS.map((s) => s.id)).size).toBe(SIGNALS.length)
    for (const s of SIGNALS) expect(typeof s.policy).toBe('string')
  })
})

describe('detect', () => {
  it('fires automation on bot language', () => {
    expect(ids({ readme: 'An auto-farm bot for gw2' })).toContain('automation')
  })

  it('fires injection on a d3d11 proxy dll', () => {
    expect(ids({ readme: 'drop d3d11.dll next to the exe', root_files: ['d3d11.dll'] }))
      .toContain('injection')
  })

  it('fires memory and packet on the respective terms', () => {
    expect(ids({ readme: 'uses ReadProcessMemory' })).toContain('memory')
    expect(ids({ readme: 'a packet sniffer for the map protocol' })).toContain('packet')
  })

  it('fires api_only for an official-API consumer and not for an injector', () => {
    expect(ids({ readme: 'Uses the official Guild Wars 2 API at api.guildwars2.com' }))
      .toContain('api_only')
    expect(ids({ readme: 'api.guildwars2.com plus a d3d11 hook' })).not.toContain('api_only')
  })

  it('grades staleness into one bucket only', () => {
    expect(ids({ pushed_at: '2023-01-01T00:00:00Z' })).toContain('stale_24m')
    expect(ids({ pushed_at: '2025-03-01T00:00:00Z' })).toContain('stale_12m')
    expect(ids({ pushed_at: '2025-03-01T00:00:00Z' })).not.toContain('stale_24m')
    expect(ids({})).not.toContain('stale_12m')
  })

  it('fires archived, no_license and obscure from metadata', () => {
    expect(ids({ archived: true, license: null, stars: 3 }))
      .toEqual(expect.arrayContaining(['archived', 'no_license', 'obscure']))
  })

  it('records evidence for every detected signal', () => {
    for (const s of detect({ ...base, readme: 'auto-farm bot', archived: true }, NOW)) {
      expect(s.evidence.length).toBeGreaterThan(0)
    }
  })

  it('tolerates a missing pushed_at without firing staleness or maintained signals', () => {
    const result = detect({ ...base, pushed_at: undefined }, NOW)
    expect(Array.isArray(result)).toBe(true)
    const found = result.map((s) => s.id)
    expect(found).not.toContain('stale_12m')
    expect(found).not.toContain('stale_24m')
    expect(found).not.toContain('popular_maintained')
  })
})
