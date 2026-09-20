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

const months = (iso, now) =>
  Math.round((now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44))

export function breakdown(repo, policies) {
  const rows = repo.signals.map((s) => {
    const p = policies[s.policy]
    const cite = p
      ? `<blockquote class="quote">${escapeHtml(p.quote)}
           <cite><a href="${escapeHtml(safeUrl(p.source_url))}" rel="noopener">${escapeHtml(p.source)}</a></cite>
         </blockquote>`
      : ''
    return `<li class="signal ${s.weight < 0 ? 'mitigator' : 'risk'}">
      <div class="signal-head"><span class="signal-label">${escapeHtml(s.label)}</span>
        <span class="signal-weight">${s.weight > 0 ? '+' : ''}${s.weight}</span></div>
      <p class="signal-explain">${escapeHtml(s.explain)}</p>
      <p class="signal-evidence">Detected: ${s.evidence.map(escapeHtml).join('; ')}</p>
      ${cite}</li>`
  }).join('')
  const ov = repo.override
    ? `<p class="override">Manual override applied: ${escapeHtml(repo.override.reason)}
       (<a href="${escapeHtml(safeUrl(repo.override.source_url))}" rel="noopener">source</a>)</p>`
    : ''
  return `<div class="breakdown">${ov}<ul class="signals">${rows}</ul></div>`
}

export function repoCard(repo, policies, now) {
  return `<article class="card band-${escapeHtml(repo.band)}">
    <header>
      <h3><a href="${escapeHtml(safeUrl(repo.html_url))}" rel="noopener">${escapeHtml(repo.full_name)}</a></h3>
      <span class="band">${escapeHtml(repo.band)} risk</span>
      <span class="points" title="risk points out of 100">${repo.points}</span>
    </header>
    <p class="desc">${escapeHtml(repo.description)}</p>
    <p class="meta">${repo.stars} stars &middot; last push ${months(repo.pushed_at, now)} months ago
      &middot; ${escapeHtml(repo.license ?? 'no license')}</p>
    <details><summary>Why this score</summary>${breakdown(repo, policies)}</details>
  </article>`
}
