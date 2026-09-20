import { SIGNALS, detect, detectMetadata, METADATA_SIGNAL_IDS } from './signals.mjs'

export const BANDS = [
  { id: 'low', min: 0 },
  { id: 'moderate', min: 20 },
  { id: 'elevated', min: 45 },
  { id: 'high', min: 70 },
]

const byId = Object.fromEntries(SIGNALS.map((s) => [s.id, s]))

export function bandFor(points) {
  let band = 'low'
  for (const b of BANDS) if (points >= b.min) band = b.id
  return band
}

// Shared tail of both scoring paths: apply the manual override, then total and
// band the result. Keeping it in one place is what guarantees a cached repo and
// a freshly-enriched one are scored by identical arithmetic.
function finalize(detected, override) {
  let signals = detected
  if (override) {
    const drop = new Set(override.suppress ?? [])
    signals = signals.filter((s) => !drop.has(s.id))
    for (const id of override.add ?? []) {
      if (!byId[id] || signals.some((s) => s.id === id)) continue
      signals.push({ ...byId[id], evidence: [`manual override: ${override.reason}`] })
    }
  }
  const raw = signals.reduce((n, s) => n + s.weight, 0)
  const points = Math.max(0, Math.min(100, raw))
  return {
    points,
    band: bandFor(points),
    signals,
    override: override ? { reason: override.reason, source_url: override.source_url } : null,
  }
}

export function score(facts, { now, override = null }) {
  return finalize(detect(facts, now), override)
}

// Re-score a repo we did not re-read this run. Its content signals are whatever
// the last enrichment found - they cannot have changed, because an unchanged
// `pushed_at` is the precondition for taking this path - while every metadata
// signal is recomputed from the summary the search API hands us for free.
export function rescore(cached, summary, { now, override = null }) {
  const content = cached.signals.filter((s) => !METADATA_SIGNAL_IDS.has(s.id))
  const meta = detectMetadata(
    {
      archived: summary.archived,
      pushed_at: summary.pushed_at ?? cached.pushed_at,
      license: summary.license,
      stars: summary.stars,
    },
    now
  )
  return finalize([...content, ...meta], override)
}
