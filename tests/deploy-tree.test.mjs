import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'

// GitHub Pages deploys `site/` as a self-contained tree (see
// .github/workflows/pages.yml, which copies only `site/*` into `_site/`).
// Vitest runs from the repo root, so an import that reaches outside `site/`
// (e.g. `../scripts/foo.mjs`) resolves fine under test but 404s in the
// browser once `site/` is flattened into `_site/` - silently breaking the
// deployed page. This test statically walks every module in `site/` and
// fails if any relative import specifier would resolve outside `site/`.

const SITE_DIR = resolve('site')

function collectFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectFiles(full))
    else if (/\.(m?js)$/.test(entry.name)) out.push(full)
  }
  return out
}

function importSpecifiers(source) {
  const specifiers = []
  const re = /from\s+['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(source))) specifiers.push(m[1])
  return specifiers
}

describe('site/ deploy tree', () => {
  it('has no relative import that escapes site/', () => {
    const files = collectFiles(SITE_DIR)
    const escapes = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const spec of importSpecifiers(source)) {
        if (!spec.startsWith('.')) continue // bare/package specifiers aren't file-relative
        const resolved = resolve(dirname(file), spec)
        const rel = relative(SITE_DIR, resolved)
        if (rel.startsWith('..')) {
          escapes.push(`${relative(process.cwd(), file)} imports '${spec}', which resolves outside site/`)
        }
      }
    }
    expect(escapes, escapes.join('\n')).toEqual([])
  })
})
