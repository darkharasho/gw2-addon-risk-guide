import { describe, it, expect } from 'vitest'
import {
  CONDUCT_TIERS, ADVANTAGE_TIERS, indexAssessments, assessmentFor,
  isContentious, badgeLabel,
} from '../site/conduct.mjs'

const doc = {
  assessments: {
    'qq1ng/rezzOrder': { conduct: 'directive', advantage: 'some' },
    'A/Boon-Table': { conduct: 'assistive', advantage: 'none' },
  },
}

describe('the enums', () => {
  it('orders conduct from no bearing on play to acting for you', () => {
    expect(CONDUCT_TIERS).toEqual(['none', 'assistive', 'directive', 'substitutive'])
  })

  it('grades advantage rather than naming mechanisms', () => {
    expect(ADVANTAGE_TIERS).toEqual(['none', 'some', 'strong'])
  })
})

describe('indexAssessments', () => {
  it('keys case-insensitively, so casing drift cannot detach a verdict', () => {
    const ix = indexAssessments(doc)
    expect(assessmentFor(ix, 'QQ1NG/rezzorder').conduct).toBe('directive')
    expect(assessmentFor(ix, 'a/boon-table').conduct).toBe('assistive')
  })

  it('returns null for a repo with no verdict', () => {
    expect(assessmentFor(indexAssessments(doc), 'someone/unknown')).toBe(null)
  })

  it('tolerates a missing or empty document', () => {
    expect(indexAssessments(null).size).toBe(0)
    expect(indexAssessments({}).size).toBe(0)
  })
})

describe('isContentious', () => {
  it('is true when either axis is non-none', () => {
    expect(isContentious({ conduct: 'directive', advantage: 'none' })).toBe(true)
    expect(isContentious({ conduct: 'assistive', advantage: 'strong' })).toBe(true)
  })

  it('is false for a benign verdict and for no verdict at all', () => {
    expect(isContentious({ conduct: 'assistive', advantage: 'none' })).toBe(false)
    expect(isContentious({ conduct: 'none', advantage: 'none' })).toBe(false)
    expect(isContentious(null)).toBe(false)
  })
})

describe('badgeLabel', () => {
  it('names the conduct tier when conduct is what fired', () => {
    expect(badgeLabel({ conduct: 'directive', advantage: 'none' })).toBe('directive')
    expect(badgeLabel({ conduct: 'substitutive', advantage: 'none' })).toBe('substitutive')
  })

  it('prefers conduct when both axes fire, as the more specific claim', () => {
    expect(badgeLabel({ conduct: 'directive', advantage: 'strong' })).toBe('directive')
  })

  it('falls back to advantage when only that fired', () => {
    expect(badgeLabel({ conduct: 'assistive', advantage: 'strong' })).toBe('advantage')
    expect(badgeLabel({ conduct: 'none', advantage: 'some' })).toBe('advantage')
  })

  it('is null for a benign verdict and for no verdict at all', () => {
    expect(badgeLabel({ conduct: 'assistive', advantage: 'none' })).toBe(null)
    expect(badgeLabel(null)).toBe(null)
  })
})
