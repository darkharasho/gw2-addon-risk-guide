import { ghFetch } from './github.mjs'

const README_MAX = 20_000

const safe = async (p, opts) => { try { return await ghFetch(p, opts) } catch { return null } }

export async function enrich(fullName, opts = {}) {
  const slug = fullName.toLowerCase()
  const repo = await ghFetch(`/repos/${slug}`, opts)
  if (!repo) return null
  const [languages, readme, contents, release] = await Promise.all([
    safe(`/repos/${slug}/languages`, opts),
    safe(`/repos/${slug}/readme`, opts),
    safe(`/repos/${slug}/contents/`, opts),
    safe(`/repos/${slug}/releases/latest`, opts),
  ])
  return {
    full_name: repo.full_name,
    name: repo.name,
    owner: repo.owner?.login ?? slug.split('/')[0],
    html_url: repo.html_url,
    description: repo.description ?? '',
    topics: repo.topics ?? [],
    language: repo.language ?? null,
    languages: Object.keys(languages ?? {}),
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    archived: !!repo.archived,
    fork: !!repo.fork,
    pushed_at: repo.pushed_at,
    created_at: repo.created_at,
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION'
      ? repo.license.spdx_id : null,
    readme: readme?.content
      ? Buffer.from(readme.content, 'base64').toString('utf8').slice(0, README_MAX) : '',
    root_files: Array.isArray(contents) ? contents.map((c) => c.name.toLowerCase()) : [],
    release_assets: (release?.assets ?? []).map((a) => a.name.toLowerCase()),
  }
}
