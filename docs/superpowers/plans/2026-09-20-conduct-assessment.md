# Conduct Assessment Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hand-authored, test-enforced conduct assessment axis to the catalog, rendered beside the mechanical score without altering it.

**Architecture:** A new `data/conduct.json` holds maintainer verdicts keyed by repo. `scripts/conduct.mjs` owns the enums, the case-insensitive lookup, and the badge rule. `build-catalog.mjs` merges a verdict onto each entry as an additive `assessment` field after scoring is complete. `site/render.js` grows a card badge and a drawer block. Tests enforce that every non-benign verdict quotes the repo's own description or a topic.

**Tech Stack:** Node 22 ESM, Vitest 2, vanilla ESM browser modules, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-conduct-assessment-design.md`

## Global Constraints

- Vitest runs with `pool: 'forks'`, `maxForks: 2` (already set in `vitest.config.js`). Run the suite as `npm test`. Never raise the fork cap.
- The mechanical scorer is untouchable. No edits to `scripts/signals.mjs` or `scripts/score.mjs`. No change to any repo's `points`, `band`, `signals`, or `override`.
- `scorerFingerprint()` must keep hashing exactly `['signals.mjs', 'score.mjs']`. Adding `conduct.mjs` to it would invalidate the whole cache and force a 671-repo re-enrichment that cannot finish inside the API budget.
- All repo-derived text rendered as HTML goes through `escapeHtml` from `site/render.js`; every `href` goes through `safeUrl` before `escapeHtml`. Verdict `rationale` and `evidence` are author-derived text and get the same treatment.
- `conduct` enum, in order: `none`, `assistive`, `directive`, `substitutive`.
- `advantage` enum, in order: `none`, `some`, `strong`.
- Lookup keys are matched case-insensitively. Discovery lowercases `full_name`; the catalog preserves GitHub casing (`qq1ng/rezzOrder`).
- The site is served from a project-site base path. Fetch paths stay relative with no leading `../` (`data/conduct.json` would be wrong anyway — the verdict ships merged into `catalog.json`, and the site fetches no new file).
- Contest link target: `https://github.com/darkharasho/gw2-addon-risk-guide/issues/new`.

**Naming deviation from the spec:** the spec called the merged catalog field `conduct`. This plan names it `assessment`, because a field at `repo.conduct.conduct` is a trap for every later reader. The JSON file stays `data/conduct.json`; only the merged field differs.

---

## File Structure

| File | Responsibility |
|---|---|
| `data/conduct.json` (create) | The verdicts. Hand-authored, committed, never written by the scraper. |
| `scripts/conduct.mjs` (create) | Enums, case-insensitive index, lookup, badge rule. Pure, no I/O, no DOM — importable by Node and the browser. |
| `tests/conduct.test.mjs` (create) | Unit tests for the module. |
| `tests/conduct-data.test.mjs` (create) | Integrity tests over the real `data/conduct.json` against `data/catalog.json` and `data/policies.json`. |
| `scripts/build-catalog.mjs` (modify) | Merge verdicts onto entries after scoring. |
| `tests/build-catalog.test.mjs` (modify) | Merge behaviour, including that scoring is untouched. |
| `site/render.js` (modify) | `assessmentBadge` on the card, `assessmentBlock` in the drawer. |
| `tests/render.test.mjs` (modify) | Badge and block rendering, escaping. |
| `site/style.css` (modify) | Outlined badge and drawer block styling. |

---

### Task 1: The conduct module and the seed verdict

**Files:**
- Create: `scripts/conduct.mjs`
- Create: `data/conduct.json`
- Test: `tests/conduct.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CONDUCT_TIERS: string[]` — `['none','assistive','directive','substitutive']`
  - `ADVANTAGE_TIERS: string[]` — `['none','some','strong']`
  - `indexAssessments(doc: object|null): Map<string, object>` — lowercased `full_name` → verdict
  - `assessmentFor(index: Map, full_name: string): object|null`
  - `isContentious(a: object|null): boolean`
  - `badgeLabel(a: object|null): string|null` — `'directive'`, `'substitutive'`, `'advantage'`, or `null`

