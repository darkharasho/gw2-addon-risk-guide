import { describe, it, expect } from 'vitest'
import { SIGNALS, detect } from '../scripts/signals.mjs'

const NOW = new Date('2026-09-19T00:00:00Z')
const base = {
  full_name: 'a/b', description: '', topics: [], languages: [], readme: '',
  root_files: [], release_assets: [], stars: 50, archived: false,
  pushed_at: '2026-08-01T00:00:00Z', license: 'MIT',
}
const ids = (facts) => detect({ ...base, ...facts }, NOW).map((s) => s.id).sort()

describe('signal table', () => {
  it('has unique ids and a policy clause on every signal', () => {
    expect(new Set(SIGNALS.map((s) => s.id)).size).toBe(SIGNALS.length)
    for (const s of SIGNALS) expect(typeof s.policy).toBe('string')
  })
})

describe('detect', () => {
  it('fires automation on bot language', () => {
    expect(ids({ readme: 'An auto-farm bot for gw2' })).toContain('automation')
    expect(ids({ readme: 'A gathering bot that plays for you' })).toContain('automation')
    expect(ids({ readme: 'multiboxing via AutoHotkey macros' })).toContain('automation')
  })

  it('does not fire automation for an out-of-game chat bot', () => {
    // ddc/DiscordBot matched on the repo NAME alone under the old bare `bot`.
    expect(ids({ full_name: 'ddc/DiscordBot', description: 'A Discord bot for GW2' }))
      .not.toContain('automation')
    expect(ids({
      full_name: 'LoganWal/GW2-DonBot',
      description: 'Discord bot posting arcdps log summaries',
    })).not.toContain('automation')
    expect(ids({ full_name: 'Seres67/arcdps_logs_bot', readme: 'uploads logs to Discord' }))
      .not.toContain('automation')
  })

  it('does not fire automation for an offline log parser', () => {
    expect(ids({
      full_name: 'baaron4/GW2-Elite-Insights-Parser',
      description: 'Elite Insights is a log parser for GW2 arcdps logs',
    })).not.toContain('automation')
  })

  it('does not fire automation when the only match is in an acknowledgements section', () => {
    const readme = `GW2Radial is a radial menu for mounts and novelties.\n\n` +
      `## ACKNOWLEDGEMENTS\n\nThanks to someone for the original AutoHotkey-based menu.`
    expect(ids({ full_name: 'Friendly0Fire/GW2Radial', readme })).not.toContain('automation')
  })

  it('still fires automation when a credited match is not the only match', () => {
    const readme = `An auto-farm script.\n\n## Credits\n\nThanks to someone for AutoHotkey help.`
    expect(ids({ readme })).toContain('automation')
  })

  it('fires cheat on self-described trainers, hacks and ESP', () => {
    expect(ids({
      full_name: 'Coredelprotect/guild-wars-2-trainer',
      description: 'Guild Wars 2 trainer with god mode, unlimited money, cooldown hacks, and more.',
    })).toContain('cheat')
    expect(ids({
      full_name: 'PebbleBowyerMotor/guild-wars-2-trainer',
      description: 'godmode, teleport, speedhack, item spawner, no cooldowns',
    })).toContain('cheat')
    expect(ids({ full_name: 'SupportWedge/TyrianScript', description: 'Guild Wars 2 Hack 2026' }))
      .toContain('cheat')
    expect(ids({ full_name: 'kxtools/kx-vision', description: 'An open-source ESP and gear inspector addon' }))
      .toContain('cheat')
    expect(ids({ full_name: 'kxtools/kx-trainer-free', description: 'Open-source gameplay utility' }))
      .toContain('cheat')
  })

  it('does not fire cheat on benign repos', () => {
    expect(ids({ full_name: 'a/b', description: 'A build editor and template sharing site for GW2' }))
      .not.toContain('cheat')
    // "hackedd" is a GitHub username, not the word "hack".
    expect(ids({ full_name: 'hackedd/gw2api', description: 'Python wrapper for the Guild Wars 2 API' }))
      .not.toContain('cheat')
    // Route files that merely name a companion product.
    expect(ids({
      full_name: 'kxtools/kx-maps',
      description: 'Official community repository of Guild Wars 2 custom route files for use with KX Trainer Pro',
    })).not.toContain('cheat')
    // anti-cheat discussion is not cheating, and `esp` as a substring is not ESP.
    expect(ids({ readme: 'This is not a cheat and will not trip ArenaNet anti-cheat.' }))
      .not.toContain('cheat')
    expect(ids({ readme: 'Traducido al espanol. Respawn timers for esports events.' }))
      .not.toContain('cheat')
    // Security repos legitimately discuss exploiting a vulnerability.
    expect(ids({ readme: 'A writeup on how to exploit a buffer overflow in libfoo.' }))
      .not.toContain('cheat')
  })

  it('does not fire cheat on innocent neighbours of an ambiguous name token', () => {
    // The name path re-admitted the bare words PATTERNS.cheat carefully
    // excludes. At 45 points each of these landed in `elevated`.
    for (const full_name of [
      'tom/gw2-cheat-sheet',
      'x/gw2-anti-cheat-notes',
      'org/gw2-hack-day',
      'sec/exploit-db-mirror',
      'wiki/gw2-esp',
      'someone/gw2-esp-translation',
    ]) expect(ids({ full_name })).not.toContain('cheat')
  })

  it('still fires cheat on an undefused name token', () => {
    expect(ids({ full_name: 'x/gw2-cheat' })).toContain('cheat')
    expect(ids({ full_name: 'x/gw2-aimbot' })).toContain('cheat')
    expect(ids({ full_name: 'kxtools/kx-trainer-free' })).toContain('cheat')
    // A real ESP overlay that spells its own name in lowercase.
    expect(ids({ full_name: 'x4c1/arcdps_esp', description: 'ArcDPS addon mini-map' }))
      .toContain('cheat')
  })

  it('fires automation on a farm bot that merely advertises a Discord', () => {
    expect(ids({ description: 'gw2 farming bot', topics: ['discord'] })).toContain('automation')
    expect(ids({ readme: 'A gathering bot. Join our Discord for support.' }))
      .toContain('automation')
  })

  it('does not fire automation when the platform is attached to the match', () => {
    expect(ids({ readme: 'discord-botting utilities' })).not.toContain('automation')
  })

  it('fires injection on a d3d11 proxy dll', () => {
    expect(ids({ readme: 'drop d3d11.dll next to the exe', root_files: ['d3d11.dll'] }))
      .toContain('injection')
  })

  it('fires memory and packet on the respective terms', () => {
    expect(ids({ readme: 'uses ReadProcessMemory' })).toContain('memory')
    expect(ids({ readme: 'a packet sniffer for the map protocol' })).toContain('packet')
  })

  it('fires api_only for an official-API consumer and not for an injector', () => {
    expect(ids({ readme: 'Uses the official Guild Wars 2 API at api.guildwars2.com' }))
      .toContain('api_only')
    expect(ids({ readme: 'api.guildwars2.com plus a d3d11 hook' })).not.toContain('api_only')
  })

  it('withholds api_only from shipped binaries and cheats', () => {
    const readme = 'Links api.guildwars2.com for item names'
    expect(ids({ readme, release_assets: ['tool.exe'] })).not.toContain('api_only')
    expect(ids({ readme, root_files: ['payload.dll'] })).not.toContain('api_only')
    expect(ids({ readme, full_name: 'x/gw2-trainer' })).not.toContain('api_only')
  })

  it('grades staleness into one bucket only', () => {
    expect(ids({ pushed_at: '2023-01-01T00:00:00Z' })).toContain('stale_24m')
    expect(ids({ pushed_at: '2025-03-01T00:00:00Z' })).toContain('stale_12m')
    expect(ids({ pushed_at: '2025-03-01T00:00:00Z' })).not.toContain('stale_24m')
    expect(ids({})).not.toContain('stale_12m')
  })

  it('fires archived, no_license and obscure from metadata', () => {
    expect(ids({ archived: true, license: null, stars: 3 }))
      .toEqual(expect.arrayContaining(['archived', 'no_license', 'obscure']))
  })

  it('records evidence for every detected signal', () => {
    for (const s of detect({ ...base, readme: 'auto-farm bot', archived: true }, NOW)) {
      expect(s.evidence.length).toBeGreaterThan(0)
    }
  })

  it('names the matched text in the evidence rather than the regex source', () => {
    const ev = (facts, id) =>
      detect({ ...base, ...facts }, NOW).find((s) => s.id === id).evidence[0]
    expect(ev({ readme: 'built around AutoHotkey macros' }, 'automation'))
      .toBe('matched "AutoHotkey"')
    expect(ev({ readme: 'Uses api.guildwars2.com only' }, 'api_only'))
      .toBe('matched "api.guildwars2.com"')
    expect(ev({ readme: 'has god mode' }, 'cheat')).toBe('matched "god mode"')
    for (const s of detect({ ...base, readme: 'a d3d11 hook and a packet sniffer' }, NOW)) {
      expect(s.evidence[0]).not.toContain('\\b')
    }
  })

  it('keeps evidence snippets short', () => {
    for (const s of detect({ ...base, readme: 'x '.repeat(200) + 'god mode' }, NOW)) {
      expect(s.evidence[0].length).toBeLessThanOrEqual(80)
    }
  })

  it('tolerates a missing pushed_at without firing staleness or maintained signals', () => {
    const result = detect({ ...base, pushed_at: undefined }, NOW)
    expect(Array.isArray(result)).toBe(true)
    const found = result.map((s) => s.id)
    expect(found).not.toContain('stale_12m')
    expect(found).not.toContain('stale_24m')
    expect(found).not.toContain('popular_maintained')
  })
})

describe('api_only gating turns on shipped binaries, not language', () => {
  const NOW = new Date('2026-09-19T00:00:00Z')
  const ids = (f) => detect({ pushed_at: NOW.toISOString(), stars: 50, license: 'MIT', ...f }, NOW)
    .map((s) => s.id)

  // gw2sdk, Gw2Sharp and gw2cli are pure official-API client libraries that
  // happen to be C#. Both repos below are C# and mention the same API; only
  // the one shipping a Windows binary loses the mitigator.
  const csharp = {
    language: 'C#',
    languages: ['C#'],
    readme: 'Fetches data from https://api.guildwars2.com/v2/items.',
  }

  it('keeps the mitigator for a C# official-API client library', () => {
    expect(ids({ ...csharp, full_name: 'sliekens/gw2sdk' })).toContain('api_only')
  })

  it('withholds it from an otherwise identical repo shipping a Windows binary', () => {
    expect(ids({ ...csharp, full_name: 'someone/gw2-overlay', release_assets: ['gw2overlay.exe'] }))
      .not.toContain('api_only')
  })
})
