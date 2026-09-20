# axi design language — design

**Date:** 2026-09-20
**Status:** approved, ready for implementation planning

## Summary

Extract the visual style of the GW2 Addon Risk Guide into a reusable design
language, `axi-design`, published as a single versioned CSS file. Build
axi.wiki — the hub for the axi suite of Guild Wars 2 tools — as its first
consumer, then retrofit the GW2 site onto it as the conformance test.

The style already exists and is liked; the work is codifying it into rules,
generalizing it out of GW2-catalog assumptions, and proving it on a page with
a different content shape.

## Goals

- A written rules document that makes the language checkable, not just copyable
- One CSS file, pulled by URL, that any axi property can adopt in one `<link>`
- Per-app accent colour via a single custom property, with family resemblance
  carried by structure rather than hue
- An axi.wiki landing page that is complete on its own and has the information
  architecture for wiki content to grow into
- The GW2 site running on the shared file, its stylesheet reduced to what is
  genuinely GW2-specific

## Non-goals

- Adopting the system in the other axi apps (AxiRoster, AxiPulse, …). Several
  are React + Tailwind, a different integration problem, deliberately deferred.
- Light mode. Structured for, not shipped.
- Wiki *content* — authoring workflow, search implementation, navigation depth.
  The article shell is in scope; filling it is a later project.
- A component JS layer. CSS only.

## Decisions taken

| Question | Decision |
|---|---|
| Delivery | Own repo, one CSS file consumers pull by URL |
| Accent strategy | Shared skeleton, per-app accent (`--axi-accent`) |
| Coverage | Tokens + primitives + layout + shells |
| Naming | Namespaced classes (`.axi-card`, `.axi-pill`) |
| Light mode | Dark now, semantic tokens so light stays possible |
| axi.wiki scope | Landing page now, article shell laid out for later |
| Versioning | Append-only versioned paths on GitHub Pages |
| axi.wiki accent | Violet `#b06bff`, not GW2 gold |

## 1. The language

### Rules

1. **No gradients on surfaces.** Flat fills only.
2. **No colour at partial opacity over the ground.** If a colour is present it
   is at full strength; if it should be quieter, use a neutral from the ramp.
3. **Every raised element is outlined and blocked.** An `--axi-ink-line` border
   plus a hard offset shadow, never a blur. Two weight steps: *panel* (4px
   border / 6px offset) and *control* (3px / 3px).
4. **Hover lifts.** `translate(-3px, -3px)` and a deeper block. Nothing fades
   or glows.
5. **Filled means status, outlined means annotation.** A filled chip asserts a
   value; an outlined chip in the cool ink is commentary.
6. **One cool ink is reserved for meta** (`--axi-meta`) and never carries a
   status meaning.
7. **The diamond is the family motif** — a 45°-rotated outlined square, used
   for dots, markers and the brand sigil.

### Token layers

**Ramp** (raw values):
`--axi-ground`, `--axi-surface`, `--axi-surface-raised`, `--axi-ink-line`,
`--axi-rule`, `--axi-text`, `--axi-text-dim`, `--axi-text-faint`

**Semantic** (the per-app override surface):
`--axi-accent`, `--axi-meta`, `--axi-ok`, `--axi-warn`, `--axi-danger`

**Form:**
`--axi-border-panel`, `--axi-offset-panel`, `--axi-border-control`,
`--axi-offset-control`, `--axi-radius`, `--axi-sans`, `--axi-mono`, plus the
type scale below.

**Type scale** — derived from the sizes already in use, named rather than
invented:

| Token | Size / weight | Used for |
|---|---|---|
| `--axi-t-display` | 54px / 900, `-.045em` | Hero headline |
| `--axi-t-h1` | 30px / 900, `-.035em` | Page title |
| `--axi-t-h2` | 24px / 900, `-.035em` | Section head, drawer title |
| `--axi-t-h3` | 19px / 900, `-.025em` | Card title, clause head |
| `--axi-t-body` | 15px / 400, 1.55 | Body copy |
| `--axi-t-small` | 13.5px / 400, 1.5 | Descriptions, notice text |
| `--axi-t-label` | 13px / 800, uppercase `.02em` | Controls, pills |
| `--axi-t-micro` | 11px / 800, uppercase `.04em` | Chips, meta strips |
| `--axi-t-eyebrow` | 11.5px / 900, uppercase `.1em` | Panel headings |

Default values carry over from the GW2 stylesheet: ground `#15181d`, surface
`#222731`, raised `#2b313d`, ink-line `#0c0e12`, rule `#3a4250`, text
`#f4f6f9` / `#a7b0be` / `#7c8695`, meta `#4ec3ff`, ok `#2fd38a`, warn
`#ff7a2f`, danger `#ff5252`, accent `#ffc53d` (overridable).

**No component file may contain a raw colour literal.** Every colour resolves
through a token, so a future light theme is a palette swap rather than a
rewrite. Enforced by test (see §5). Values that are not colours in the
themeable sense — `transparent`, `currentColor` — are exempt; anything else
that wants a colour gets a token, including the drawer scrim
(`--axi-scrim`).

## 2. `axi.css` contents

**Base** — reset, `color-scheme`, body type, link, focus ring, `.axi-sr-only`.

