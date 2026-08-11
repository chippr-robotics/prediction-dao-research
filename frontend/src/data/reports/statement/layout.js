/**
 * Page furniture for the statement document (issue #1026).
 *
 * Everything that repeats — the branded masthead, the continuation header, the
 * footer stamp, section headings, figure tiles, note blocks — lives here so the
 * document renderer reads as a sequence of sections rather than a pile of
 * coordinates, and so a tenant's brand reaches every page through one code path.
 *
 * Two conventions the renderer depends on:
 *   - `ctx.y` is the live cursor; every helper returns the page it leaves you on
 *     and advances the cursor past what it drew.
 *   - `ensure(ctx, h)` is called BEFORE drawing anything with a known height, so
 *     a section never straddles a page break with its heading orphaned on the
 *     previous one.
 */

import { jsPDF } from 'jspdf'

export const PAGE = Object.freeze({
  width: 595.28, // A4 portrait, points
  height: 841.89,
  margin: 40,
  get contentWidth() {
    return this.width - this.margin * 2
  },
  bodyTop: 84, // below a continuation header
  bodyBottom: 792, // above the footer band
  /**
   * Prose runs narrower than the tables. Full-width body text at this size is
   * ~135 characters a line, well past the point where the eye loses its place
   * returning to the left edge; tables and charts keep the full measure because
   * their structure carries the eye instead.
   */
  proseWidth: 348,
})

export const FONT = Object.freeze({ sans: 'helvetica', mono: 'courier' })

/** Create the document context every helper and section takes. */
export function createContext({ theme, brand, model }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  doc.setFont(FONT.sans, 'normal')
  // Pages that already carry a header. Tables add their own pages without going
  // through newPage(), so without this a long register produced pages with no
  // masthead at all — a loose sheet of financial figures identifying nobody.
  return { doc, theme, brand, model, y: PAGE.margin, page: 1, headered: new Set([1]) }
}

/** Draw the continuation header on the current page unless it already has one. */
export function ensureHeader(ctx) {
  const page = ctx.doc.getCurrentPageInfo().pageNumber
  if (ctx.headered.has(page)) return ctx
  ctx.headered.add(page)
  drawContinuationHeader(ctx)
  return ctx
}

function fill(ctx, rgb) {
  ctx.doc.setFillColor(rgb[0], rgb[1], rgb[2])
}
function stroke(ctx, rgb) {
  ctx.doc.setDrawColor(rgb[0], rgb[1], rgb[2])
}
function ink(ctx, rgb) {
  ctx.doc.setTextColor(rgb[0], rgb[1], rgb[2])
}

/**
 * jsPDF's standard fonts are WinAnsi-encoded. A character outside that set does
 * not fail loudly — it renders as a DIFFERENT character, silently, which on a
 * financial document turns "-$2,635.50" into something that is not a number at
 * all. Every string the document draws passes through here, so a stray glyph
 * from a future copy edit degrades to its ASCII equivalent instead of
 * corrupting a figure.
 */
const GLYPH_FALLBACKS = [
  // The typographic minus and the dashes WinAnsi lacks. En dash and em dash are
  // deliberately absent: both encode, and downgrading them would flatten the
  // typography for no reason.
  [/[−‒‐‑]/g, '-'],
  [/→/g, '->'],
  [/←/g, '<-'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/…/g, '...'],
]

export function sanitize(value) {
  let out = String(value)
  for (const [pattern, replacement] of GLYPH_FALLBACKS) out = out.replace(pattern, replacement)
  return out
}

/** Sanitize a string or an array of lines, preserving the array shape. */
function sanitizeLines(value) {
  return Array.isArray(value) ? value.map(sanitize) : sanitize(value)
}

export function text(ctx, str, x, y, { size = 9, weight = 'normal', font = FONT.sans, color, align } = {}) {
  ctx.doc.setFont(font, weight)
  ctx.doc.setFontSize(size)
  ink(ctx, color || ctx.theme.ink)
  // An array MUST stay an array: jsPDF renders it as one line per element, and
  // stringifying it would join the lines with commas into a single overflowing
  // run of text.
  ctx.doc.text(sanitizeLines(str), x, y, align ? { align } : undefined)
}

