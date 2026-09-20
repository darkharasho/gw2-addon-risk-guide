# Conduct Assessment Layer — Design

**Date:** 2026-09-20
**Status:** Approved for planning

## Problem

The catalog's risk score answers one question: *how is this built?* Every
signal is mechanical — `injection` fires on an addon-loader string,
`unsigned_binaries` on a release asset, `obscure` on a star count. The score
never asks what the tool does to play.

That gap is visible in the data. Boon-Table, GW2TacO, TaimiHUD and rezzOrder
all score 30–35 and all land in `moderate`. The scorer cannot separate "shows
boon uptime" from "tells you whose turn it is to rez", because from a
mechanism standpoint they are the same program: a C++ addon that hooks the
client and draws ImGui.

ArenaNet's User Agreement forbids programs that confer "an unintended,
unnatural, or unfair advantage" and alter game balance. That clause is about
effect on play, not about DLL loading — yet in `data/policies.json` it is
currently wired to `injection` and `multibox`, i.e. the advantage clause is
being used to justify mechanism findings. Nothing in the site evaluates the
thing the clause actually describes.

## Goal

Add a second, independent assessment axis expressing the maintainer's
judgment about what an addon does to gameplay, rendered alongside the
mechanical score without altering it.

## Non-goals

- Changing points, bands, signals, or the scorer in any way
- Re-wiring `ua-third-party-programs` away from `injection`/`multibox`
  (real, pre-existing, tracked as follow-up)
- Fetching or storing README content
- Claiming to state ArenaNet's position
- Full coverage of the catalog

## Decisions

### The score stays mechanical

The conduct verdict is a separate axis, not a points modifier and not a band
override. A repo reads as "moderate risk · directive".

Rationale: every mechanical signal cites the match that produced it, so the
number is falsifiable by anyone. Folding judgment into the same points would
make it impossible to tell whether 65 meant "hooks the client hard" or "the
maintainer thinks this crosses a line".

### Two axes, not one

`conduct` — who makes the decision. The pivot is **show info vs prompt
action**.

| value | meaning | example |
|---|---|---|
| `none` | no bearing on play decisions | wikis, API libraries, bank managers |
| `assistive` | shows in-game information, faster and clearer | arcdps, boon tables |
| `directive` | tells you what to do or when | rezzOrder, rotation prompts |
| `substitutive` | acts for you | bots, input automation |

`advantage` — how much edge it hands you that fair play would not:
`none` → `some` → `strong`. Deliberately a severity grade, not a taxonomy of
mechanisms; the *kind* of advantage is described in prose, so the schema does
not have to anticipate every case.

Rationale for two axes: they are independent, and one ordinal cannot carry
both. rezzOrder is `directive` with little information advantage — squad
state is already on screen; it issues an instruction. An enemy cooldown
tracker is the mirror: purely `assistive`, but decisive, because the client
never displays that information. A single ladder would have to lie about one
of them.

`directive` is where the line sits. `directive` and `substitutive` are always
contentious; `assistive` and `none` are contentious only when `advantage` is
non-`none`. That keeps `assistive` + `advantage: none` — a DPS meter — benign
and unrendered, which is the deliberately ArenaNet-tolerated case.

### Verdicts must quote the repo's own words

Every contentious entry carries `evidence`: a verbatim string
from that repo's catalog `description` or one of its `topics`.

Rationale: this is published opinion about a named person's project. The
mechanical score is defensible because each signal cites its match. A
judgment has no such anchor unless the schema forces one. Requiring the
author's own description as evidence means a `directive` call is reading a
tool's purpose back to it rather than inferring intent — and it is
mechanically checkable, so a test can enforce it.

The catalog stores no README, only `description`, `topics`, `name`,
`language` and signals. Evidence is therefore restricted to description and
topics rather than adding README scraping. Useful side effect: if a repo's
own description does not say enough to justify a verdict, that verdict does
not get published.

### Coverage is triaged, and absence is meaningful

Assess repos carrying the `injection` signal (~151 of 671), plus any repo
hand-added to the file. Unassessed repos render nothing — no badge, no empty
state.

