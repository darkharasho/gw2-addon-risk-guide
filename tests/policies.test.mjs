import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SIGNALS } from '../scripts/signals.mjs'

const policies = JSON.parse(readFileSync('data/policies.json', 'utf8')).clauses

describe('data/policies.json', () => {
  it('gives every clause a verbatim quote and a source', () => {
    expect(policies.length).toBeGreaterThan(0)
    for (const c of policies) {
      expect(c.quote.trim().length).toBeGreaterThan(20)
      expect(c.source_url).toMatch(/^https:\/\//)
      expect(c.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(c.source.length).toBeGreaterThan(0)
    }
  })

  it('has a clause for every policy id referenced by a signal', () => {
    const have = new Set(policies.map((c) => c.id))
    for (const s of SIGNALS) expect(have).toContain(s.policy)
  })
})
