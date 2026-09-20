import { readFileSync, writeFileSync } from 'node:fs'
import { discover as realDiscover } from './discover.mjs'
import { enrich as realEnrich } from './enrich.mjs'
import { score as realScore, BANDS } from './score.mjs'
import { SIGNALS } from './signals.mjs'

export async function buildCatalog({
  discover = realDiscover, enrich = realEnrich, score = realScore,
  now = new Date(), overrides = {}, token,
} = {}) {
  const names = await discover({ token })
  const repos = []
  for (const name of names) {
    const facts = await enrich(name, { token })
    if (!facts) continue
    const s = score(facts, { now, override: overrides[name.toLowerCase()] ?? null })
    repos.push({
      full_name: facts.full_name, name: facts.name, owner: facts.owner,
      html_url: facts.html_url, description: facts.description, topics: facts.topics,
      language: facts.language, stars: facts.stars, archived: facts.archived,
      pushed_at: facts.pushed_at, license: facts.license,
      points: s.points, band: s.band, signals: s.signals, override: s.override,
    })
  }
  repos.sort((a, b) => b.points - a.points || a.full_name.localeCompare(b.full_name))
  return { bands: BANDS, generated_at: now.toISOString(), repos, signal_definitions: SIGNALS }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const overrides = JSON.parse(readFileSync('data/overrides.json', 'utf8')).overrides ?? {}
  const catalog = await buildCatalog({ token: process.env.GITHUB_TOKEN, overrides })
  writeFileSync('data/catalog.json', JSON.stringify(catalog, null, 2) + '\n')
  console.log(`wrote ${catalog.repos.length} repos to data/catalog.json`)
}