/** Start a new page and lay its continuation header. */
export function newPage(ctx) {
  ctx.doc.addPage()
  ctx.page = ctx.doc.getCurrentPageInfo().pageNumber
  ensureHeader(ctx)
  ctx.y = PAGE.bodyTop
  return ctx
}

/** Break to a new page unless `h` points still fit above the footer. */
export function ensure(ctx, h) {
  if (ctx.y + h > PAGE.bodyBottom) newPage(ctx)
  return ctx
}

// ------------------------------------------------------------------- mastheads

/**
 * The branded masthead: a deep band in the tenant's own colour carrying the
 * statement's identity — who it is for, which network, which period, when it
 * was produced. Issue #1026 asks for this to anchor the page, and it is also
 * the part a tenant most wants to be theirs.
 */
export function drawMasthead(ctx, { title, subtitle, rows }) {
  const { theme, brand } = ctx
  const bandH = 132
  fill(ctx, theme.band)
  ctx.doc.rect(0, 0, PAGE.width, bandH, 'F')

  // A hairline of the live brand colour under the band: the darkened band is a
  // background, and this is where the tenant's actual colour shows.
  fill(ctx, theme.accent)
  ctx.doc.rect(0, bandH, PAGE.width, 2.5, 'F')

  const x = PAGE.margin
  text(ctx, brand.displayName, x, 44, { size: 15, weight: 'bold', color: theme.bandInk })
  if (brand.tagline) {
    text(ctx, brand.tagline, x, 58, { size: 7, color: theme.bandInkSoft })
  }

  text(ctx, title, PAGE.width - PAGE.margin, 44, {
    size: 15,
    weight: 'bold',
    color: theme.bandInk,
    align: 'right',
  })
  if (subtitle) {
    text(ctx, subtitle, PAGE.width - PAGE.margin, 58, {
      size: 7.5,
      color: theme.bandInkSoft,
      align: 'right',
    })
  }

  stroke(ctx, theme.bandRule)
  ctx.doc.setLineWidth(0.4)
  ctx.doc.line(x, 72, PAGE.width - PAGE.margin, 72)

  // Identity rows in two columns. The account address is monospaced and
  // complete — an address a member cannot check character by character is not
  // an identification (FR-006).
  const colW = PAGE.contentWidth / 2
  rows.forEach((row, i) => {
    const cx = x + (i % 2) * colW
    const cy = 90 + Math.floor(i / 2) * 22
    text(ctx, row.label, cx, cy, { size: 6.5, color: ctx.theme.bandInkSoft })
    text(ctx, row.value, cx, cy + 11, {
      size: row.mono ? 7.5 : 8.5,
      weight: row.mono ? 'normal' : 'bold',
      font: row.mono ? FONT.mono : FONT.sans,
      color: theme.bandInk,
    })
  })

  ctx.y = bandH + 26
  return ctx
}

/** Slim repeat of the statement's identity on every page after the first. */
export function drawContinuationHeader(ctx) {
  const { theme, brand, model } = ctx
  fill(ctx, theme.band)
  ctx.doc.rect(0, 0, PAGE.width, 46, 'F')
  fill(ctx, theme.accent)
  ctx.doc.rect(0, 46, PAGE.width, 1.5, 'F')

  text(ctx, brand.displayName, PAGE.margin, 22, { size: 9.5, weight: 'bold', color: theme.bandInk })
  // Name the section as well as the document: a page separated from the stack
  // has to say what it is, not just who it belongs to.
  const where = ctx.section ? `${model.title} — ${ctx.section} (continued)` : model.title
  text(ctx, where, PAGE.margin, 34, { size: 7, color: theme.bandInkSoft })
  // The network belongs on EVERY page, not just the first: a testnet page
  // detached from the stack, showing dollar figures and naming no network, is
  // indistinguishable from a mainnet statement.
  text(
    ctx,
    `${model.period.label}  ·  ${model.networkName}${model.isTestnet ? ' · TESTNET' : ''}`,
    PAGE.width - PAGE.margin,
    22,
    { size: 8, weight: 'bold', color: theme.bandInk, align: 'right' },
  )
  // The account is the identifying field on the page; it is never the faintest
  // thing on it.
  text(ctx, shortAccount(model.account), PAGE.width - PAGE.margin, 34, {
    size: 7,
    font: FONT.mono,
    color: theme.bandInk,
    align: 'right',
  })
  return ctx
}

