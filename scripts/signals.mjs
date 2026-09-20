const MONTH = 1000 * 60 * 60 * 24 * 30.44

export const SIGNALS = [
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

const PATTERNS = {
  automation: /\b(bot|botting|auto-?farm|auto-?play|auto-?cast|auto-?loot|macro|autohotkey|sendinput|input simulation|clicker)\b/i,
  memory: /\b(readprocessmemory|writeprocessmemory|memory (read|scan|edit)|pattern scan|mumble link offsets|process memory)\b/i,
  packet: /\b(packet|pcap|sniff(er|ing)?|man-in-the-middle|mitm|intercept(s|ing)? traffic)\b/i,
  injection: /\b(inject(ion|or|s|ed)?|dll hook|hooks? (d3d|directx|the client)|d3d9|d3d11|dxgi|detour|proxy dll|addon loader)\b/i,
  api_only: /\b(api\.guildwars2\.com|official (gw2|guild wars 2) api|wiki\.guildwars2\.com\/wiki\/api)\b/i,
}

const text = (f) =>
  [f.description, f.readme, (f.topics ?? []).join(' '), f.full_name].filter(Boolean).join('\n')

const hit = (id, ev) => ({ ...byId[id], evidence: ev })

export function detect(facts, now) {
  const body = text(facts)
  const out = []
  const fired = new Set()
  const push = (id, ev) => { out.push(hit(id, ev)); fired.add(id) }

  for (const id of ['automation', 'memory', 'packet', 'injection']) {
    const m = PATTERNS[id].exec(body)
    if (m) push(id, [`text matches /${PATTERNS[id].source}/`])
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

  const invasive = ['automation', 'memory', 'packet', 'injection'].some((id) => fired.has(id))
  const api = PATTERNS.api_only.exec(body)
  if (api && !invasive) push('api_only', [`text matches /${PATTERNS.api_only.source}/`])
  if ((facts.stars ?? 0) >= 200 && months < 6) {
    push('popular_maintained', [`${facts.stars} stars, last push ${Math.round(months)} months ago`])
  }
  return out
}
