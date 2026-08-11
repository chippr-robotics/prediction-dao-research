/**
 * The statement document (issue #1026).
 *
 * A member-facing account statement for digital assets: branded masthead, the
 * period's figures as tiles, two charts, the balances and activity tables, a
 * transaction register carrying complete transaction hashes, failed operations
 * kept visibly apart, and the disclosures at the end.
 *
 * The document's job is to be *reconcilable*. Everything it draws, it also
 * tabulates; every figure it cannot substantiate it names instead of rounding
 * away; and anything the member's own choices removed — a narrower statement
 * type, a section switched off — is disclosed on the page rather than left for
 * the reader to notice. A statement that quietly under-reports is worse than no
 * statement at all, so each of those cases has an explicit note below.
 *
 * Brand comes in as tokens (see ./theme.js), so a tenant re-skins this by
 * editing its manifest — no renderer change, and the legibility of the result
 * is derived rather than trusted.
 */

import autoTable from 'jspdf-autotable'
import {
  buildStatementModel,
  formatAmount,
  formatTokenAmount,
  formatDate,
  formatDateTime,
  formatList,
  splitHash,
  formatUsd,
  formatUsdSigned,
} from './model'
import { drawBreakdownChart, drawFlowChart } from './charts'
import {
  createContext,
  ensure,
  fineprint,
  FONT,
  noteBlock,
  PAGE,
  sectionHeading,
  ensureHeader,
  measureFineprint,
  measureNote,
  sanitize,
  stampFooters,
  statTiles,
  text,
  drawMasthead,
} from './layout'
import { STATEMENT_SECTIONS } from './reportTypes'
import { formatPlatformFee, PLATFORM_FEE_STATUS } from '../activityClassification'

/**
 * Every table on the document goes through here, so they read as one system and
 * so three things that are easy to get wrong are got right once:
 *
 *  - table content is SANITIZED like everything else on the page. autoTable
 *    writes its own cells, bypassing the layout text helper, and a bare '-'
 *    (U+2212) in a cell renders as a quote mark — silently turning a negative
 *    figure into nonsense.
 *  - a page the TABLE created still gets the statement's header. autoTable
 *    breaks pages itself, and those pages would otherwise carry no identity.
 *  - a row is never split across a page break. Half a register row on each side
 *    of a break reads as two different entries.
 */
function statementTable(ctx, config) {
  const { theme } = ctx
  const compact = config.compact === true
  const callerDidParseCell = config.didParseCell
  // Columns whose VALUES are numbers. Their headings are right-aligned with
  // them: a left-aligned heading floating above a right-aligned column of
  // figures is the loudest tell of a table nobody typeset.
  const numeric = new Set(config.numeric || [])
  const { compact: _compact, numeric: _numeric, ...rest } = config

  autoTable(ctx.doc, {
    margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.bodyTop, bottom: PAGE.height - PAGE.bodyBottom },
    styles: {
      font: FONT.sans,
      fontSize: compact ? 6.6 : 7.4,
      cellPadding: compact ? { top: 3.5, right: 4, bottom: 3.5, left: 4 } : 5,
      textColor: theme.ink,
      lineColor: theme.rule,
      lineWidth: { top: 0, right: 0, bottom: 0.4, left: 0 },
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: theme.band,
      textColor: theme.bandInk,
      fontSize: compact ? 6.2 : 6.8,
      fontStyle: 'bold',
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: theme.zebra },
    // The table repeats its own header on every page it spills onto — a column
    // of numbers with no heading is unreadable on page four.
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    ...rest,
    didParseCell: (data) => {
      data.cell.text = Array.isArray(data.cell.text)
        ? data.cell.text.map(sanitize)
        : [sanitize(data.cell.text)]
      if (data.section === 'head' && numeric.has(data.column.index)) data.cell.styles.halign = 'right'
      callerDidParseCell?.(data)
    },
    didDrawPage: () => {
      ensureHeader(ctx)
      config.didDrawPage?.()
    },
  })
  return ctx
}

/**
 * Heading, standfirst, table header and two rows. A section reserved for less
 * than this puts its heading on one page and its content on the next.
 */
const TABLE_MIN_SPACE = 132

