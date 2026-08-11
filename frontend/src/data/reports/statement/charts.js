/**
 * Vector charts drawn straight into the statement PDF (issue #1026).
 *
 * Drawn with jsPDF primitives rather than rasterizing a chart library: the
 * output stays vector (sharp at any zoom, and printable), the statement gains
 * no runtime dependency, and the charts inherit the tenant palette by
 * construction because they take the same theme the rest of the document does.
 *
 * The encoding is deliberately narrow and repeated: money IN is the brand-side
 * colour, money OUT is the warm counter-colour, and that pairing means the same
 * thing in every chart and every table on the document. One measure per axis,
 * never two — a statement is a document people reconcile, so a chart here may
 * not imply a relationship the numbers do not contain.
 *
 * Colour is never the only carrier: every chart ships a legend, its values are
 * directly labelled or read off the axis, and every figure it plots also
 * appears in a table on the same document.
 */

const LEGEND_SWATCH = 6
const HAIRLINE = 0.4

/** Compact USD for an axis tick: `1.2k`, `340`, `2.5m`. */
export function compactUsd(n) {
  const v = Math.abs(Number(n) || 0)
  if (v >= 1e9) return `${trim(v / 1e9)}b`
  if (v >= 1e6) return `${trim(v / 1e6)}m`
  if (v >= 1e3) return `${trim(v / 1e3)}k`
  if (v >= 1) return String(Math.round(v))
  return v === 0 ? '0' : v.toFixed(2)
}

function trim(n) {
  return String(Math.round(n * 10) / 10)
}

/**
 * A "nice" axis maximum and step at or above `max`. Axis ticks land on round
 * numbers or the reader has to do arithmetic to check a bar.
 */
export function niceScale(max, targetTicks = 4) {
  if (!(max > 0)) return { max: 1, step: 1 }
  const raw = max / targetTicks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  return { max: Math.ceil(max / step) * step, step }
}

function setInk(doc, rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2])
}

/** Legend row — always drawn, so identity is never carried by colour alone. */
export function drawLegend(doc, x, y, items, theme) {
  let cx = x
  doc.setFontSize(7)
  for (const item of items) {
    doc.setFillColor(item.color[0], item.color[1], item.color[2])
    doc.rect(cx, y - LEGEND_SWATCH + 1.5, LEGEND_SWATCH, LEGEND_SWATCH, 'F')
    cx += LEGEND_SWATCH + 3.5
    setInk(doc, theme.inkSoft)
    doc.text(item.label, cx, y)
    cx += doc.getTextWidth(item.label) + 12
  }
  return cx
}

/**
 * Diverging column chart of value in (up) and value out (down) per time bucket.
 *
 * Both halves are scaled in the SAME units per point — the zero line simply
 * sits wherever that shared scale puts it. Scaling each half to its own maximum
 * would make a $10 outflow look like a $10,000 inflow.
 *
 * @returns {number} y coordinate below the chart
 */
