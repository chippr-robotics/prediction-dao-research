#!/usr/bin/env node
/**
 * One-shot font-stack codemod for spec 089 (Chippr brand alignment).
 *
 * WHY THIS EXISTS
 * Defining --font-sans/--font-display/--font-mono at :root does not make the
 * brand faces appear. The app restates a font stack in ~40 component rules, and
 * every one of those local declarations OVERRIDES the root default. Left alone,
 * the typography half of the rebrand silently does not land — the same failure
 * mode as the color literals.
 *
 * The monospace declarations matter most: 'SF Mono' / Monaco / 'Courier New'
 * are exactly the addresses-and-hashes role the guidelines assign to JetBrains
 * Mono (slide 12), so they are re-pointed rather than left as-is.
 *
 * Only stacks that restate a GENERIC system or monospace family are rewritten.
 * `font-family: inherit` is left alone — it is already correct, and rewriting
 * it would break controls that deliberately inherit from a styled parent.
 *
 * Usage: node scripts/brand/codemod-fonts.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '../..')
const DRY_RUN = process.argv.includes('--dry-run')

/** Families that mark a stack as monospace. */
const MONO_MARKERS = [
  'monospace',
  'sf mono',
  'sfmono-regular',
  'ui-monospace',
  'menlo',
  'monaco',
  'consolas',
  'courier',
]

/** Families that mark a stack as a generic system/UI sans restatement. */
const SANS_MARKERS = [
  'system-ui',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'helvetica',
  'avenir',
  'arial',
  'roboto',
]

const CSS_ROOT = 'frontend/src'
// Path prefixes, matched against the repo-relative path.
const EXCLUDE = [
  'frontend/src/theme.css',        // declares the stacks
  'frontend/src/index.css',        // applies them at the root
  'frontend/src/styles/fonts.css', // loads the faces
  'frontend/src/test/',            // fixtures are not shipped styling
]

/**
 * Minimal recursive file walk. Deliberately not `glob`: this repo's dependency
 * hygiene gate (spec 075 FR-003) rejects a package that resolves only through
 * npm hoisting, and a ten-line walker is not worth a lockfile re-resolve.
 */
function walkCss(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walkCss(full, out)
    } else if (entry.name.endsWith('.css')) {
      out.push(full)
    }
  }
  return out
}

const files = walkCss(resolve(REPO, CSS_ROOT))
  .filter((f) => !EXCLUDE.some((e) => relative(REPO, f) === e || relative(REPO, f).startsWith(e)))
  .sort()

let changed = 0
let replaced = 0
const skipped = []

for (const file of files) {
  const rel = relative(REPO, file)
  const before = readFileSync(file, 'utf8')

  const after = before.replace(/font-family:\s*([^;{}]+);/g, (match, stack) => {
    const value = stack.trim()
    const lower = value.toLowerCase()

    // Already tokenized, or deliberately inheriting — leave both alone.
    if (lower.includes('var(--font')) return match
    if (lower === 'inherit' || lower === 'initial' || lower === 'unset') return match

    const isMono = MONO_MARKERS.some((m) => lower.includes(m))
    if (isMono) {
      replaced++
      return 'font-family: var(--font-mono);'
    }

    const isSans = SANS_MARKERS.some((m) => lower.includes(m))
    if (isSans) {
      replaced++
      return 'font-family: var(--font-sans);'
    }

    // A named face this script does not recognise. Report rather than guess —
    // it may be a deliberate choice (an icon font, a vendor widget).
    skipped.push({ rel, value })
    return match
  })

  if (after === before) continue
  changed++
  if (!DRY_RUN) writeFileSync(file, after)
  console.log(`  ${rel}`)
}

console.log('')
console.log(`${DRY_RUN ? '[dry run] ' : ''}${replaced} font stack(s) re-pointed across ${changed} file(s) (of ${files.length} scanned).`)

if (skipped.length) {
  console.log('')
  console.log('LEFT ALONE — a named family this script does not classify:')
  for (const { rel, value } of skipped) console.log(`  ${rel}: ${value}`)
}