**Primitives** — `.axi-btn` (`--ghost`, `--dashed`, `--primary`), `.axi-pill`
(pressed state fills with its own colour), `.axi-chip` (`--ok`, `--warn`,
`--danger` filled; `--meta` outlined), `.axi-panel`, `.axi-input`,
`.axi-select` (self-drawn caret plus the `@supports (appearance: base-select)`
popup styling, lifted intact), `.axi-badge-count`, `.axi-diamond`.

**Layout** — `.axi-page` (with `--narrow` at ~46rem for prose and `--wide` at
1660px for dense grids), `.axi-grid` (auto-fill, per-instance min column width
via a custom property), `.axi-stack`, `.axi-row`.

**Shells** — `.axi-mast` (sticky masthead, brand + sigil, tabs with filled
current-page state), `.axi-notice`, `.axi-toolbar`, `.axi-menu` /
`.axi-menupop`, `.axi-drawer` + `.axi-scrim`, `.axi-card` (optional top accent
strip), `.axi-quote`.

**Prose** — `.axi-prose`: headings, lists, tables, inline code, code blocks,
blockquote. The one genuinely new area; axi.wiki's article shell needs it.

**Not included** (stays GW2-local): risk-band colours, conduct/verdict badges,
score chips, signal weight chips.

## 3. axi.wiki

**Navigation:** Home · Apps · Guides · Reference, plus search. Routes:
`/apps/<name>`, `/guides/<slug>`, rendered into `.axi-prose` inside
`.axi-page--narrow`.

**Homepage sections**, in order: hero (one-line pitch, two CTAs) → "suite at a
glance" panel → AxiOM start-here notice → app grid → guides/reference split →
footer.

**Accent:** violet `#b06bff`. The suite is not ArenaNet's brand, and this
demonstrates that the per-app override is the only difference between this page
and the GW2 site.

**Card top strip carries release maturity** — stable / beta / experimental —
not category. A coloured strip must mean data (rule 5); category colouring
would be decoration impersonating meaning.

**Cross-link:** the reference panel quotes and links the GW2 Addon Risk Guide,
making it a sibling in the family rather than an outlier.

**Data:** apps live in `data/apps.json`; the homepage grid and the `/apps/*`
pages both render from it, so adding an app is a data edit.

**Build:** static, no framework, plus a small step rendering guide markdown
into the article shell — matching how the GW2 site is built.

## 4. Repos and release

### `axi-design`

- `src/` → `tokens.css`, `base.css`, `primitives.css`, `layout.css`,
  `shells.css`, `prose.css`; a build script concatenates in that order to
  `dist/axi.css`.
- `docs/RULES.md` — the seven rules and the token contract.
- **Pattern gallery** at the repo's Pages root: every component on one page,
  accent switchable live. Serves as the visual regression check.
- Published to `https://darkharasho.github.io/axi-design/v<major>/axi.css`.
  A release workflow copies `dist/axi.css` to `v<major>/` on tag push.
- **`v1/` is append-only.** Breaking changes go to `v2/`; `v1/` keeps serving
  indefinitely. Non-breaking fixes republish `v1/` in place.

### `axi-wiki`

- Static site, GitHub Pages, `CNAME` → `axi.wiki` (domain already owned).
- Links `axi.css` from the versioned URL; a short local stylesheet sets
  `--axi-accent` and anything wiki-specific.

**Accepted risk:** a cross-origin CSS dependency means axi.wiki renders
unstyled if `axi-design`'s Pages site is down. Both are GitHub Pages and fail
together, so the added exposure is small. Revisit by vendoring via CI if it
ever bites.

## 5. Testing

- **Token contract test:** every `--axi-*` token referenced by a component is
  defined in `tokens.css`, and no component file contains a raw colour literal
  (hex, `rgb()`, `hsl()`). Enforces the rule from §1.
- **Build test:** `dist/axi.css` is byte-identical to the concatenation of
  `src/` in the declared order (catches a stale committed artifact).
- **Pattern gallery** as the human visual check before any release tag.
- **GW2 site:** its existing vitest suite must stay green through the retrofit.
- Vitest run with `--maxWorkers=2` per the machine's global instruction.

## 6. Sequencing

1. Write `docs/RULES.md` in `axi-design`.
2. Extract `src/` from the GW2 stylesheet, filtered by the rules — anything not
   justified by a stated rule either earns a rule or is left behind as
   GW2-specific. Build the pattern gallery. Tag `v1`.
3. Build axi.wiki on `v1/axi.css`. This is the real test: a hero, prose and an
   app grid expose GW2-catalog assumptions that a retrofit never would.
4. Retrofit `gw2-addon-risk-guide`: local stylesheet reduced to accent, band
   colours and GW2-specific components; markup renamed to the `axi-`
   namespace across `index.html`, `policy.html`, `render.js`, `app.js`;
   `--page: 1660px` becomes `.axi-page--wide`.

Each stage is independently useful. If work stops after stage 3 there is still
a design system and a homepage.

**Retrofit watch-point:** the band-coloured pill/card/score behaviour is
GW2-specific *data* styling built on shared *form*. If expressing it locally
turns awkward, that indicates a missing primitive — the fix belongs in
`axi-design`, not in a local workaround.
