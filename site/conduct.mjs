// The conduct assessment axis: the maintainer's judgment about what an addon
// does to gameplay, kept deliberately separate from the mechanical score.
//
// Pure functions only - no I/O, no DOM - so the same module backs the catalog
// build, the browser, and the tests that enforce the file's integrity.

// Ordered from "no bearing on play decisions" to "acts for you".
//
// The top of the ladder is anchored by ArenaNet's own rule of thumb: one
// action per one click. A tool may do whatever it likes up to the point where
// a single input produces a sequence the player did not individually make -
// that is the substitutive line, and it is the one ArenaNet states outright.
//
// Below it, directive vs assistive is a judgment about instruction, not about
// input: both leave every keypress with the player. Directive tells them what
// to do at a moment that bears on a contested outcome - who to rez, when to
// dodge - which is the tool making the play call. Assistive reports state and
// leaves the call with them; ArenaNet tolerates DPS meters, which anchors it
// as a known tolerated tier.
//
// Notifications, reminders and threshold alerts are assistive. An earlier
// reading treated any prompt to act as directive, which filed buff reminders
// and trading post alerts next to automation - two rungs above where the
// one-click rule actually puts them.
export const CONDUCT_TIERS = ['none', 'assistive', 'directive', 'substitutive']

// A severity grade, not a taxonomy. What *kind* of edge a tool confers lives
// in the verdict's prose, so the schema never has to anticipate every case:
// revealing withheld information and amplifying perception are two examples of
// advantage, not the set of them.
export const ADVANTAGE_TIERS = ['none', 'some', 'strong']

// Discovery lowercases full_name while the catalog preserves GitHub's casing
// ("qq1ng/rezzOrder"). Exact-match keying would let a verdict silently detach
// from its repo the first time either side changed case.
export function indexAssessments(doc) {
  const entries = Object.entries(doc?.assessments ?? {})
  return new Map(entries.map(([k, v]) => [k.toLowerCase(), v]))
}

export const assessmentFor = (index, full_name) =>
  index.get(String(full_name ?? '').toLowerCase()) ?? null

// Non-none on either axis. A benign verdict is still a verdict - it records
// that the repo was looked at - but it renders as nothing.
export const isContentious = (a) => {
  if (!a) return false
  const conduct = a.conduct ?? 'none'
  const advantage = a.advantage ?? 'none'
  // Directive and substitutive are always contentious. Assistive is only contentious if advantage fires.
  if (conduct === 'directive' || conduct === 'substitutive') return true
  return advantage !== 'none'
}

// Conduct wins when both axes fire: "directive" is a more specific claim than
// "advantage", and a badge has room for one word.
export function badgeLabel(a) {
  if (!isContentious(a)) return null
  const conduct = a.conduct ?? 'none'
  if (conduct === 'directive' || conduct === 'substitutive') return conduct
  return (a.advantage ?? 'none') !== 'none' ? 'advantage' : null
}
