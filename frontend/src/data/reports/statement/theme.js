/**
 * Statement design tokens, derived from the active tenant's brand (spec 072).
 *
 * The statement is a member-facing financial document, so a tenant has to be
 * able to put its own brand on it without anyone editing a renderer. That is
 * only safe if the design *derives* every surface from one brand colour and
 * then PROVES the result is legible: a tenant is free to pick any primary,
 * including a pale yellow, and the header band must still carry readable text.
 * So the band is darkened until its ink clears WCAG AA rather than trusting a
 * hand-picked pair, and mark colours are stepped until they clear 3:1 against
 * paper (the dataviz contrast check) — a chart printed in a colour nobody can
 * see against white is not a branded chart, it is a broken one.
 *
 * Pure: takes brand tokens in, returns numbers out. Nothing here reads the
 * tenant module, so the whole document renderer is testable — and previewable
 * from plain Node — against any brand.
 *
 * Colours are `[r, g, b]` 0–255 triples because that is what jsPDF's
 * setFillColor/setTextColor/setDrawColor take.
 */

/** Canonical FairWins-default brand tokens; also the fallback for a thin brand. */
const DEFAULT_TOKENS = Object.freeze({
  primary: '#36B37E',
  positive: '#2ECC71',
  negative: '#E5533D',
  warning: '#F5A623',
  neutral: '#7A8794',
})

// ---------------------------------------------------------------- colour math

/** '#rgb' | '#rrggbb' | 'rgb(r,g,b)' → [r,g,b], or null when unparseable. */
export function parseColor(value) {
  if (Array.isArray(value) && value.length === 3) return value.map((n) => clamp255(Number(n)))
  if (typeof value !== 'string') return null
  const hex = value.trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex)
  if (short) return [short[1], short[2], short[3]].map((c) => parseInt(c + c, 16))
  const long = /^#([0-9a-f]{6})$/i.exec(hex)
  if (long) {
    const n = parseInt(long[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(hex)
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])].map(clamp255)
  return null
}

function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(n) ? n : 0)))
}

export function toHex(rgb) {
  return `#${rgb.map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')}`
}

/** Linear interpolation between two colours; `t` 0 → a, 1 → b. */
export function mix(a, b, t) {
  const k = Math.max(0, Math.min(1, t))
  return [0, 1, 2].map((i) => clamp255(a[i] + (b[i] - a[i]) * k))
}

export const shade = (rgb, t) => mix(rgb, [0, 0, 0], t)
export const tint = (rgb, t) => mix(rgb, [255, 255, 255], t)

/** WCAG relative luminance. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio (1–21). */
export function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Darken `rgb` until `ink` clears `ratio` against it. Used for the header band:
 * a tenant picks a brand colour, not a *background* colour, and the difference
 * between the two is exactly this loop.
 */
function darkenUntilReadable(rgb, ink, ratio) {
  let out = rgb
  for (let i = 0; i < 24 && contrast(out, ink) < ratio; i++) out = shade(out, 0.08)
  return out
}

/**
 * Step a mark colour until it clears `ratio` against paper. A chart mark is not
 * text, so the target is the dataviz 3:1 non-text floor, not 4.5:1 — but a
 * brand primary that reads as a pastel on white has to move, or the chart is
 * decoration rather than data.
 */
function deepenForPaper(rgb, paper, ratio = 3) {
  let out = rgb
  for (let i = 0; i < 24 && contrast(out, paper) < ratio; i++) out = shade(out, 0.07)
  return out
}

/** Black or white — whichever is more readable on `bg`. */
export function readableInk(bg) {
  return contrast(bg, [255, 255, 255]) >= contrast(bg, [17, 22, 28]) ? [255, 255, 255] : [17, 22, 28]
}

// ------------------------------------------------------------------ the theme

/**
 * Build the statement palette from a tenant's brand tokens.
 *
 * @param {object} [brand]
 * @param {string} [brand.primary]  brand primary (`--brand-primary`)
 * @param {string} [brand.positive] value-in colour (`--semantic-win`)
 * @param {string} [brand.negative] value-out colour (`--semantic-loss`)
 * @param {string} [brand.warning]  attention colour (`--semantic-warning`)
 * @returns {object} frozen token set consumed by layout/charts/renderer
 */
export function statementTheme(brand = {}) {
  const primary = parseColor(brand.primary) || parseColor(DEFAULT_TOKENS.primary)
  const paper = [255, 255, 255]

  // The band anchors the page (issue #1026): a deep shade of the tenant's own
  // colour, darkened until its ink is legible rather than assumed to be.
  const bandSeed = shade(primary, 0.62)
  const bandInk = readableInk(bandSeed)
  const band = darkenUntilReadable(bandSeed, bandInk, 7)

  const ink = [22, 28, 35]
  const inkSoft = [72, 84, 96]
  const inkMuted = [122, 133, 145]

  // Money in / money out is a genuinely polar reading, so it gets a diverging
  // pair (brand-side vs. warm) with a neutral for value that is NEITHER —
  // a member moving their own assets between networks (spec 067 FR-036).
  const positive = deepenForPaper(parseColor(brand.positive) || primary, paper)
  const negative = deepenForPaper(parseColor(brand.negative) || parseColor(DEFAULT_TOKENS.negative), paper)
  const warning = deepenForPaper(parseColor(brand.warning) || parseColor(DEFAULT_TOKENS.warning), paper, 2.6)
  const neutral = parseColor(DEFAULT_TOKENS.neutral)

  const accent = deepenForPaper(primary, paper)

  return Object.freeze({
    paper,
    band,
    bandInk,
    // Deliberately not pure white: the band's secondary text is a level down,
    // and mixing toward the band keeps that hierarchy on any tenant colour.
    bandInkSoft: mix(bandInk, band, 0.32),
    bandRule: mix(bandInk, band, 0.72),

    ink,
    inkSoft,
    inkMuted,

    accent,
    accentSoft: tint(primary, 0.86),
    accentLine: tint(primary, 0.62),

    positive,
    negative,
    warning,
    neutral,
    // Row/panel washes. Kept close to paper so a dense table never turns into
    // stripes of colour — the numbers are the ink here.
    wash: tint(primary, 0.94),
    washWarn: mix(parseColor(brand.warning) || parseColor(DEFAULT_TOKENS.warning), paper, 0.9),
    zebra: [248, 249, 250],
    rule: [225, 229, 233],
    ruleStrong: [196, 203, 210],

    chart: Object.freeze({
      grid: [232, 235, 238],
      axis: [196, 203, 210],
      label: inkMuted,
    }),
  })
}

/**
 * Pull the statement's brand inputs out of a tenant manifest theme block
 * (`brand.theme.base` CSS custom properties). Missing tokens fall back to the
 * FairWins defaults — a tenant that themes nothing still gets a real statement.
 */
export function brandTokensFromTheme(themeBlock) {
  const base = themeBlock?.base || {}
  return {
    primary: base['--brand-primary'] || DEFAULT_TOKENS.primary,
    positive: base['--semantic-win'] || base['--brand-primary'] || DEFAULT_TOKENS.positive,
    negative: base['--semantic-loss'] || DEFAULT_TOKENS.negative,
    warning: base['--semantic-warning'] || DEFAULT_TOKENS.warning,
  }
}
