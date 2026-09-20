# axi-design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `axi-design` — the axi suite's design language — as a new repo
publishing a single versioned CSS file, a rules document, and a live pattern
gallery.

**Architecture:** Six hand-written CSS sources in `src/` are concatenated in a
fixed order by a small Node script into `dist/axi.css`, the single artifact
consumers link. Two vitest suites guard the system: one asserts the committed
artifact matches its sources, the other asserts every colour goes through a
token and every token referenced is defined. A pattern gallery renders every
component on one page with a live accent switcher, serving as the human visual
check before any release tag. A tag-triggered workflow copies `dist/axi.css`
to an append-only `v<major>/` path on GitHub Pages.

**Tech Stack:** Plain CSS (no preprocessor, no framework), Node 22+ ESM for the
build script, vitest for tests, GitHub Actions + GitHub Pages for release.

**Spec:** `docs/superpowers/specs/2026-09-20-axi-design-language-design.md`
(in the `gw2-addon-risk-guide` repo, branch `design/axi-design-language`)

**Scope:** This plan covers **stage 1 only** of the spec's four-stage
sequencing (§6) — the `axi-design` repo through its `v1` tag. Stage 2
(axi.wiki), stage 3 (the GW2 retrofit) and the deferred per-app adoption each
get their own plan, written after `v1/axi.css` exists so they can be written
against its real class names rather than predicted ones.

## Global Constraints

- **Repo location:** `/var/home/mstephens/Documents/GitHub/axi-design`. All
  paths in this plan are relative to that directory unless stated otherwise.
- **Node:** `>=22`. Machine has v24. ESM only (`"type": "module"`).
- **Vitest parallelism:** capped at 2 forks, per the machine's global
  instruction. Config in Task 1 sets this; do not raise it.
- **No dependencies** beyond `vitest` as a devDependency. No PostCSS, no Sass,
  no autoprefixer.
- **Class namespace:** every class the system ships is prefixed `axi-`. No
  exceptions, including modifiers (`.axi-btn--primary`) and state hooks.
- **Token namespace:** every custom property is prefixed `--axi-`.
- **No raw colour literals in component files.** `src/tokens.css` is the only
  file permitted to contain hex / `rgb()` / `hsl()` values. `transparent` and
  `currentColor` are exempt everywhere.
- **Two form steps only:** *panel* = `--axi-border-panel` (4px) /
  `--axi-offset-panel` (6px); *control* = `--axi-border-control` (3px) /
  `--axi-offset-control` (3px). Components must not invent a third.
- **No gradients on surfaces, no blurred shadows.** `box-shadow` is always
  `<x> <y> 0 var(--axi-ink-line)`. The only permitted `linear-gradient` usage
  is the hand-drawn select caret in `src/primitives.css`, which draws a
  triangle, not a surface fill.
- **Commit trailer:** end every commit message with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Do not create or push the GitHub remote until Task 8**, which gates it on
  explicit user confirmation.

---

### Task 1: Repo scaffold, build script, and the build test

Establishes the repo, the concatenation build, and the test that keeps the
committed artifact honest. Ships `tokens.css` as the first source so the build
has something real to build.

**Files:**
- Create: `package.json`
- Create: `vitest.config.mjs`
- Create: `.gitignore`
- Create: `scripts/build.mjs`
- Create: `src/tokens.css`
- Create: `dist/axi.css` (generated, committed)
- Test: `tests/build.test.mjs`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `scripts/build.mjs` exports `ORDER: string[]` — source filenames in
    concatenation order — and `buildCss(order?: string[]): string`, which
    returns the full concatenated stylesheet as a string. Later tasks append
    their filename to `ORDER`.
  - `src/tokens.css` defines the full `--axi-*` token set on `:root`. Every
    later task references these names and adds none of its own.

- [ ] **Step 1: Create the repo directory and initialise git**

```bash
mkdir -p /var/home/mstephens/Documents/GitHub/axi-design
cd /var/home/mstephens/Documents/GitHub/axi-design
git init -b main
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "axi-design",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "vitest run"
  },
  "devDependencies": { "vitest": "^2.1.0" }
}
```

- [ ] **Step 3: Write `vitest.config.mjs`**

```js
import { defineConfig } from 'vitest/config'

// This machine runs heavy apps alongside dev work; cap test parallelism at 2 forks.
export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { minForks: 1, maxForks: 2 } },
  },
})
```

- [ ] **Step 4: Write `.gitignore`**

`dist/` is deliberately NOT ignored — the built artifact is committed, because
the release workflow publishes it directly and consumers link it by URL.

```
node_modules/
```

- [ ] **Step 5: Install vitest**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design && npm install
```

- [ ] **Step 6: Write the failing build test**

Create `tests/build.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCss, ORDER } from '../scripts/build.mjs'

