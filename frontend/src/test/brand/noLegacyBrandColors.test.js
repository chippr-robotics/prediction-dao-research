import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join, sep } from 'node:path'

// Regression guard for spec 089 — Chippr brand alignment.
//
// The FairWins app shipped a green/blue palette (#36B37E Winning Green, #4C9AFF
// Odds Blue, #7BDCB5 Momentum Mint) that the Chippr Robotics Brand Guidelines
// v1.0 replace with a teal system. #2FA043 is the legacy 2017 Chippr green,
// which the guidelines explicitly RETIRE from the estate ("never the legacy
// green — that color is retired with the 2017 identity", slide 6).
//
// This guard exists because the palette lives in ONE place (theme.css + the
// tenant manifest) only for as long as nobody restates a value inline. Before
// spec 089 there were 686 hex literals and 169 rgba() brand triples spread over
// 74 CSS files — 447 of them #36B37E alone — which meant the "single source of
// truth" governed almost nothing. A reintroduced literal doesn't fail visibly;
// it just quietly stops tracking the palette until somebody notices two
// different teals on one screen.
//
// Scope note: this guard bans the RETIRED BRAND HUES, not every hardcoded
// color. The remaining Tailwind-ish neutral greys (#6B7280 and friends) are
// pre-existing debt tracked separately (spec 089 research R8) — they are not
// brand hues and do not clash with the teal system.

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(__dirname, '../../..')
const REPO = resolve(FRONTEND, '..')

/**
 * Hex literals that must never appear in shipped styling, with why.
 * Compared case-insensitively; 3-digit shorthand is not a concern for any of
 * these (all have distinct digit pairs).
 */
const BANNED_HEX = {
  '#2FA043': 'legacy 2017 Chippr green — retired by Brand Guidelines v1.0 slide 6',
  '#36B37E': 'outgoing FairWins "Winning Green" — replaced by Chippr Teal',
  '#2F9E6E': 'outgoing FairWins "Deep Green" hover — replaced by Teal 700',
  '#45C492': 'outgoing FairWins dark-mode green — replaced by Teal 300',
  '#5ED6A6': 'outgoing FairWins "Neon Mint" — replaced by the dark teal hover',
  '#4C9AFF': 'outgoing FairWins "Odds Blue" — the teal ladder replaces the second hue',
  '#4A9EFF': 'outgoing FairWins odds-blue variant',
  '#7BDCB5': 'outgoing FairWins "Momentum Mint" — replaced by Teal 300',
}

/**
 * rgba() triples of the same colors. These hide from a hex scan entirely, and
 * they were the more common form in tint/shadow rules.
 */
const BANNED_RGB = {
  '54, 179, 126': '#36B37E as an rgba triple — use rgba(var(--brand-primary-rgb), a)',
  '76, 154, 255': '#4C9AFF as an rgba triple — use rgba(var(--brand-secondary-rgb), a)',
  '123, 220, 181': '#7BDCB5 as an rgba triple — use rgba(var(--brand-accent-rgb), a)',
}

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

/**
 * Files whose styling ships to a member. Tests are exempt: a fixture may
 * legitimately name an old value while describing history.
 */
function shippedFiles() {
  const exemptPrefix = resolve(FRONTEND, 'src/test') + sep
  const styling = walk(
    resolve(FRONTEND, 'src'),
    (f) => /\.(css|jsx|js)$/.test(f) && !f.startsWith(exemptPrefix)
  )
  const extras = [resolve(FRONTEND, 'index.html'), ...walk(resolve(REPO, 'tenants'), (f) => f.endsWith('manifest.json'))]
  return [...styling, ...extras].sort()
}

/** Normalize `rgba( 54 , 179 , 126` spacing so a reformat can't smuggle a triple past us. */
function normalizeSpacing(line) {
  return line.replace(/\s*,\s*/g, ', ')
}

function findViolations() {
  const violations = []
  for (const file of shippedFiles()) {
    const rel = relative(REPO, file)
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const upper = line.toUpperCase()
      for (const [hex, why] of Object.entries(BANNED_HEX)) {
        if (upper.includes(hex)) violations.push({ rel, line: i + 1, token: hex, why })
      }
      const spaced = normalizeSpacing(line)
      for (const [rgb, why] of Object.entries(BANNED_RGB)) {
        if (spaced.includes(rgb)) violations.push({ rel, line: i + 1, token: `rgb(${rgb})`, why })
      }
    })
  }
  return violations
}

function report(violations) {
  const byFile = new Map()
  for (const v of violations) {
    if (!byFile.has(v.rel)) byFile.set(v.rel, [])
    byFile.get(v.rel).push(v)
  }
  const lines = [
    `${violations.length} retired brand color literal(s) in ${byFile.size} file(s).`,
    '',
    'Color must come from a token so the palette stays changeable from one place.',
    'See specs/089-chippr-brand-alignment/contracts/color-tokens.md for the mapping.',
    '',
  ]
  for (const [file, vs] of byFile) {
    lines.push(`  ${file}`)
    for (const v of vs.slice(0, 10)) lines.push(`    :${v.line}  ${v.token}  — ${v.why}`)
    if (vs.length > 10) lines.push(`    … and ${vs.length - 10} more in this file`)
  }
  return lines.join('\n')
}

describe('no legacy brand colors in shipped styling (spec 089)', () => {
  it('finds files to scan', () => {
    // A glob that silently matches nothing would make every assertion below
    // pass for the wrong reason.
    expect(shippedFiles().length).toBeGreaterThan(100)
  })

  it('ships no retired or outgoing brand color literal', () => {
    const violations = findViolations()
    expect(violations.length, violations.length ? report(violations) : '').toBe(0)
  })

  it('never ships the retired 2017 Chippr green specifically', () => {
    // Called out on its own: the guidelines retire this color by name, so its
    // reappearance is a brand violation rather than a drift problem.
    const legacy = findViolations().filter((v) => v.token === '#2FA043')
    expect(legacy, legacy.length ? report(legacy) : '').toEqual([])
  })
})