function afterTable(ctx, gap = 16) {
  ctx.y = (ctx.doc.lastAutoTable?.finalY ?? ctx.y) + gap
  ctx.page = ctx.doc.getNumberOfPages()
  return ctx
}

// ------------------------------------------------------------------- sections

function renderSummary(ctx) {
  const { model, theme } = ctx
  const s = model.summary

  sectionHeading(
    ctx,
    'Statement summary',
    `Recorded activity for ${model.period.label} on ${model.networkName}` +
      `${model.scopeClasses ? ', within this statement\u2019s activity types' : ''}.`,
  )

  statTiles(ctx, [
    {
      label: 'MONEY IN',
      value: formatUsd(s.moneyIn),
      color: theme.positive,
      sub: 'Payouts and receipts',
    },
    {
      label: 'MONEY OUT',
      value: formatUsd(s.moneyOut),
      color: theme.negative,
      sub: 'Stakes and payments',
    },
    {
      label: 'NET CHANGE',
      value: formatUsdSigned(s.net),
      color: s.net < 0 ? theme.negative : theme.positive,
      sub: 'Money in less money out',
      emphasis: true,
    },
    {
      label: 'ENTRIES',
      value: String(s.entryCount),
      // "22 / 1 failed" reads as "22 of which 1 failed". It is 22 plus 1.
      sub: [
        s.pendingCount ? `${s.pendingCount} pending, included` : null,
        s.failedCount ? `${s.failedCount} failed, excluded (${s.recordedCount} recorded)` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'All confirmed',
    },
  ], { height: 62 })

  // A statement is a cash-flow record of one period, not a balance sheet. Saying
  // so in one line is the difference between a member reading "net change" and
  // reading it as a closing balance.
  fineprint(
    ctx,
    'Net change is the movement across this period only. It is not an account balance: ' +
      `${ctx.brand.displayName} is self-custody, so your holdings live in your own wallet and are ` +
      'not restated here. Money in and money out are the value of the transfers themselves — network ' +
      'fees and platform fees are reported separately below and are not netted into these figures.',
  )
  return ctx
}

function renderFees(ctx) {
  const { model, theme } = ctx
  const s = model.summary
  const bridgesInScope = !model.scopeClasses || model.scopeClasses.includes('bridge')
  const scoped = Boolean(model.scopeClasses)

  // Reserve the tiles AND the notes that explain them. Measured after the fact
  // the callout was widowed onto the next page, where it read as a preamble to
  // whatever section happened to follow it.
  const feeNote = s.platformFeeUnknownCount
    ? `${s.platformFeeUnknownCount} entr${s.platformFeeUnknownCount === 1 ? 'y carries' : 'ies carry'} a platform fee ` +
      'that could not be valued in USD. Those fees are shown as “unknown” in the register and are NOT included in ' +
      'the platform fee total above — the total is therefore a lower bound, not a complete figure.'
    : null
  const needs = 76 + (feeNote ? measureNote(ctx, feeNote, { title: 'x' }) : 0)

  sectionHeading(
    ctx,
    'Fees and cross-network movement',
    scoped
      ? 'Figures below cover only the activity types this statement includes.'
      : undefined,
    { needs },
  )

  const tiles = [
    {
      label: 'NETWORK FEES PAID',
      value: `${formatAmount(s.networkFees)} ${s.networkFeeSymbol}`.trim(),
      sub: s.networkFeesFailed
        ? `Includes ${formatAmount(s.networkFeesFailed)} ${s.networkFeeSymbol} on failed operations`.trim()
        : scoped
          ? 'Gas on the transactions covered here'
          : 'Gas on your transactions',
    },
    {
      label: 'PLATFORM FEES CHARGED',
      value: formatUsd(s.platformFeesUsd),
      sub: s.platformFeeUnknownCount
        ? `${s.platformFeeUnknownCount} not valued in USD, shown as unknown`
        : scoped
          ? 'On the activity this statement covers'
          : 'Charged by the platform',
    },
    // A scoped statement CANNOT say "no bridges this period" — it does not know.
    // Reporting an out-of-scope class as $0.00 states a fact about the account
    // that the document has deliberately not looked at.
    bridgesInScope
      ? {
          label: 'MOVED BETWEEN YOUR NETWORKS',
          value: formatUsd(s.movedUsd),
          color: theme.inkSoft,
          sub: s.movedCount
            ? `${s.movedCount} bridge${s.movedCount === 1 ? '' : 's'}, not income or disposal`
            : 'No bridges in this period',
        }
      : {
          label: 'MOVED BETWEEN YOUR NETWORKS',
          value: 'Not covered',
          color: theme.inkMuted,
          sub: 'Bridges are outside this statement\u2019s scope',
        },
  ]
  statTiles(ctx, tiles, { height: 62 })

  // Value that is neither a receipt nor a payment and is NOT a bridge — an
  // unstake request, say. It has to be named, because it is in the entry count
  // and in no other figure on the page.
  if (s.neutralOtherCount > 0) {
    fineprint(
      ctx,
      `A further ${s.neutralOtherCount} entr${s.neutralOtherCount === 1 ? 'y records' : 'ies record'} ` +
        `${formatUsd(s.neutralOtherUsd)} of value that moved neither in nor out — for example a staking unstake ` +
        'request, which changes what an asset is doing without paying you or charging you. It is excluded from ' +
        'money in, money out, net change and both charts.' +
        (s.neutralOtherUnvalued
          ? ` ${s.neutralOtherUnvalued} of those entries could not be valued in USD and ` +
            `contribute${s.neutralOtherUnvalued === 1 ? 's' : ''} nothing to that figure.`
          : ''),
    )
  }

  if (feeNote) noteBlock(ctx, feeNote, { tone: 'info', title: 'Platform fees not fully valued' })
  return ctx
}

function renderCharts(ctx) {
  const { model, theme } = ctx
  const chartW = (PAGE.contentWidth - 18) / 2
  const chartH = 168

  sectionHeading(ctx, 'Activity at a glance')
  ensure(ctx, chartH + 30)

  const top = ctx.y
  text(ctx, 'Flow over the period', PAGE.margin, top, { size: 8, weight: 'bold' })
  text(ctx, 'Money in and out per activity type', PAGE.margin + chartW + 18, top, { size: 8, weight: 'bold' })
  // The unit belongs in the subtitle, not on the axis rule (see charts.js).
  text(ctx, 'USD, gross in and out', PAGE.margin + chartW + 18, top + 9, { size: 6.5, color: theme.inkMuted })

  text(ctx, 'USD in and out per day', PAGE.margin, top + 9, { size: 6.5, color: theme.inkMuted })

  const flowBottom = drawFlowChart(ctx.doc, { x: PAGE.margin, y: top + 14, w: chartW, h: chartH }, model.flow, theme)
  const breakdownBottom = drawBreakdownChart(
    ctx.doc,
    { x: PAGE.margin + chartW + 18, y: top + 14, w: chartW, h: chartH },
    model.activity.chartRows,
    theme,
  )
  // Whichever chart ran longer sets the floor — a chart that grew with its row
  // count must not be written over by the text below it.
  ctx.y = Math.max(flowBottom, breakdownBottom) + 16

  const caveats = []
  if (model.flow.undated > 0) {
    caveats.push(
      `${model.flow.undated} entr${model.flow.undated === 1 ? 'y has' : 'ies have'} no usable date and cannot be ` +
        `placed on the timeline. ${model.flow.undated === 1 ? 'It is' : 'They are'} in the totals and the ` +
        `register, but not in the chart on the left, and ${model.flow.undated === 1 ? 'its' : 'their'} ` +
        'membership of this period cannot be confirmed against the public record.',
    )
  }
  if (model.activity.folded > 0) {
    caveats.push(
      `The ${model.activity.folded} smallest activity types are grouped as “Other” in the chart; each is listed ` +
        'separately in the activity breakdown table.',
    )
  }
  if (model.summary.movedCount > 0) {
    caveats.push(
      'Value moved between your own networks is absent from both charts: it is neither money in nor money out.',
    )
  }
  if (caveats.length) fineprint(ctx, caveats.join(' '))
  return ctx
}

function renderTokens(ctx) {
  const { model, theme } = ctx
  if (!model.tokens.length) return ctx
  sectionHeading(
    ctx,
    'Movement by asset',
    'What came in and what went out, per asset. Net is money in less money out — it is the movement across ' +
      'the period, not a holding.',
    { needs: TABLE_MIN_SPACE },
  )

  // Bridged and merely-neutral are different claims about a member's money and
  // never share a column: one says "you moved this between your own networks",
  // the other says "this changed state without paying you".
  const hasBridged = model.tokens.some((t) => t.movedAmount)
  const hasNeutral = model.tokens.some((t) => t.neutralAmount)
  const head = ['Asset', 'Entries', 'In', 'Out', 'Net', 'Net (USD)']
  if (hasBridged) head.push('Bridged')
  if (hasNeutral) head.push('Neither in nor out')

  const body = model.tokens.map((t) => {
    const row = [
      t.ticker,
      String(t.count),
      t.inAmount ? formatTokenAmount(t.inAmount, t.decimals) : '-',
      t.outAmount ? formatTokenAmount(t.outAmount, t.decimals) : '-',
      `${t.netAmount > 0 ? '+' : ''}${formatTokenAmount(t.netAmount, t.decimals)}`,
      formatUsdSigned(t.netUsd),
    ]
    if (hasBridged) row.push(t.movedAmount ? formatTokenAmount(t.movedAmount, t.decimals) : '-')
    if (hasNeutral) row.push(t.neutralAmount ? formatTokenAmount(t.neutralAmount, t.decimals) : '-')
    return row
  })

  statementTable(ctx, {
    numeric: [1, 2, 3, 4, 5, 6, 7],
    startY: ctx.y,
    head: [head],
    body,
    // Fixed widths, and the table wraps to their sum. Left to stretch, a
    // one-row variant distributed all its slack between the figures and opened
    // gulfs inside the data.
    tableWidth: 'wrap',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 62 },
      1: { halign: 'right', cellWidth: 36 },
      2: { halign: 'right', cellWidth: 64, textColor: theme.positive },
      3: { halign: 'right', cellWidth: 64, textColor: theme.negative },
      4: { halign: 'right', cellWidth: 70, fontStyle: 'bold' },
      5: { halign: 'right', cellWidth: 74, fontStyle: 'bold' },
      6: { halign: 'right', cellWidth: 66, textColor: theme.inkMuted },
      7: { halign: 'right', cellWidth: 66, textColor: theme.inkMuted },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const row = model.tokens[data.row.index]
      if (!row) return
      // Net carries the same in/out colour language as the charts.
      if (data.column.index === 4 || data.column.index === 5) {
        const v = data.column.index === 4 ? row.netAmount : row.netUsd
        if (v !== 0) data.cell.styles.textColor = v < 0 ? theme.negative : theme.positive
      }
    },
  })
  afterTable(ctx, 8)

  const unvalued = model.tokens.filter((t) => t.unvalued)
  const unvaluedTotal = unvalued.reduce((n, t) => n + t.unvalued, 0)
  if (unvalued.length) {
    fineprint(
      ctx,
      `${unvaluedTotal} entr${unvaluedTotal === 1 ? 'y' : 'ies'} in this table (${unvalued
        .map((t) => t.ticker)
        .join(', ')}) had no available USD basis. Their asset amounts are included in full; they contribute ` +
        'nothing to Net (USD), so that column is a lower bound on the value moved, not a complete figure.',
    )
  }
  return ctx
}

