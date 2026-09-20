# gw2-addon-risk-guide

A static GitHub Pages site that helps Guild Wars 2 players understand which third-party addons are tolerated and what risks come with running them. One half is a curated, sourced collection of ArenaNet/NCSoft policy statements on third-party programs; the other half is a catalog of GW2-related GitHub repos gathered by a scheduled scraper and automatically risk-scored from observable signals. A searchable, filterable UI sits over both, so a player can look up an addon and see its score, the reasoning behind it, and the policy text it bumps against.

This site reports risk information, not endorsement. ArenaNet tolerates third-party programs; it does not approve them.

## Disclaimer

> ArenaNet does not approve or endorse third-party programs. This site reports observable risk signals from public repository data; a low score is not permission, and nothing here is legal advice. Running any third-party program is at your own risk and may put your account at risk.

## How scoring works

Every catalog entry is scored automatically from public repository signals — no hand-curated allowlist. Each signal carries a weight and maps to a policy clause quoted on the Policy page. The full signal table (id, label, weight, detection pattern, and the policy clause it maps to) lives in [`scripts/signals.mjs`](scripts/signals.mjs). Signals are detected from repo metadata, README text, topics, and release assets (for example: gameplay automation, memory access, packet handling, client injection/hooking, unsigned release binaries, archived status, staleness, missing license, and low popularity). The score breakdown shown for each repo lists exactly which signals fired and why.

## Development

```bash
npm test          # run the test suite (vitest, capped at 2 forks)
npm run catalog   # rebuild data/catalog.json from GitHub (needs a token)
```

`npm run catalog` calls the GitHub REST/Search API to discover and enrich repos, so set a `GITHUB_TOKEN` with at least public read access before running it:

```bash
GITHUB_TOKEN=ghp_xxx npm run catalog

# Cap how many repos a single run re-reads (5 REST calls each):
ENRICH_BUDGET=150 GITHUB_TOKEN=ghp_xxx npm run catalog
```

### Incremental refresh

A full pass enriches every repo at 5 REST calls each — roughly 3,400 calls for
the current catalog. A personal token gets 5,000 REST calls an hour and can
manage that; the workflow's built-in `GITHUB_TOKEN` gets only 1,000 and cannot.
So a run treats the committed `data/catalog.json` as a cache:

- **Discovery is the free tier.** GitHub's search endpoint returns full repo
  objects, so every run learns each repo's current `pushed_at`, stars, archived
  flag and license at no extra cost.
- **Unchanged `pushed_at` means unchanged content**, so the cached README-derived
  signals are reused verbatim — zero calls for that repo.
- **Metadata signals are always recomputed** (`archived`, `stale_12m`,
  `stale_24m`, `no_license`, `obscure`, `popular_maintained`). They depend only
  on fields discovery already handed us, so a repo can age into a staleness band
  or cross a star threshold without being re-read.
- **`ENRICH_BUDGET` caps re-reads per run.** Never-seen-before repos are spent
  on first, then the most recently pushed. Anything beyond the budget keeps
  serving cached content and is picked up by a later run.
- **A scorer change invalidates everything.** The catalog stores a
  `scorer_fingerprint` hashed from `scripts/signals.mjs` and `scripts/score.mjs`;
  if it does not match, no cached signal is trusted. After editing either file,
  regenerate the catalog locally with a personal token so the committed catalog
  carries the new fingerprint — otherwise the next scheduled run starts from a
  cold cache it cannot afford to fill.
- **Repos with a manual override are always re-read**, since their cached signal
  list has already had the override applied.

Each run reports the split, e.g. `discovered 678, reused 671, enriched 7 ≈35
calls, deferred 0, failures 0`.

The site itself has no build step, but `data/` is not a sibling of `site/index.html` in this repo layout, and the pages fetch `data/*.json` with page-relative paths (no `../`). Stage a directory first, then serve that:

```bash
mkdir -p /tmp/site-preview/data
cp -r site/* /tmp/site-preview/
cp data/*.json /tmp/site-preview/data/
python3 -m http.server 8000 --directory /tmp/site-preview
```

Then open `http://localhost:8000/index.html`.

## Proposing an override

Signals are detected automatically; overrides are a thin manual layer for the rare case where a signal is wrong, not a way to mark an addon as risk-free. To propose one, edit `data/overrides.json` and add an entry keyed by the repo's lowercase `owner/name`, with the signal ids to suppress or add, a `reason`, and a `source_url` backing the change. Bands are always derived from signals and are never set by hand. Open a pull request with your change; the scraper picks it up on the next scheduled run.

## CI

- `.github/workflows/refresh-catalog.yml` runs weekly (and on demand via `workflow_dispatch`) to rebuild `data/catalog.json` and commit it to `main` if it changed, guarding against a catastrophically shrunken catalog before committing. It runs with `ENRICH_BUDGET=150` (750 REST calls) to stay inside the workflow token's 1,000-per-hour limit; see [Incremental refresh](#incremental-refresh).
- `.github/workflows/pages.yml` deploys `site/` and `data/` to GitHub Pages on every push to `main`, and also runs automatically when the refresh workflow above completes (a commit made with the default `GITHUB_TOKEN` does not itself trigger `push` events, so this second trigger is what gets the refreshed catalog live). The deploy is skipped if the refresh run failed.
