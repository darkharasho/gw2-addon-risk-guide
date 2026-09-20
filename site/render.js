// Rendering helpers shared by the catalog page. Plain ESM, no DOM access,
// so it can run unmodified in the browser and be imported by Vitest.
//
// All repo-derived text (name, description, topics, evidence strings, etc.)
// is untrusted third-party input and must be passed through escapeHtml
// before it lands in any template string used as innerHTML.

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

// Returns the url unchanged only if it parses and uses http(s); otherwise
// returns '#'. Escaping neutralizes HTML metacharacters but not a
// javascript: scheme in an href, so every href-bearing catalog/policy field
// must be passed through this before escapeHtml.
export function safeUrl(u) {
  try {
    const parsed = new URL(String(u ?? ''))
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? String(u) : '#'
  } catch {
    return '#'
  }
}

// Returns null rather than NaN when pushed_at is missing or unparseable:
// signals.mjs tolerates a missing pushed_at, so the card must too instead of
// rendering "NaN months ago".
const months = (iso, now) => {
  const t = new Date(iso ?? '').getTime()
  return Number.isFinite(t) ? Math.round((now.getTime() - t) / (1000 * 60 * 60 * 24 * 30.44)) : null
}

export function lastPush(iso, now) {
  const m = months(iso, now)
  return m === null ? 'last push unknown' : `last push ${m} months ago`
}

// The compact form used on cards, where the full sentence does not fit.
export function shortAge(iso, now) {
  const m = months(iso, now)
  if (m === null) return 'date unknown'
  if (m < 1) return 'this month'
  if (m < 24) return `${m} mo ago`
  return `${Math.round(m / 12)} yr ago`
}

// Signal chips are graded by weight rather than by id, so a reweighting in
// score.mjs changes the colour without anyone editing this file.
const chipClass = (w) => (w < 0 ? 'w-neg' : w >= 35 ? 'w-hi' : w >= 20 ? 'w-md' : '')
const weightClass = (w) => (w < 0 ? 'neg' : w >= 35 ? 'hi' : w >= 20 ? '' : 'lo')

const signed = (w) => `${w > 0 ? '+' : ''}${w}`

function policyQuote(policy) {
  if (!policy) return ''
  return `<div class="quote"><p>${escapeHtml(policy.quote)}</p>
    <cite><a href="${escapeHtml(safeUrl(policy.source_url))}" rel="noopener" target="_blank"
      >${escapeHtml(policy.source)}</a></cite></div>`
}

function signalRow(s, policies) {
  return `<div class="drow">
    <span class="dwt ${weightClass(s.weight)}">${escapeHtml(signed(s.weight))}</span>
    <div class="drb">
      <span class="lb">${escapeHtml(s.label)}</span>
      <p class="ex">${escapeHtml(s.explain)}</p>
      <p class="ev">detected: ${s.evidence.map(escapeHtml).join('; ')}</p>
      ${policyQuote(policies[s.policy])}
    </div></div>`
}

export function breakdown(repo, policies) {
  const signals = repo.signals ?? []
  const risks = signals.filter((s) => s.weight >= 0)
  const mitigators = signals.filter((s) => s.weight < 0)
  const ov = repo.override
    ? `<p class="override">Manual override applied: ${escapeHtml(repo.override.reason)}
       (<a href="${escapeHtml(safeUrl(repo.override.source_url))}" rel="noopener" target="_blank">source</a>)</p>`
    : ''
  // Mitigators are split out so a counterweight like "popular and maintained"
  // does not read as one more finding against the repo.
  const mit = mitigators.length
    ? `<h3>Mitigating factors</h3>${mitigators.map((s) => signalRow(s, policies)).join('')}`
    : ''
  const none = signals.length ? '' : '<p class="dnote">No risk signals were detected in public repository data.</p>'
  return `${ov}<h3>Why this score</h3>${none}${risks.map((s) => signalRow(s, policies)).join('')}${mit}`
}