// dist/axi.css is committed, because the release workflow publishes that exact
// file and consumers link it by URL. A committed artifact can go stale the
// moment someone edits a source and forgets to rebuild - and because nothing
// imports dist/, nothing else would ever notice. This test is the only thing
// standing between a source edit and a release that silently ships the old CSS.
describe('dist/axi.css', () => {
  it('matches the concatenation of its sources', () => {
    const built = buildCss()
    const committed = readFileSync(resolve('dist/axi.css'), 'utf8')
    expect(committed).toBe(built)
  })

  it('concatenates sources in the declared order', () => {
    const built = buildCss()
    const positions = ORDER.map((name) => built.indexOf(`/* --- ${name} --- */`))
    expect(positions.every((p) => p !== -1)).toBe(true)
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b))
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd /var/home/mstephens/Documents/GitHub/axi-design && npx vitest run --maxWorkers=2`
Expected: FAIL — `Cannot find module '../scripts/build.mjs'`

- [ ] **Step 8: Write `scripts/build.mjs`**

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The shipped artifact is one file, but the sources are split by
// responsibility so they stay readable. Order matters and is declared here
// rather than inferred from the directory listing: tokens must land before
// anything that references them, and later layers deliberately override
// earlier ones (a shell restyles a primitive it contains). Alphabetical order
// would put `base` before `tokens` and quietly break the cascade.
export const ORDER = ['tokens.css']

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const BANNER = `/* axi design language - generated by scripts/build.mjs.
   Edit the files in src/ and run \`npm run build\`; do not edit this file. */
`

export function buildCss(order = ORDER) {
  const parts = order.map((name) => {
    const source = readFileSync(resolve(ROOT, 'src', name), 'utf8').trimEnd()
    return `/* --- ${name} --- */\n${source}`
  })
  return `${BANNER}\n${parts.join('\n\n')}\n`
}

// Only write when run directly, so importing this from a test never has the
// side effect of rewriting the artifact the test is about to check.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(resolve(ROOT, 'dist'), { recursive: true })
  writeFileSync(resolve(ROOT, 'dist/axi.css'), buildCss())
  console.log(`built dist/axi.css from ${ORDER.length} source(s)`)
}
```

- [ ] **Step 9: Write `src/tokens.css`**

```css
/* axi design language - tokens.
   The only file in this system permitted to contain a colour literal. Every
   component resolves its colours through the names below, which is what keeps
   a future light theme a palette swap instead of a rewrite.

   Three layers:
   - surface & text: the neutral ramp the language is drawn on
   - accent & status: the per-app override surface. An app that sets
     --axi-accent and nothing else is correctly themed.
   - form: geometry and type. Shared by every property; overriding these
     means leaving the design language, not theming it. */
:root {
  /* --- surface & text --- */
  --axi-ground: #15181d;          /* the page itself */
  --axi-surface: #222731;         /* a panel raised off the page */
  --axi-surface-raised: #2b313d;  /* a chip or popover raised off a panel */
  --axi-ink-line: #0c0e12;        /* the outline every raised element is drawn with */
  --axi-rule: #3a4250;            /* internal rules, inside an outlined panel */
  --axi-text: #f4f6f9;
  --axi-text-dim: #a7b0be;
  --axi-text-faint: #7c8695;
  --axi-scrim: rgba(6, 7, 9, .72); /* behind a drawer */

  /* --- accent & status --- */
  --axi-accent: #ffc53d;
  /* Text drawn on top of an accent fill. Near-black suits every accent bright
     enough to pass contrast on this ground; an app choosing a dark accent
     overrides this to --axi-text rather than editing components. */
  --axi-accent-ink: var(--axi-ink-line);
  --axi-meta: #4ec3ff;            /* the one cool ink: meta only, never a status */
  --axi-ok: #2fd38a;
  --axi-warn: #ff7a2f;
  --axi-danger: #ff5252;

  /* --- form: outline and offset --- */
  /* Two steps, and only two. A panel is drawn heavier than a control so a
     toolbar full of controls still reads as sitting inside its panel. */
  --axi-border-panel: 4px;
  --axi-offset-panel: 6px;
  --axi-border-control: 3px;
  --axi-offset-control: 3px;
  --axi-radius: 10px;
  --axi-radius-sm: 6px;

  /* --- form: measure --- */
  --axi-page: 1280px;             /* the default reading//browsing width */
  --axi-page-narrow: 46rem;       /* prose */
  --axi-page-wide: 1660px;        /* dense card grids */
  --axi-gutter: 18px;

  /* --- form: type --- */
  --axi-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", "Segoe UI", Roboto, sans-serif;
  --axi-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  /* Font shorthands, so a component sets `font: var(--axi-t-h2)` in one
     declaration. Tracking cannot ride in the shorthand, so the headings that
     need it carry a paired --axi-ls-* token. */
  --axi-t-display: 900 54px/1.02 var(--axi-sans);
  --axi-ls-display: -.045em;
  --axi-t-h1: 900 30px/1.1 var(--axi-sans);
  --axi-ls-h1: -.035em;
  --axi-t-h2: 900 24px/1.15 var(--axi-sans);
  --axi-ls-h2: -.035em;
  --axi-t-h3: 900 19px/1.2 var(--axi-sans);
  --axi-ls-h3: -.025em;
  --axi-t-body: 400 15px/1.55 var(--axi-sans);
  --axi-t-small: 400 13.5px/1.5 var(--axi-sans);
  --axi-t-label: 800 13px/1 var(--axi-sans);
  --axi-ls-label: .02em;
  --axi-t-micro: 800 11px/1 var(--axi-sans);
  --axi-ls-micro: .04em;
  --axi-t-eyebrow: 900 11.5px/1 var(--axi-sans);
  --axi-ls-eyebrow: .1em;
}
```

- [ ] **Step 10: Build and run the tests to verify they pass**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
npm run build
npx vitest run --maxWorkers=2
```

Expected: `dist/axi.css` written, both tests PASS.

- [ ] **Step 11: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git add -A
git commit -F - <<'EOF'
build: scaffold axi-design and its token layer

The shipped artifact is one file so a consumer needs one <link>, but the
sources are split by responsibility so they stay readable. ORDER is declared
rather than inferred from the directory, because tokens must land before their
references and later layers deliberately override earlier ones.

dist/ is committed, since the release workflow publishes that exact file. A
committed artifact goes stale the moment a source edit skips the rebuild, and
nothing imports dist/ to notice - so a test asserts the two agree.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Base layer and the token contract test

Adds the reset/base layer, and the test that makes the system's central rule —
every colour goes through a token — mechanically enforced for every task after
this one.

**Files:**
- Create: `src/base.css`
- Modify: `scripts/build.mjs` (append `'base.css'` to `ORDER`)
- Modify: `dist/axi.css` (rebuild)
- Test: `tests/tokens.test.mjs`

**Interfaces:**
- Consumes: `ORDER`, `buildCss()` from `scripts/build.mjs` (Task 1);
  all `--axi-*` tokens from `src/tokens.css` (Task 1)
- Produces: `.axi-sr-only` utility class, used by later tasks for
  screen-reader-only labels. Base element styling for `body`, `a`,
  `:focus-visible`, `*` box-sizing — later tasks assume these and do not
  repeat them.

- [ ] **Step 1: Write the failing token contract test**

Create `tests/tokens.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ORDER } from '../scripts/build.mjs'

const read = (name) => readFileSync(resolve('src', name), 'utf8')

// Strip comments before scanning. Comments routinely mention a hex value while
// explaining why it was chosen, and a naive scan would read that as a
// violation - a false failure that teaches people to stop writing the comments.
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const TOKENS_FILE = 'tokens.css'
const COMPONENT_FILES = () => ORDER.filter((name) => name !== TOKENS_FILE)

const defined = () => {
  const src = stripComments(read(TOKENS_FILE))
  return new Set([...src.matchAll(/(--axi-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
}

const referenced = (css) =>
  [...stripComments(css).matchAll(/var\(\s*(--axi-[a-z0-9-]+)/g)].map((m) => m[1])

// Hex, rgb()/rgba(), hsl()/hsla(). `transparent` and `currentColor` are
// deliberately absent: they are not themeable values, so tokenising them would
// add indirection without buying anything.
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

describe('token contract', () => {
  it('defines every --axi-* token that any source references', () => {
    const known = defined()
    const missing = []
    for (const name of ORDER) {
      for (const token of referenced(read(name))) {
        if (!known.has(token)) missing.push(`${name}: ${token}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('keeps every colour literal inside tokens.css', () => {
    const offenders = []
    for (const name of COMPONENT_FILES()) {
      stripComments(read(name))
        .split('\n')
        .forEach((line, i) => {
          if (COLOUR_LITERAL.test(line)) offenders.push(`${name}:${i + 1}: ${line.trim()}`)
        })
    }
    expect(offenders).toEqual([])
  })

  it('uses only the two declared form steps for outlines', () => {
    // A third border weight is how a system stops looking like one system.
    // Any literal px border in a component means a step was invented.
    const offenders = []
    for (const name of COMPONENT_FILES()) {
      stripComments(read(name))
        .split('\n')
        .forEach((line, i) => {
          if (/\bborder(-[a-z]+)?\s*:\s*\d+px/.test(line)) {
            offenders.push(`${name}:${i + 1}: ${line.trim()}`)
          }
        })
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /var/home/mstephens/Documents/GitHub/axi-design && npx vitest run tests/tokens.test.mjs --maxWorkers=2`
Expected: FAIL — `ENOENT` on `src/base.css` is NOT what we want yet; at this
point `ORDER` is still `['tokens.css']`, so the suite PASSES vacuously with
zero component files. That vacuous pass is the failure signal: confirm all
three tests report passing with an empty offender list, then proceed to Step 3,
which adds the first component file and gives the test something to guard.

- [ ] **Step 3: Write `src/base.css`**

```css
/* axi design language - base.
   Element-level defaults every axi property inherits. Nothing here is a
   component; if it needs a class, it belongs in a later layer. */

*, *::before, *::after { box-sizing: border-box; }

/* Dark is the only theme shipped today. Declaring the scheme means form
   controls, scrollbars and the like come up dark from the first paint rather
   than flashing light, and it is the one line a light theme will flip. */
html { color-scheme: dark; }

body {
  margin: 0;
  background: var(--axi-ground);
  color: var(--axi-text);
  font: var(--axi-t-body);
  -webkit-font-smoothing: antialiased;
}

/* Links inherit their colour by default: in this language a link is usually
   inside something that has already chosen an ink, and a globally accented
   link would fight every card title and nav item. Components opt into the
   accent where a link should read as one. */
a { color: inherit; }

/* The focus ring is accent-coloured and thick enough to read against a
   near-black outline, which a 1px ring does not. */
:focus-visible {
  outline: var(--axi-border-control) solid var(--axi-accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.axi-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
```

- [ ] **Step 4: Append `base.css` to `ORDER` in `scripts/build.mjs`**

```js
export const ORDER = ['tokens.css', 'base.css']
```

- [ ] **Step 5: Rebuild and run the full suite**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
npm run build
npx vitest run --maxWorkers=2
```

Expected: all tests PASS. `base.css` now has one component file under the
contract test, and contains no colour literal.

- [ ] **Step 6: Verify the contract test actually catches a violation**

A test that has never failed is a test you do not know works. Temporarily add
a violating line to `src/base.css`:

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
printf '\n.axi-scratch { color: #ff00ff; border: 5px solid red; }\n' >> src/base.css
npx vitest run tests/tokens.test.mjs --maxWorkers=2
```

Expected: FAIL, reporting both the colour literal and the invented border step.
Then revert:

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git checkout src/base.css 2>/dev/null || sed -i '/axi-scratch/d' src/base.css
npm run build
npx vitest run --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git add -A
git commit -F - <<'EOF'
feat(base): add the base layer and enforce the token contract

The rule that makes a light theme possible later - every colour resolves
through a token - is worth nothing as prose in a README. This makes it a test,
along with the two-form-step rule, so a component that invents a third border
weight or drops a hex in fails before it ships.

Comments are stripped before scanning: they routinely name the hex they are
explaining, and failing on that would just teach people to delete the
explanation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Primitives

The reusable pieces every axi property needs: buttons, pills, chips, panels,
inputs, the self-drawn select, the count badge and the diamond motif.

**Files:**
- Create: `src/primitives.css`
- Modify: `scripts/build.mjs` (append `'primitives.css'` to `ORDER`)
- Modify: `dist/axi.css` (rebuild)

**Interfaces:**
- Consumes: all tokens from `src/tokens.css`; base element styling from
  `src/base.css`
- Produces, for use by Tasks 4–7:
  - `.axi-panel` — the outlined-and-blocked surface. `.axi-toolbar`,
    `.axi-notice`, `.axi-card` and `.axi-menupop` all build on it.
  - `.axi-btn` + `--primary`, `--ghost`, `--dashed`
  - `.axi-pill` + `[aria-pressed="true"]` behaviour
  - `.axi-chip` + `--ok`, `--warn`, `--danger`, `--meta`
  - `.axi-input`, `.axi-select`
  - `.axi-badge-count`, `.axi-diamond`

- [ ] **Step 1: Write `src/primitives.css`**

```css
/* axi design language - primitives.
   The pieces that recur in every property. Two rules govern the whole file:
   a raised thing is outlined in --axi-ink-line and carries a hard offset
   block, never a blur; and a filled chip asserts a value while an outlined
   one annotates. */

/* ---------- panel ---------- */
/* The surface every larger component is built on. Kept as its own class so a
   consumer can raise an arbitrary block into the language without waiting for
   us to ship a component for it. */
.axi-panel {
  background: var(--axi-surface);
  border: var(--axi-border-panel) solid var(--axi-ink-line);
  border-radius: var(--axi-radius);
  box-shadow: var(--axi-offset-panel) var(--axi-offset-panel) 0 var(--axi-ink-line);
}

/* ---------- button ---------- */
.axi-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 20px;
  border: var(--axi-border-control) solid var(--axi-ink-line);
  border-radius: 8px;
  background: var(--axi-ground);
  color: var(--axi-text-dim);
  font: var(--axi-t-label);
  letter-spacing: var(--axi-ls-label);
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition: transform .1s, box-shadow .1s;
}
/* Hover lifts. Nothing in this language fades or glows: the block deepens and
   the element moves against it, which reads instantly even in peripheral
   vision and costs no colour. */
.axi-btn:hover {
  color: var(--axi-text);
  box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
  transform: translate(-2px, -2px);
}
.axi-btn--primary {
  background: var(--axi-accent);
  color: var(--axi-accent-ink);
  box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
}
.axi-btn--primary:hover { color: var(--axi-accent-ink); }
.axi-btn--ghost { background: transparent; }
.axi-btn--dashed { background: transparent; border-style: dashed; }

/* ---------- pill ---------- */
/* A filter toggle. Its pressed state fills with whatever colour the consumer
   has put on it, so the control reads as the thing it filters to rather than
   as a generic "selected". Consumers set that colour by overriding
   --axi-pill-fill on the element. */
.axi-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 9px;
  border: var(--axi-border-control) solid var(--axi-ink-line);
  border-radius: 8px;
  background: var(--axi-ground);
  color: var(--axi-text-dim);
  font: var(--axi-t-label);
  letter-spacing: var(--axi-ls-label);
  text-transform: uppercase;
  cursor: pointer;
  transition: transform .1s, box-shadow .1s;
  --axi-pill-fill: var(--axi-accent);
}
.axi-pill:hover {
  color: var(--axi-text);
  box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
  transform: translate(-2px, -2px);
}
.axi-pill[aria-pressed="true"] {
  background: var(--axi-pill-fill);
  color: var(--axi-accent-ink);
  box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
}

/* ---------- chip ---------- */
/* Filled asserts, outlined annotates. The unmodified chip is a neutral fact;
   the status modifiers assert a value; --meta is the only outlined variant and
   is drawn in the reserved cool ink, so a reader can tell commentary from
   data without reading either. */
.axi-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 9px;
  border: var(--axi-border-control) solid var(--axi-ink-line);
  border-radius: var(--axi-radius-sm);
  background: var(--axi-surface-raised);
  color: var(--axi-text-dim);
  font: var(--axi-t-micro);
  letter-spacing: var(--axi-ls-micro);
  text-transform: uppercase;
}
.axi-chip--ok { background: var(--axi-ok); color: var(--axi-ink-line); }
.axi-chip--warn { background: var(--axi-warn); color: var(--axi-ink-line); }
.axi-chip--danger { background: var(--axi-danger); color: var(--axi-ink-line); }
.axi-chip--accent { background: var(--axi-accent); color: var(--axi-accent-ink); }
.axi-chip--meta {
  background: transparent;
  border-color: var(--axi-meta);
  color: var(--axi-meta);
}

/* ---------- count badge ---------- */
.axi-badge-count {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 99px;
  background: var(--axi-accent);
  color: var(--axi-accent-ink);
  font: var(--axi-t-micro);
  font-size: 11px;
}

/* ---------- diamond ---------- */
/* The family motif: a rotated outlined square. Used as a bullet, a status dot
   and, scaled up behind a glyph, the brand sigil. */
.axi-diamond {
  display: inline-block;
  width: 9px; height: 9px; flex: none;
  transform: rotate(45deg);
  background: var(--axi-meta);
  border: var(--axi-border-control) solid var(--axi-ink-line);
}
.axi-diamond--accent { background: var(--axi-accent); }
.axi-diamond--ok { background: var(--axi-ok); }
.axi-diamond--warn { background: var(--axi-warn); }
.axi-diamond--danger { background: var(--axi-danger); }

/* ---------- input ---------- */
.axi-input {
  width: 100%;
  padding: 11px 12px;
  background: var(--axi-ground);
  border: var(--axi-border-control) solid var(--axi-ink-line);
  border-radius: 8px;
  color: var(--axi-text);
  font: var(--axi-t-label);
  font-size: 14px;
}
.axi-input::placeholder { color: var(--axi-text-faint); font-weight: 500; }

/* A search input with the magnifier drawn inside it. The glyph is the
   consumer's; this only reserves the room and positions it. */
.axi-search { position: relative; }
.axi-search .axi-input { padding-left: 38px; }
.axi-search__icon {
  position: absolute; left: 13px; top: 50%; transform: translateY(-50%);
  color: var(--axi-accent); font-weight: 900; pointer-events: none;
}

/* ---------- select ---------- */
/* The closed box is ours everywhere: strip the native control and draw the
   caret, so a select sits alongside the other controls as just another
   outlined chip instead of announcing the OS. */
.axi-select {
  appearance: none;
  padding: 10px 30px 10px 9px;
  border: var(--axi-border-control) solid var(--axi-ink-line);
  border-radius: 8px;
  background-color: var(--axi-ground);
  color: var(--axi-text-dim);
  font: var(--axi-t-label);
  font-size: 12.5px;
  letter-spacing: var(--axi-ls-label);
  text-transform: uppercase;
  cursor: pointer;
  /* Two triangles meeting: a caret with no image and no icon font. */
  background-image:
    linear-gradient(45deg, transparent 50%, var(--axi-accent) 50%),
    linear-gradient(135deg, var(--axi-accent) 50%, transparent 50%);
  background-position: calc(100% - 16px) calc(50% + 2px), calc(100% - 11px) calc(50% + 2px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.axi-select:hover {
  color: var(--axi-text);
  box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
  transform: translate(-2px, -2px);
}

/* The popup stays OS chrome until a browser lets us style it. Where one does
   (Chromium's base-select), the list is drawn with the same outline and offset
   block as our own popovers, so both dropdown kinds read as one family; where
   it does not, the closed box above is still ours and the list is native. */
@supports (appearance: base-select) {
  /* base-select draws its own ::picker-icon, so the hand-drawn caret above
     would be a second arrow. */
  .axi-select, .axi-select::picker(select) { appearance: base-select; }
  .axi-select { background-image: none; padding-right: 9px; }
  .axi-select::picker-icon { color: var(--axi-accent); transition: none; }
  .axi-select::picker(select) {
    margin-top: 9px; padding: 6px;
    border: var(--axi-border-panel) solid var(--axi-ink-line);
    border-radius: 9px;
    background: var(--axi-surface-raised);
    box-shadow: var(--axi-offset-panel) var(--axi-offset-panel) 0 var(--axi-ink-line);
  }
  .axi-select option {
    display: flex; align-items: center; gap: 9px;
    padding: 8px 9px;
    border-radius: var(--axi-radius-sm);
    background: transparent;
    color: var(--axi-text-dim);
    font: var(--axi-t-label);
    font-size: 12.5px;
    letter-spacing: var(--axi-ls-label);
    text-transform: uppercase;
  }
  .axi-select option:hover, .axi-select option:focus {
    background: var(--axi-ground); color: var(--axi-text);
  }
  /* The page-wide focus ring sits 2px outside its element; inside a picker
     that is 2px into the neighbouring row, so pull it back in. */
  .axi-select option:focus-visible { outline-offset: -3px; }
  .axi-select option:checked { color: var(--axi-text); }
  .axi-select option::checkmark { content: "\2713"; color: var(--axi-accent); font-weight: 900; }
}
```

- [ ] **Step 2: Append `primitives.css` to `ORDER`**

```js
export const ORDER = ['tokens.css', 'base.css', 'primitives.css']
```

- [ ] **Step 3: Rebuild and run the tests**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
npm run build
npx vitest run --maxWorkers=2
```

Expected: PASS. In particular the contract test confirms `primitives.css`
carries no colour literal — the `linear-gradient` caret uses
`var(--axi-accent)` and `transparent`, both permitted.

- [ ] **Step 4: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git add -A
git commit -F - <<'EOF'
feat(primitives): add buttons, chips, inputs and the self-drawn select

The select is the reason this layer exists. Every property needs one, the
native control announces the OS the moment it appears next to an outlined
chip, and the base-select work to style its popup is fiddly enough that
reimplementing it per repo guarantees three subtly different dropdowns.

A pressed pill fills with whatever colour the consumer puts on it via
--axi-pill-fill, so a filter reads as the thing it filters to rather than as a
generic selected state.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Layout

The page wrapper with its three measures, the auto-fill grid, and the two
spacing helpers that actually recur.

**Files:**
- Create: `src/layout.css`
- Modify: `scripts/build.mjs` (append `'layout.css'` to `ORDER`)
- Modify: `dist/axi.css` (rebuild)

**Interfaces:**
- Consumes: tokens from `src/tokens.css`
- Produces, for use by Tasks 5–7:
  - `.axi-page` + `--narrow`, `--wide`
  - `.axi-grid`, with per-instance column width via `--axi-grid-min`
  - `.axi-stack`, `.axi-row`

- [ ] **Step 1: Write `src/layout.css`**

```css
/* axi design language - layout.
   Three measures, one grid, two spacing helpers. Deliberately small: a
   layout system large enough to express any page is a framework, and every
   property here can reach for plain CSS grid the moment it needs something
   these do not cover. */

/* The page wrapper. --axi-page is the default because most axi surfaces are
   browsing views; the two modifiers exist because prose and dense catalogs
   genuinely disagree about measure, and hard-coding either default made one
   of them wrong. */
.axi-page {
  max-width: var(--axi-page);
  margin-inline: auto;
  padding-inline: var(--axi-gutter);
}
/* Prose. Beyond this measure a line of body text gets hard to track back to
   the start of the next one. */
.axi-page--narrow { max-width: var(--axi-page-narrow); }
/* Dense card grids, where width spent on margins is a column not shown. */
.axi-page--wide { max-width: var(--axi-page-wide); }

/* Auto-fill card grid. The minimum column width is per-instance rather than
   global: a grid of ten app cards and a grid of sixty catalog entries want
   genuinely different minimums, and both are this same component. */
.axi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--axi-grid-min, 300px), 1fr));
  gap: var(--axi-gutter);
  --axi-grid-min: 300px;
}

/* Vertical rhythm between siblings, set per-instance. */
.axi-stack { display: flex; flex-direction: column; gap: var(--axi-stack-gap, 12px); }
/* A horizontal run that wraps rather than overflowing. */
.axi-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--axi-row-gap, 10px); }

@media (max-width: 640px) {
  .axi-page { padding-inline: 16px; }
  .axi-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Append `layout.css` to `ORDER`**

```js
export const ORDER = ['tokens.css', 'base.css', 'primitives.css', 'layout.css']
```

- [ ] **Step 3: Rebuild and run the tests**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
npm run build
npx vitest run --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git add -A
git commit -F - <<'EOF'
feat(layout): add the page measures, grid and spacing helpers

Measure is the one thing that did not survive extraction unchanged. The source
site ran a single 1660px page width because a dense catalog wanted it; a wiki
article at that width is unreadable. So the default narrows and both extremes
become modifiers, which is the first real sign this is a system rather than
one site's stylesheet renamed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Shells

The furniture: masthead, notice, toolbar, menu popover, card, drawer and
pull-quote.

**Files:**
- Create: `src/shells.css`
- Modify: `scripts/build.mjs` (append `'shells.css'` to `ORDER`)
- Modify: `dist/axi.css` (rebuild)

**Interfaces:**
- Consumes: `.axi-panel` from `src/primitives.css`; `.axi-page` from
  `src/layout.css`; all tokens
- Produces, for use by Tasks 6–7:
  - `.axi-mast`, `.axi-mast__in`, `.axi-brand`, `.axi-sigil`,
    `.axi-brand__name`, `.axi-tabs`
  - `.axi-notice`, `.axi-notice__icon`
  - `.axi-toolbar`
  - `.axi-menu`, `.axi-menu__pop`
  - `.axi-card`, `.axi-card__head`, `.axi-card__glyph`, `.axi-card__title`,
    `.axi-card__meta`, and `--strip` accent variants
  - `.axi-drawer`, `.axi-drawer__head`, `.axi-drawer__body`, `.axi-scrim`
  - `.axi-quote`
  - `.axi-eyebrow` (the small uppercase section heading used in panels)

- [ ] **Step 1: Write `src/shells.css`**

```css
/* axi design language - shells.
   Assembled components. Each is built from the primitives rather than
   redefining them, so a change to .axi-panel moves the notice, the toolbar,
   the popover and the card together. */

/* The small uppercase heading that labels a panel's contents. */
.axi-eyebrow {
  margin: 0 0 14px;
  font: var(--axi-t-eyebrow);
  letter-spacing: var(--axi-ls-eyebrow);
  text-transform: uppercase;
  color: var(--axi-text-faint);
}

/* ---------- masthead ---------- */
.axi-mast {
  position: sticky; top: 0; z-index: 40;
  background: var(--axi-ground);
  border-bottom: var(--axi-border-panel) solid var(--axi-ink-line);
}
.axi-mast__in {
  max-width: var(--axi-page); margin-inline: auto;
  padding-inline: var(--axi-gutter);
  display: flex; align-items: center; gap: 22px; min-height: 66px; flex-wrap: wrap;
}
.axi-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
/* The sigil is the diamond motif scaled up with a glyph on top. The diamond is
   a rotated pseudo-element behind the text rather than a rotated box, so the
   glyph stays upright. isolation keeps the negative z-index inside the sigil
   instead of dropping it behind the masthead. */
.axi-sigil {
  position: relative; isolation: isolate;
  width: 34px; height: 34px; flex: none;
  display: grid; place-items: center;
  color: var(--axi-accent-ink); font-weight: 900; font-size: 13px;
}
.axi-sigil::before {
  content: ""; position: absolute; inset: 0; z-index: -1;
  transform: rotate(45deg);
  border-radius: 5px;
  background: var(--axi-accent);
  border: var(--axi-border-control) solid var(--axi-ink-line);
}
.axi-brand__name { font: 800 17px/1.15 var(--axi-sans); letter-spacing: -.02em; }
.axi-brand__name small {
  display: block;
  font: 700 10.5px/1.4 var(--axi-sans);
  color: var(--axi-text-faint);
  letter-spacing: .09em; text-transform: uppercase;
}
.axi-tabs { display: flex; gap: 8px; margin-left: auto; }
.axi-tabs a {
  padding: 8px 16px;
  font: 800 13.5px/1 var(--axi-sans);
  color: var(--axi-text-dim); text-decoration: none;
  border: var(--axi-border-control) solid transparent;
  border-radius: 8px;
}
.axi-tabs a:hover { color: var(--axi-text); border-color: var(--axi-rule); }
/* The current tab is filled and blocked - the same treatment a pressed pill
   gets, because it is the same idea: this one is on. */
.axi-tabs a[aria-current="page"] {
  background: var(--axi-accent);
  color: var(--axi-accent-ink);
  border-color: var(--axi-ink-line);
  box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
}

/* ---------- notice ---------- */
.axi-notice {
  display: flex; gap: 14px; padding: 15px 18px;
  background: var(--axi-surface);
  border: var(--axi-border-panel) solid var(--axi-ink-line);
  border-radius: var(--axi-radius);
  box-shadow: var(--axi-offset-panel) var(--axi-offset-panel) 0 var(--axi-ink-line);
}
.axi-notice__icon {
  flex: none; width: 26px; height: 26px;
  display: grid; place-items: center;
  border-radius: var(--axi-radius-sm);
  background: var(--axi-accent); color: var(--axi-accent-ink);
  font-size: 14px; font-weight: 900;
  border: var(--axi-border-control) solid var(--axi-ink-line);
}
.axi-notice p { margin: 0; font: var(--axi-t-small); color: var(--axi-text-dim); }
.axi-notice b { color: var(--axi-accent); font-weight: 800; }

/* ---------- toolbar ---------- */
.axi-toolbar {
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
  padding: 14px;
  background: var(--axi-surface);
  border: var(--axi-border-panel) solid var(--axi-ink-line);
  border-radius: var(--axi-radius);
  box-shadow: var(--axi-offset-panel) var(--axi-offset-panel) 0 var(--axi-ink-line);
}

/* ---------- menu popover ---------- */
/* A disclosure, not a permanent row of controls. The trigger is an .axi-btn
   with aria-expanded; this styles the panel it opens. */
.axi-menu { position: relative; }
.axi-menu__pop {
  position: absolute; top: calc(100% + 9px); left: 0; z-index: 30;
  width: var(--axi-menu-width, 310px);
  max-height: 340px; overflow-y: auto; padding: 8px;
  background: var(--axi-surface-raised);
  border: var(--axi-border-panel) solid var(--axi-ink-line);
  border-radius: 9px;
  box-shadow: var(--axi-offset-panel) var(--axi-offset-panel) 0 var(--axi-ink-line);
}
.axi-menu__pop[hidden] { display: none; }
.axi-menu__pop label {
  display: flex; gap: 9px; align-items: flex-start;
  padding: 7px 8px; border-radius: var(--axi-radius-sm);
  font-size: 13px; font-weight: 600; color: var(--axi-text-dim); cursor: pointer;
}
.axi-menu__pop label:hover { background: var(--axi-ground); color: var(--axi-text); }
.axi-menu__pop input { margin: 3px 0 0; accent-color: var(--axi-accent); }

/* ---------- card ---------- */
.axi-card {
  position: relative; overflow: hidden;
  width: 100%; text-align: left;
  display: flex; flex-direction: column; gap: 11px;
  padding: 22px 16px 14px;
  background: var(--axi-surface);
  border: var(--axi-border-panel) solid var(--axi-ink-line);
  border-radius: var(--axi-radius);
  box-shadow: var(--axi-offset-panel) var(--axi-offset-panel) 0 var(--axi-ink-line);
  font: inherit; color: inherit; text-decoration: none; cursor: pointer;
  transition: transform .1s, box-shadow .1s;
}
.axi-card:hover {
  transform: translate(-3px, -3px);
  box-shadow: 10px 10px 0 var(--axi-ink-line);
}
/* The top strip is drawn from the card itself so a renderer does not have to
   emit an extra element for it. It is opt-in: a card only gets a strip when
   the consumer has a real value to encode in it, because a coloured strip that
   means nothing is decoration impersonating data. */
.axi-card--strip::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 9px;
  background: var(--axi-card-strip, var(--axi-accent));
  border-bottom: var(--axi-border-panel) solid var(--axi-ink-line);
}
.axi-card__head { display: flex; gap: 12px; align-items: flex-start; }
.axi-card__glyph {
  flex: none; width: 40px; height: 40px;
  display: grid; place-items: center;
  border-radius: 8px;
  border: var(--axi-border-control) solid var(--axi-ink-line);
  background: var(--axi-surface-raised);
  color: var(--axi-text);
  font: 900 15px/1 var(--axi-sans);
}
.axi-card__title { flex: 1; min-width: 0; }
.axi-card__title .axi-card__name {
  display: block;
  font: var(--axi-t-h3); letter-spacing: var(--axi-ls-h3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.axi-card__title .axi-card__kind {
  display: block; margin-top: 3px;
  font: 700 11px/1.3 var(--axi-sans);
  color: var(--axi-text-faint);
  letter-spacing: .08em; text-transform: uppercase;
}
.axi-card p { margin: 0; font: var(--axi-t-small); color: var(--axi-text-dim); }
/* Pushed to the bottom so that in an equalised grid row every card's meta
   strip lands on the same line and the rules read as continuous across the
   grid. The cost is empty space on cards with less content. */
.axi-card__meta {
  display: flex; gap: 14px; flex-wrap: wrap; align-items: center;
  margin-top: auto; padding-top: 12px;
  border-top: var(--axi-border-control) solid var(--axi-rule);
  font: 700 12px/1 var(--axi-sans);
  color: var(--axi-text-faint);
}
.axi-card__go { margin-left: auto; color: var(--axi-accent); font-weight: 900; text-transform: uppercase; letter-spacing: .05em; }
.axi-card:hover .axi-card__go { color: var(--axi-text); }

/* ---------- drawer ---------- */
.axi-scrim { position: fixed; inset: 0; z-index: 50; background: var(--axi-scrim); border: 0; }
.axi-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 51;
  width: min(var(--axi-drawer-width, 560px), 100vw);
  display: flex; flex-direction: column;
  background: var(--axi-surface);
  border-left: var(--axi-border-panel) solid var(--axi-ink-line);
}
.axi-drawer[hidden], .axi-scrim[hidden] { display: none; }
.axi-drawer__head {
  position: relative;
  padding: 20px 24px 18px;
  border-bottom: var(--axi-border-panel) solid var(--axi-ink-line);
}
.axi-drawer__head h2 {
  margin: 2px 0 0; padding-right: 44px;
  font: var(--axi-t-h2); letter-spacing: var(--axi-ls-h2);
}
.axi-drawer__close {
  position: absolute; top: 16px; right: 18px;
  width: 32px; height: 32px;
  display: grid; place-items: center;
  border-radius: 8px;
  background: var(--axi-ground);
  border: var(--axi-border-control) solid var(--axi-ink-line);
  color: var(--axi-text-dim);
  font-size: 15px; font-weight: 900; cursor: pointer;
}
.axi-drawer__close:hover {
  background: var(--axi-accent); color: var(--axi-accent-ink);
  box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
  transform: translate(-2px, -2px);
}
.axi-drawer__body { overflow-y: auto; padding: 18px 24px 30px; }

/* ---------- pull-quote ---------- */
/* A cited quotation. The accent rule down the left is the only place in the
   language where colour marks a block rather than filling a chip - a quote is
   someone else's words and wants to look borrowed. */
.axi-quote {
  margin: 0;
  padding: 11px 13px;
  border-left: var(--axi-border-panel) solid var(--axi-accent);
  background: var(--axi-ground);
  border-radius: 0 var(--axi-radius-sm) var(--axi-radius-sm) 0;
}
.axi-quote p { margin: 0; font-size: 13px; font-style: italic; color: var(--axi-text-dim); line-height: 1.5; }
.axi-quote cite {
  display: block; margin-top: 7px;
  font-style: normal; font-size: 11.5px; font-weight: 700;
  color: var(--axi-accent);
}

@media (max-width: 640px) {
  .axi-mast__in { min-height: 0; padding: 10px 16px; gap: 12px; }
  .axi-tabs { margin-left: 0; width: 100%; overflow-x: auto; }
  /* The offset blocks eat horizontal room a phone does not have. */
  .axi-notice, .axi-toolbar, .axi-card { box-shadow: 4px 4px 0 var(--axi-ink-line); }
}
```

- [ ] **Step 2: Append `shells.css` to `ORDER`**

```js
export const ORDER = ['tokens.css', 'base.css', 'primitives.css', 'layout.css', 'shells.css']
```

- [ ] **Step 3: Rebuild and run the tests**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
npm run build
npx vitest run --maxWorkers=2
```

Expected: PASS. Note the scrim now resolves through `--axi-scrim` rather than
an inline `rgba()`, which is what keeps the contract test green.

- [ ] **Step 4: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git add -A
git commit -F - <<'EOF'
feat(shells): add masthead, notice, toolbar, menu, card, drawer and quote

The card's top strip becomes opt-in here. In the source site that strip always
meant risk band - real data - and carrying it over as an always-on decoration
would have made the first thing the eye lands on the one thing that means
nothing. A card gets a strip when the consumer has a value to put in it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Prose

The typographic block for wiki article bodies — the one genuinely new area,
with no source in the GW2 stylesheet to extract from.

**Files:**
- Create: `src/prose.css`
- Modify: `scripts/build.mjs` (append `'prose.css'` to `ORDER`)
- Modify: `dist/axi.css` (rebuild)

**Interfaces:**
- Consumes: tokens; `.axi-quote` from `src/shells.css` (prose blockquotes
  reuse its treatment rather than defining a second quote style)
- Produces: `.axi-prose`, a single class wrapping rendered markdown. Consumers
  apply it to one container; nothing inside needs a class.

- [ ] **Step 1: Write `src/prose.css`**

```css
/* axi design language - prose.
   A single class wrapping rendered markdown, so a content pipeline can emit
   plain HTML with no classes at all and still land inside the language.

   This layer has no ancestor in the source site, which was all cards and
   controls. The restraint it needs is different: long-form reading wants
   generous leading and quiet rules, and the offset blocks that make a card
   feel physical would make a paragraph feel shouted. So nothing in here is
   blocked except the code block and the table, which are genuinely objects
   dropped into the text rather than part of its flow. */
.axi-prose { color: var(--axi-text-dim); font: var(--axi-t-body); }

.axi-prose > :first-child { margin-top: 0; }
.axi-prose > :last-child { margin-bottom: 0; }

.axi-prose h1 { margin: 0 0 18px; font: var(--axi-t-h1); letter-spacing: var(--axi-ls-h1); color: var(--axi-text); }
.axi-prose h2 {
  margin: 38px 0 14px; padding-top: 22px;
  border-top: var(--axi-border-control) solid var(--axi-rule);
  font: var(--axi-t-h2); letter-spacing: var(--axi-ls-h2); color: var(--axi-text);
}
.axi-prose h3 { margin: 28px 0 10px; font: var(--axi-t-h3); letter-spacing: var(--axi-ls-h3); color: var(--axi-text); }
.axi-prose h4 {
  margin: 22px 0 8px;
  font: var(--axi-t-eyebrow); letter-spacing: var(--axi-ls-eyebrow);
  text-transform: uppercase; color: var(--axi-text-faint);
}

.axi-prose p { margin: 0 0 16px; }
.axi-prose strong { color: var(--axi-text); font-weight: 800; }
/* Prose is the one place a link should announce itself: a reader scanning an
   article is looking for them, and inheriting the body ink would hide them. */
.axi-prose a { color: var(--axi-accent); font-weight: 600; text-underline-offset: 2px; }
.axi-prose a:hover { color: var(--axi-text); }

.axi-prose ul, .axi-prose ol { margin: 0 0 16px; padding-left: 22px; }
.axi-prose li { margin: 0 0 7px; }
/* The family motif as a bullet. Drawn with ::marker's replacement rather than
   a background image so it inherits the list's own indentation. */
.axi-prose ul { list-style: none; padding-left: 20px; }
.axi-prose ul > li { position: relative; }
.axi-prose ul > li::before {
  content: ""; position: absolute; left: -20px; top: .55em;
  width: 7px; height: 7px; transform: rotate(45deg);
  background: var(--axi-accent);
  border: 2px solid var(--axi-ink-line);
}

.axi-prose code {
  font-family: var(--axi-mono); font-size: .88em;
  background: var(--axi-ground); color: var(--axi-text);
  border: 2px solid var(--axi-ink-line);
  border-radius: 4px; padding: 1px 5px;
}
.axi-prose pre {
  margin: 0 0 18px; padding: 14px 16px; overflow-x: auto;
  background: var(--axi-ground);
  border: var(--axi-border-control) solid var(--axi-ink-line);
  border-radius: var(--axi-radius-sm);
  box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
}
.axi-prose pre code { background: none; border: 0; padding: 0; font-size: 12.5px; line-height: 1.6; }

.axi-prose blockquote {
  margin: 0 0 18px;
  padding: 11px 13px;
  border-left: var(--axi-border-panel) solid var(--axi-accent);
  background: var(--axi-ground);
  border-radius: 0 var(--axi-radius-sm) var(--axi-radius-sm) 0;
}
.axi-prose blockquote p { margin: 0; font-style: italic; }

.axi-prose table {
  width: 100%; margin: 0 0 18px;
  border-collapse: collapse;
  border: var(--axi-border-control) solid var(--axi-ink-line);
  border-radius: var(--axi-radius-sm);
  overflow: hidden;
  font-size: 13.5px;
}
.axi-prose th {
  text-align: left; padding: 10px 12px;
  background: var(--axi-surface-raised); color: var(--axi-text);
  font: var(--axi-t-micro); letter-spacing: var(--axi-ls-micro); text-transform: uppercase;
}
.axi-prose td { padding: 10px 12px; border-top: 2px solid var(--axi-rule); }

.axi-prose hr {
  margin: 30px 0; height: 0;
  border: 0; border-top: var(--axi-border-control) solid var(--axi-rule);
}

.axi-prose img { max-width: 100%; height: auto; border-radius: var(--axi-radius-sm); }
```

- [ ] **Step 2: Append `prose.css` to `ORDER`**

```js
export const ORDER = ['tokens.css', 'base.css', 'primitives.css', 'layout.css', 'shells.css', 'prose.css']
```

- [ ] **Step 3: Rebuild and run the tests**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
npm run build
npx vitest run --maxWorkers=2
```

Expected: PASS. The `2px` borders on inline code and table cells are
deliberate and do not trip the form-step test, which only matches a `border:`
or `border-<side>:` shorthand beginning with a number — these are written as
`border: 2px solid ...`. **If that test fails here**, that is the plan being
wrong rather than the CSS: the correct fix is to add `--axi-border-hairline: 2px`
to `src/tokens.css` and use it in both places, not to weaken the test.

- [ ] **Step 4: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git add -A
git commit -F - <<'EOF'
feat(prose): add the article body typography

The one layer with no ancestor in the source site, which was all cards and
controls. Long-form reading needs the opposite restraint: the offset blocks
that make a card feel physical make a paragraph feel shouted, so only the code
block and the table are blocked - the two things that really are objects
dropped into the text rather than part of its flow.

One class on the container, nothing inside needing one, so a markdown pipeline
can emit plain HTML and still land inside the language.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Pattern gallery

Every component on one page with a live accent switcher. This is the visual
regression check the spec calls for, and the thing that proves per-app
theming works before any consumer depends on it.

**Files:**
- Create: `index.html`
- Create: `gallery.js`

**Interfaces:**
- Consumes: `dist/axi.css` — every class produced by Tasks 2–6
- Produces: the Pages root for `axi-design`. Task 8's workflow publishes this
  alongside `v1/axi.css`.

- [ ] **Step 1: Write `index.html`**

The gallery links `dist/axi.css` by relative path so it always renders the
artifact the tests just checked, not a published copy.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>axi design language — pattern gallery</title>
<link rel="stylesheet" href="dist/axi.css">
<style>
  /* Gallery chrome only. Nothing here is part of the design language; it is
     the scaffolding that displays it, kept in the page so the gallery cannot
     accidentally become an unversioned seventh source file. */
  .g-section { margin: 46px 0; }
  .g-section > h2 { font: var(--axi-t-h2); letter-spacing: var(--axi-ls-h2); margin: 0 0 6px; }
  .g-section > p { color: var(--axi-text-faint); margin: 0 0 20px; font: var(--axi-t-small); }
  .g-demo { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
  .g-swatches { display: flex; gap: 8px; flex-wrap: wrap; }
  .g-swatch { width: 44px; height: 44px; border: var(--axi-border-control) solid var(--axi-ink-line); border-radius: 8px; }
</style>
</head>
<body>

<header class="axi-mast">
  <div class="axi-mast__in">
    <a class="axi-brand" href="#">
      <span class="axi-sigil">A</span>
      <span class="axi-brand__name">axi-design<small>Pattern gallery</small></span>
    </a>
    <nav class="axi-tabs">
      <a href="#" aria-current="page">Gallery</a>
      <a href="#primitives">Primitives</a>
      <a href="#shells">Shells</a>
      <a href="#prose">Prose</a>
    </nav>
    <label class="axi-sr-only" for="accent">Accent colour</label>
    <select class="axi-select" id="accent">
      <option value="#ffc53d">Gold — default</option>
      <option value="#b06bff">Violet — axi.wiki</option>
      <option value="#2fd38a">Jade</option>
      <option value="#ff5252">Tyrian</option>
      <option value="#4ec3ff">Sky</option>
    </select>
  </div>
</header>

<main class="axi-page">

  <section class="g-section">
    <h2>Accent</h2>
    <p>The whole per-app override surface. Change the accent above; everything below follows.</p>
    <div class="axi-notice">
      <span class="axi-notice__icon">!</span>
      <p><b>One variable.</b> An app that sets <code>--axi-accent</code> and nothing else is correctly themed. If something on this page ignores the switcher, it hard-coded a colour and the contract test missed it.</p>
    </div>
  </section>

  <section class="g-section">
    <h2>Palette</h2>
    <p>Status inks are fixed; only the accent moves.</p>
    <div class="g-swatches">
      <span class="g-swatch" style="background: var(--axi-accent)" title="accent"></span>
      <span class="g-swatch" style="background: var(--axi-meta)" title="meta"></span>
      <span class="g-swatch" style="background: var(--axi-ok)" title="ok"></span>
      <span class="g-swatch" style="background: var(--axi-warn)" title="warn"></span>
      <span class="g-swatch" style="background: var(--axi-danger)" title="danger"></span>
      <span class="g-swatch" style="background: var(--axi-surface)" title="surface"></span>
      <span class="g-swatch" style="background: var(--axi-surface-raised)" title="surface-raised"></span>
      <span class="g-swatch" style="background: var(--axi-ground)" title="ground"></span>
    </div>
  </section>

  <section class="g-section" id="primitives">
    <h2>Primitives</h2>
    <p>Buttons, pills, chips, inputs, the select, badges and the diamond.</p>

    <div class="g-demo">
      <a class="axi-btn axi-btn--primary" href="#">Primary</a>
      <a class="axi-btn" href="#">Default</a>
      <a class="axi-btn axi-btn--ghost" href="#">Ghost</a>
      <a class="axi-btn axi-btn--dashed" href="#">Dashed</a>
    </div>

    <div class="g-demo">
      <button class="axi-pill" aria-pressed="false" type="button">Unpressed</button>
      <button class="axi-pill" aria-pressed="true" type="button">Pressed</button>
      <button class="axi-pill" aria-pressed="true" type="button" style="--axi-pill-fill: var(--axi-ok)">Low</button>
      <button class="axi-pill" aria-pressed="true" type="button" style="--axi-pill-fill: var(--axi-warn)">Elevated</button>
      <button class="axi-pill" aria-pressed="true" type="button" style="--axi-pill-fill: var(--axi-danger)">High</button>
    </div>

    <div class="g-demo">
      <span class="axi-chip">Neutral</span>
      <span class="axi-chip axi-chip--accent">Accent</span>
      <span class="axi-chip axi-chip--ok">Stable</span>
      <span class="axi-chip axi-chip--warn">Beta</span>
      <span class="axi-chip axi-chip--danger">Deprecated</span>
      <span class="axi-chip axi-chip--meta">Annotation</span>
    </div>

    <div class="g-demo">
      <span class="axi-diamond"></span>
      <span class="axi-diamond axi-diamond--accent"></span>
      <span class="axi-diamond axi-diamond--ok"></span>
      <span class="axi-diamond axi-diamond--warn"></span>
      <span class="axi-diamond axi-diamond--danger"></span>
      <span class="axi-badge-count">12</span>
    </div>

    <div class="axi-toolbar">
      <div class="axi-search" style="flex: 1 1 200px; max-width: 260px">
        <span class="axi-search__icon">&#8981;</span>
        <label class="axi-sr-only" for="q">Search</label>
        <input class="axi-input" id="q" placeholder="Search…">
      </div>
      <label class="axi-sr-only" for="sort">Sort</label>
      <select class="axi-select" id="sort">
        <option>Sort: name</option>
        <option>Sort: newest</option>
        <option>Sort: score</option>
      </select>
      <div class="axi-menu">
        <button class="axi-btn axi-btn--dashed" type="button" aria-expanded="false" id="menu-trigger">
          Filters <span class="axi-badge-count">3</span>
        </button>
        <div class="axi-menu__pop" id="menu-pop" hidden>
          <label><input type="checkbox" checked> Injects into the client</label>
          <label><input type="checkbox" checked> Simulates input</label>
          <label><input type="checkbox" checked> Reads process memory</label>
          <label><input type="checkbox"> Archived upstream</label>
          <label><input type="checkbox"> No release artifacts</label>
        </div>
      </div>
    </div>
  </section>

  <section class="g-section" id="shells">
    <h2>Shells</h2>
    <p>Cards in a grid, with and without a meaning-carrying strip.</p>
    <div class="axi-grid" style="--axi-grid-min: 280px">
      <a class="axi-card axi-card--strip" href="#" style="--axi-card-strip: var(--axi-ok)">
        <div class="axi-card__head">
          <span class="axi-card__glyph">OM</span>
          <span class="axi-card__title">
            <span class="axi-card__name">AxiOM</span>
            <span class="axi-card__kind">Launcher</span>
          </span>
        </div>
        <p>One launcher for every Axi app. Installs, updates and launches the whole suite.</p>
        <div class="axi-row" style="--axi-row-gap: 6px">
          <span class="axi-chip axi-chip--ok">Stable</span>
          <span class="axi-chip">Desktop</span>
        </div>
        <div class="axi-card__meta">Electron <span class="axi-card__go">Docs &rarr;</span></div>
      </a>

      <a class="axi-card axi-card--strip" href="#" style="--axi-card-strip: var(--axi-warn)">
        <div class="axi-card__head">
          <span class="axi-card__glyph">BR</span>
          <span class="axi-card__title">
            <span class="axi-card__name">AxiBridge</span>
            <span class="axi-card__kind">Log uploader</span>
          </span>
        </div>
        <p>Uploads arcdps logs, summarizes WvW fights, and posts readable reports to Discord.</p>
        <div class="axi-row" style="--axi-row-gap: 6px">
          <span class="axi-chip axi-chip--warn">Beta</span>
          <span class="axi-chip axi-chip--meta">arcdps</span>
        </div>
        <div class="axi-card__meta">Node <span class="axi-card__go">Docs &rarr;</span></div>
      </a>

      <a class="axi-card" href="#">
        <div class="axi-card__head">
          <span class="axi-card__glyph">LG</span>
          <span class="axi-card__title">
            <span class="axi-card__name">axilog</span>
            <span class="axi-card__kind">No strip</span>
          </span>
        </div>
        <p>A card with nothing to encode in a strip gets none. A coloured strip must mean something.</p>
        <div class="axi-card__meta">Rust <span class="axi-card__go">Docs &rarr;</span></div>
      </a>
    </div>

    <div class="g-demo" style="margin-top: 20px">
      <button class="axi-btn" type="button" id="open-drawer">Open the drawer</button>
    </div>

    <blockquote class="axi-quote">
      <p>Third-party programs are used at your own risk — ArenaNet tolerates addons rather than endorsing them.</p>
      <cite>GW2 Addon Risk Guide</cite>
    </blockquote>
  </section>

  <section class="g-section" id="prose">
    <h2>Prose</h2>
    <p>One class on the container; nothing inside carries a class.</p>
    <div class="axi-panel" style="padding: 26px">
      <div class="axi-prose axi-page axi-page--narrow" style="padding-inline: 0">
        <h1>Installing the suite</h1>
        <p>The fastest way to get every app is <a href="#">AxiOM</a>, which installs and updates the rest for you. If you would rather install one app on its own, each has a standalone release.</p>
        <h2>Requirements</h2>
        <p>The desktop apps run on <strong>Windows and Linux</strong>. Combat analysis additionally needs <code>arcdps</code> installed and loading correctly.</p>
        <ul>
          <li>A Guild Wars 2 installation</li>
          <li>An API key with the <code>account</code> and <code>guilds</code> scopes</li>
          <li>Roughly 400&nbsp;MB of disk for the full suite</li>
        </ul>
        <h3>Verifying the install</h3>
        <pre><code>axilog --version
axilog parse ./logs/20260920-wvw.zevtc --summary</code></pre>
        <blockquote><p>If the parser reports zero agents, arcdps wrote the log but the fight never started.</p></blockquote>
        <h2>Support matrix</h2>
        <table>
          <thead><tr><th>App</th><th>Windows</th><th>Linux</th></tr></thead>
          <tbody>
            <tr><td>AxiOM</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>AxiPulse</td><td>Yes</td><td>Yes</td></tr>
            <tr><td>AxiStream</td><td>Yes</td><td>NVENC only</td></tr>
          </tbody>
        </table>
        <h4>Next steps</h4>
        <p>Continue to <a href="#">your first fight report</a>.</p>
      </div>
    </div>
  </section>

</main>

<div class="axi-scrim" id="scrim" hidden></div>
<aside class="axi-drawer" id="drawer" hidden aria-label="Example detail">
  <div class="axi-drawer__head">
    <button class="axi-drawer__close" id="close-drawer" type="button" aria-label="Close">&times;</button>
    <h2>AxiBridge</h2>
    <p style="margin: 10px 0 0; font: var(--axi-t-small); color: var(--axi-text-dim)">The drawer is the detail surface: one thing, in depth, without losing the list behind it.</p>
    <div class="axi-row" style="--axi-row-gap: 7px; margin-top: 13px">
      <span class="axi-chip axi-chip--warn">Beta</span>
      <span class="axi-chip">Node</span>
      <span class="axi-chip axi-chip--meta">arcdps</span>
    </div>
  </div>
  <div class="axi-drawer__body">
    <p class="axi-eyebrow">What it does</p>
    <div class="axi-prose">
      <p>Watches the arcdps log directory, uploads each new encounter, and posts a summary to a Discord webhook.</p>
      <ul><li>Automatic upload on file close</li><li>Per-squad routing</li><li>Retry with backoff</li></ul>
    </div>
  </div>
</aside>

<script type="module" src="gallery.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `gallery.js`**

```js
// Gallery behaviour only - the design language ships no JavaScript.
// Every interactive component in the system (the menu disclosure, the drawer)
// is CSS plus a `hidden` attribute and an aria state; this file is the minimum
// needed to toggle those so the gallery can show both states, and it doubles
// as the reference for what a consumer has to wire up themselves.

const accent = document.getElementById('accent')
accent.addEventListener('change', () => {
  document.documentElement.style.setProperty('--axi-accent', accent.value)
})

const trigger = document.getElementById('menu-trigger')
const pop = document.getElementById('menu-pop')
trigger.addEventListener('click', () => {
  const open = trigger.getAttribute('aria-expanded') === 'true'
  trigger.setAttribute('aria-expanded', String(!open))
  pop.hidden = open
})

const drawer = document.getElementById('drawer')
const scrim = document.getElementById('scrim')
const setDrawer = (open) => {
  drawer.hidden = !open
  scrim.hidden = !open
  if (open) document.getElementById('close-drawer').focus()
}
document.getElementById('open-drawer').addEventListener('click', () => setDrawer(true))
document.getElementById('close-drawer').addEventListener('click', () => setDrawer(false))
scrim.addEventListener('click', () => setDrawer(false))
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !drawer.hidden) setDrawer(false)
})
```

- [ ] **Step 3: Open the gallery and check it visually**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design && python3 -m http.server 8137
```

Open `http://localhost:8137/`. Verify, in order:

1. Every section renders — no unstyled blocks.
2. Changing the accent select moves the sigil, primary button, pressed pill,
   current tab, chip accent, notice icon, quote rule, prose links and prose
   bullets. **Anything that does not move has hard-coded a colour.**
3. Hovering a button, pill, select, card or drawer close button lifts it
   up-left with a deeper block. Nothing fades or glows.
4. The menu trigger opens and closes the popover.
5. The drawer opens, the scrim covers the page, Escape and scrim-click close it.
6. Narrow the window below 640px: the grid becomes one column, the tabs scroll,
   the offset blocks shrink.

Stop the server with Ctrl-C when done.

- [ ] **Step 4: Commit**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git add -A
git commit -F - <<'EOF'
feat(gallery): render every component on one page with a live accent switch

The accent switcher is the test, not a convenience. The system's central claim
is that an app sets one variable and is themed; a component that hard-codes a
colour still looks fine in isolation and only gives itself away when the
accent moves and it does not. The contract test catches literal hex, this
catches the subtler version.

The gallery's own chrome stays inline in the page so it cannot quietly become
an unversioned seventh source file.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Rules document, release workflow, and the v1 tag

Writes the document that makes this a language rather than a stylesheet, wires
the append-only release, and publishes `v1`.

**Files:**
- Create: `docs/RULES.md`
- Create: `README.md`
- Create: `.github/workflows/pages.yml`
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: `dist/axi.css` (Tasks 1–6), `index.html` + `gallery.js` (Task 7)
- Produces: `https://darkharasho.github.io/axi-design/v1/axi.css` — the URL
  every consumer links. The axi.wiki plan and the GW2 retrofit plan both
  depend on this exact path.

- [ ] **Step 1: Write `docs/RULES.md`**

````markdown
# The axi design language

Flat and outlined. Every fill is a saturated ink at full strength, every raised
element is drawn with a near-black outline and a hard offset block instead of a
blur.

These are the rules. A component that cannot be justified by one of them either
needs a new rule written for it, or does not belong in the system.

## 1. No gradients on surfaces

Flat fills only. The single exception in the codebase is the select caret,
which uses two `linear-gradient`s to draw a triangle — a shape, not a surface.

## 2. No colour at partial opacity over the ground

If a colour is present it is at full strength. A muted gold over near-black is
just brown, and five muted inks over near-black are five browns. When something
should be quieter, reach for a neutral from the ramp — that is what the ramp is
for.

## 3. Every raised element is outlined and blocked

An `--axi-ink-line` border plus a hard offset shadow, never a blur.

Two weight steps, and only two:

| Step | Border | Offset |
|---|---|---|
| Panel | `--axi-border-panel` (4px) | `--axi-offset-panel` (6px) |
| Control | `--axi-border-control` (3px) | `--axi-offset-control` (3px) |

A third step is how a system stops looking like one system. This is enforced by
`tests/tokens.test.mjs`.

## 4. Hover lifts

`translate(-3px, -3px)` and a deeper block. Nothing in this language fades,
glows or pulses. The movement reads in peripheral vision and costs no colour.

## 5. Filled means status, outlined means annotation

A filled chip asserts a value about the thing. An outlined chip in the cool ink
is commentary *about* the thing — a maintainer's judgment, a source, a caveat.
A reader must be able to tell which they are looking at before reading either.

The same rule governs coloured strips on cards: a strip must encode real data.
A strip that carries "category" is decoration impersonating data, and it takes
the first position the eye lands on.

## 6. One cool ink is reserved for meta

`--axi-meta` marks metadata and annotation, and may never carry a status
meaning. It is the only ink guaranteed not to mean "how bad is this" — which is
what makes it readable as commentary at a glance.

## 7. The diamond is the family motif

A 45°-rotated outlined square. Bullet, status dot, language marker, and scaled
up behind a glyph, the brand sigil.

## Tokens

Three layers, in `src/tokens.css` — the only file permitted to contain a colour
literal.

- **Surface & text** — `--axi-ground`, `--axi-surface`, `--axi-surface-raised`,
  `--axi-ink-line`, `--axi-rule`, `--axi-text`, `--axi-text-dim`,
  `--axi-text-faint`, `--axi-scrim`
- **Accent & status** — `--axi-accent`, `--axi-accent-ink`, `--axi-meta`,
  `--axi-ok`, `--axi-warn`, `--axi-danger`. **This is the per-app override
  surface.** An app that sets `--axi-accent` and nothing else is correctly
  themed.
- **Form** — outline and offset steps, radii, measures (`--axi-page`,
  `--axi-page-narrow`, `--axi-page-wide`, `--axi-gutter`) and the type scale.
  Overriding these means leaving the language, not theming it.

### Theming an app

```css
:root { --axi-accent: #b06bff; }
```

If an app picks an accent dark enough that near-black text on it fails
contrast, it also sets `--axi-accent-ink: var(--axi-text)`. It should not edit
components.

## Light mode

Not shipped. The system is *structured* for it: no component contains a colour
literal, so a light theme is a second palette block, not a rewrite. It is not
a token swap either — the saturated inks that read as vivid on near-black go
washed out on white and would need retuning.

## Adding a component

1. Which rule justifies it? If none, write the rule first or stop.
2. Build it from the existing primitives. A shell that redefines `.axi-panel`
   instead of using it will drift the first time the panel changes.
3. No colour literals. No third form step.
4. Add it to the gallery, and check it with the accent switcher — if it does
   not follow the accent, it hard-coded something.
5. `npm run build` and commit `dist/axi.css` with your source change.
````

- [ ] **Step 2: Write `README.md`**

````markdown
# axi-design

The design language for the [axi suite](https://axi.wiki) — flat and outlined,
dark, drawn in saturated ink.

One CSS file. No build step for consumers, no dependencies, no JavaScript.

## Use it

```html
<link rel="stylesheet" href="https://darkharasho.github.io/axi-design/v1/axi.css">
```

Then set your accent:

```css
:root { --axi-accent: #b06bff; }
```

That is the whole theming surface. See [the pattern
gallery](https://darkharasho.github.io/axi-design/) for every component, with a
live accent switcher.

## Versioning

Published under `v<major>/`, and **`v1/` is append-only** — it will keep
serving for as long as the Pages site exists. Non-breaking fixes republish
`v1/axi.css` in place; anything that would break a consumer goes to `v2/`. No
consumer should ever wake up to a changed class name.

## Develop

```bash
npm install
npm run build          # src/*.css -> dist/axi.css
npx vitest run --maxWorkers=2
python3 -m http.server # then open the gallery at /
```

`dist/axi.css` is committed, because the release workflow publishes that exact
file. A test asserts it matches its sources, so a source edit that skips the
rebuild fails rather than shipping stale CSS.

The rules the system is built on are in [docs/RULES.md](docs/RULES.md). Read
them before adding a component.
````

- [ ] **Step 3: Write `.github/workflows/test.yml`**

```yaml
name: Test
on:
  push: { branches: [main] }
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      # Catches the stale-artifact case in CI too: if dist/ was not rebuilt,
      # the build test fails here before anything can be tagged and published.
      - run: npx vitest run --maxWorkers=2
```

- [ ] **Step 4: Write `.github/workflows/pages.yml`**

```yaml
name: Deploy Pages
on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npx vitest run --maxWorkers=2

      # Every published major version is rebuilt from its own tag on every
      # deploy, rather than carried forward from whatever the last deploy
      # happened to upload. GitHub Pages replaces the whole site each time, so
      # a version that is not re-staged here silently disappears - and the
      # promise that v1/ keeps serving forever is the one thing consumers are
      # relying on.
      - name: Stage the gallery and every published version
        run: |
          mkdir -p _site
          cp -r index.html gallery.js dist _site/
          for tag in $(git tag -l 'v*' | sort -V); do
            major="${tag%%.*}"
            mkdir -p "_site/$major"
            git show "$tag:dist/axi.css" > "_site/$major/axi.css"
            echo "staged $tag -> /$major/axi.css"
          done
          ls -R _site

      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: _site }
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 5: Commit the docs and workflows**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git add -A
git commit -F - <<'EOF'
docs: state the rules, and publish versions from their own tags

The rules document is what makes this a language rather than a stylesheet
someone copied: it is the thing that answers, a year from now in another repo,
whether a new component belongs.

The deploy rebuilds every published major from its own tag on each run. Pages
replaces the whole site every time, so a version not re-staged here quietly
vanishes - and "v1/ keeps serving forever" is the one promise consumers are
actually relying on.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Confirm with the user before creating the remote**

This is the one outward-facing, hard-to-reverse step in the plan. **Stop and
ask the user to confirm** before running Step 7 — creating a public GitHub repo
publishes this work under their account.

Ask: *"Ready to create `darkharasho/axi-design` as a public repo and push? This
is the first public step."* Wait for an explicit yes. If they want it private
initially, substitute `--private` in the next step; Pages on a private repo
requires a paid plan, so flag that trade-off if they choose it.

- [ ] **Step 7: Create the remote and push**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
gh repo create darkharasho/axi-design --public --source=. --remote=origin \
  --description="The axi suite's design language - flat and outlined, one CSS file."
git push -u origin main
```

- [ ] **Step 8: Enable Pages with the Actions source**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
gh api -X POST repos/darkharasho/axi-design/pages \
  -f 'build_type=workflow' 2>/dev/null \
  || gh api -X PUT repos/darkharasho/axi-design/pages -f 'build_type=workflow'
```

Then confirm the first deploy succeeded. Use the CI watcher rather than
pasting a run URL:

`sai_watch_github_run` with owner `darkharasho`, repo `axi-design`, branch
`main`, workflow `pages.yml`.

- [ ] **Step 9: Tag v1 and verify the published artifact**

```bash
cd /var/home/mstephens/Documents/GitHub/axi-design
git tag -a v1.0.0 -m "v1.0.0 - first published axi design language"
git push origin v1.0.0
```

Watch the tag-triggered deploy with `sai_watch_github_run` (owner
`darkharasho`, repo `axi-design`, workflow `pages.yml`). When it completes:

```bash
curl -sfI https://darkharasho.github.io/axi-design/v1/axi.css | head -1
curl -sf https://darkharasho.github.io/axi-design/v1/axi.css | head -3
```

Expected: `HTTP/2 200`, and the banner comment from `scripts/build.mjs`.

Also open `https://darkharasho.github.io/axi-design/` and confirm the gallery
renders and the accent switcher works against the deployed CSS.

- [ ] **Step 10: Report the consumer URL**

Stage 1 is done when `https://darkharasho.github.io/axi-design/v1/axi.css`
returns 200. That URL is the interface the axi.wiki plan and the GW2 retrofit
plan are both written against; do not proceed to stage 2 until it resolves.

---

## Self-review

**Spec coverage.** Walked each spec section against the tasks:

- §1 rules → Task 8 `docs/RULES.md`; enforced in Task 2
- §1 token layers → Task 1 `src/tokens.css` (the spec's "ramp" is renamed
  "surface & text" here, since the ramp names were already semantic — this is
  the correction recorded in the spec's §1)
- §1 type scale → Task 1, all nine tokens with their paired tracking tokens
- §2 base / primitives / layout / shells / prose → Tasks 2, 3, 4, 5, 6
  respectively; every named class accounted for
- §4 repo structure, build, gallery, versioned publish → Tasks 1, 7, 8
- §4 append-only `v1/` → Task 8's workflow rebuilds every major from its tag
- §5 token contract test → Task 2; build test → Task 1; gallery visual check →
  Task 7 Step 3 and Task 8 Step 9
- §5 `--maxWorkers=2` → every test invocation in the plan
- §6 stage 1 → this plan in full. Stages 2–4 are explicitly out of scope and
  get their own plans.

**Gaps found and closed.** The spec's §5 lists a build test but the reason it
matters (nothing imports `dist/`, so staleness is otherwise invisible) only
existed in my head — written into Task 1's test comment and the README. The
spec did not say how multiple published majors survive a Pages redeploy, which
is a real hole in "append-only": closed in Task 8's workflow by rebuilding
every major from its own tag.

**Placeholder scan.** No TBDs. Every code step carries the actual content.
The one conditional in the plan (Task 6 Step 3, the `2px` hairline borders) is
written with a specific resolution rather than left to judgment.

**Type consistency.** Class names cross-checked between the Interfaces blocks
and the CSS: `.axi-menu__pop` (not `.axi-menupop`) is used consistently in
Tasks 5 and 7; `.axi-card__name` / `.axi-card__kind` match between Task 5's CSS
and Task 7's markup; `--axi-pill-fill`, `--axi-card-strip`, `--axi-grid-min`,
`--axi-row-gap`, `--axi-stack-gap`, `--axi-menu-width` and
`--axi-drawer-width` are each defined with a fallback in the component and
used with that exact name in the gallery. `ORDER` and `buildCss()` keep the
same signature from Task 1 through Task 8.
