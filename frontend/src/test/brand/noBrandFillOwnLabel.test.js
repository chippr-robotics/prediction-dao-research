import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join, sep } from 'node:path'

// The USAGE guard for brand fills (issue #1260).
//
// WHY THIS EXISTS, AND WHY NOTHING ELSE CAUGHT IT
//
// 66 rules across 43 stylesheets filled a control from a brand token and then
// wrote their own label:
//
//   .earn-btn.primary { background: var(--brand-primary); color: #fff; }
//
// In dark mode --brand-primary lifts to #83B9C4 and that white label measures
// 2.16:1 — under AA's 4.5:1 for normal text and under even the 3:1 large-text
// floor. Light mode squeaked through at 4.74:1, which is the usual shape: a bug
// that exists in exactly one theme cell.
//
// Three guards sit next to this and every one of them is blind to it:
//
//   - tokenContrast.test.js audits --primary-button-text ON --primary-button
//     and passes, because it checks the PALETTE, not who uses it. 66 rules that
//     never name the pair are invisible to it.
//   - noHardcodedColors.test.js exempts #fff and #000 as absolutes — a reasoned
//     exemption, and precisely the literal being used here.
//   - cy.a11yScan() would catch it on any surface it scanned in dark mode, but
//     the fast tier runs one theme.
//
// The missing check was never about the palette or the literal. It is about the
// PAIRING: a fill whose value changes per theme cannot be labelled with a value
// that does not. So this guard says one thing — if the fill comes from a brand
// token, the label must come from a token too — and it does not care which
// token, because tokenContrast is what decides whether a pairing is legible.

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(__dirname, '../../..')

/**
 * Tokens whose VALUE MOVES BETWEEN THEMES. A fill built from one of these
 * cannot carry a fixed label.
 *
 * --primary-button is in the list on purpose even though it is the sanctioned
 * fill: it is the one that moves the most (#2E7D8C → #6FAEBB), so a literal
 * label on it is the same bug wearing the right token.
 */
const BRAND_FILL_TOKENS = [
  'brand-primary',
  'brand-secondary',
  'brand-accent',
  'primary-color',
  'color-primary',
  'color-accent',
  'accent-color',
  'accent',
  'primary-button',
  'primary-bg',
  'gradient-brand',
  'gradient-brand-soft',
  'gradient-primary-button',
]

const FILL = new RegExp(
  String.raw`background(?:-color|-image)?\s*:\s*[^;]*var\(--(?:${BRAND_FILL_TOKENS.join('|')})\b`,
  'i'
)

/**
 * A `color:` whose value is a literal — a hex, a named colour, or an rgb()/
 * rgba() that does not itself resolve a token. `rgb(var(--brand-primary-rgb))`
 * is a token reference in rgb clothing and is NOT a finding.
 *
 * The `(?<![-\w])` guard keeps `border-color`, `background-color`,
 * `outline-color` and friends out: only the label property is in scope.
 */
const LITERAL_LABEL = new RegExp(
  String.raw`(?<![-\w])color\s*:\s*(#[0-9a-fA-F]{3,8}\b|white\b|black\b|rgba?\((?![^)]*var\()[^)]*\))\s*(?=;|$)`,
  'i'
)

/**
 * Rules allowed to keep a literal label on a brand fill, each with the reason.
 *
 * Adding a row is a design decision, not a formality: it is a claim that the
 * label stays legible against the fill in BOTH themes, which is the thing this
 * guard exists to stop people assuming. Prefer moving the rule onto
 * --primary-button-text, which is audited.
 */
const ALLOWED = {
  // (empty — every rule in the tree takes its label from a token)
}

/** Minimal recursive walk — same reasoning as the sibling guards (no glob). */
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

/** Blank out comment bodies, preserving line count, so prose is not scanned. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
}

function stylesheets() {
  const exemptPrefix = resolve(FRONTEND, 'src/test') + sep
  return walk(
    resolve(FRONTEND, 'src'),
    (f) => f.endsWith('.css') && !f.startsWith(exemptPrefix)
  ).sort()
}

/**
 * Rule bodies are flat in this tree (no CSS nesting), so a non-greedy brace
 * match is enough and avoids taking a CSS parser as a test dependency — the
 * same trade the other three brand guards make.
 */
export function findViolations(files = stylesheets()) {
  const findings = []
  for (const file of files) {
    const rel = relative(FRONTEND, file).split(sep).join('/')
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = rule[2]
      if (!FILL.test(body)) continue
      const label = LITERAL_LABEL.exec(body)
      if (!label) continue
      const selector = rule[1].trim().split('\n').pop().trim()
      if (ALLOWED[`${rel} ${selector}`]) continue
      findings.push({
        rel,
        line: source.slice(0, rule.index).split('\n').length,
        selector,
        label: label[0].trim(),
      })
    }
  }
  return findings
}

function report(findings) {
  const lines = [
    `${findings.length} rule(s) fill from a brand token and then state their own label colour.`,
    '',
    'A brand fill changes value between themes and a literal label does not, so',
    'the pairing can only be right in one of them. --brand-primary lifts to',
    '#83B9C4 on dark, where `color: #fff` measures 2.16:1 (issue #1260).',
    '',
    'Fill from var(--primary-button) and label with var(--primary-button-text):',
    'that pair inverts on dark (Teal 300 fill, Gunmetal label, 5.3:1) and is',
    'audited in both themes by tokenContrast.test.js. Do NOT darken',
    '--brand-primary instead — Chippr Teal is a large-text-and-fill colour.',
    '',
  ]
  for (const f of findings.slice(0, 40)) {
    lines.push(`  ${f.rel}:${f.line}  ${f.selector}`)
    lines.push(`      ${f.label}`)
  }
  if (findings.length > 40) lines.push(`  … and ${findings.length - 40} more`)
  return lines.join('\n')
}

describe('no brand fill states its own label colour (issue #1260)', () => {
  it('scans a realistic number of stylesheets', () => {
    // A walk that silently matched nothing would make the assertion below pass
    // for the wrong reason — which is how a guard quietly stops guarding.
    expect(stylesheets().length).toBeGreaterThan(100)
  })

  it('pairs every brand fill with a tokenised label', () => {
    const findings = findViolations()
    expect(findings.length, findings.length ? report(findings) : '').toBe(0)
  })

  it('detects the shape it is meant to detect', () => {
    // The pairing this guard exists for, and the two near-misses that must NOT
    // be findings: a token label on a brand fill, and a literal label on a fill
    // that is not brand at all.
    const cases = [
      ['.x { background: var(--brand-primary); color: #fff; }', 1],
      ['.x { background: var(--brand-primary); color: var(--primary-button-text); }', 0],
      ['.x { background: var(--bg-secondary); color: #fff; }', 0],
      ['.x { background: var(--primary-button); color: white; }', 1],
      ['.x { background: var(--gradient-brand); color: #FFFFFF; }', 1],
      // rgb(var(--token-rgb)) is a token reference, not a literal.
      ['.x { background: var(--brand-primary); color: rgb(var(--brand-primary-rgb)); }', 0],
      // border-color is not a label.
      ['.x { background: var(--brand-primary); border-color: #fff; }', 0],
      // A commented-out literal is prose, not shipped colour.
      ['.x { background: var(--brand-primary); /* color: #fff; */ }', 0],
    ]
    for (const [css, expected] of cases) {
      const body = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}'))
      const stripped = stripComments(body)
      const hit = FILL.test(stripped) && LITERAL_LABEL.test(stripped) ? 1 : 0
      expect(hit, css).toBe(expected)
    }
  })
})
