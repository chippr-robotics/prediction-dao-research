#!/usr/bin/env node
/**
 * One-shot NEUTRAL + STATUS colour codemod (spec 091).
 *
 * WHY THIS EXISTS
 * Spec 090 tokenised the brand hues and deliberately stopped there: the
 * remaining literals were assorted Tailwind/Chakra neutrals and status shades
 * with no token equivalent, and sweeping them would have mixed an unrelated
 * refactor into a brand change. They were recorded as follow-up (090 research
 * R8). This is that follow-up.
 *
 * THE RULE, and why it is different from 090's
 * Spec 090 could match EXACTLY: a literal equal to a token's current value has
 * one unambiguous replacement. Nothing here equals a token, so exact matching
 * finds nothing. These are mapped by ROLE instead — `#6b7280` is the mid-grey
 * everyone reaches for when they mean secondary text — which is a judgement,
 * so every entry below is listed individually with the role it was read as.
 * Nothing is matched by a pattern or a distance function.
 *
 * WHAT IS DELIBERATELY LEFT ALONE
 *   · #fff / #000 and their long forms. White on a coloured fill is not
 *     `--surface-color`, and black at 6% opacity is a shadow, not text. Both
 *     are handled per-site where they are genuinely a token.
 *   · Third-party brand colours (token logos, vendor marks). Those identify
 *     someone else and must not move onto our palette.
 *   · Deliberate non-palette accents that carry meaning of their own — the
 *     membership tier metals. Those become tier tokens in theme.css instead.
 *
 * Usage: node scripts/brand/codemod-neutrals.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '../..')
const DRY_RUN = process.argv.includes('--dry-run')

/**
 * Literals whose role is the same in either theme. The tokens are theme-aware,
 * so replacing these ALSO fixes surfaces that were previously frozen on a
 * light-theme colour in dark mode — most of these sites had no dark variant.
 */