function renderActivity(ctx) {
  const { model, theme } = ctx
  const rows = model.activity.rows
  if (!rows.length) return ctx
  sectionHeading(ctx, 'Activity breakdown', 'Every activity type in scope, largest first.', { needs: TABLE_MIN_SPACE })

  statementTable(ctx, {
    numeric: [1, 2, 3, 4, 5, 6, 7],
    startY: ctx.y,
    head: [['Activity type', 'Entries', 'Money in', 'Money out', 'Net', 'Bridged', 'Neither in nor out', 'Platform fees']],
    body: rows.map((r) => [
      r.label,
      String(r.count),
      formatUsd(r.inUsd),
      formatUsd(r.outUsd),
      formatUsdSigned(r.inUsd - r.outUsd),
      r.movedUsd ? formatUsd(r.movedUsd) : '-',
      // Same rule as the fee cell below: a dash reads as zero, and "could not
      // be valued" is a different claim from "there was none".
      unvaluedCell(r.neutralUsd, r.neutralUnvalued),
      // A fee nobody reported is not a fee of zero, and a dash reads as zero.
      platformFeeCell(r),
    ]),
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 82 },
      1: { halign: 'right', cellWidth: 38 },
      2: { halign: 'right', textColor: theme.positive },
      3: { halign: 'right', textColor: theme.negative },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right', textColor: theme.inkMuted },
      6: { halign: 'right', textColor: theme.inkMuted },
      7: { halign: 'right' },
    },
  })
  return afterTable(ctx)
}