- [ ] **Step 1: Write the failing test**

Create `tests/conduct.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import {
  CONDUCT_TIERS, ADVANTAGE_TIERS, indexAssessments, assessmentFor,
  isContentious, badgeLabel,
} from '../scripts/conduct.mjs'

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/conduct.test.mjs`
Expected: FAIL — cannot resolve `../scripts/conduct.mjs`.

- [ ] **Step 3: Write the module**

Create `scripts/conduct.mjs`:

```js
// The conduct assessment axis: the maintainer's judgment about what an addon
// does to gameplay, kept deliberately separate from the mechanical score.
//
// Pure functions only - no I/O, no DOM - so the same module backs the catalog
// build, the browser, and the tests that enforce the file's integrity.

// Ordered from "no bearing on play decisions" to "acts for you". The pivot
// that matters is assistive -> directive: showing information versus prompting
// an action. ArenaNet tolerates DPS meters, which makes assistive a known
// tolerated tier and directive the first contentious one.
export const CONDUCT_TIERS = ['none', 'assistive', 'directive', 'substitutive']

// A severity grade, not a taxonomy. What *kind* of edge a tool confers lives
// in the verdict's prose, so the schema never has to anticipate every case:
// revealing withheld information and amplifying perception are two examples of
// advantage, not the set of them.
export const ADVANTAGE_TIERS = ['none', 'some', 'strong']

// Discovery lowercases full_name while the catalog preserves GitHub's casing
// ("qq1ng/rezzOrder"). Exact-match keying would let a verdict silently detach
// from its repo the first time either side changed case.
export function indexAssessments(doc) {
  const entries = Object.entries(doc?.assessments ?? {})
  return new Map(entries.map(([k, v]) => [k.toLowerCase(), v]))
}

export const assessmentFor = (index, full_name) =>
  index.get(String(full_name ?? '').toLowerCase()) ?? null

// Non-none on either axis. A benign verdict is still a verdict - it records
// that the repo was looked at - but it renders as nothing.
export const isContentious = (a) =>
  !!a && ((a.conduct ?? 'none') !== 'none' || (a.advantage ?? 'none') !== 'none')

// Conduct wins when both axes fire: "directive" is a more specific claim than
// "advantage", and a badge has room for one word.
export function badgeLabel(a) {
  if (!isContentious(a)) return null
  const conduct = a.conduct ?? 'none'
  if (conduct === 'directive' || conduct === 'substitutive') return conduct
  return (a.advantage ?? 'none') !== 'none' ? 'advantage' : null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/conduct.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Create the seed verdict file**

Create `data/conduct.json`. One worked example; the batch assessment pass is content work, not implementation.

```json
{
  "_comment": "Maintainer's judgment, not ArenaNet's. Two axes: conduct (show info vs prompt action) and advantage (how much edge it confers). Every entry non-none on either axis MUST carry an `evidence` string quoted verbatim from that repo's own catalog description or one of its topics - tests/conduct-data.test.mjs enforces it. Scope: repos carrying the `injection` signal, plus anything added by hand.",
  "assessments": {
    "qq1ng/rezzOrder": {
      "conduct": "directive",
      "advantage": "some",
      "rationale": "Reads squad state and tells the player when to act, rather than showing state and leaving the decision to them. The information itself is already on screen; what the addon adds is the instruction.",
      "evidence": "shows whose turn it is to rez",
      "policy": "ua-third-party-programs",
      "assessed_at": "2026-09-20"
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add scripts/conduct.mjs data/conduct.json tests/conduct.test.mjs
git commit -m "feat(conduct): add the conduct assessment module and seed verdict

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Integrity tests over the real verdict file

This is the enforcement the whole design rests on: a verdict that cannot be traced to the repo's own words fails the build rather than shipping.

**Files:**
- Create: `tests/conduct-data.test.mjs`

**Interfaces:**
- Consumes: `CONDUCT_TIERS`, `ADVANTAGE_TIERS`, `indexAssessments` from `scripts/conduct.mjs` (Task 1).
- Produces: nothing importable.

- [ ] **Step 1: Write the test**

Create `tests/conduct-data.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CONDUCT_TIERS, ADVANTAGE_TIERS, indexAssessments } from '../scripts/conduct.mjs'

const doc = JSON.parse(readFileSync('data/conduct.json', 'utf8'))
const assessments = Object.entries(doc.assessments)
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'))
const policyIds = new Set(JSON.parse(readFileSync('data/policies.json', 'utf8')).clauses.map((c) => c.id))

const repos = new Map(catalog.repos.map((r) => [r.full_name.toLowerCase(), r]))
const contentious = (v) => (v.conduct ?? 'none') !== 'none' || (v.advantage ?? 'none') !== 'none'

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
      if (!contentious(v)) continue
      expect(policyIds, `${key} policy`).toContain(v.policy)
    }
  })

  it('quotes the repo’s own words as evidence for every contentious verdict', () => {
    // The load-bearing rule. The mechanical score is checkable because each
    // signal cites the match that produced it; a judgment has no such anchor
    // unless the schema forces one. Requiring the author's own description
    // means a `directive` call reads a tool's purpose back to it rather than
    // inferring intent - and the catalog stores no README, so description and
    // topics are the only text a test can verify against.
    for (const [key, v] of assessments) {
      if (!contentious(v)) continue
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
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/conduct-data.test.mjs`
Expected: PASS, 6 tests. The seed verdict is already valid — `"shows whose turn it is to rez"` is verbatim in rezzOrder's catalog description, and `ua-third-party-programs` exists in `data/policies.json`.

- [ ] **Step 3: Prove the evidence test actually bites**

Temporarily edit `data/conduct.json`, changing the `evidence` value to `"directs your gameplay"` (a phrase that is *not* in the description), then run:

Run: `npx vitest run tests/conduct-data.test.mjs`
Expected: FAIL with "evidence not found verbatim in description or topics".

Then revert the edit:

```bash
git checkout -- data/conduct.json
```

Run: `npx vitest run tests/conduct-data.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/conduct-data.test.mjs
git commit -m "test(conduct): enforce that every verdict quotes the repo's own words

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Merge verdicts into the catalog build

**Files:**
- Modify: `scripts/build-catalog.mjs`
- Test: `tests/build-catalog.test.mjs`

**Interfaces:**
- Consumes: `indexAssessments`, `assessmentFor` from `scripts/conduct.mjs` (Task 1).
- Produces: `buildCatalog({ ..., assessments = {} })` — the option takes the **raw document** (`{ assessments: {...} }`) or `{}`. Every catalog entry gains `assessment: object|null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/build-catalog.test.mjs`. The file already defines a `deps` fixture whose `discover` returns `z/injector`, `a/clean` and `ghost/gone` — reuse it. Add `import { readFileSync } from 'node:fs'` to the top of the file.

```js
describe('conduct assessments', () => {
  it('merges a verdict onto the matching repo, case-insensitively', async () => {
    const cat = await buildCatalog({
      ...deps,
      assessments: { assessments: { 'Z/Injector': { conduct: 'directive', advantage: 'some' } } },
    })
    expect(cat.repos.find((r) => r.full_name === 'z/injector').assessment)
      .toEqual({ conduct: 'directive', advantage: 'some' })
  })

  it('gives every unassessed repo an explicit null rather than a missing key', async () => {
    const cat = await buildCatalog(deps)
    for (const r of cat.repos) expect(r.assessment).toBe(null)
  })

  it('leaves points, band and signals byte-identical', async () => {
    // The axis is independent by construction, not by convention: if a verdict
    // can move a score, the number stops being falsifiable from the signals.
    const scored = (c) => JSON.stringify(
      c.repos.map((r) => [r.full_name, r.points, r.band, r.signals, r.override]))
    const without = await buildCatalog(deps)
    const with_ = await buildCatalog({
      ...deps,
      assessments: { assessments: { 'z/injector': { conduct: 'substitutive', advantage: 'strong' } } },
    })
    expect(scored(with_)).toBe(scored(without))
  })

  it('does not fold conduct.mjs into the scorer fingerprint', async () => {
    // Hashing it would invalidate every cached entry and force a 671-repo
    // re-enrichment that cannot finish inside the API budget.
    const src = readFileSync('scripts/build-catalog.mjs', 'utf8')
    expect(src).toContain("['signals.mjs', 'score.mjs']")
    expect(src).not.toMatch(/conduct\.mjs'[\s,\]]/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/build-catalog.test.mjs`
Expected: FAIL — `repo.assessment` is `undefined`.

- [ ] **Step 3: Wire the merge**

In `scripts/build-catalog.mjs`, add the import beside the existing ones:

```js
import { indexAssessments, assessmentFor } from './conduct.mjs'
```

Add `assessments = {}` to the `buildCatalog` destructured options, beside `overrides = {}`:

```js
  now, overrides = {}, assessments = {}, token, previous = null, budget = Infinity,
```

Then, immediately before `repos.sort(...)` at the end of the function body, insert:

```js
  // Applied in one pass after scoring rather than inside entry()/cachedEntry(),
  // so a verdict reaches fresh, cached and deferred entries identically and
  // there is exactly one place where the two axes meet. Additive only: nothing
  // here reads or writes points, band or signals.
  const conduct = indexAssessments(assessments)
  for (const r of repos) r.assessment = assessmentFor(conduct, r.full_name)

  repos.sort((a, b) => b.points - a.points || a.full_name.localeCompare(b.full_name))
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/build-catalog.test.mjs`
Expected: PASS.

- [ ] **Step 5: Load the file in the CLI entrypoint**

In the `import.meta.url === ...` block at the bottom of `scripts/build-catalog.mjs`, beside the `overrides` line:

```js
  const assessments = existsSync('data/conduct.json')
    ? JSON.parse(readFileSync('data/conduct.json', 'utf8')) : {}
```

and pass it through:

```js
  const catalog = await buildCatalog({
    token: process.env.GITHUB_TOKEN, overrides, assessments, now, previous, budget,
  })
```

`existsSync` and `readFileSync` are already imported at the top of the file.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-catalog.mjs tests/build-catalog.test.mjs
git commit -m "feat(catalog): merge conduct verdicts onto catalog entries

Applied after scoring as an additive field, so the mechanical score is
untouched and the scorer fingerprint stays narrow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Render the badge and the drawer block

**Files:**
- Modify: `site/render.js`
- Test: `tests/render.test.mjs`

**Interfaces:**
- Consumes: `badgeLabel`, `isContentious` from `scripts/conduct.mjs` (Task 1). Import path from `site/render.js` is `../scripts/conduct.mjs`.
- Produces: `assessmentBadge(repo): string`, `assessmentBlock(repo, policies): string`. Both return `''` when there is nothing to show.

Note on the import: `site/render.js` must run unmodified in the browser, so `../scripts/conduct.mjs` has to resolve over HTTP too. `scripts/` is a sibling of `site/` at the repo root and GitHub Pages serves the whole repo, so the relative path resolves in both Node and the browser.

- [ ] **Step 1: Write the failing tests**

Add to `tests/render.test.mjs`. It already defines `repo` and `policies` fixtures at the top — reuse them.

```js
import { assessmentBadge, assessmentBlock } from '../site/render.js'

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/render.test.mjs`
Expected: FAIL — `assessmentBadge is not a function`.

- [ ] **Step 3: Implement the renderers**

At the top of `site/render.js`, beside the existing header comment block:

```js
import { badgeLabel, isContentious } from '../scripts/conduct.mjs'
```

Add these functions above `repoDrawer`:

```js
const ISSUE_BASE = 'https://github.com/darkharasho/gw2-addon-risk-guide/issues/new'

// A second, differently-sourced claim, so it is drawn as annotation rather
// than as score: outlined, never filled like a band chip, and absent unless
// something actually fired. A card with no badge is the common case, which is
// what keeps the badge from reading as a list of the accused.
export function assessmentBadge(repo) {
  const label = badgeLabel(repo?.assessment)
  return label ? `<span class="vbadge">${escapeHtml(label)}</span>` : ''
}

// A verdict older than the repo's last push may be describing software that no
// longer exists. Saying so is cheaper, and more honest, than re-assessing on
// every push.
const assessedBeforeLastPush = (a, repo) => {
  const pushed = String(repo?.pushed_at ?? '').slice(0, 10)
  return !!a?.assessed_at && !!pushed && a.assessed_at < pushed
}

export function assessmentBlock(repo, policies) {
  const a = repo?.assessment
  if (!isContentious(a)) return ''
  const contest = `${ISSUE_BASE}?title=${encodeURIComponent(`Contest assessment: ${repo.full_name}`)}`
    + `&body=${encodeURIComponent(`Repository: ${repo.full_name}\n\nWhat the assessment gets wrong:\n`)}`
  const stale = assessedBeforeLastPush(a, repo)
    ? `<p class="vstale">This repo has been updated since it was assessed; the verdict may describe
       an older version.</p>`
    : ''
  return `<h3>Maintainer&#8217;s assessment</h3>
    <p class="dnote">This is the judgment of this site&#8217;s maintainer, not ArenaNet.
      ArenaNet has not ruled on this class of tool, and silence is neither permission nor
      prohibition.</p>
    <div class="vaxes">
      <span class="vax"><b>${escapeHtml(a.conduct)}</b> conduct</span>
      <span class="vax"><b>${escapeHtml(a.advantage)}</b> advantage</span>
    </div>
    <p class="vrat">${escapeHtml(a.rationale)}</p>
    <p class="vev">Based on the project&#8217;s own description:
      &ldquo;${escapeHtml(a.evidence)}&rdquo;</p>
    ${policyQuote(policies[a.policy])}
    ${stale}
    <p class="vcontest"><a href="${escapeHtml(safeUrl(contest))}" rel="noopener" target="_blank"
      >Contest this assessment &#8599;</a>
      <span class="vdate">assessed ${escapeHtml(a.assessed_at)}</span></p>`
}
```

`policyQuote` and `safeUrl` are already defined in the file; `assessmentBlock` must appear after `policyQuote`'s definition.

- [ ] **Step 4: Wire into the card**

In `repoCard`, change the `.sigs` line so the badge leads the chip row:

```js
    <span class="sigs">${assessmentBadge(repo)}${signals.map((s) =>
      `<span class="sig ${chipClass(s.weight)}">${escapeHtml(s.label)}</span>`).join('')}</span>
```

- [ ] **Step 5: Wire into the drawer**

In `repoDrawer`, change the `.dbody` block so the assessment sits after the mechanical breakdown and before the framing note:

```js
  <div class="dbody">
    ${breakdown(repo, policies)}
    ${assessmentBlock(repo, policies)}
    <h3>What this means</h3><p class="dnote">${MEANING}</p>
  </div>`
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/render.test.mjs`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add site/render.js tests/render.test.mjs
git commit -m "feat(site): render the conduct assessment on cards and in the drawer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Style the badge and block, then rebuild the catalog

**Files:**
- Modify: `site/style.css`
- Modify: `data/catalog.json` (regenerated)

**Interfaces:**
- Consumes: the class names emitted in Task 4 — `.vbadge`, `.vaxes`, `.vax`, `.vrat`, `.vev`, `.vstale`, `.vcontest`, `.vdate`.
- Produces: nothing importable.

- [ ] **Step 1: Add the styles**

Append to `site/style.css`, after the `.sig` rules near line 268. The badge must read as annotation, so it is outlined in `--sky` — the file's designated cool ink, documented there as "meta, never a risk band" — and never filled like a band chip.

```css
/* Conduct assessment. Deliberately the only chip on a card drawn in the cool
   ink and left unfilled: it is the maintainer's judgment, not a score, and it
   must not be mistaken for one at a glance. */
.vbadge {
  font: 800 11px/1 var(--sans); padding: 5px 9px; border-radius: 6px;
  border: 3px solid var(--sky); background: transparent; color: var(--sky);
  text-transform: uppercase; letter-spacing: .04em;
}

.vaxes { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0; }
.vax {
  font: 700 12px/1 var(--sans); color: var(--dim);
  border: 3px solid var(--line); border-radius: 6px; padding: 7px 10px;
}
.vax b { color: var(--sky); text-transform: uppercase; letter-spacing: .04em; }

.vrat { margin: 10px 0; color: var(--ink); }
.vev { margin: 10px 0; color: var(--dim); font-style: italic; }
.vstale { margin: 10px 0; color: var(--ember); font: 700 13px/1.5 var(--sans); }
.vcontest {
  display: flex; gap: 12px; flex-wrap: wrap; align-items: baseline;
  margin: 12px 0 0; font: 700 12px/1 var(--sans);
}
.vcontest a { color: var(--sky); }
.vdate { color: var(--faint); }
```

- [ ] **Step 2: Rebuild the catalog so the field exists in the shipped data**

Run:

```bash
GITHUB_TOKEN="$(gh auth token)" npm run catalog
```

Expected: a line reading `wrote 671 repos to data/catalog.json (...)`. The repo count must not drop — this run changes no discovery or scoring behaviour.

- [ ] **Step 3: Verify the merge landed and nothing else moved**

Run:

```bash
git stash push data/catalog.json && git stash pop --quiet 2>/dev/null
python3 - <<'PY'
import json, subprocess
new = json.load(open('data/catalog.json'))
old = json.loads(subprocess.run(
    ['git', 'show', 'HEAD:data/catalog.json'], capture_output=True, text=True).stdout)
o = {r['full_name']: r for r in old['repos']}
n = {r['full_name']: r for r in new['repos']}
assert set(o) == set(n), f"membership changed: {set(o) ^ set(n)}"
moved = [k for k in o if (o[k]['points'], o[k]['band']) != (n[k]['points'], n[k]['band'])]
print('repos:', len(n), '| scores moved:', len(moved))
print('rezzOrder assessment:', json.dumps(n['qq1ng/rezzOrder']['assessment']))
print('null assessments:', sum(1 for r in new['repos'] if r['assessment'] is None))
PY
```

Expected: `scores moved: 0`, rezzOrder's assessment printed with `"conduct": "directive"`, and `null assessments: 670`.

- [ ] **Step 4: Eyeball it in the browser**

Run:

```bash
python3 -m http.server 8905 --bind 127.0.0.1 >/dev/null 2>&1 &
```

Open `http://127.0.0.1:8905/site/index.html`, search for `rezzOrder`, and confirm: the card shows an outlined blue `DIRECTIVE` badge beside its signal chips, no other card carries one, and opening the drawer shows the *Maintainer's assessment* block with both axes, the quote, the policy clause and a working contest link. Then stop the server.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 6: Commit**

```bash
git add site/style.css data/catalog.json
git commit -m "feat(site): style the conduct badge and rebuild the catalog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Out of scope for this plan

Tracked in the spec's Follow-up section, deliberately not built here:

- The batch assessment pass over the ~151 `injection` repos, plus hand-adding the perception-enhancing tools the triage rule cannot see (ReShade-family presets, second-screen apps). That is content work, and every entry it adds is already gated by Task 2's tests.
- Re-wiring `ua-third-party-programs` in `data/policies.json` away from `injection`/`multibox`. Its quote describes this layer, not those signals — but `tests/policies.test.mjs` asserts `applies_to` stays in sync with `SIGNALS`, so the change is a scorer change and does not belong in a plan whose first constraint is that the scorer is untouchable.
- Sourcing and adding a policy clause for ArenaNet's explicit tolerance of DPS meters and arcdps — the anchor establishing `assistive` as a tolerated tier.
- A conduct filter pill. Revisit once there is enough data to make it return something.