const UNIVERSAL = {
  // ---- neutral text -------------------------------------------------------
  '#111827': '--text-primary', // tailwind gray-900
  '#1A1A1A': '--text-primary',
  '#1A202C': '--text-primary', // chakra gray-800
  '#212529': '--text-primary', // bootstrap body
  '#2D3748': '--text-primary', // chakra gray-700
  '#333333': '--text-primary',
  '#374151': '--text-secondary', // tailwind gray-700
  '#4A5568': '--text-secondary', // chakra gray-600
  '#4B5563': '--text-secondary', // tailwind gray-600
  '#6B7280': '--text-secondary', // tailwind gray-500
  '#718096': '--text-secondary', // chakra gray-500
  '#64748B': '--text-secondary', // slate-500
  '#94A3B8': '--text-muted', // slate-400
  '#9CA3AF': '--text-muted', // tailwind gray-400
  '#A0AEC0': '--text-muted', // chakra gray-400
  '#888888': '--text-muted',

  // ---- neutral borders ----------------------------------------------------
  '#E5E7EB': '--border-color', // tailwind gray-200
  '#E2E8F0': '--border-color', // chakra gray-200
  '#CBD5E1': '--border-color', // slate-300
  '#CBD5E0': '--border-color',
  '#D1D5DB': '--border-color', // tailwind gray-300
  '#DDDDDD': '--border-color',

  // ---- neutral surfaces ---------------------------------------------------
  '#F8FAFC': '--bg-tertiary', // slate-50
  '#F8F9FA': '--bg-tertiary',
  '#F9FAFB': '--bg-tertiary', // tailwind gray-50
  '#F1F5F9': '--bg-tertiary', // slate-100
  '#F7FAFC': '--bg-tertiary',
  '#EDF2F7': '--bg-tertiary',

  // ---- status: success ----------------------------------------------------
  '#10B981': '--success-color', // emerald-500
  '#16A34A': '--success-color',
  '#15803D': '--success-color',
  '#047857': '--success-text', // emerald-700, used as text
  '#166534': '--success-text',
  '#14532D': '--success-text',
  '#34A853': '--success-color',
  '#3DC48B': '--success-color',
  '#2D7A4F': '--brand-primary', // the outgoing card/border green — brand emphasis
  '#1A2820': '--bg-tertiary', // its dark companion surface
  '#D1FAE5': '--success-bg',
  '#DCFCE7': '--success-bg',

  // ---- status: danger -----------------------------------------------------
  '#EF4444': '--danger-color', // red-500
  '#E53E3E': '--danger-color',
  '#DC3545': '--danger-color',
  '#C53030': '--danger-color',
  '#F56565': '--danger-color',
  '#B91C1C': '--danger-text', // red-700, used as text
  '#991B1B': '--danger-text',
  '#7F1D1D': '--danger-text',
  '#FEE2E2': '--danger-bg',
  '#FECACA': '--danger-bg',
  '#FED7D7': '--danger-bg',

  // ---- status: warning ----------------------------------------------------
  '#D97706': '--warning-text', // amber-600, used as text
  '#B45309': '--warning-text', // amber-700
  '#92400E': '--warning-text',
  '#C77D11': '--warning-text',
  '#FFC107': '--warning-color',
  '#FEF9C3': '--warning-bg',
  '#FEF9E7': '--warning-bg',
  '#FFFBEB': '--warning-bg',

  // ---- status: info -------------------------------------------------------
  '#1D4ED8': '--info-text', // blue-700, used as text
  '#1E40AF': '--info-text',
  '#2563EB': '--info-color',
  '#4299E1': '--info-color',
  '#2D9CDB': '--info-color',
  '#DBEAFE': '--info-bg',
  '#EBF8FF': '--info-bg',

  // ---- second pass: the long tail found after the first sweep --------------
  // Categorical purples. These marked market categories and "resolution
  // initiator" — distinctions that belong on the chart ramp, which is designed
  // to stay separable, rather than on a hue picked once and never revisited.
  '#6366F1': '--chart-series-d',
  '#818CF8': '--chart-series-c',
  '#8B5CF6': '--chart-series-d',
  '#A855F7': '--chart-series-d',
  '#9F7AEA': '--chart-series-c',
  '#6C5CE7': '--chart-series-d',
  '#E9DFFF': '--brand-accent',

  // Blues read as info at every site found.
  '#60A5FA': '--info-color',
  '#93C5FD': '--info-color',
  '#3A7FD5': '--info-color',
  '#5CA9FF': '--info-color',
  '#DBEAFE': '--info-bg',
  '#F0F9FF': '--info-bg',

  // Teals that predate the palette.
  '#0F766E': '--brand-secondary',
  '#5EEAD4': '--brand-accent',

  // Greens that predate the palette.
  '#48BB78': '--success-color',
  '#38A169': '--success-color',
  '#3D8B40': '--success-color',
  '#1E5A37': '--success-text',
  '#F0FDF4': '--success-bg',

  // Warm signals.
  '#FF9800': '--warning-color',
  '#D99B00': '--warning-text',
  '#D99520': '--warning-color',
  '#FFB834': '--warning-color',

  // Reds.
  '#FEF2F2': '--danger-bg',
  '#FCA5A5': '--danger-color',
  '#FF8A90': '--danger-color',

  // Neutrals.
  '#475569': '--text-secondary',

  // Tier metal (the fourth rank).
  '#E5E4E2': '--tier-silver',

  // ---- third pass: singletons -------------------------------------------
  '#FBBF24': '--warning-color',
  '#FDE68A': '--warning-bg',
  '#FFAB00': '--warning-color',
  '#FDCB6E': '--warning-color',
  '#92700E': '--warning-text',
  '#B36400': '--warning-text',
  '#FF5252': '--danger-color',
  '#D9534F': '--danger-color',
  '#FF7961': '--danger-color',
  '#FFB4B4': '--danger-bg',
  '#90EE90': '--success-color',
  '#3C9A5F': '--success-color',
  '#3B9C78': '--success-color',
  '#00B894': '--success-color',
  '#065F46': '--success-text',
  '#00CEC9': '--brand-accent',
  '#0984E3': '--info-color',
  '#2962FF': '--info-color',
  '#448AFF': '--info-color',
  '#6CB8FF': '--info-color',
  '#E17055': '--danger-color',
  '#A29BFE': '--chart-series-c',
  '#A78BFA': '--chart-series-c',
  '#B5A8FF': '--chart-series-c',
  '#AB47BC': '--chart-series-d',
  '#4F46E5': '--chart-series-d',
  '#636E72': '--text-muted',
  '#999999': '--text-muted',
  '#1E293B': '--text-primary',
  '#1E3A8A': '--info-text',
}

/**
 * Literals whose role depends on theme scope, resolved by where they sit.
 * A `light: null` entry is reported rather than guessed at.
 */
const SCOPED = {
  // Dark page/panel grounds. Outside a `.theme-dark` rule these belong to a
  // surface that is dark in BOTH themes (the landing hero, the component
  // gallery), so they are reported rather than repointed at a theme token that
  // would turn light.
  '#0A0F1A': { light: null, dark: '--bg-primary' },
  '#0D1622': { light: null, dark: '--bg-secondary' },
  '#0F1810': { light: null, dark: '--bg-secondary' },
}

