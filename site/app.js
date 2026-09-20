import { indexRepos, filterRepos, sortRepos } from './search.js'
import { repoCard, repoDrawer, escapeHtml } from './render.js'
import { CONDUCT_TIERS } from './conduct.mjs'

const $ = (id) => document.getElementById(id)

const BAND_ORDER = ['high', 'elevated', 'moderate', 'low']
const pressed = (host) =>
  [...host.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.value)
const checked = (host) => [...host.querySelectorAll('input:checked')].map((i) => i.value)

// The catalog is fetched non-blocking: the page shell (search box, filters,
// nav, disclaimer) is already rendered by the browser before this script
// runs. We show a loading state in #results/#count until the ~900KB
// catalog.json and policies.json have arrived, then populate the list.
//
// Paths are relative ('data/...', no '../'): the deployed site serves
// data/ as a sibling of this page, and on a GitHub Pages *project* site
// (https://user.github.io/repo/index.html) a '../data/...' fetch is
// clamped by the browser at the origin root, producing '/data/...'
// instead of '/repo/data/...' - a 404. 'data/...' resolves relative to
// the page URL in both cases and works under any base path.
const now = new Date()
Promise.all([
  fetch('data/catalog.json').then((r) => r.json()),
  fetch('data/policies.json').then((r) => r.json()),
]).then(([catalog, policyDoc]) => {
  const policies = Object.fromEntries(policyDoc.clauses.map((c) => [c.id, c]))
  const indexed = indexRepos(catalog.repos)
  const total = catalog.repos.length

  // Band ids come from the catalog, but the catalog lists them ascending
  // (low first) because that is the order the scorer thresholds them in.
  // Filters read better worst-first, so present them reversed.
  const bandIds = catalog.bands.map((b) => b.id)
  const ordered = BAND_ORDER.filter((b) => bandIds.includes(b))
    .concat(bandIds.filter((b) => !BAND_ORDER.includes(b)))
  const counts = Object.fromEntries(ordered.map((b) =>
    [b, catalog.repos.filter((r) => r.band === b).length]))

  const colour = (b) => `var(--band-${b}, var(--dim))`

  // The distribution strip is the one place the catalog's overall shape
  // (overwhelmingly low risk) is visible. It is decorative: the band pills
  // below it carry the same colours and do the filtering.
  $('distro').innerHTML = ordered.slice().reverse().map((b) =>
    `<i style="flex:${counts[b]};background:${colour(b)}"></i>`).join('')
  $('bands').innerHTML = ordered.map((b) =>
    `<button type="button" class="pill b-${escapeHtml(b)}" data-value="${escapeHtml(b)}" aria-pressed="false">
      <span class="dot" style="background:${colour(b)}"></span>${escapeHtml(b)}</button>`).join('')
  // Conduct rows are driven by CONDUCT_TIERS rather than by whatever the
  // data happens to contain, so the order is the ladder's order - benign to
  // most contentious - and never reshuffles as verdicts are added. A tier
  // nobody has been judged into is omitted: an always-empty filter is noise.
  const conductCounts = Object.fromEntries(CONDUCT_TIERS.map((t) =>
    [t, catalog.repos.filter((r) => r.assessment?.conduct === t).length]))
  const conductTiers = CONDUCT_TIERS.filter((t) => conductCounts[t] > 0)
  $('conduct').innerHTML = conductTiers.map((t) =>
    `<label><input type="checkbox" value="${escapeHtml(t)}">
      <span class="dot" aria-hidden="true"></span>${escapeHtml(t)}
      <b>${conductCounts[t]}</b></label>`).join('')

  $('sigpop').innerHTML = catalog.signal_definitions.map((s) =>
    `<label><input type="checkbox" value="${escapeHtml(s.id)}"> ${escapeHtml(s.label)}</label>`).join('')

  $('total').textContent = `· ${total} repositories`
  $('generated').textContent = `Updated ${new Date(catalog.generated_at).toISOString().slice(0, 10)} · refreshed weekly`
  $('results').removeAttribute('aria-busy')

  const setBand = (band, on) => {
    const el = $('bands').querySelector(`[data-value="${CSS.escape(band)}"]`)
    if (el) el.setAttribute('aria-pressed', String(on))
  }

  function render() {
    const bands = pressed($('bands'))
    const signals = checked($('sigpop'))
    const conduct = checked($('conduct'))
    const matches = sortRepos(filterRepos(indexed, {
      query: $('q').value, bands, signals, conduct, maintenance: $('maintenance').value,
    }), $('sort').value)

    const filtered = bands.length || signals.length || conduct.length ||
      $('q').value.trim() || $('maintenance').value !== 'any'
    $('count').innerHTML = `<b>${matches.length}</b> of ${total} repositories` +
      (filtered ? '<button type="button" class="clear" id="clear">Clear filters</button>' : '')
    $('sigbtn').innerHTML = 'Signals' + (signals.length ? ` <span class="n">${signals.length}</span>` : '')
    $('conductbtn').innerHTML = 'Conduct' + (conduct.length ? ` <span class="n">${conduct.length}</span>` : '')

    $('results').innerHTML = matches.length
      ? matches.map((r) => repoCard(r, policies, now)).join('')
      : '<p class="empty">No repositories match these filters.</p>'
    $('results').querySelectorAll('.card').forEach((el, i) => {
      el.onclick = () => openDrawer(matches[i])
    })
  }

  // --- detail drawer -------------------------------------------------
  let lastFocus = null
  function openDrawer(repo) {
    lastFocus = document.activeElement
    $('drawer').innerHTML = repoDrawer(repo, policies, now)
    $('drawer').className = `drawer b-${repo.band}`
    $('drawer').hidden = false
    $('scrim').hidden = false
    document.body.style.overflow = 'hidden'
    $('drawer').querySelector('[data-close]').focus()
  }
  function closeDrawer() {
    if ($('drawer').hidden) return
    $('drawer').hidden = true
    $('scrim').hidden = true
    document.body.style.overflow = ''
    lastFocus?.focus()
  }
  $('scrim').onclick = closeDrawer
  $('drawer').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeDrawer()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (!$('drawer').hidden) closeDrawer()
    else closeMenus()
  })

  // --- filter menus ----------------------------------------------------
  // Two disclosures over the same pattern (signals, conduct). Only one is
  // ever open: a click anywhere - including on the other trigger - closes
  // whatever was open first, and the trigger's own handler reopens itself.
  const MENUS = [['sigbtn', 'sigpop'], ['conductbtn', 'conduct']]
  const closeMenus = () => {
    for (const [btn, pop] of MENUS) {
      $(pop).hidden = true
      $(btn).setAttribute('aria-expanded', 'false')
    }
  }
  for (const [btn, pop] of MENUS) {
    $(btn).onclick = () => {
      const open = $(pop).hidden
      closeMenus()
      $(pop).hidden = !open
      $(btn).setAttribute('aria-expanded', String(open))
    }
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu')) closeMenus()
  })

  // --- wiring ---------------------------------------------------------
  const onToggle = (e) => {
    const btn = e.target.closest('[data-value]')
    if (!btn) return
    setBand(btn.dataset.value, btn.getAttribute('aria-pressed') !== 'true')
    render()
  }
  $('bands').onclick = onToggle
  $('controls').addEventListener('input', render)
  $('controls').addEventListener('submit', (e) => e.preventDefault())
  $('count').addEventListener('click', (e) => {
    if (!e.target.closest('#clear')) return
    $('q').value = ''
    $('maintenance').value = 'any'
    for (const b of ordered) setBand(b, false)
    for (const [, pop] of MENUS) {
      $(pop).querySelectorAll('input').forEach((i) => { i.checked = false })
    }
    render()
  })

  render()
}).catch((err) => {
  $('count').textContent = 'Failed to load catalog.'
  $('results').removeAttribute('aria-busy')
  $('results').textContent = `Could not load the catalog data: ${err.message}`
})
