import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// WCAG 2.1 AA contrast audit over the shipped color tokens (spec 090).
//
// Constitution V requires WCAG 2.1 AA. Before this guard, that was asserted by
// hand at design time and then trusted forever — which is how a token tweak
// three specs later silently drops a pairing below threshold.
//
// This matters acutely for the Chippr palette. Its own measured table (Brand
// Guidelines v1.0 slide 11) puts Chippr Teal on white at 4.7:1 — AA, but with
// 0.24 of headroom, and annotated "18px+ / bold 14px+" because at body size it
// is a large-text-only color. Teal 700 (7.8:1) is what small teal text must
// use. A naive swap of the outgoing green for Chippr Teal everywhere would have
// shipped an accessibility regression under the banner of following the brand.
//
// The obligations below are the contract in
// specs/090-chippr-brand-alignment/contracts/color-tokens.md. If that file and
// this test disagree, one of them is a bug.

const __dirname = dirname(fileURLToPath(import.meta.url))
const THEME_CSS = resolve(__dirname, '../../theme.css')

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

/**
 * Collect `--token: value` declarations from every rule whose selector list
 * contains at least one of `selectors`. Later declarations win, matching the
 * cascade for rules of equal specificity in source order.
 */
function declarationsFor(css, selectors) {
  const out = {}
  // Strip comments FIRST. theme.css is heavily commented and a `/* ... */`
  // block sitting above a rule lands inside the selector capture, so `:root`
  // stops matching and every token reads as undefined.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Rule bodies are flat here (theme.css has no nesting or at-rules around the
  // token blocks), so a non-greedy brace match is sufficient and avoids pulling
  // in a CSS parser dependency for a test.
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g
  let match
  while ((match = ruleRe.exec(source)) !== null) {
    const selectorList = match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const applies = selectorList.some((sel) => selectors.includes(sel))
    if (!applies) continue
    const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g
    let decl
    while ((decl = declRe.exec(match[2])) !== null) {
      out[decl[1]] = decl[2].trim()
    }
  }
  return out
}

/** Follow `var(--a, fallback)` chains to a literal. */
function resolveVar(tokens, value, depth = 0) {
  if (depth > 10) throw new Error(`circular var() chain at: ${value}`)
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim())
  if (!m) return value.trim()
  const [, name, fallback] = m
  if (tokens[name] !== undefined) return resolveVar(tokens, tokens[name], depth + 1)
  if (fallback !== undefined) return resolveVar(tokens, fallback, depth + 1)
  throw new Error(`unresolved var(${name})`)
}

const LIGHT_SELECTORS = [':root', '.platform-fairwins', '.theme-light.platform-fairwins']
const DARK_SELECTORS = [
  ':root',
  '.platform-fairwins',
  '.theme-dark',
  '.theme-dark.platform-fairwins',
]

function themeTokens(css, selectors) {
  const raw = declarationsFor(css, selectors)
  const resolved = {}
  for (const [name, value] of Object.entries(raw)) {
    try {
      resolved[name] = resolveVar(raw, value)
    } catch {
      resolved[name] = value
    }
  }
  return resolved
}

// ---------------------------------------------------------------------------
// WCAG 2.1 relative luminance and contrast
// ---------------------------------------------------------------------------

function parseColor(value) {
  const v = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const h = hex[1]
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  }
  const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(v)
  if (rgba) return [1, 2, 3].map((i) => Number(rgba[i]))
  return null
}

/**
 * Composite a possibly-translucent color over an opaque backdrop. A token like
 * --warning-bg is an alpha tint; measuring it as if opaque reports a contrast
 * the member never sees.
 */
function alphaOf(value) {
  const m = /^rgba\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+[,\s/]+([\d.]+)\s*\)$/i.exec(value.trim())
  return m ? Number(m[1]) : 1
}

function composite(fg, bg) {
  const a = alphaOf(fg)
  const f = parseColor(fg)
  const b = parseColor(bg)
  if (!f || !b) return null
  if (a >= 1) return f
  return f.map((c, i) => c * a + b[i] * (1 - a))
}

function relativeLuminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(fgValue, bgValue, pageBg) {
  const bg = composite(bgValue, pageBg)
  const fg = composite(fgValue, bg ? `rgb(${bg.join(',')})` : pageBg)
  if (!fg || !bg) return null
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

const SURFACES = ['--bg-primary', '--bg-secondary', '--surface-color', '--bg-tertiary']
const CARD_SURFACES = ['--bg-secondary', '--surface-color']

/** [foreground, backgrounds, minimum ratio, why] */
const OBLIGATIONS = [
  ['--text-primary', SURFACES, 4.5, 'body text'],
  ['--text-secondary', SURFACES, 4.5, 'secondary text'],
  ['--text-muted', SURFACES, 4.5, 'muted text is still text'],
  ['--accent-color', CARD_SURFACES.concat('--bg-primary'), 4.5, 'links render at body size (FR-017)'],
  ['--primary-button-text', ['--primary-button'], 4.5, 'button label'],
  ['--primary-button-text', ['--primary-button-hover'], 4.5, 'button label, hovered'],
  // --primary-button-text is now the label on every brand fill in the tree, not
  // just on the button token (issue #1260) — noBrandFillOwnLabel.test.js is what
  // makes that true. Each fill it can land on has to be audited, or the usage
  // guard would just be redirecting 66 rules onto an unmeasured pairing.
  //
  // --brand-accent is deliberately ABSENT: at Teal 300 (light) and Teal 100
  // (dark) it is 2.5:1 under white and 3.0:1 under Gunmetal, so no label fits on
  // it in either theme. That is why --gradient-brand-soft carries none, and why
  // .status-badge.live moved off it onto --success-color.
  ['--primary-button-text', ['--brand-primary'], 4.5, 'label on a brand fill'],
  ['--primary-button-text', ['--brand-secondary'], 4.5, 'label on the deep brand fill'],
  ['--primary-button-text', ['--info-color'], 4.5, 'label on an info fill'],
  ['--primary-button-text', ['--success-color'], 4.5, 'label on a success fill'],
  // A disabled control drops off the brand ladder onto a neutral rather than
  // fading (issue #1260). WCAG 1.4.3 exempts inactive controls, but a label a
  // member cannot read is still unreadable, so the pair is held to 4.5 too.
  ['--disabled-text', ['--disabled-bg'], 4.5, 'disabled control label'],
  ['--success-color', CARD_SURFACES, 4.5, 'status text'],
  ['--danger-color', CARD_SURFACES, 4.5, 'status text'],
  ['--info-color', CARD_SURFACES, 4.5, 'status text'],
  // Status chips. The screenshot round caught the dark amber chip at 4.10:1 on a
  // raised panel while this audit read 5.89 — because the token was an ALPHA
  // TINT and the audit composited it over the page background only. The tokens
  // are opaque now, so these hold wherever the chip is placed; the surface list
  // stays broad so a future alpha tint cannot pass by being measured on the one
  // background that flatters it.
  ['--success-text', ['--success-bg'], 4.5, 'success chip label'],
  ['--warning-text', ['--warning-bg'], 4.5, 'warning chip label'],
  ['--danger-text', ['--danger-bg'], 4.5, 'danger chip label'],
  ['--info-text', ['--info-bg'], 4.5, 'info chip label'],
  // Chippr Teal is a LARGE-TEXT and FILL color by the guidelines' own
  // annotation — 3.0 is the UI-component / large-text threshold. Anything
  // needing 4.5 uses --accent-color instead. Do not "fix" this to 4.5 by
  // darkening --brand-primary; that would take the brand off palette.
  ['--brand-primary', ['--bg-secondary'], 3.0, 'large text and fills only'],
]

const THEMES = [
  { name: 'light', selectors: LIGHT_SELECTORS },
  { name: 'dark', selectors: DARK_SELECTORS },
]

describe('shipped color tokens meet WCAG 2.1 AA (spec 090)', () => {
  const css = readFileSync(THEME_CSS, 'utf8')

  it.each(THEMES)('$name theme defines every token an obligation names', ({ selectors }) => {
    const tokens = themeTokens(css, selectors)
    const needed = new Set()
    for (const [fg, bgs] of OBLIGATIONS) {
      needed.add(fg)
      bgs.forEach((b) => needed.add(b))
    }
    // A token missing in one theme silently inherits a value designed for the
    // other theme's background — the failure this catches is invisible in the
    // theme that does define it.
    const missing = [...needed].filter((t) => tokens[t] === undefined)
    expect(missing, `tokens undefined: ${missing.join(', ')}`).toEqual([])
  })

  for (const { name, selectors } of THEMES) {
    describe(`${name} theme`, () => {
      const tokens = themeTokens(css, selectors)
      const pageBg = () => tokens['--bg-primary'] || '#FFFFFF'

      for (const [fg, backgrounds, min, why] of OBLIGATIONS) {
        for (const bg of backgrounds) {
          it(`${fg} on ${bg} >= ${min}:1 (${why})`, () => {
            const fgValue = tokens[fg]
            const bgValue = tokens[bg]
            expect(fgValue, `${fg} undefined in ${name} theme`).toBeDefined()
            expect(bgValue, `${bg} undefined in ${name} theme`).toBeDefined()

            const ratio = contrast(fgValue, bgValue, pageBg())
            expect(ratio, `could not parse ${fgValue} on ${bgValue}`).not.toBeNull()
            expect(
              Number(ratio.toFixed(2)),
              `${fg} (${fgValue}) on ${bg} (${bgValue}) is ${ratio.toFixed(2)}:1, needs ${min}:1 — ${why}`
            ).toBeGreaterThanOrEqual(min)
          })
        }
      }
    })
  }

  it('defines status surfaces opaquely, so their contrast does not depend on placement', () => {
    // The lesson from round 1 of the screenshot loop, encoded. An alpha tint's
    // measured contrast is a property of whatever sits behind it, which is not
    // knowable where the token is defined — the same chip read 5.89:1 on the page
    // background and 4.10:1 on a raised panel. Assert the tokens are opaque
    // rather than trying to enumerate every surface a chip might land on.
    for (const { name, selectors } of THEMES) {
      const tokens = themeTokens(css, selectors)
      for (const surface of ['--success-bg', '--warning-bg', '--danger-bg', '--info-bg']) {
        const value = tokens[surface]
        expect(value, `${name}: ${surface} undefined`).toBeDefined()
        expect(
          alphaOf(value),
          `${name}: ${surface} is a translucent tint (${value}). Its contrast then depends on the surface behind it — use an opaque value.`
        ).toBe(1)
      }
    }
  })

  it('does not define a brand token as a retired hue', () => {
    // Belt-and-braces with noLegacyBrandColors: that guard scans text, this one
    // checks the RESOLVED value, so an alias chain landing on a retired color
    // cannot hide behind a var().
    const retired = ['#2FA043', '#36B37E', '#4C9AFF', '#7BDCB5']
    for (const { name, selectors } of THEMES) {
      const tokens = themeTokens(css, selectors)
      for (const [token, value] of Object.entries(tokens)) {
        const hit = retired.find((r) => String(value).toUpperCase().includes(r))
        expect(hit, `${name}: ${token} resolves to retired ${hit}`).toBeUndefined()
      }
    }
  })
})