/**
 * A USD figure some entries could not contribute to. `$0.00` beside an unvalued
 * entry claims nothing moved; a dash claims the same thing more quietly. Both
 * are wrong when the truth is "we could not value it".
 */
function unvaluedCell(usd, unvaluedCount) {
  if (!usd && !unvaluedCount) return '-'
  if (!usd) return `${unvaluedCount} unvalued`
  return unvaluedCount ? `${formatUsd(usd)} + ${unvaluedCount} unvalued` : formatUsd(usd)
}

/**
 * Platform fee for one activity row. An UNKNOWN fee is named: rendered as the
 * same dash used for "no fee", it would tell a member they were charged nothing
 * when the truth is that nobody recorded what they were charged.
 */
function platformFeeCell(row) {
  const unknown = row.platformFeeUnknownCount
  if (!row.platformFeesUsd && !unknown) return '-'
  if (!row.platformFeesUsd) return `${unknown} unknown`
  return unknown ? `${formatUsd(row.platformFeesUsd)} + ${unknown} unknown` : formatUsd(row.platformFeesUsd)
}

/** Direction glyph + colour for a register amount. */
function amountFacts(item, theme) {
  const vd = item.valueDirection ?? null
  // No sign at all, in neutral ink. The '±' it used to carry reads as a
  // measurement tolerance to a banking audience, and being neither green nor
  // red it looked like a rendering fallback rather than a decision.
  if (vd === 'none') return { sign: '', color: theme.inkMuted }
  const inward = vd != null ? vd === 'in' : item.direction === 'payout' || item.direction === 'refund'
  return inward ? { sign: '+', color: theme.positive } : { sign: '-', color: theme.negative }
}

