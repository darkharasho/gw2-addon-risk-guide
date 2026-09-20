import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CONDUCT_TIERS, ADVANTAGE_TIERS, indexAssessments, isContentious } from '../scripts/conduct.mjs'

const doc = JSON.parse(readFileSync('data/conduct.json', 'utf8'))
const assessments = Object.entries(doc.assessments)
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'))
const policyIds = new Set(JSON.parse(readFileSync('data/policies.json', 'utf8')).clauses.map((c) => c.id))

const repos = new Map(catalog.repos.map((r) => [r.full_name.toLowerCase(), r]))

describe('data/conduct.json', () => {
  it('keys every verdict to a repo that is actually in the catalog', () => {
    // Without this the file rots into opinions about repos that have been
    // deleted, renamed, or gone private - published with nothing to check
    // them against.
    for (const [key] of assessments) expect(repos.has(key.toLowerCase())).toBe(true)
  })

  it('uses only the defined tiers on both axes', () => {
    for (const [key, v] of assessments) {
      expect(CONDUCT_TIERS, `${key} conduct`).toContain(v.conduct)
      expect(ADVANTAGE_TIERS, `${key} advantage`).toContain(v.advantage)
    }
  })

  it('carries a rationale and an ISO assessment date on every verdict', () => {
    for (const [key, v] of assessments) {
      expect(v.rationale?.trim().length ?? 0, `${key} rationale`).toBeGreaterThan(20)
      expect(v.assessed_at, `${key} assessed_at`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('cites a policy clause that exists', () => {
    for (const [key, v] of assessments) {
      if (!isContentious(v)) continue
      expect(policyIds, `${key} policy`).toContain(v.policy)
    }
  })

  it("quotes the repo's own words as evidence for every contentious verdict", () => {
    // The load-bearing rule. The mechanical score is checkable because each
    // signal cites the match that produced it; a judgment has no such anchor
    // unless the schema forces one. Requiring the author's own description
    // means a `directive` call reads a tool's purpose back to it rather than
    // inferring intent - and the catalog stores no README, so description and
    // topics are the only text a test can verify against.
    for (const [key, v] of assessments) {
      if (!isContentious(v)) continue
      const repo = repos.get(key.toLowerCase())
      const quote = (v.evidence ?? '').trim().toLowerCase()
      expect(quote.length, `${key} evidence`).toBeGreaterThan(0)
      const inDescription = String(repo.description ?? '').toLowerCase().includes(quote)
      const inTopics = (repo.topics ?? []).some((t) => t.toLowerCase() === quote)
      expect(inDescription || inTopics, `${key} evidence not found verbatim in description or topics`).toBe(true)
    }
  })

  it('indexes without collisions', () => {
    expect(indexAssessments(doc).size).toBe(assessments.length)
  })
})
