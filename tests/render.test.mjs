import { describe, it, expect } from 'vitest'
import { escapeHtml, repoCard, breakdown, safeUrl } from '../site/render.js'

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

  it('shows the band, points and a link', () => {
    const html = repoCard(repo, policies, now)
    expect(html).toContain('elevated')
    expect(html).toContain('45')
    expect(html).toContain('https://github.com/a/b')
  })

  it('renders a known age from a fixed now', () => {
    const html = repoCard(repo, policies, now)
    expect(html).toContain('2 months ago')
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

describe('breakdown', () => {
  it('lists each signal with its evidence and its policy quote', () => {
    const html = breakdown(repo, policies)
    expect(html).toContain('Client injection or hooking')
    expect(html).toContain('text mentions &quot;d3d11&quot;')
    expect(html).toContain('Quoted policy text here.')
    expect(html).toContain('https://example.com/ua')
  })

  it('surfaces a manual override with its reason', () => {
    const html = breakdown({ ...repo, override: { reason: 'maintainer confirmed', source_url: 'https://e.com' } }, policies)
    expect(html).toContain('maintainer confirmed')
  })
})
