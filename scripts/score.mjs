import { SIGNALS, detect } from './signals.mjs'

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

export function score(facts, { now = new Date(), override = null } = {}) {
  let signals = detect(facts, now)
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
