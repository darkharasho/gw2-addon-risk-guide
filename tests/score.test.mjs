import { describe, it, expect } from 'vitest'
import { score, bandFor } from '../scripts/score.mjs'

const NOW = new Date('2026-09-19T00:00:00Z')
const base = {
  full_name: 'a/b', description: '', topics: [], readme: '', root_files: [],
  release_assets: [], stars: 50, archived: false,
  pushed_at: '2026-08-01T00:00:00Z', license: 'MIT',
}

describe('bandFor', () => {
  it('maps points onto the four bands', () => {
    expect(bandFor(0)).toBe('low')
    expect(bandFor(19)).toBe('low')
    expect(bandFor(20)).toBe('moderate')
    expect(bandFor(44)).toBe('moderate')
    expect(bandFor(45)).toBe('elevated')
    expect(bandFor(70)).toBe('high')
    expect(bandFor(100)).toBe('high')
  })
})

describe('score', () => {
  it('sums signal weights', () => {
    const r = score({ ...base, readme: 'an auto-farm bot that uses ReadProcessMemory' }, { now: NOW })
    expect(r.points).toBe(75)
    expect(r.band).toBe('high')
  })

  it('clamps to 0 when mitigators outweigh', () => {
    const r = score({ ...base, readme: 'uses api.guildwars2.com only', stars: 500 }, { now: NOW })
    expect(r.points).toBe(0)
    expect(r.band).toBe('low')
  })

  it('clamps to 100', () => {
    const r = score({
      ...base, readme: 'bot with ReadProcessMemory, packet sniffing and a d3d11 hook',
      archived: true, license: null, stars: 0, pushed_at: '2020-01-01T00:00:00Z',
    }, { now: NOW })
    expect(r.points).toBe(100)
  })

  it('applies an override that suppresses a signal', () => {
    const r = score({ ...base, readme: 'auto-farm bot' }, {
      now: NOW,
      override: { suppress: ['automation'], reason: 'name collision', source_url: 'https://example.com' },
    })
    expect(r.signals.map((s) => s.id)).not.toContain('automation')
    expect(r.override.reason).toBe('name collision')
  })

  it('applies an override that adds a signal', () => {
    const r = score(base, {
      now: NOW,
      override: { add: ['injection'], reason: 'injects, undocumented in README', source_url: 'https://example.com' },
    })
    expect(r.signals.map((s) => s.id)).toContain('injection')
    expect(r.signals.find((s) => s.id === 'injection').evidence)
      .toContain('manual override: injects, undocumented in README')
  })
})