/**
 * Footer stamped on every page once the page count is known. Carries the
 * tenant's own support and legal identity, because on a statement the footer is
 * where a member looks to find out who to ask.
 */
export function stampFooters(ctx, { note }) {
  const { doc, theme, brand, model } = ctx
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    stroke(ctx, theme.rule)
    doc.setLineWidth(0.4)
    doc.line(PAGE.margin, PAGE.bodyBottom + 8, PAGE.width - PAGE.margin, PAGE.bodyBottom + 8)

    const left = [brand.copyrightNotice, brand.appUrl, brand.supportEmail].filter(Boolean).join('  ·  ')
    text(ctx, left, PAGE.margin, PAGE.bodyBottom + 20, { size: 6.5, color: theme.inkMuted })
    if (note) text(ctx, note, PAGE.margin, PAGE.bodyBottom + 29, { size: 6.5, color: theme.inkMuted })
    text(ctx, `Page ${p} of ${total}`, PAGE.width - PAGE.margin, PAGE.bodyBottom + 20, {
      size: 6.5,
      weight: 'bold',
      color: theme.inkSoft,
      align: 'right',
    })
    text(ctx, model.period.label, PAGE.width - PAGE.margin, PAGE.bodyBottom + 29, {
      size: 6.5,
      color: theme.inkMuted,
      align: 'right',
    })
  }
  doc.setPage(total)
  return ctx
}

// -------------------------------------------------------------------- sections

/** Section heading: a brand tick, the title, and an optional standfirst. */
export function sectionHeading(ctx, title, standfirst, { needs = 0 } = {}) {
  // Space BEFORE a heading has to beat the space after it, or the heading reads
  // as a label attached to the paragraph above rather than the start of what
  // follows. Never at the top of a fresh page, where it would be a dent.
  if (ctx.y > PAGE.bodyTop + 4) ctx.y += 12
  // `needs` reserves the heading AND enough of what follows it. Reserving only
  // the heading is what stranded "Movement by asset" and its standfirst at the
  // foot of a page with the table overleaf.
  ensure(ctx, Math.max(standfirst ? 52 : 40, needs))
  ctx.section = title
  const { theme } = ctx
  fill(ctx, theme.accent)
  ctx.doc.rect(PAGE.margin, ctx.y - 8, 2.5, 11, 'F')
  text(ctx, title, PAGE.margin + 9, ctx.y, { size: 10.5, weight: 'bold' })
  ctx.y += standfirst ? 12 : 16
  if (standfirst) {
    // splitTextToSize measures with the font that is CURRENTLY set, not the one
    // the text will be drawn in. Setting it first is the difference between
    // wrapping at the right width and wrapping at the heading's size.
    ctx.doc.setFont(FONT.sans, 'normal')
    ctx.doc.setFontSize(7.5)
    const lines = ctx.doc.splitTextToSize(standfirst, PAGE.proseWidth)
    text(ctx, lines, PAGE.margin + 9, ctx.y, { size: 7.5, color: ctx.theme.inkSoft })
    ctx.y += 9 * lines.length + 8
  }
  return ctx
}

/**
 * A row of figure tiles. `emphasis: true` gives the tile the brand rule and a
 * larger figure — used for the one number the statement is about.
 */
