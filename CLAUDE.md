## Project Context

A static GitHub Pages site that helps Guild Wars 2 players understand which third-party addons are tolerated and what risks come with running them. One half is a curated, sourced collection of ArenaNet/NCSoft policy statements on third-party programs; the other half is a catalog of GW2-related GitHub repos gathered by a scheduled scraper and automatically risk-scored from observable signals. A searchable, filterable UI sits over both, so a player can look up an addon and see its score, the reasoning behind it, and the policy text it bumps against.

## Goals

- Collect and cite ArenaNet/NCSoft statements on third-party programs (EULA, User Agreement, support articles, forum and dev posts) as the policy backbone of the site
- Run a scheduled GitHub Action that searches GitHub for GW2 addon repos (gw2, guild wars 2, arcdps, and related terms) and commits results into the repo as data files
- Automatically risk-score each repo from observable signals: client injection or DLL hooking, gameplay automation and input simulation, memory or packet manipulation, maintenance recency, archived status, license, release artifacts, popularity
- Show each score's breakdown transparently - which signals fired, how they were detected, and which policy clause each maps to
- Provide fast client-side search and filtering over the catalog by name, risk band, signal, and maintenance status
- Frame the whole site as risk information rather than approval, since ArenaNet tolerates addons rather than endorsing them

## Out of scope

- Hand-curated allowlist or manual per-addon triage as the primary mechanism
- Any backend, database, or user accounts
- Acting as an addon installer, updater, or download mirror
- Claiming official ArenaNet endorsement or giving legal advice

## Suggested stack

- **GitHub Pages** — Free static hosting that lives in the same repo as the data and the scraper
- **GitHub Actions (scheduled)** — Runs the scraper and scorer on a cron and commits the refreshed catalog back to the repo
- **GitHub REST/Search API** — Source for repo discovery and for the metadata signals the score is built from
- **Static site with client-side search** — Catalog is small enough to ship as JSON and filter entirely in the browser, keeping the site serverless