/** The reference block for one entry — complete hashes, never truncated (FR-006). */
function referenceCell(item) {
  const lines = []
  if (item.txHash) lines.push(splitHash(item.txHash))
  if (item.destinationTxHash) {
    lines.push(`on ${item.destinationNetworkName || 'destination network'}:`, splitHash(item.destinationTxHash))
  }
  if (!lines.length) lines.push(item.entryId ? `no transaction · ${item.entryId}` : 'no transaction reference')
  return lines.join('\n')
}

function describeEntry(item) {
  const parts = []
  if (item.kind) parts.push(String(item.kind).replace(/_/g, ' '))
  if (item.wagerId) parts.push(`wager ${item.wagerId}`)
  const counterparty = item.selfTransfer ? item.toAddress : item.valueDirection === 'in' ? item.fromAddress : item.toAddress
  if (counterparty) parts.push(`${item.selfTransfer ? 'to' : item.valueDirection === 'in' ? 'from' : 'to'} ${counterparty}`)
  if (item.status && item.status !== 'settled') parts.push(`status: ${item.status}`)
  const fee = formatPlatformFee(item.platformFee)
  if (fee && fee !== 'none') parts.push(`platform fee ${fee}`)
  return parts.join('\n')
}

function renderRegister(ctx) {
  const { model, theme } = ctx
  if (!model.settled.length) return ctx
  sectionHeading(
    ctx,
    'Transaction register',
    'Every recorded entry in scope, in date order. Transaction hashes are printed in full so each line can be ' +
      'checked against the public record.',
    { needs: TABLE_MIN_SPACE },
  )

  statementTable(ctx, {
    compact: true,
    startY: ctx.y,
    numeric: [4, 5],
    head: [['Date (UTC)', 'Activity', 'Details', 'Reference', 'Amount', 'Value (USD)']],
    body: model.settled.map((it) => [
      // A dash in the ordinary date style. Set bold amber it was the only
      // colour in the column and read as an error stamp on a row that is
      // perfectly valid and fully counted; the caption explains the dash.
      it.timestamp == null ? '—' : formatDate(it.timestamp),
      it.classLabel || it.class || 'Activity',
      describeEntry(it),
      referenceCell(it),
      `${amountFacts(it, theme).sign}${formatTokenAmount(it.amountNumber, model.amountDecimals[it.tokenTicker] ?? 2)} ${it.tokenTicker || ''}`.trim(),
      it.valuationStatus === 'unvalued'
        ? 'unvalued'
        : `${amountFacts(it, theme).sign}${formatUsd(it.usdValue)}`,
    ]),
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 46, fontStyle: 'bold' },
      2: { cellWidth: 108 },
      // A 66-character hash needs the room to break cleanly in two; starved of
      // it, it ragged into four lines and doubled the row height.
      // Large enough and dark enough to read off paper. At 5.4pt in muted grey
      // the hashes did not survive a monochrome print, which broke the caption's
      // promise that each line can be checked against the public record.
      3: { cellWidth: 156, font: FONT.mono, fontSize: 6.2, textColor: theme.inkSoft },
      4: { cellWidth: 88, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 71, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const item = model.settled[data.row.index]
      if (!item) return
      if (data.column.index === 4) data.cell.styles.textColor = amountFacts(item, theme).color
      if (data.column.index === 0 && item.timestamp == null) data.cell.styles.textColor = theme.inkMuted
      if (data.column.index === 5 && item.valuationStatus === 'unvalued') {
        data.cell.styles.textColor = theme.warning
      }
    },
  })
  return afterTable(ctx)
}

