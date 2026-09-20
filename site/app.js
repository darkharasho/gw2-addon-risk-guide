import { indexRepos, filterRepos } from './search.js'
import { repoCard, escapeHtml } from './render.js'

const $ = (id) => document.getElementById(id)

const checkboxes = (host, items) => {
  host.insertAdjacentHTML('beforeend', items.map(({ value, label }) =>
    `<label><input type="checkbox" value="${escapeHtml(value)}"> ${escapeHtml(label)}</label>`).join(''))
}

const checked = (host) => [...host.querySelectorAll('input:checked')].map((i) => i.value)

function renderResults(indexed, total, policies, now) {
  const matches = filterRepos(indexed, {
    query: $('q').value,
    bands: checked($('bands')),
    signals: checked($('signals')),
    maintenance: $('maintenance').value,
  })
  $('count').textContent = `${matches.length} of ${total} repositories`
  $('results').innerHTML = matches.map((r) => repoCard(r, policies, now)).join('')
}

// The catalog is fetched non-blocking: the page shell (search box, filters,
// nav, disclaimer) is already rendered by the browser before this script
// runs. We show a loading state in #results/#count until the ~900KB
// catalog.json and policies.json have arrived, then populate the list.
//
// Paths are relative ('data/...', no '../'): the deployed site serves
// data/ as a sibling of this page, and on a GitHub Pages *project* site
// (https://user.github.io/repo/index.html) a '../data/...' fetch is
// clamped by the browser at the origin root, producing '/data/...'
// instead of '/repo/data/...' — a 404. 'data/...' resolves relative to
// the page URL in both cases and works under any base path.
const now = new Date()
Promise.all([
  fetch('data/catalog.json').then((r) => r.json()),
  fetch('data/policies.json').then((r) => r.json()),
]).then(([catalog, policyDoc]) => {
  const policies = Object.fromEntries(policyDoc.clauses.map((c) => [c.id, c]))
  const indexed = indexRepos(catalog.repos)

  checkboxes($('bands'), catalog.bands.map((b) => ({ value: b.id, label: b.id })))
  checkboxes($('signals'), catalog.signal_definitions.map((s) => ({ value: s.id, label: s.label })))

  $('results').removeAttribute('aria-busy')
  $('controls').addEventListener('input', () => renderResults(indexed, catalog.repos.length, policies, now))
  $('generated').textContent = `Catalog generated ${new Date(catalog.generated_at).toUTCString()}`
  renderResults(indexed, catalog.repos.length, policies, now)
}).catch((err) => {
  $('count').textContent = 'Failed to load catalog.'
  $('results').removeAttribute('aria-busy')
  $('results').textContent = `Could not load the catalog data: ${err.message}`
})
