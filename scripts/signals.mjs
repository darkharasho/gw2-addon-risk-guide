const MONTH = 1000 * 60 * 60 * 24 * 30.44

export const SIGNALS = [
  { id: 'cheat', label: 'Cheating or exploit tooling', weight: 45, policy: 'ua-modify-client',
    explain: 'Presents itself as a cheat, trainer, or exploit — the category ArenaNet bans outright.' },
  { id: 'automation', label: 'Gameplay automation', weight: 40, policy: 'ua-automation',
    explain: 'Plays the game for you — bots, autofarming, or simulated input.' },
  { id: 'memory', label: 'Game memory access', weight: 35, policy: 'ua-modify-client',
    explain: 'Reads or writes the game client’s memory.' },
  { id: 'packet', label: 'Network/packet handling', weight: 30, policy: 'ua-modify-client',
    explain: 'Inspects or alters traffic between the client and the servers.' },
  { id: 'injection', label: 'Client injection or hooking', weight: 25, policy: 'ua-third-party-programs',
    explain: 'Loads code into the game process, typically via a proxy DLL or graphics hook.' },
  { id: 'unsigned_binaries', label: 'Ships prebuilt binaries', weight: 5, policy: 'support-own-risk',
    explain: 'Releases contain executables or DLLs you must trust without building them yourself.' },
  { id: 'archived', label: 'Archived repository', weight: 10, policy: 'support-own-risk',
    explain: 'The project is archived and will not be updated after game patches.' },
  { id: 'stale_24m', label: 'Unmaintained (2+ years)', weight: 10, policy: 'support-own-risk',
    explain: 'No pushes in over two years.' },
  { id: 'stale_12m', label: 'Slow maintenance (1-2 years)', weight: 5, policy: 'support-own-risk',
    explain: 'No pushes in over a year.' },
  { id: 'no_license', label: 'No license', weight: 5, policy: 'support-own-risk',
    explain: 'No declared license, so redistribution and auditing terms are unclear.' },
  { id: 'obscure', label: 'Little public scrutiny', weight: 5, policy: 'support-own-risk',
    explain: 'Few stars, so few people have looked at the code.' },
  { id: 'api_only', label: 'Official API only', weight: -15, policy: 'api-terms',
    explain: 'Appears to use only the official Guild Wars 2 API, outside the game process.' },
  { id: 'popular_maintained', label: 'Popular and actively maintained', weight: -5, policy: 'support-own-risk',
    explain: 'Widely used and pushed recently, so problems surface fast.' },
]

const byId = Object.fromEntries(SIGNALS.map((s) => [s.id, s]))

// Case-insensitive risk patterns.
//
// `cheat` deliberately has NO bare `cheat`/`hack`/`esp` alternative: a bare
// `cheat` matches "anti-cheat" and "this is not a cheat", a bare `hack`
// matches the GitHub username "hackedd", and a bare `esp` matches "espanol",
// "esports" and "respawn". Only explicit multi-word forms are listed here,
// and `ESP` is matched case-sensitively by CASE_SENSITIVE_PATTERNS below.
//
// `exploit` is only matched adjacent to a game-context word: security repos
// legitimately talk about exploiting a vulnerability, which is not cheating.
const PATTERNS = {
  cheat: /\b(trainers? (features?|menu|mode|hacks?)|(cheat|game|memory|hack) trainer|aim[- ]?bot|wall[- ]?hacks?|speed[- ]?hacks?|god[- ]?mode|item spawner|teleport hacks?|(unlimited|infinite) (health|hp|money|gold|mana)|cooldown hacks?|multi[- ]?box(ing)?|cheat (engine|table|menu|client|tool)|(gw2|guild ?wars ?2?) hacks?|hacks? for (gw2|guild ?wars)|exploits? (gw2|guild ?wars|the game|in-?game)|(gw2|guild ?wars ?2?|in-?game) exploits?)\b/i,
  // Botting must be game-context: a bare `bot` matched every Discord/Twitch
  // bot built on the public API (~20 repos) plus repos merely named *Bot.
  automation: /\b((game|farm|play|raid|gather|fish|combat|chat)?[- ]?botting|(farm|farming|gameplay|combat|gathering|grind|grinding)[- ]?bots?|auto-?farm|auto-?play|auto-?cast|auto-?loot|macro|autohotkey|sendinput|input simulation|clicker)\b/i,
  memory: /\b(readprocessmemory|writeprocessmemory|memory (read|scan|edit)|pattern scan|mumble link offsets|process memory)\b/i,
  packet: /\b(packet|pcap|sniff(er|ing)?|man-in-the-middle|mitm|intercept(s|ing)? traffic)\b/i,
  injection: /\b(inject(ion|or|s|ed)?|dll hook|hooks? (d3d|directx|the client)|d3d9|d3d11|dxgi|detour|proxy dll|addon loader)\b/i,
  api_only: /\b(api\.guildwars2\.com|official (gw2|guild wars 2) api|wiki\.guildwars2\.com\/wiki\/api)\b/i,
}

// Matched WITH case sensitivity, so `ESP` (the cheat overlay) fires but
// "espanol" / "esports" / "respawn" do not.
const CASE_SENSITIVE_PATTERNS = {
  cheat: /\bESP\b/,
}

