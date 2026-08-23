import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join, sep } from 'node:path'

// A disabled primary control must be TELLABLE from an enabled one (issue #1260).
//
// It used to be the enabled control at `opacity: 0.55`. On the pale teal that
// --brand-primary becomes in dark mode that is not a state a member can read —
// the spec-060 screenshots show an enabled deposit button and a disabled one
// side by side and they look alike. On a fee surface that means the control
// which ACCEPTS A CHARGE is hard to tell from one that cannot be pressed.
//
// The fix is a hue change, not more alpha: index.css re-points the button token
// set at a neutral on any disabled button, so every control that fills from
// var(--primary-button) drops off the brand ladder. This test holds the THREE
// halves of that mechanism together — the tokens have to differ from the
// enabled fill by enough to see, the remap has to actually be declared, and
// every control has to read the whole set rather than half of it. Any one alone
// is silently useless, and the third is the one that is easy to get wrong.
//
// WHY THE THIRD CHECK EXISTS
//
// The remap works by re-pointing custom properties on the disabled element, so
// a control only follows it for the tokens it actually reads. A rule that fills
// from something outside the set and labels from --primary-button-text gets the
// worst of both: a grey label on a full-strength brand fill. Measured with the
// same WCAG helper below, --disabled-text on --primary-button-strength teal is
// 1.27:1 in light and 1.06:1 in dark — against 4.74:1 for the white label it
// replaced. That is a REGRESSION IN BOTH THEMES, not an unfixed dark cell, and
// it is not exotic: Button.jsx sets `disabled={disabled || loading}`, so it
// would hit every primary button while a transaction is in flight.
//
// The gradient is the same trap wearing a token. A custom property's computed
// value is its specified value WITH var() ALREADY SUBSTITUTED, resolved on the
// element the declaration applies to. --gradient-primary-button is declared at
// :root, so its stops resolve there against the ENABLED tokens and descendants
// inherit that finished string — re-pointing --primary-button on the button
// cannot reach back into it. index.css therefore re-points the gradient token
// itself, and `remapsTheWholeFillSet` below is what stops someone dropping that
// line as redundant.

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(__dirname, '../../..')
const THEME_CSS = resolve(__dirname, '../../theme.css')
const INDEX_CSS = resolve(__dirname, '../../index.css')

/** Every token index.css re-points on a disabled button. */
const REMAPPED = [
  '--primary-button',
  '--primary-button-hover',
  '--primary-button-text',
  '--gradient-primary-button',
]

/** The subset of those that a rule can FILL from. */
const REMAPPED_FILLS = ['--primary-button', '--primary-button-hover', '--gradient-primary-button']

/** The one that a rule can LABEL from. */
const REMAPPED_LABEL = '--primary-button-text'

function declarationsFor(css, selectors) {
  const out = {}
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g
  let match
  while ((match = ruleRe.exec(source)) !== null) {
    const list = match[1].split(',').map((s) => s.trim()).filter(Boolean)
    if (!list.some((sel) => selectors.includes(sel))) continue
    const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g
    let decl
    while ((decl = declRe.exec(match[2])) !== null) out[decl[1]] = decl[2].trim()
  }
  return out
}

function parseColor(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!hex) return null
  const h = hex[1]
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}

function relativeLuminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a, b) {
  const l1 = relativeLuminance(parseColor(a))
  const l2 = relativeLuminance(parseColor(b))
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/* ------------------------------------------------------------------ *
 * The usage scan: does every control read the WHOLE fill/label set?
 * ------------------------------------------------------------------ */

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

/** The first token a background resolves from, or null if it names none. */
function fillToken(body) {
  const bg = /(?:^|;)\s*background(?:-color|-image)?\s*:\s*([^;]+)/.exec(body)
  if (!bg) return null
  const token = /var\(\s*(--[\w-]+)/.exec(bg[1])
  return token ? token[1] : null
}

/**
 * The label declaration, or null when the rule states none. `(?<![-\w])` keeps
 * `border-color` / `background-color` / `outline-color` out: only the label
 * property is in scope.
 */
function labelValue(body) {
  const decl = /(?<![-\w])color\s*:\s*([^;]+)/.exec(body)
  return decl ? decl[1].trim() : null
}

/**
 * A rule is a finding when the fill and the label disagree about whether they
 * follow the disabled remap.
 *
 * A rule that states a remapped fill and NO label is fine: that is the `:hover`
 * shape used ~23 times in this tree, where the base rule already carries the
 * label and only the background is being restated.
 */
export function findPairingViolations(files = stylesheets()) {
  const findings = []
  for (const file of files) {
    const rel = relative(FRONTEND, file).split(sep).join('/')
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = rule[2]
      const fill = fillToken(body)
      const label = labelValue(body)
      // Consumption, not declaration: `--primary-button-text: …` at :root is
      // the token being defined, not a control reading it.
      const labelsFromPair = label !== null && new RegExp(`var\\(\\s*${REMAPPED_LABEL}\\b`).test(label)
      const fillsFromPair = fill !== null && REMAPPED_FILLS.includes(fill)

      let reason = null
      if (labelsFromPair && !fillsFromPair) {
        reason =
          `labels from ${REMAPPED_LABEL} but fills from ${fill ?? 'nothing in this rule'} — ` +
          'the label greys on a disabled control and the fill does not'
      } else if (fillsFromPair && label !== null && !labelsFromPair) {
        reason =
          `fills from ${fill} but labels with \`${label}\` — ` +
          'the fill greys on a disabled control and the label does not'
      }
      if (!reason) continue

      findings.push({
        rel,
        line: source.slice(0, rule.index).split('\n').length,
        selector: rule[1].trim().split('\n').pop().trim(),
        reason,
      })
    }
  }
  return findings
}

function pairingReport(findings) {
  const lines = [
    `${findings.length} rule(s) read only HALF of the disabled fill/label set.`,
    '',
    'index.css re-points these on a disabled <button>:',
    `  ${REMAPPED.join('\n  ')}`,
    '',
    'A control follows the remap only for the tokens it actually reads, so a',
    'fill and a label must both be in that set or both be outside it. Half of',
    'each yields --disabled-text on a full-strength brand fill (1.27:1 light,',
    '1.06:1 dark) or a white label on the grey neutral.',
    '',
    'Fill from var(--primary-button) or var(--gradient-primary-button) and label',
    'with var(--primary-button-text). A control whose fill is a STATUS colour',
    'keeps that colour when disabled, so it labels with var(--status-fill-text),',
    'which is deliberately not re-pointed.',
    '',
  ]
  for (const f of findings.slice(0, 40)) {
    lines.push(`  ${f.rel}:${f.line}  ${f.selector}`)
    lines.push(`      ${f.reason}`)
  }
  if (findings.length > 40) lines.push(`  … and ${findings.length - 40} more`)
  return lines.join('\n')
}

const THEMES = [
  { name: 'light', selectors: [':root', '.platform-fairwins', '.theme-light.platform-fairwins'] },
  {
    name: 'dark',
    selectors: [':root', '.platform-fairwins', '.theme-dark', '.theme-dark.platform-fairwins'],
  },
]

describe('a disabled control is distinguishable from an enabled one (issue #1260)', () => {
  const theme = readFileSync(THEME_CSS, 'utf8')
  const index = readFileSync(INDEX_CSS, 'utf8')

  it.each(THEMES)('$name theme defines the disabled pair', ({ selectors }) => {
    const tokens = declarationsFor(theme, selectors)
    for (const token of ['--disabled-bg', '--disabled-text', '--disabled-border']) {
      expect(tokens[token], `${token} undefined`).toBeDefined()
    }
  })

  it.each(THEMES)('$name theme: the disabled fill is off the brand ladder', ({ name, selectors }) => {
    const tokens = declarationsFor(theme, selectors)
    // 1.6:1 is not a text threshold — the disabled fill and the enabled fill are
    // both large areas, and the point is that they do not read as the same
    // control at a glance. A pure alpha change scores 1.0 here, which is exactly
    // the state this replaces.
    const ratio = contrast(tokens['--disabled-bg'], tokens['--primary-button'])
    expect(
      Number(ratio.toFixed(2)),
      `${name}: --disabled-bg (${tokens['--disabled-bg']}) against --primary-button ` +
        `(${tokens['--primary-button']}) is ${ratio.toFixed(2)}:1 — too close to read as a state change`
    ).toBeGreaterThanOrEqual(1.6)
  })

  it.each(THEMES)('$name theme defines the status-fill label', ({ selectors }) => {
    // A status-coloured control keeps its fill when disabled, so its label must
    // NOT follow the remap. --status-fill-text carries the same values as
    // --primary-button-text per theme; the separate name is what keeps it out
    // of the remap. tokenContrast.test.js audits it against danger and success.
    const tokens = declarationsFor(theme, selectors)
    expect(tokens['--status-fill-text'], '--status-fill-text undefined').toBeDefined()
  })

  it('re-points the whole button fill set on disabled buttons', () => {
    // Without this rule the tokens above are decoration: nothing would consume
    // them, and every swept control would keep its brand fill while disabled.
    const rule = /button:disabled[^{}]*\{([^{}]*)\}/.exec(index.replace(/\/\*[\s\S]*?\*\//g, ''))
    expect(rule, 'index.css declares no disabled-button rule').not.toBeNull()
    for (const token of REMAPPED) {
      expect(rule[1], `${token} is not re-pointed on disabled buttons`).toContain(`${token}:`)
    }
    expect(rule[1]).toContain('var(--disabled-bg)')
    expect(rule[1]).toContain('var(--disabled-text)')
  })

  it('re-points the gradient token rather than trusting it to re-resolve', () => {
    // --gradient-primary-button is declared at :root, where its var() stops are
    // substituted against the ENABLED tokens; a descendant inherits the finished
    // string. Re-pointing --primary-button on the button cannot reach into it,
    // so the gradient has to be restated here or 18 gradient-filled controls
    // keep their teal under a grey label. It stays a gradient, not a bare
    // colour, so a rule reaching it through `background-image` still resolves to
    // a valid <image>.
    const rule = /button:disabled[^{}]*\{([^{}]*)\}/.exec(index.replace(/\/\*[\s\S]*?\*\//g, ''))
    const decl = /--gradient-primary-button\s*:\s*([^;]+);/.exec(rule[1])
    expect(decl, '--gradient-primary-button is not re-pointed on disabled buttons').not.toBeNull()
    expect(decl[1]).toMatch(/^linear-gradient\(/)
    expect(decl[1]).toContain('var(--disabled-bg)')
    expect(decl[1], 'a stop still resolves from the enabled pair').not.toMatch(
      /var\(--primary-button/
    )
  })

  it('scans a realistic number of stylesheets', () => {
    // A walk that silently matched nothing would make the assertion below pass
    // for the wrong reason — which is how a guard quietly stops guarding.
    expect(stylesheets().length).toBeGreaterThan(100)
  })

  it('pairs every remapped fill with a remapped label, and vice versa', () => {
    const findings = findPairingViolations()
    expect(findings.length, findings.length ? pairingReport(findings) : '').toBe(0)
  })

  it('detects the shape it is meant to detect', () => {
    // Row 1-3 are the defect this guard exists for: the label follows the remap
    // and the fill does not, so `disabled` yields grey-on-brand. Rows 4-5 are
    // the mirror. The rest must NOT be findings.
    const cases = [
      // fill outside the set, label inside it
      ['.x { background: var(--brand-primary); color: var(--primary-button-text); }', 1],
      ['.x { background: var(--danger-color); color: var(--primary-button-text); }', 1],
      ['.x { background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));' +
        ' color: var(--primary-button-text); }', 1],
      // fill inside the set, label outside it
      ['.x { background: var(--primary-button); color: #fff; }', 1],
      ['.x { background: var(--gradient-primary-button); color: var(--text-primary); }', 1],
      // both inside — the sanctioned pairing
      ['.x { background: var(--primary-button); color: var(--primary-button-text); }', 0],
      ['.x { background: var(--gradient-primary-button); color: var(--primary-button-text); }', 0],
      ['.x { background: var(--primary-button, var(--brand-primary));' +
        ' color: var(--primary-button-text); }', 0],
      // both outside — a status control, which keeps its fill when disabled
      ['.x { background: var(--danger-color); color: var(--status-fill-text); }', 0],
      ['.x { background: var(--brand-primary); color: var(--text-on-brand); }', 0],
      // a :hover restating only the fill; the base rule carries the label
      ['.x:hover { background: var(--primary-button-hover); }', 0],
      // border-color is not a label
      ['.x { background: var(--primary-button); border-color: #fff; }', 0],
      // the declaration site is not a consumer
      [':root { --primary-button-text: #FFFFFF; }', 0],
      // a commented-out label is prose, not shipped colour
      ['.x { background: var(--brand-primary); /* color: var(--primary-button-text); */ }', 0],
    ]
    for (const [css, expected] of cases) {
      const body = stripComments(css.slice(css.indexOf('{') + 1, css.lastIndexOf('}')))
      const fill = fillToken(body)
      const label = labelValue(body)
      const labelsFromPair =
        label !== null && new RegExp(`var\\(\\s*${REMAPPED_LABEL}\\b`).test(label)
      const fillsFromPair = fill !== null && REMAPPED_FILLS.includes(fill)
      const hit =
        (labelsFromPair && !fillsFromPair) ||
        (fillsFromPair && label !== null && !labelsFromPair)
          ? 1
          : 0
      expect(hit, css).toBe(expected)
    }
  })

  it('leaves anchors out of the remap', () => {
    // --primary-button-hover is also the colour of a hovered LINK (index.css
    // `a:hover`). Remapping it on an anchor would paint disabled link text in
    // the disabled FILL colour — a near-invisible grey — instead of greying a
    // fill, so the selector is deliberately buttons only.
    const rule = /button:disabled[^{}]*\{/.exec(index.replace(/\/\*[\s\S]*?\*\//g, ''))
    expect(rule[0]).not.toMatch(/(^|[\s,])a\[/)
  })
})
