import { describe, it, expect } from 'vitest'
import { escapeHtml, repoCard, repoDrawer, breakdown, safeUrl, lastPush, shortAge,
  assessmentBadge, assessmentBlock } from '../site/render.js'

const policies = {
  'ua-third-party-programs': {
    id: 'ua-third-party-programs', title: 'Third-party programs',
    source: 'User Agreement', source_url: 'https://example.com/ua', quote: 'Quoted policy text here.',
  },
}
const repo = {
  full_name: 'a/b', name: 'b', html_url: 'https://github.com/a/b',
  description: 'a tool', band: 'elevated', points: 45, stars: 12,
  pushed_at: '2026-08-01T00:00:00Z', license: 'MIT', topics: [], archived: false,
  signals: [{ id: 'injection', label: 'Client injection or hooking', weight: 25,
              policy: 'ua-third-party-programs', explain: 'Loads code into the game process.',
              evidence: ['text mentions "d3d11"'] }],
  override: null,
}

describe('escapeHtml', () => {
  it('escapes angle brackets, quotes and ampersands', () => {
    expect(escapeHtml('<img src=x onerror="y">&')).toBe(
      '&lt;img src=x onerror=&quot;y&quot;&gt;&amp;')
  })
})

describe('safeUrl', () => {
  it('passes an https url through unchanged', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a')
  })

  it('rejects a javascript: url', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('#')
  })

  it('rejects a malformed url', () => {
    expect(safeUrl('not a url')).toBe('#')
  })
})

describe('repoCard', () => {
  const now = new Date('2026-10-01T00:00:00Z')

  it('shows the band and points', () => {
    const html = repoCard(repo, policies, now)
    expect(html).toContain('b-elevated')
    expect(html).toContain('45')
  })

  it('shows each signal label on the face of the card, not only in the drawer', () => {
    // The whole point of the chips: scanning a grid must not require opening
    // every card to find out which signals fired.
    expect(repoCard(repo, policies, now)).toContain('Client injection or hooking')
  })

  it('renders a compact age from a fixed now', () => {
    expect(repoCard(repo, policies, now)).toContain('2 mo ago')
  })

  it('renders an unknown age instead of NaN when pushed_at is missing', () => {
    const html = repoCard({ ...repo, pushed_at: undefined }, policies, now)
    expect(html).not.toContain('NaN')
    expect(html).toContain('date unknown')
  })

  it('escapes repo-controlled text', () => {
    const html = repoCard({ ...repo, description: '<script>alert(1)</script>' }, policies, now)
    expect(html).not.toContain('<script>')
  })

  it('never calls an addon safe or approved', () => {
    expect(repoCard({ ...repo, band: 'low', points: 0 }, policies, now).toLowerCase())
      .not.toMatch(/\b(safe|approved|allowed|endorsed)\b/)
  })
})

describe('lastPush', () => {
  const now = new Date('2026-10-01T00:00:00Z')

  it('formats a known age in months', () => {
    expect(lastPush('2026-08-01T00:00:00Z', now)).toBe('last push 2 months ago')
  })

  it('falls back to unknown for a missing or unparseable date', () => {
    expect(lastPush(undefined, now)).toBe('last push unknown')
    expect(lastPush(null, now)).toBe('last push unknown')
    expect(lastPush('not a date', now)).toBe('last push unknown')
  })
})

describe('shortAge', () => {
  const now = new Date('2026-10-01T00:00:00Z')

  it('collapses under a month, months, then years', () => {
    expect(shortAge('2026-09-25T00:00:00Z', now)).toBe('this month')
    expect(shortAge('2026-05-01T00:00:00Z', now)).toBe('5 mo ago')
    expect(shortAge('2023-10-01T00:00:00Z', now)).toBe('3 yr ago')
  })

  it('falls back rather than rendering NaN', () => {
    expect(shortAge(undefined, now)).toBe('date unknown')
    expect(shortAge('not a date', now)).toBe('date unknown')
  })
})

describe('repoDrawer', () => {
  const now = new Date('2026-10-01T00:00:00Z')

  it('links the repo and shows the score out of 100', () => {
    const html = repoDrawer(repo, policies, now)
    expect(html).toContain('https://github.com/a/b')
    expect(html).toContain('45')
    expect(html).toContain('/100')
  })

  it('counts the signals it is about to list', () => {
    expect(repoDrawer(repo, policies, now)).toContain('1 risk signal detected')
  })

  it('separates mitigating factors from risks so a counterweight does not read as a finding', () => {
    const withMitigator = { ...repo, signals: [...repo.signals,
      { id: 'popular_maintained', label: 'Popular and maintained', weight: -10,
        policy: null, explain: 'Widely used.', evidence: ['900 stars'] }] }
    const html = repoDrawer(withMitigator, policies, now)
    expect(html).toContain('Mitigating factors')
    expect(html).toContain('1 risk signal detected')
    expect(html).toContain('1 mitigating')
  })

  it('restates the framing every time, not just in the masthead', () => {
    const html = repoDrawer(repo, policies, now)
    expect(html).toContain('not an accusation')
    expect(html).toContain('not permission')
  })

  it('escapes repo-controlled text in the drawer too', () => {
    const html = repoDrawer(
      { ...repo, description: '<script>alert(1)</script>', topics: ['<img src=x>'] }, policies, now)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x>')
  })

  it('never calls an addon safe or approved', () => {
    expect(repoDrawer({ ...repo, band: 'low', points: 0, signals: [] }, policies, now).toLowerCase())
      .not.toMatch(/\b(safe|approved|allowed|endorsed)\b/)
  })
})

