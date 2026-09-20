import { indexRepos, filterRepos } from './search.js'
import { repoCard, escapeHtml } from './render.js'

const $ = (id) => document.getElementById(id)

const checkboxes = (host, items) => {
  host.insertAdjacentHTML('beforeend', items.map(({ value, label }) =>
    `<label><input type="checkbox" value="${escapeHtml(value)}"> ${escapeHtml(label)}</label>`).join(''))
}

const checked = (host) => [...host.querySelectorAll('input:checked')].map((i) => i.value)

function renderResults(indexed, total, policies) {
  const matches = filterRepos(indexed, {
    query: $('q').value,
    bands: checked($('bands')),
    signals: checked($('signals')),
    maintenance: $('maintenance').value,
  })
  $('count').textContent = `${matches.length} of ${total} repositories`
  $('results').innerHTML = matches.map((r) => repoCard(r, policies)).join('')
}

// The catalog is fetched non-blocking: the page shell (search box, filters,
// nav, disclaimer) is already rendered by the browser before this script
// runs. We show a loading state in #results/#count until the ~900KB
// catalog.json and policies.json have arrived, then populate the list.
Promise.all([
  fetch('../data/catalog.json').then((r) => r.json()),
  fetch('../data/policies.json').then((r) => r.json()),
]).then(([catalog, policyDoc]) => {
  const policies = Object.fromEntries(policyDoc.clauses.map((c) => [c.id, c]))
  const indexed = indexRepos(catalog.repos)

  checkboxes($('bands'), catalog.bands.map((b) => ({ value: b.id, label: b.id })))
  checkboxes($('signals'), catalog.signal_definitions.map((s) => ({ value: s.id, label: s.label })))

  $('results').removeAttribute('aria-busy')
  $('controls').addEventListener('input', () => renderResults(indexed, catalog.repos.length, policies))
  $('generated').textContent = `Catalog generated ${new Date(catalog.generated_at).toUTCString()}`
  renderResults(indexed, catalog.repos.length, policies)
}).catch((err) => {
  $('count').textContent = 'Failed to load catalog.'
  $('results').removeAttribute('aria-busy')
  $('results').textContent = `Could not load the catalog data: ${err.message}`
})
