/**
 * The import boundary between the host and the mini-app packages (spec 073).
 *
 * Converting a feature into a package MOVES its tree out of `frontend/src/`. That is a rename the
 * compiler cannot help with across the boundary, and both directions have already gone wrong once:
 *
 *   - HOST → PACKAGE. After the ClearPath conversion (T028), `useMembershipTreasuryStats.js` and
 *     `useCallsignRegistryMetrics.js` were still importing `getLogsRange` from
 *     `components/clearpath/connectors/ozGovernor` — a path that no longer exists. Six test files
 *     failed to load and `npm run build` would have failed outright. It survived because the
 *     conversion's own suites were green: nothing that ran locally imported those hooks, and the
 *     breakage only surfaced on a full-suite run.
 *
 *   - PACKAGE → HOST. A package is built separately and frozen at an immutable CID, so a bundled
 *     copy of a React context is a DIFFERENT context and a bundled copy of `config/` is a snapshot
 *     of whatever the build machine believed. `frontend/miniapps/` must take everything from the
 *     host at runtime, through the `host` object.
 *
 * Both are cheap to check and expensive to discover, so they are checked here rather than left to
 * whichever suite happens to import the broken module next.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const FRONTEND = resolve(__dirname, '../../..')
const SRC = join(FRONTEND, 'src')
const PACKAGES = join(FRONTEND, 'miniapps')

const CODE = /\.(js|jsx|ts|tsx)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '__snapshots__'])

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (CODE.test(name)) out.push(full)
  }
  return out
}

/** Every module specifier in a file: static imports, re-exports, and dynamic `import()`. */
function specifiers(source) {
  const found = []
  const patterns = [
    /(?:^|\n)\s*import\s[^'"\n]*from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s[^'"\n]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(source)) !== null) found.push(m[1])
  }
  return found
}

/** Trees that were moved into `frontend/miniapps/` and no longer exist under `src/`. */
const CONVERTED_TREES = [
  { label: 'ClearPath (T028)', pattern: /(^|\/)(components|config)\/clearpath(\/|$)/ },
  { label: 'Token Mint (T026)', pattern: /(^|\/)components\/tokens(\/|$)/ },
]

describe('the host does not import from a converted tree', () => {
  // A comment may legitimately mention the old path; only real module specifiers are checked.
  const offenders = []
  for (const file of walk(SRC)) {
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('.')) continue
      const resolved = relative(SRC, resolve(join(file, '..'), spec)).replace(/\\/g, '/')
      for (const tree of CONVERTED_TREES) {
        if (tree.pattern.test(resolved)) {
          offenders.push(`${relative(FRONTEND, file)} → ${spec}  [${tree.label}]`)
        }
      }
    }
  }

  it('has no import pointing at a tree that moved into frontend/miniapps/', () => {
    // The host keeps its OWN copies of the few pieces it still needs (e.g.
    // src/lib/clearpath/connectors/ for the daoSource notification adapter). Import those.
    expect(offenders).toEqual([])
  })
})

describe('a package does not import from the host', () => {
  const offenders = []
  for (const file of walk(PACKAGES)) {
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      const normalized = spec.replace(/\\/g, '/')
      const escapesToSrc =
        normalized.startsWith('.') &&
        relative(FRONTEND, resolve(join(file, '..'), normalized))
          .replace(/\\/g, '/')
          .startsWith('src/')
      if (escapesToSrc || /(^|\/)frontend\/src\//.test(normalized)) {
        offenders.push(`${relative(FRONTEND, file)} → ${spec}`)
      }
    }
  }

  it('has no import reaching back into frontend/src/', () => {
    // A package is built separately and frozen at a CID. Anything it needs from the host arrives at
    // runtime through the `host` object, or through the externalised shared scope
    // (react / react-dom / ethers / @fairwins/miniapp-sdk).
    expect(offenders).toEqual([])
  })
})
