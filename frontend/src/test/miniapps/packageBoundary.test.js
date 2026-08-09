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

// `.mjs`/`.cjs` included: they were missing, so a single-line violation in a .mjs file was
// invisible purely because of its extension.
const CODE = /\.(js|jsx|ts|tsx|mjs|cjs)$/
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

/**
 * Remove comments before scanning, so a commented-out import cannot be reported as a violation —
 * and, more importantly, so allowing newlines inside an import statement (below) cannot start a
 * match inside a block comment.
 *
 * Hand-rolled rather than regex because `//` appears inside every `https://` URL in the tree, and a
 * naive strip would truncate the line and hide a real import after it. Tracks string and template
 * state so only genuine comment text is dropped.
 */
function stripComments(source) {
  let out = ''
  let i = 0
  let state = 'code' // code | line | block | single | double | template
  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]
    if (state === 'code') {
      if (c === '/' && next === '/') { state = 'line'; i += 2; continue }
      if (c === '/' && next === '*') { state = 'block'; i += 2; continue }
      if (c === "'") state = 'single'
      else if (c === '"') state = 'double'
      else if (c === '`') state = 'template'
      out += c; i++; continue
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c }
      i++; continue
    }
    if (state === 'block') {
      if (c === '*' && next === '/') { state = 'code'; i += 2; continue }
      // Keep newlines so line-anchored patterns below still see real line boundaries.
      if (c === '\n') out += c
      i++; continue
    }
    // inside a string/template: copy verbatim, honouring escapes
    if (c === '\\') { out += c + (next ?? ''); i += 2; continue }
    if ((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'template' && c === '`')) {
      state = 'code'
    }
    out += c; i++
  }
  return out
}

/**
 * Every module specifier in a file: static imports, re-exports, and dynamic `import()`.
 *
 * MULTI-LINE AWARE. The previous version used `[^'"\n]*` between `import` and `from`, so any
 * statement spanning lines was invisible — measured at 270 multi-line import statements across 229
 * files in this tree, versus the 4,976 specifiers it did see. Multi-line named imports are the
 * dominant style in exactly the files most likely to reach across the boundary, and all four
 * violation shapes in #1037 passed because of it.
 *
 * The clause is bounded by `[^;]*?` rather than an unbounded `[\s\S]*?`: an import's binding list
 * never contains a semicolon before its `from`, so this spans newlines while still refusing to run
 * away across unrelated statements.
 */
function specifiers(source) {
  const code = stripComments(source)
  const found = []
  const patterns = [
    /(?:^|\n)\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(code)) !== null) found.push(m[1])
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

  /*
   * CONVERTED_TREES matches the OLD paths, which no longer exist — so on its own it can catch a
   * STALE import left behind by a conversion, but never a NEW one written into
   * `frontend/miniapps/`. Confirmed before this was added: a host file importing
   * '../miniapps/token-mint/src/App.jsx' passed every check in this file.
   *
   * That import is precisely the failure spec 073 describes — it bundles a copy of package code
   * into the host bundle, and "a bundled copy of a React context is a DIFFERENT context".
   */
  it('has no import reaching into frontend/miniapps/ by path', () => {
    const byPath = []
    for (const file of walk(SRC)) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) continue
        const resolved = relative(FRONTEND, resolve(join(file, '..'), spec)).replace(/\\/g, '/')
        if (resolved.startsWith('miniapps/')) byPath.push(`${relative(FRONTEND, file)} → ${spec}`)
      }
    }
    expect(byPath).toEqual([])
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


/**
 * BY-NAME imports — the direction npm workspaces newly created (spec 075, FR-046).
 *
 * Converting the mini-apps into workspace members means npm symlinks each one into the ROOT
 * node_modules under its package name (verified: `@fairwins/miniapp-token-mint ->
 * ../../frontend/miniapps/token-mint`). So `import '@fairwins/miniapp-token-mint'` is now
 * resolvable from anywhere in the tree, including frontend/src.
 *
 * The checks above only look at relative paths and the literal substring `frontend/src/`, so they
 * are structurally blind to this. Nothing enforced it before workspaces because nothing could
 * resolve it before workspaces.
 */
/*
 * DERIVED from the packages on disk, not hardcoded. The literal list read
 * ['@fairwins/miniapp-token-mint', '@fairwins/miniapp-clearpath'], so a third package was invisible
 * to all three by-name checks below the moment it was added — the same by-name-list shape that let
 * `record-build-digests.js` report "output bytes unchanged" while never looking at a third app.
 *
 * A package that somehow has no package.json is skipped here, but it is still walked by the
 * path-based checks above, so it cannot escape the boundary entirely.
 */
const PACKAGE_NAMES = existsSync(PACKAGES)
  ? readdirSync(PACKAGES)
      .filter((d) => !SKIP_DIRS.has(d) && existsSync(join(PACKAGES, d, 'package.json')))
      .map((d) => JSON.parse(readFileSync(join(PACKAGES, d, 'package.json'), 'utf8')).name)
      .filter(Boolean)
  : []
const HOST_PACKAGE_NAME = 'frontend'

describe('the boundary holds for by-name imports too', () => {
  it('no host file imports a mini-app package by its package name', () => {
    const offenders = []
    for (const file of walk(SRC)) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        if (PACKAGE_NAMES.includes(pkg)) offenders.push(`${relative(FRONTEND, file)} → ${spec}`)
      }
    }
    // A package is untrusted third-party code frozen at an immutable CID. The host importing one
    // by name would bundle a copy of it — a different module instance from the one the loader
    // verifies and executes.
    expect(offenders).toEqual([])
  })

  it('no package imports the host by its package name', () => {
    const offenders = []
    for (const file of walk(PACKAGES)) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        if (pkg === HOST_PACKAGE_NAME) offenders.push(`${relative(FRONTEND, file)} → ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no package imports another package by name', () => {
    const offenders = []
    for (const file of walk(PACKAGES)) {
      const owner = relative(PACKAGES, file).split(/[\\/]/)[0]
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        if (PACKAGE_NAMES.includes(pkg) && !pkg.endsWith(owner)) {
          offenders.push(`${relative(FRONTEND, file)} → ${spec}`)
        }
      }
    }
    // Packages are curated and versioned independently; one bundling another would freeze a copy
    // of code the registry believes it is serving separately.
    expect(offenders).toEqual([])
  })
})