// The framing constraint the whole site exists under, restated at the moment
// someone has just read a list of findings about an addon they may install.
const MEANING = `These signals come from public repository data &mdash; the README, file listing,
  release assets and GitHub metadata. They describe what the code appears to do, not whether
  ArenaNet has acted against it. A high score is not an accusation, and a low score is not permission.`

export function repoDrawer(repo, policies, now) {
  const [owner, name] = String(repo.full_name ?? '').split('/')
  const signals = repo.signals ?? []
  const risks = signals.filter((s) => s.weight >= 0).length
  const mitigators = signals.filter((s) => s.weight < 0).length
  const stale = (months(repo.pushed_at, now) ?? 0) >= 12
  const topics = (repo.topics ?? []).slice(0, 6)
  return `<div class="dhead">
    <button type="button" class="x" data-close aria-label="Close details">&#10005;</button>
    <span class="owner">${escapeHtml(owner)}/</span>
    <h2><a href="${escapeHtml(safeUrl(repo.html_url))}" rel="noopener" target="_blank"
      >${escapeHtml(name)}</a> &#8599;</h2>
    <p class="desc">${escapeHtml(repo.description) || '<em>No description</em>'}</p>
    <div class="dscore">
      <span class="n">${escapeHtml(repo.points)}</span><span class="of">/100</span>
      <span class="txt"><span class="bnd">${escapeHtml(repo.band)} risk</span>
        <span class="sub">${risks} risk signal${risks === 1 ? '' : 's'} detected${
          mitigators ? ` &middot; ${mitigators} mitigating` : ''}</span></span>
    </div>
    <div class="dmeta">
      <span>&#9733; ${escapeHtml(repo.stars ?? 0)} stars</span>
      ${repo.language ? `<span>${escapeHtml(repo.language)}</span>` : ''}
      <span class="${repo.license ? '' : 'warn'}">${escapeHtml(repo.license ?? 'no license')}</span>
      <span class="${stale ? 'warn' : ''}">updated ${escapeHtml(shortAge(repo.pushed_at, now))}</span>
      ${repo.archived ? '<span class="warn">archived</span>' : ''}
      ${topics.map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}
    </div>
  </div>
  <div class="dbody">
    ${breakdown(repo, policies)}
    <h3>What this means</h3><p class="dnote">${MEANING}</p>
  </div>`
}

export function repoCard(repo, policies, now) {
  const [owner, name] = String(repo.full_name ?? '').split('/')
  const signals = repo.signals ?? []
  const stale = (months(repo.pushed_at, now) ?? 0) >= 12
  return `<button type="button" class="card b-${escapeHtml(repo.band)}"
    aria-label="${escapeHtml(repo.full_name)} &mdash; ${escapeHtml(repo.band)} risk, ${escapeHtml(repo.points)} points. Show details.">
    <span class="chead">
      <span class="ctitle"><span class="owner">${escapeHtml(owner)}/</span>
        <span class="nm">${escapeHtml(name)}</span></span>
      <span class="score"><span class="n">${escapeHtml(repo.points)}</span>
        <span class="lb">${escapeHtml(repo.band)}</span></span>
    </span>
    <p class="desc">${escapeHtml(repo.description) || '<em>No description</em>'}</p>
    <span class="sigs">${signals.map((s) =>
      `<span class="sig ${chipClass(s.weight)}">${escapeHtml(s.label)}</span>`).join('')}</span>
    <span class="cmeta">
      <span class="it">&#9733; ${escapeHtml(repo.stars ?? 0)}</span>
      ${repo.language ? `<span class="it lang">${escapeHtml(repo.language)}</span>` : ''}
      <span class="it ${repo.license ? '' : 'warn'}">${escapeHtml(repo.license ?? 'no license')}</span>
      <span class="it ${stale ? 'warn' : ''}">${escapeHtml(shortAge(repo.pushed_at, now))}</span>
      <span class="why">Why this score &rarr;</span>
    </span>
  </button>`
}