export function statTiles(ctx, tiles, { height = 58 } = {}) {
  ensure(ctx, height + 8)
  const { theme } = ctx
  const gap = 8
  const w = (PAGE.contentWidth - gap * (tiles.length - 1)) / tiles.length
  tiles.forEach((tile, i) => {
    const x = PAGE.margin + i * (w + gap)
    fill(ctx, tile.emphasis ? theme.accentSoft : theme.zebra)
    ctx.doc.roundedRect(x, ctx.y, w, height, 3, 3, 'F')
    if (tile.emphasis) {
      fill(ctx, theme.accent)
      ctx.doc.rect(x, ctx.y, 2.5, height, 'F')
    }
    const px = x + (tile.emphasis ? 11 : 9)
    text(ctx, tile.label, px, ctx.y + 15, { size: 6.5, color: theme.inkMuted })
    text(ctx, tile.value, px, ctx.y + 34, {
      size: tile.emphasis ? 15 : 13,
      weight: 'bold',
      color: tile.color || theme.ink,
    })
    if (tile.sub) {
      // Measure at the size it will be drawn at (see sectionHeading).
      ctx.doc.setFont(FONT.sans, 'normal')
      ctx.doc.setFontSize(6.5)
      const lines = ctx.doc.splitTextToSize(tile.sub, w - 18)
      text(ctx, lines.slice(0, 2), px, ctx.y + 46, { size: 6.5, color: theme.inkSoft })
    }
  })
  ctx.y += height + 14
  return ctx
}

/**
 * A note the reader is meant to act on. `tone: 'warn'` is for the disclosures
 * that change how a figure should be read — excluded failures, unread classes,
 * a scope that hides activity.
 */
export function noteBlock(ctx, body, { tone = 'info', title } = {}) {
  const { theme } = ctx
  const accent = tone === 'warn' ? theme.warning : theme.accent
  const bg = tone === 'warn' ? theme.washWarn : theme.wash
  const inner = Math.min(PAGE.proseWidth, PAGE.contentWidth - 20)
  ctx.doc.setFont(FONT.sans, 'normal')
  ctx.doc.setFontSize(7.5)
  const lines = ctx.doc.splitTextToSize(body, inner)
  const h = 10 + (title ? 11 : 0) + lines.length * 9.5 + 8
  ensure(ctx, h + 6)

  fill(ctx, bg)
  ctx.doc.roundedRect(PAGE.margin, ctx.y, PAGE.contentWidth, h, 2.5, 2.5, 'F')
  fill(ctx, accent)
  ctx.doc.rect(PAGE.margin, ctx.y, 2.5, h, 'F')

  let ty = ctx.y + 14
  if (title) {
    text(ctx, title, PAGE.margin + 11, ty, { size: 7.5, weight: 'bold' })
    ty += 11
  }
  text(ctx, lines, PAGE.margin + 11, ty, { size: 7.5, color: ctx.theme.inkSoft })
  ctx.y += h + 10
  return ctx
}

/**
 * Height a note block or a fine-print paragraph WILL take, without drawing it.
 * Lets a caller reserve a whole section up front so it is never split across a
 * page — the notes are the part of a statement that must arrive intact.
 */
export function measureNote(ctx, body, { title } = {}) {
  ctx.doc.setFont(FONT.sans, 'normal')
  ctx.doc.setFontSize(7.5)
  const inner = Math.min(PAGE.proseWidth, PAGE.contentWidth - 20)
  const lines = ctx.doc.splitTextToSize(body, inner)
  return 10 + (title ? 11 : 0) + lines.length * 9.5 + 8 + 10
}

export function measureFineprint(ctx, body) {
  ctx.doc.setFont(FONT.sans, 'normal')
  ctx.doc.setFontSize(6.8)
  return ctx.doc.splitTextToSize(body, PAGE.proseWidth).length * 8.5 + 6
}

/** Small-print paragraph (valuation basis, disclaimer). */
export function fineprint(ctx, body) {
  ctx.doc.setFont(FONT.sans, 'normal')
  ctx.doc.setFontSize(6.8)
  const lines = ctx.doc.splitTextToSize(body, PAGE.proseWidth)
  ensure(ctx, lines.length * 8.5 + 6)
  text(ctx, lines, PAGE.margin, ctx.y, { size: 6.8, color: ctx.theme.inkMuted })
  ctx.y += lines.length * 8.5 + 6
  return ctx
}

/** `0x1234…abcd` — for the running header only; never for a value on the page. */
export function shortAccount(address) {
  const a = String(address || '')
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}