/**
 * Failed operations, on their own page section with their own colouring — the
 * acceptance scenario this issue is most specific about. They are listed
 * because they happened, and separated because they moved nothing.
 */
function renderFailed(ctx) {
  const { model, theme } = ctx
  if (!model.failed.length) return ctx
  sectionHeading(ctx, 'Failed operations', undefined, { needs: TABLE_MIN_SPACE })
  noteBlock(
    ctx,
    `${model.failed.length} operation${model.failed.length === 1 ? '' : 's'} did not complete. ` +
      `${model.failed.length === 1 ? 'It moved' : 'They moved'} no value, and ` +
      `${model.failed.length === 1 ? 'it contributes' : 'none of them contribute'} to any total or chart on ` +
      'this statement. A transaction that reverts still consumes gas, so the network fee it cost IS included ' +
      'in network fees paid. They are listed here so the record of the period is complete.',
    { tone: 'info', title: 'Excluded from every total on this statement' },
  )

  statementTable(ctx, {
    compact: true,
    startY: ctx.y,
    numeric: [4],
    head: [['Date (UTC)', 'Activity', 'Details', 'Reason', 'Attempted amount']],
    body: model.failed.map((it) => [
      it.timestamp == null ? '—' : formatDate(it.timestamp),
      it.classLabel || it.class || 'Activity',
      describeEntry(it),
      it.failureReason || 'Not recorded',
      `${formatTokenAmount(it.amountNumber, model.amountDecimals[it.tokenTicker] ?? 2)} ${it.tokenTicker || ''}`.trim(),
    ]),
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 54, fontStyle: 'bold' },
      2: { cellWidth: 156 },
      3: { cellWidth: 156, textColor: theme.negative },
      4: { cellWidth: 84, halign: 'right', textColor: theme.inkMuted },
    },
    bodyStyles: { fillColor: theme.washWarn },
    alternateRowStyles: { fillColor: theme.washWarn },
  })
  return afterTable(ctx)
}

/**
 * Everything the figures above depend on being read correctly.
 *
 * Reserved and drawn as ONE block. Letting it flow meant the disclaimer could
 * land alone on a final page under no heading, which reads as a printing fault
 * and separates a caveat from the figures it qualifies — the one part of a
 * statement that must arrive intact.
 */