const CSS_ROOT = 'frontend/src'
// Path prefixes, matched against the repo-relative path.
const EXCLUDE = [
  'frontend/src/theme.css', // the source of truth — it STATES the values
  'frontend/src/test/', // fixtures are not shipped styling
  // THIRD-PARTY CHAIN IDENTITY. Every colour in this file is a network's own
  // brand — Polygon purple, Ethereum indigo, Bitcoin orange. Rendering Polygon
  // in teal would not be on-brand, it would be wrong. A first pass mapped ETC's
  // green onto `--success-color`, which says "this succeeded" about a chain name.
  'frontend/src/components/ui/NetworkPill.css',
]

/** Minimal recursive walk — see the note in codemod-colors.mjs about `glob`. */
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

/** Tag each chunk of CSS with whether it sits inside a `.theme-dark` rule. */
function segments(css) {
  const out = []
  const stack = []
  let preludeStart = 0
  let chunkStart = 0
  let i = 0
  const isDark = () => stack.some((p) => p.includes('.theme-dark'))
  const push = (end) => {
    if (end > chunkStart) out.push({ text: css.slice(chunkStart, end), dark: isDark() })
    chunkStart = end
  }
  while (i < css.length) {
    if (css[i] === '{') {
      push(i + 1)
      stack.push(css.slice(preludeStart, i))
      preludeStart = i + 1
    } else if (css[i] === '}') {
      push(i + 1)
      stack.pop()
      preludeStart = i + 1
    }
    i++
  }
  push(css.length)
  return out
}

/** Expand `#abc` to `#aabbcc` so three-digit shorthand is matched too. */
function expand(hex) {
  const h = hex.slice(1)
  return h.length === 3
    ? `#${h.split('').map((c) => c + c).join('').toUpperCase()}`
    : hex.toUpperCase()
}

/**
 * Rewrite the code, never the prose.
 *
 * A first pass rewrote hexes inside `/* ... *\/` comments, including one that
 * documented a measured contrast pair — leaving it half in tokens and half in
 * hex, and saying something different from what it was written to say. Comments
 * also carry issue references like `#938`, which are the same shape as a
 * three-digit colour and must never be touched.
 */
function splitComments(text) {
  const parts = []
  let i = 0
  while (i < text.length) {
    const start = text.indexOf('/*', i)
    if (start === -1) {
      parts.push({ code: true, text: text.slice(i) })
      break
    }
    if (start > i) parts.push({ code: true, text: text.slice(i, start) })
    let end = text.indexOf('*/', start + 2)
    if (end === -1) end = text.length
    else end += 2
    parts.push({ code: false, text: text.slice(start, end) })
    i = end
  }
  return parts
}

function rewrite(text, dark, report) {
  return splitComments(text)
    .map((part) => (part.code ? rewriteCode(part.text, dark, report) : part.text))
    .join('')
}

function rewriteCode(text, dark, report) {
  return text.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (literal) => {
    const key = expand(literal)
    if (UNIVERSAL[key]) return `var(${UNIVERSAL[key]})`
    if (SCOPED[key]) {
      const token = dark ? SCOPED[key].dark : SCOPED[key].light
      if (token) return `var(${token})`
      report.push(key)
    }
    return literal
  })
}

const files = walkCss(resolve(REPO, CSS_ROOT))
  .filter((f) => !EXCLUDE.some((e) => relative(REPO, f) === e || relative(REPO, f).startsWith(e)))
  .sort()

let total = 0
let changed = 0
const needsReview = []

for (const file of files) {
  const rel = relative(REPO, file)
  const before = readFileSync(file, 'utf8')
  const report = []
  const after = segments(before)
    .map((s) => rewrite(s.text, s.dark, report))
    .join('')
  if (report.length) needsReview.push({ rel, items: report })
  if (after === before) continue

  const count = (s) =>
    (s.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).filter(
      (h) => UNIVERSAL[expand(h)] || SCOPED[expand(h)]
    ).length
  const n = count(before) - count(after)
  total += n
  changed++
  if (!DRY_RUN) writeFileSync(file, after)
  console.log(`  ${String(n).padStart(4)}  ${rel}`)
}

console.log('')
console.log(`${DRY_RUN ? '[dry run] ' : ''}${total} neutral/status literal(s) tokenized across ${changed} file(s) (of ${files.length} scanned).`)

if (needsReview.length) {
  console.log('\nMANUAL REVIEW — a dark-theme value outside a .theme-dark rule:')
  for (const { rel, items } of needsReview) console.log(`  ${rel}: ${[...new Set(items)].join(', ')}`)
}