export function drawFlowChart(doc, { x, y, w, h }, flow, theme) {
  const buckets = flow.buckets || []
  const maxIn = Math.max(0, ...buckets.map((b) => b.inUsd))
  const maxOut = Math.max(0, ...buckets.map((b) => b.outUsd))
  const peak = Math.max(maxIn, maxOut)

  const legendY = y + 7
  drawLegend(
    doc,
    x,
    legendY,
    [
      { label: 'Money in', color: theme.positive },
      { label: 'Money out', color: theme.negative },
    ],
    theme,
  )

  const plotTop = legendY + 8
  const axisH = 16
  const plotH = h - (plotTop - y) - axisH
  const gutter = 34
  const plotX = x + gutter
  const plotW = w - gutter

  if (buckets.length < 2 || peak <= 0) {
    setInk(doc, theme.inkMuted)
    doc.setFontSize(8)
    doc.text(
      buckets.length < 2
        ? 'The period is too short to plot a trend; the summary figures above carry it.'
        : 'No inflow or outflow to plot for this period.',
      x,
      plotTop + plotH / 2,
    )
    return y + h
  }

  // Each half is rounded UP to a whole number of steps, and the plot height is
  // divided between them in that ratio. Every bar therefore fits inside its own
  // half by construction. Deriving the height split from the raw maxima instead
  // — and then scaling by a rounded-up axis maximum — is what let the tallest
  // bar draw straight through the axis and over the tick labels beneath it.
  const { step } = niceScale(peak)
  const upSpan = maxIn > 0 ? Math.ceil(maxIn / step) * step : 0
  const downSpan = maxOut > 0 ? Math.ceil(maxOut / step) * step : 0
  const unit = plotH / (upSpan + downSpan || 1)
  const zeroY = plotTop + upSpan * unit

  // Gridlines: solid hairlines one shade off the paper, never dashed.
  doc.setLineWidth(HAIRLINE)
  doc.setDrawColor(theme.chart.grid[0], theme.chart.grid[1], theme.chart.grid[2])
  doc.setFontSize(6.5)
  for (const [dir, span] of [[1, upSpan], [-1, downSpan]]) {
    for (let v = dir > 0 ? 0 : step; v <= span + 1e-9; v += step) {
      const gy = zeroY - dir * v * unit
      doc.line(plotX, gy, plotX + plotW, gy)
      setInk(doc, theme.chart.label)
      doc.text(`${dir < 0 && v > 0 ? '-' : ''}${compactUsd(v)}`, plotX - 4, gy + 2, { align: 'right' })
    }
  }

  // Zero baseline reads stronger than the grid — it is the reference, not a tick.
  doc.setDrawColor(theme.chart.axis[0], theme.chart.axis[1], theme.chart.axis[2])
  doc.setLineWidth(0.6)
  doc.line(plotX, zeroY, plotX + plotW, zeroY)

  const colW = plotW / buckets.length
  // Air between columns. A bar that fills 90% of its slot turns a busy period
  // into a wall of saturated colour instead of a readable series.
  const barW = Math.max(1.2, Math.min(colW * 0.55, 16))

  // Thin the tick labels by MEASURED width rather than a fixed divisor: twelve
  // month names in a half-page chart collide, and a ratio that works for days
  // has no way of knowing that.
  doc.setFontSize(6.5)
  let labelEvery = 1
  while (
    labelEvery < buckets.length &&
    Math.max(...buckets.map((b) => doc.getTextWidth(b.label))) + 4 > colW * labelEvery
  ) {
    labelEvery += 1
  }

  buckets.forEach((b, i) => {
    const cx = plotX + colW * i + colW / 2
    const bx = cx - barW / 2
    if (b.inUsd > 0) {
      const bh = Math.max(0.8, b.inUsd * unit)
      doc.setFillColor(theme.positive[0], theme.positive[1], theme.positive[2])
      roundedBar(doc, bx, zeroY - bh, barW, bh)
    }
    if (b.outUsd > 0) {
      const bh = Math.max(0.8, b.outUsd * unit)
      doc.setFillColor(theme.negative[0], theme.negative[1], theme.negative[2])
      roundedBar(doc, bx, zeroY, barW, bh)
    }
    if (i % labelEvery === 0) {
      setInk(doc, theme.chart.label)
      doc.setFontSize(6.5)
      doc.text(b.label, cx, plotTop + plotH + 8, { align: 'center' })
      // The sub-label names the unit the tick omits — but only where it CHANGES.
      // Repeating "2026" under all twelve months is noise, not orientation.
      if (b.subLabel && b.subLabel !== buckets[i - labelEvery]?.subLabel) {
        doc.text(b.subLabel, cx, plotTop + plotH + 14, { align: 'center' })
      }
    }
  })

  return y + h
}

/** Bar with a lightly rounded data end, anchored flat to the baseline. */
function roundedBar(doc, x, y, w, h) {
  if (h < 3 || w < 3) {
    doc.rect(x, y, w, h, 'F')
    return
  }
  doc.roundedRect(x, y, w, h, 1.2, 1.2, 'F')
}

/**
 * Horizontal grouped bars — money in and money out per activity type. Values
 * are direct-labelled because there are at most a handful of rows; the axis
 * would otherwise be the only way to read them.
 *
 * @returns {number} y coordinate below the chart
 */
