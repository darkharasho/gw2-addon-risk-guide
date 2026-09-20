// The conduct assessment axis: the maintainer's judgment about what an addon
// does to gameplay, kept deliberately separate from the mechanical score.
//
// Pure functions only - no I/O, no DOM - so the same module backs the catalog
// build, the browser, and the tests that enforce the file's integrity.

// Ordered from "no bearing on play decisions" to "acts for you".
//
// The top of the ladder is anchored by ArenaNet's own rule, stated in the
// macro policy: "Each macro should represent a single action that requires
// user input before repeating the action." A tool may do whatever it likes up
// to the point where a single input produces a sequence the player did not
// individually make - that is the substitutive line, and it is the one
// ArenaNet draws in writing. Quoted as `support-macros-prohibited` in
// data/policies.json, alongside the rest of that article's prohibitions:
// acting on more than one account at a time, automating skill use away from
// the computer, farming, and full automation.
//
// The same article permits attended macro use outright (`support-macros`) and
// names three things players may do - bind dodge and jump to one key, run an
// auto-clicker over a stack of items, drive in-game music
// (`support-macros-permitted`). That is why a tool which merely prompts the
// player is nowhere near the substitutive line: ArenaNet has already said a
// single keypress doing two things is fine.
//
// Below it, directive vs assistive is a judgment about instruction, not about
// input: both leave every keypress with the player. Directive tells them what
// to do at a moment that bears on a contested outcome - who to rez, when to
// dodge - which is the tool making the play call. Assistive reports state and
// leaves the call with them, which is the tier ArenaNet describes when it says
// it is "aware that some utilities help players without affecting others" and
// will generally not act on them - `support-benign-tolerance`. Note what that
// clause does not say: it is tolerance at ArenaNet's discretion, not approval,
// which is why an assistive verdict is still a verdict and not a clearance.
//
// Notifications, reminders and threshold alerts are assistive. An earlier
// reading treated any prompt to act as directive, which filed buff reminders
// and trading post alerts next to automation - two rungs above where the
// one-click rule actually puts them.
//
// What this ladder deliberately does not model: context. The macro policy
// forbids macro-built skill chains "in any competitive environment, including
// PvP, WvW, open world activities, races" - the same tool can be fine in one
// mode and actionable in another. A verdict here grades the tool, not the mode
// it is used in, so a benign grade never travels into competitive play intact.
export const CONDUCT_TIERS = ['none', 'assistive', 'directive', 'substitutive']

// A severity grade, not a taxonomy. What *kind* of edge a tool confers lives
// in the verdict's prose, so the schema never has to anticipate every case:
// revealing withheld information and amplifying perception are two examples of
// advantage, not the set of them.
//
// The grade answers the three questions ArenaNet tells players to ask of a
// third-party program (`support-advantage-test` in data/policies.json): does it
// let someone play "faster, better, longer, or more accurately" than someone
// without it, play while away from the computer, or gain "unnatural or
// undeserved rewards"? A yes to any of them is what `some` and `strong` record;
// `none` means the answer is no on all three.
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