describe('breakdown', () => {
  it('lists each signal with its evidence and its policy quote', () => {
    const html = breakdown(repo, policies)
    expect(html).toContain('Client injection or hooking')
    expect(html).toContain('text mentions &quot;d3d11&quot;')
    expect(html).toContain('Quoted policy text here.')
    expect(html).toContain('https://example.com/ua')
  })

  it('says so plainly when nothing fired, rather than rendering an empty list', () => {
    expect(breakdown({ ...repo, signals: [] }, policies)).toContain('No risk signals were detected')
  })

  it('surfaces a manual override with its reason', () => {
    const html = breakdown({ ...repo, override: { reason: 'maintainer confirmed', source_url: 'https://e.com' } }, policies)
    expect(html).toContain('maintainer confirmed')
  })
})

const assessed = (a) => ({ ...repo, assessment: a })
const directive = {
  conduct: 'directive', advantage: 'some',
  rationale: 'Tells the player when to act rather than leaving the decision to them.',
  evidence: 'shows whose turn it is to rez',
  policy: 'ua-third-party-programs', assessed_at: '2026-09-20',
}

describe('assessmentBadge', () => {
  it('renders the fired axis as an outlined badge', () => {
    const html = assessmentBadge(assessed(directive))
    expect(html).toContain('directive')
    expect(html).toContain('vbadge')
  })

  it('renders nothing for a benign verdict or an unassessed repo', () => {
    expect(assessmentBadge(assessed({ conduct: 'assistive', advantage: 'none' }))).toBe('')
    expect(assessmentBadge(assessed(null))).toBe('')
    expect(assessmentBadge(repo)).toBe('')
  })
})

describe('assessmentBlock', () => {
  it('attributes the judgment to the maintainer, not to ArenaNet', () => {
    const html = assessmentBlock(assessed(directive), policies)
    expect(html).toContain('Maintainer&#8217;s assessment')
    expect(html).toMatch(/ArenaNet has not ruled/)
  })

  it('shows both axes, the rationale and the quoted evidence', () => {
    const html = assessmentBlock(assessed(directive), policies)
    expect(html).toContain('directive')
    expect(html).toContain('some')
    expect(html).toContain('leaving the decision to them')
    expect(html).toContain('shows whose turn it is to rez')
  })

  it('offers a contest link that names the repo', () => {
    const html = assessmentBlock(assessed(directive), policies)
    expect(html).toContain('issues/new')
    expect(html).toContain(encodeURIComponent(repo.full_name))
  })

  it('flags a verdict older than the repo’s last push', () => {
    const stale = assessed({ ...directive, assessed_at: '2026-01-01' })
    expect(assessmentBlock({ ...stale, pushed_at: '2026-08-01T00:00:00Z' }, policies))
      .toMatch(/assessed before/)
  })

  it('renders nothing for a benign verdict or an unassessed repo', () => {
    expect(assessmentBlock(assessed(null), policies)).toBe('')
    expect(assessmentBlock(assessed({ conduct: 'none', advantage: 'none' }), policies)).toBe('')
  })

  it('escapes author-controlled rationale and evidence', () => {
    const xss = assessed({ ...directive, rationale: '<img src=x onerror="y">', evidence: '<b>z</b>' })
    const html = assessmentBlock(xss, policies)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>z</b>')
    expect(html).toContain('&lt;img')
  })
})

describe('repoCard with an assessment', () => {
  it('carries the badge', () => {
    expect(repoCard(assessed(directive), policies, new Date('2026-09-20T00:00:00Z')))
      .toContain('vbadge')
  })

  it('carries no badge when unassessed, so absence is the signal', () => {
    expect(repoCard(repo, policies, new Date('2026-09-20T00:00:00Z')))
      .not.toContain('vbadge')
  })
})

describe('repoDrawer with an assessment', () => {
  it('carries the assessment block', () => {
    expect(repoDrawer(assessed(directive), policies, new Date('2026-09-20T00:00:00Z')))
      .toContain('Maintainer&#8217;s assessment')
  })
})