// Repo names are checked token-by-token rather than by substring, so the
// GitHub username "hackedd" is not read as "hack". Bare `trainer` is not in
// PATTERNS.cheat because a benign repo may legitimately name one in prose
// (kxtools/kx-maps ships route files "for use with KX Trainer Pro"); naming
// yourself one is the actual signal.
const CHEAT_NAME_TOKENS = new Set([
  'trainer', 'trainers', 'aimbot', 'wallhack', 'wallhacks', 'speedhack', 'speedhacks',
  'godmode', 'cheat', 'cheats', 'cheater', 'esp', 'hack', 'hacks', 'hacktool',
  'exploit', 'exploits', 'multibox',
])

const cheatName = (fullName) =>
  String(fullName ?? '').toLowerCase().split(/[^a-z0-9]+/).find((t) => CHEAT_NAME_TOKENS.has(t)) ?? null

const CHAT_PLATFORM = /\b(discord|twitch|telegram|slack|matrix|irc)\b/i
const CREDITS = /\b(acknowledge?ments?|credits?|thanks to|thank you to|inspired by|see also)\b/i

// How much text on either side of a match a guard gets to look at.
const BEFORE = 200
const AFTER = 60

// Guards reject an otherwise-matching occurrence. A guarded-away occurrence
// does not stop the scan: the signal still fires if some other occurrence in
// the text is unguarded, so a guard only suppresses a *sole* bad match.
const GUARDS = {
  // An out-of-game Discord/Twitch bot is not gameplay automation, and an
  // AutoHotkey tool merely thanked in an ACKNOWLEDGEMENTS section is not
  // this repo's own behaviour.
  automation: (before, after) =>
    CHAT_PLATFORM.test(before.slice(-AFTER) + after) || CREDITS.test(before),
}

const globalRe = (re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')

// Returns the matched text of the first occurrence a guard does not reject.
function firstMatch(re, body, guard) {
  const g = globalRe(re)
  for (let m; (m = g.exec(body)); ) {
    if (m[0] === '') { g.lastIndex += 1; continue }
    const before = body.slice(Math.max(0, m.index - BEFORE), m.index)
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + AFTER)
    if (guard && guard(before, after)) continue
    return m[0]
  }
  return null
}

// Evidence is rendered through escapeHtml, so raw repo text is safe to show,
// but keep it to a short token rather than a whole README line.
const snippet = (s) => {
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length > 60 ? t.slice(0, 59) + '…' : t
}

const matchFor = (id, body) =>
  firstMatch(PATTERNS[id], body, GUARDS[id]) ??
  (CASE_SENSITIVE_PATTERNS[id] ? firstMatch(CASE_SENSITIVE_PATTERNS[id], body, GUARDS[id]) : null)

const text = (f) =>
  [f.description, f.readme, (f.topics ?? []).join(' '), f.full_name].filter(Boolean).join('\n')

const hit = (id, ev) => ({ ...byId[id], evidence: ev })

export function detect(facts, now) {
  const body = text(facts)
  const out = []
  const fired = new Set()
  const push = (id, ev) => { out.push(hit(id, ev)); fired.add(id) }

  for (const id of ['cheat', 'automation', 'memory', 'packet', 'injection']) {
    const m = matchFor(id, body)
    if (m) { push(id, [`matched "${snippet(m)}"`]); continue }
    if (id === 'cheat') {
      const t = cheatName(facts.full_name)
      if (t) push(id, [`repository name contains "${t}"`])
    }
  }
  const dlls = [...(facts.root_files ?? []), ...(facts.release_assets ?? [])]
    .filter((n) => n.endsWith('.dll'))
  if (dlls.length && !fired.has('injection')) push('injection', [`ships ${dlls[0]}`])

  const bins = (facts.release_assets ?? []).filter((n) => /\.(dll|exe)$/.test(n))
  if (bins.length) push('unsigned_binaries', [`release asset ${bins[0]}`])

  if (facts.archived) push('archived', ['repository is archived on GitHub'])

  const months = (now - new Date(facts.pushed_at)) / MONTH
  if (months >= 24) push('stale_24m', [`last push ${Math.round(months)} months ago`])
  else if (months >= 12) push('stale_12m', [`last push ${Math.round(months)} months ago`])

  if (!facts.license) push('no_license', ['no license detected by GitHub'])
  if ((facts.stars ?? 0) < 10) push('obscure', [`${facts.stars ?? 0} stars`])

  // A mention of the official API only earns the mitigator when nothing
  // suggests the repo also touches the client: no invasive/cheat signal and
  // no shipped Windows binary.
  //
  // Implementation language is deliberately NOT part of this test. C# is the
  // usual language for official-API client libraries (Gw2Sharp, gw2sdk,
  // gw2cli), so gating on it stripped the mitigator from exactly the repos it
  // exists to reward. Shipping a .dll/.exe is the signal that a repo runs
  // against the client; the language it is written in is not.
  const invasive = ['cheat', 'automation', 'memory', 'packet', 'injection'].some((id) => fired.has(id))
  const native = [...(facts.root_files ?? []), ...(facts.release_assets ?? [])]
    .some((n) => /\.(dll|exe)$/i.test(String(n)))
  const api = matchFor('api_only', body)
  if (api && !invasive && !native) push('api_only', [`matched "${snippet(api)}"`])
  if ((facts.stars ?? 0) >= 200 && months < 6) {
    push('popular_maintained', [`${facts.stars} stars, last push ${Math.round(months)} months ago`])
  }
  return out
}
