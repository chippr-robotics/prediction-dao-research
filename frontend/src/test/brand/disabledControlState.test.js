import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// A disabled primary control must be TELLABLE from an enabled one (issue #1260).
//
// It used to be the enabled control at `opacity: 0.55`. On the pale teal that
// --brand-primary becomes in dark mode that is not a state a member can read —
// the spec-060 screenshots show an enabled deposit button and a disabled one
// side by side and they look alike. On a fee surface that means the control
// which ACCEPTS A CHARGE is hard to tell from one that cannot be pressed.
//
// The fix is a hue change, not more alpha: index.css re-points the button token
// pair at a neutral on any disabled button, so every control that fills from
// var(--primary-button) drops off the brand ladder. This test holds the two
// halves of that mechanism together — the tokens have to differ from the
// enabled fill by enough to see, and the remap has to actually be declared.
// Either half alone is silently useless.

const __dirname = dirname(fileURLToPath(import.meta.url))
const THEME_CSS = resolve(__dirname, '../../theme.css')
const INDEX_CSS = resolve(__dirname, '../../index.css')

const REMAPPED = ['--primary-button', '--primary-button-hover', '--primary-button-text']

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

  it('re-points the button token pair on disabled buttons', () => {
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

  it('leaves anchors out of the remap', () => {
    // --primary-button-hover is also the colour of a hovered LINK (index.css
    // `a:hover`). Remapping it on an anchor would paint disabled link text in
    // the disabled FILL colour — a near-invisible grey — instead of greying a
    // fill, so the selector is deliberately buttons only.
    const rule = /button:disabled[^{}]*\{/.exec(index.replace(/\/\*[\s\S]*?\*\//g, ''))
    expect(rule[0]).not.toMatch(/(^|[\s,])a\[/)
  })
})