function renderDisclosures(ctx) {
  const { model } = ctx

  // The scope and stale-data notes are deliberately absent: both are printed
  // directly under the masthead, above the figures they qualify.
  const notes = []
  const omitted = describeOmittedSections(model)
  if (omitted) notes.push([omitted, { tone: 'warn', title: 'Sections you chose to leave out' }])

  if (model.prunedBefore != null) {
    notes.push([
      `Device-held records before ${formatDateTime(model.prunedBefore)} were pruned from this device. On-chain ` +
        'activity remains recoverable from the network; records that only ever existed on this device do not.',
      { tone: 'warn', title: 'Local retention' },
    ])
  }

  if (model.summary.unvaluedCount > 0) {
    notes.push([
      `${model.summary.unvaluedCount} entr${model.summary.unvaluedCount === 1 ? 'y is' : 'ies are'} marked “unvalued”: ` +
        'the amount moved is known, but no USD basis was available to value it. Those entries contribute nothing ' +
        'to any USD figure on this statement, so every USD total here is a lower bound on the value that actually ' +
        'moved — it is not a claim that the value was zero.',
      { tone: 'warn', title: 'Entries without a USD value' },
    ])
  }

  const small = [model.selfTransferNote, model.valuationNote, model.disclaimer].filter(Boolean)
  const needed =
    40 +
    notes.reduce((h, [body, opts]) => h + measureNote(ctx, body, opts), 0) +
    small.reduce((h, body) => h + measureFineprint(ctx, body), 0)
  ensure(ctx, needed)

  sectionHeading(ctx, 'Notes and disclosures')
  for (const [body, opts] of notes) noteBlock(ctx, body, opts)
  for (const note of small) fineprint(ctx, note)
  return ctx
}

function describeOmittedSections(model) {
  const labels = {
    [STATEMENT_SECTIONS.SUMMARY]: 'the statement summary',
    [STATEMENT_SECTIONS.CHARTS]: 'the charts',
    [STATEMENT_SECTIONS.BY_TOKEN]: 'movement by asset',
    [STATEMENT_SECTIONS.BY_ACTIVITY]: 'the activity breakdown',
    [STATEMENT_SECTIONS.REGISTER]: 'the transaction register',
    [STATEMENT_SECTIONS.FEES]: 'fees and cross-network movement',
    [STATEMENT_SECTIONS.FAILED]: 'failed operations',
  }
  const off = Object.entries(model.sections)
    .filter(([, on]) => !on)
    .map(([id]) => labels[id])
    .filter(Boolean)
  if (!off.length) return null
  return (
    `This statement was generated without ${off.join(', ')}. The figures shown are unchanged — the omitted ` +
    'sections are detail, not value — but a reader cannot check them from this document alone. Regenerate with ' +
    'every section included, or export the CSV, for the complete record.'
  )
}

// ---------------------------------------------------------------------- entry

/**
 * Render an ActivityReport as a branded statement PDF.
 *
 * @param {object} report ActivityReport from buildReport
 * @param {object} [options]
 * @param {object} options.brand   tenant brand identity (displayName, tagline, appUrl, …)
 * @param {object} options.theme   statement theme tokens (see ./theme.js)
 * @param {string} [options.type]  statement type id (see ./reportTypes.js)
 * @param {string[]} [options.classes] explicit class scope
 * @param {object} [options.sections]  section toggles
 * @returns {Blob} application/pdf
 */
