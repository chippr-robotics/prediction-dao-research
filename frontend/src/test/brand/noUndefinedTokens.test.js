import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join, sep } from 'node:path'

// Guard against `var(--token-that-does-not-exist, #hardcoded)` (spec 089).
//
// WHY THIS EXISTS
// This is the bug the screenshot round found that no other check could. The app
// had 177 references to 90 custom properties that were NEVER DEFINED —
// `--color-primary` alone used 109 times. Each one looks like a themed
// reference and behaves like a hardcoded literal, because the fallback is what
// renders. Always. In both themes.
//
// It defeats every other guard by construction:
//   - the palette codemod removes literals, but here the literal IS the value,
//     so removing it would change the rendering
//   - the legacy-colour scanner only knows the retired brand hues, and these
//     fallbacks were assorted Tailwind greens, violets and greys
//   - the contrast audit reads TOKENS, and these were not tokens
//
// Concretely: `var(--color-success, #15803d)` rendered the network chips bright
// green in a teal app, and `var(--color-primary, #6d28d9)` rendered violet.
// Both looked entirely correct in the source.
//
// The fix was to DEFINE the names in theme.css, which repointed all 177 at the
// palette at once. This test is what stops the 178th from being written.

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(__dirname, '../../..')
const THEME_CSS = resolve(FRONTEND, 'src/theme.css')

/**
 * Custom properties set at RUNTIME (by a component measuring the DOM) or in a
 * component's own stylesheet for a sibling to consume. Their fallbacks are
 * real, reachable values, not hidden hardcoding — a measured header height
 * genuinely does not exist until the header mounts.
 */
const RUNTIME_SET = new Set([
  '--dev-banner-height', // DevelopmentWarningBanner.jsx sets it on <html>
  '--infotip-shift', // InfoTip.jsx sets it per-tooltip after measuring
  '--mobile-header-height', // FairWinsAppNew.css, consumed by HeaderBar.css
  '--mobile-header-compact-height', // same pair
  '--my-account-sticky-top', // MyAccountView.jsx measures and sets it
  '--color-scheme', // a CSS `color-scheme` keyword, not a colour value
])

/**
 * Minimal recursive walk. Deliberately not `glob`: this repo's dependency
 * hygiene gate (spec 075 FR-003) rejects a package that resolves only through
 * npm hoisting, and a test guard does not justify a lockfile entry.
 */
function walk(dir, match, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walk(full, match, out)
    } else if (match(full)) {
      out.push(full)
    }
  }
  return out
}

function definedTokens() {
  const css = readFileSync(THEME_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return new Set(Array.from(css.matchAll(/(--[\w-]+)\s*:/g), (m) => m[1]))
}

function scan() {
  const global = definedTokens()
  const exemptPrefix = resolve(FRONTEND, 'src/test') + sep
  const files = walk(
    resolve(FRONTEND, 'src'),
    (f) => f.endsWith('.css') && !f.startsWith(exemptPrefix)
  ).sort()

  const findings = []
  for (const file of files) {
    const rel = relative(FRONTEND, file)
    const raw = readFileSync(file, 'utf8')
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    // A property defined anywhere in this same file is legitimate — component
    // stylesheets set their own locals and consume them lower down.
    const local = new Set(Array.from(source.matchAll(/(--[\w-]+)\s*:/g), (m) => m[1]))

    const lines = source.split('\n')
    lines.forEach((line, i) => {
      for (const match of line.matchAll(/var\(\s*(--[\w-]+)/g)) {
        const name = match[1]
        if (global.has(name) || local.has(name) || RUNTIME_SET.has(name)) continue
        findings.push({ rel, line: i + 1, name })
      }
    })
  }
  return findings
}

function report(findings) {
  const byName = new Map()
  for (const f of findings) {
    if (!byName.has(f.name)) byName.set(f.name, [])
    byName.get(f.name).push(f)
  }
  const lines = [
    `${findings.length} reference(s) to ${byName.size} undefined custom propert(ies).`,
    '',
    'A var() whose token is undefined renders its FALLBACK — always, in both',
    'themes. That is hardcoded colour wearing a token costume.',
    '',
    'Fix by DEFINING the name in src/theme.css (map it onto a real token), not by',
    'editing the call sites. If the property is genuinely set at runtime, add it',
    'to RUNTIME_SET in this file with a comment saying what sets it.',
    '',
  ]
  for (const [name, refs] of [...byName.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`  ${name}  (${refs.length})`)
    for (const r of refs.slice(0, 5)) lines.push(`      ${r.rel}:${r.line}`)
    if (refs.length > 5) lines.push(`      … and ${refs.length - 5} more`)
  }
  return lines.join('\n')
}

describe('no undefined CSS custom properties (spec 089)', () => {
  it('finds theme tokens to check against', () => {
    // A parser that silently matched nothing would make the assertion below
    // pass for the wrong reason — every var() would look "defined" or none would.
    expect(definedTokens().size).toBeGreaterThan(80)
  })

  it('references no custom property that is never defined', () => {
    const findings = scan()
    expect(findings.length, findings.length ? report(findings) : '').toBe(0)
  })
})