export function drawBreakdownChart(doc, { x, y, w, h }, rows, theme) {
  const legendY = y + 7
  drawLegend(
    doc,
    x,
    legendY,
    [
      { label: 'Money in', color: theme.positive },
      { label: 'Money out', color: theme.negative },
    ],
    theme,
  )

  const top = legendY + 9
  if (!rows.length) {
    setInk(doc, theme.inkMuted)
    doc.setFontSize(8)
    doc.text('No activity to break down for this period.', x, top + 10)
    return y + h
  }

  const labelW = 72
  const valueW = 46
  const plotX = x + labelW
  // Room at the bar end for its own value label, so a full-length bar's number
  // never lands on top of the net column.
  const tipW = 30
  const plotW = Math.max(20, w - labelW - valueW - tipW)
  const peak = Math.max(...rows.map((r) => Math.max(r.inUsd, r.outUsd)), 0)
  const { max: scaleMax } = niceScale(peak, 3)

  // The net column is headed here, not on the axis: the BARS are gross in and
  // out, and captioning their scale "net" would name the axis after a figure it
  // does not plot.
  setInk(doc, theme.inkMuted)
  doc.setFontSize(6)
  doc.text('NET USD', x + w, top - 3, { align: 'right' })

  const rowH = Math.min(26, Math.max(15, (h - (top - y)) / rows.length))
  const barH = Math.min(6, rowH / 2 - 2.4)

  rows.forEach((r, i) => {
    const ry = top + rowH * i
    setInk(doc, theme.ink)
    doc.setFontSize(7.5)
    doc.text(clip(doc, r.label, labelW - 6), x, ry + rowH / 2 + 1)
    setInk(doc, theme.inkMuted)
    doc.setFontSize(6.5)
    doc.text(`${r.count} entr${r.count === 1 ? 'y' : 'ies'}`, x, ry + rowH / 2 + 9)

    // Two bars, a 2pt surface gap between them — never a stroked border. Each
    // is labelled at its tip with its own direction, so the pair survives
    // greyscale printing and colour-blind reading, where hue alone would not.
    const pairTop = ry + rowH / 2 - barH - 1
    let labelled = false
    for (const [value, color, offset, tag] of [
      [r.inUsd, theme.positive, 0, 'in'],
      [r.outUsd, theme.negative, barH + 2, 'out'],
    ]) {
      if (!(value > 0)) continue
      labelled = true
      const bw = Math.max(1, (value / (scaleMax || 1)) * plotW)
      doc.setFillColor(color[0], color[1], color[2])
      roundedBar(doc, plotX, pairTop + offset, bw, barH)
      setInk(doc, theme.inkSoft)
      doc.setFontSize(5.8)
      doc.text(`${tag} ${compactUsd(value)}`, plotX + bw + 3, pairTop + offset + barH - 0.8)
    }
    // A lane with no bars is a fact, not a rendering failure — say which fact.
    if (!labelled) {
      setInk(doc, theme.inkMuted)
      doc.setFontSize(5.8)
      doc.text('neither in nor out', plotX, ry + rowH / 2 + 1)
    }

    setInk(doc, theme.inkSoft)
    doc.setFontSize(7)
    const net = r.inUsd - r.outUsd
    doc.text(
      net === 0 ? compactUsd(0) : `${net < 0 ? '-' : '+'}${compactUsd(net)}`,
      x + w,
      ry + rowH / 2 + 2,
      { align: 'right' },
    )
  })

  // One scale rule under the bars, naming the gross quantity they encode.
  const baseY = top + rowH * rows.length + 2
  doc.setDrawColor(theme.chart.grid[0], theme.chart.grid[1], theme.chart.grid[2])
  doc.setLineWidth(HAIRLINE)
  doc.line(plotX, baseY, plotX + plotW, baseY)
  setInk(doc, theme.chart.label)
  doc.setFontSize(6.5)
  doc.text('0', plotX, baseY + 7)
  doc.text(`${compactUsd(scaleMax)} USD in / out`, plotX + plotW, baseY + 7, { align: 'right' })

  return Math.max(y + h, baseY + 12)
}

/** Truncate to fit a width, with an ellipsis — labels only, never a hash. */
function clip(doc, text, maxW) {
  if (doc.getTextWidth(text) <= maxW) return text
  let out = text
  while (out.length > 1 && doc.getTextWidth(`${out}...`) > maxW) out = out.slice(0, -1)
  return `${out}...`
}