export function renderStatement(report, options = {}) {
  const model = buildStatementModel(report, options)
  const theme = options.theme
  const brand = options.brand
  const ctx = createContext({ theme, brand, model })

  drawMasthead(ctx, {
    title: model.title,
    subtitle: model.period.label,
    rows: [
      { label: 'ACCOUNT', value: model.account, mono: true },
      {
        label: 'NETWORK',
        value: `${model.networkName}${model.isTestnet ? ' · TESTNET' : ''} · chain ${model.chainId}`,
      },
      { label: 'STATEMENT PERIOD', value: `${formatDate(model.period.from)} — ${formatDate(model.period.to)}` },
      { label: 'GENERATED', value: formatDateTime(model.generatedAt) },
    ],
  })

  // Qualifications that change how EVERY figure below should be read belong
  // above those figures. Left in the closing notes, a reader who reconciles the
  // summary tiles and stops — which is most readers — never learns that the
  // statement is partial or that a category failed to load.
  if (model.isTestnet) {
    noteBlock(
      ctx,
      'This statement covers a TEST network. The assets recorded here carry no monetary value, and every USD ' +
        'figure below is notional — it must not be used as a record of real funds.',
      { tone: 'warn', title: 'Test network — no monetary value' },
    )
  }

  if (model.scopeNote) {
    noteBlock(
      ctx,
      model.excludedByScope > 0
        ? `${model.scopeNote} ${model.excludedByScope} further entr${
            model.excludedByScope === 1 ? 'y' : 'ies'
          } on this account in this period ${model.excludedByScope === 1 ? 'is' : 'are'} outside that scope and ` +
          'contribute to no figure here.'
        : model.scopeNote,
      { tone: 'warn', title: 'This is a partial statement' },
    )
  }

  if (model.staleClasses.length) {
    noteBlock(
      ctx,
      `${formatList(model.staleClassLabels)} could not be fully read for this network, so the figures below ` +
        'may include only PART of that activity. Every affected row is marked "(partial)" where it appears. ' +
        'This is not a confirmed zero — it is a gap in what could be loaded.',
      { tone: 'warn', title: 'Incomplete data — figures below may understate your activity' },
    )
  }

  if (!model.settled.length && !model.failed.length) {
    renderEmpty(ctx)
  } else {
    const on = model.sections
    if (on[STATEMENT_SECTIONS.SUMMARY]) renderSummary(ctx)
    if (on[STATEMENT_SECTIONS.CHARTS]) renderCharts(ctx)
    if (on[STATEMENT_SECTIONS.FEES]) renderFees(ctx)
    if (on[STATEMENT_SECTIONS.BY_TOKEN]) renderTokens(ctx)
    if (on[STATEMENT_SECTIONS.BY_ACTIVITY]) renderActivity(ctx)
    if (on[STATEMENT_SECTIONS.REGISTER]) renderRegister(ctx)
    if (on[STATEMENT_SECTIONS.FAILED]) renderFailed(ctx)
  }

  renderDisclosures(ctx)
  stampFooters(ctx, {
    note: 'Informational record of on-chain activity — not tax advice, not a statement of account balances.',
  })
  return ctx.doc.output('blob')
}

function renderEmpty(ctx) {
  const { model } = ctx
  sectionHeading(
    ctx,
    'Statement summary',
    `Recorded activity for ${model.period.label} on ${model.networkName}` +
      `${model.scopeClasses ? ', within this statement\u2019s activity types' : ''}.`,
  )
  statTiles(ctx, [
    { label: 'MONEY IN', value: '$0.00', sub: 'No receipts in this period' },
    { label: 'MONEY OUT', value: '$0.00', sub: 'No payments in this period' },
    { label: 'NET CHANGE', value: '$0.00', sub: 'No movement', emphasis: true },
    { label: 'ENTRIES', value: '0', sub: 'Nothing recorded' },
  ])
  noteBlock(
    ctx,
    model.staleClasses.length
      ? `No activity was found for ${model.period.label} — but ${formatList(model.staleClassLabels)} could not ` +
          'be read, so this is not a confirmed zero. Activity in those categories would not appear here.'
      : model.scopeClasses
        ? 'No activity was recorded within the activity types this statement covers. Other activity on this ' +
          'account in this period would not appear here.'
        : 'No activity was recorded for this period on this network.',
    { tone: model.staleClasses.length ? 'warn' : 'info', title: 'Nothing to report' },
  )
  return ctx
}

/** Statement file name: type, network and period, so a folder of them sorts. */
export function statementFileName(report, options = {}) {
  const model = buildStatementModel(report, options)
  const from = new Date(model.period.from).toISOString().slice(0, 10)
  const to = new Date(model.period.to).toISOString().slice(0, 10)
  const net = String(model.networkName).replace(/\s+/g, '-')
  const brandSlug = String(options.brand?.displayName || 'account')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${brandSlug}-statement_${model.type}_${net}_${from}_${to}.pdf`
}

export { PLATFORM_FEE_STATUS }