Rationale: 671 verdicts is not sustainable against a scraper that keeps
adding repos, and the remaining ~520 are overwhelmingly API tools, wikis and
libraries that cannot direct anything. A stated rule — "we assess the tools
that can reach into the client" — is what keeps this from reading as a
shitlist, which assess-on-demand would. The hand-add escape hatch covers the
known gap: directive or perception-enhancing tools that do not inject
(ReShade-family presets, second-screen apps) are invisible to the triage rule
and must be pulled in deliberately. The first pass is therefore not purely
"walk the 151".

## Data format

`data/conduct.json`, hand-authored and committed. The scraper never writes it.

```json
{
  "_comment": "Maintainer's judgment, not ArenaNet's. Each entry needs a verbatim quote from the repo's own description or topics as evidence.",
  "assessments": {
    "qq1ng/rezzOrder": {
      "conduct": "directive",
      "advantage": "some",
      "rationale": "Reads squad state and tells the player when to act, rather than showing state and leaving the decision to them.",
      "evidence": "shows whose turn it is to rez",
      "policy": "ua-third-party-programs",
      "assessed_at": "2026-09-20"
    }
  }
}
```

Keys are matched case-insensitively. Discovery lowercases `full_name` while
the catalog preserves GitHub's casing (`qq1ng/rezzOrder`), so exact-match
keying would let a verdict silently detach from its repo.

`assessed_at` exists because tools change. A verdict older than the repo's
last push may be describing software that no longer exists, and the UI can
say so rather than presenting it as current.

## Build integration

`scripts/build-catalog.mjs` merges `conduct.json` into each catalog entry as
an additive `conduct` block. The merge:

- never reads or writes `points`, `band`, or `signals`
- is not covered by `scorerFingerprint()` (which hashes `signals.mjs` and
  `score.mjs` only), so adding a verdict costs no re-enrichment and no API
  calls
- drops nothing: a key with no matching repo is a test failure, not a silent
  skip

## Testing

Enforcement lives in tests, not discipline.

1. Every entry non-`none` on either axis has an `evidence` string appearing
   verbatim in that repo's catalog `description` or `topics`.
2. Every `policy` id exists in `data/policies.json`.
3. Every key resolves to a catalog repo, case-insensitively.
4. `conduct` and `advantage` values are within their enums; `rationale` and
   `assessed_at` are present and non-empty.
5. Merging leaves `points`, `band` and `signals` byte-identical for every
   repo.

Test 1 is the load-bearing one: it fails the build rather than letting an
unsourced opinion ship. Test 3 prevents the file rotting into verdicts about
repos that have been removed or gone private.

Vitest runs with `--maxWorkers=2` per the repo's standing limit.

## UI

**Card:** a small outlined badge, visually distinct from the filled band
chip so it reads as annotation rather than score. Text is `directive` or
`advantage`, whichever axis fired; when both fire, the more serious. Absent
for benign verdicts (see contentiousness rule above) and for unassessed
repos, so the badge's presence is itself the signal.

**Drawer:** a block headed *Maintainer's assessment* containing both axes,
the rationale, the quoted evidence attributed to the repo's own description,
the policy clause, the assessed date, an explicit note that this is the
maintainer's judgment and that ArenaNet has not ruled on this class of tool,
and a prefilled issue link for an author who wants to contest it.

**No new filter pill.** The toolbar already wraps at five controls, and with
most assessed repos resolving to benign a conduct filter would mostly return
empty. Revisit once the data justifies it.

Accepted cost: a badge on someone's card is the most visible thing this layer
does and will be read as a mark against them regardless of the drawer's
wording. Outlined styling and absent-by-default are mitigation, not a fix.

## Follow-up

- `ua-third-party-programs` is wired to `injection` and `multibox` in
  `data/policies.json`. Its quote is about unfair advantage and game balance,
  which describes this layer, not those signals. Re-wiring is deferred so the
  scorer is not changed mid-design.
- No policy clause records ArenaNet's explicit tolerance of DPS meters and
  arcdps. That tolerance is the anchor establishing `assistive` as a
  known-tolerated tier and `directive` as the first contentious one; it
  should be sourced and added.
