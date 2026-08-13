/**
 * Perps activity source (spec 082 FR-014, extended by spec 083 T070 / FR-023). TWO INPUTS, ONE
 * FEED — the `earnSource` shape:
 *
 * 1. **Action buffer.** What the member did IN THE APP. The position surfaces queue the order
 *    machine's own state into `lib/perps/perpsActivityBuffer` (with the transaction it produced);
 *    this source drains it each cycle and words each record here. Routing member actions through
 *    the source keeps every store write inside the engine's poll.
 * 2. **Snapshot-diff backstop.** What happened ANYWHERE ELSE — the venue's own app, a keeper, a
 *    liquidation. The member's per-venue open-position set is fingerprinted each cycle and a change
 *    with no action to explain it emits the generic position-changed entry.
 *
 * THE RULE THAT SHAPES ALL THE WORDING: inclusion is never execution. A record's state comes from
 * `lib/perps/orderState.js`, which reaches `executed` for exactly one signal — the venue's own
 * execution event — so a submitted order is worded as SENT and never as done. Nothing is re-derived
 * here: this module chooses copy for a state, it never decides what the state is.
 *
 * HONEST ABOUT THE RECORD (FR-023). A feed entry links a transaction only when the member's own
 * action produced one, and when there is no such transaction the entry SAYS the venue is the only
 * record rather than leaving a silent absence. Two cases reach that clause: a snapshot-diff entry
 * (we compared two reads; there is no event of ours to link) and a venue whose actions leave no
 * chain record at all. Where a transaction IS linked it is the member's REQUEST — both EVM venues
 * fill from their own keeper transaction, which is why the executed wording attributes the fill to
 * the venue by name instead of implying the linked transaction is the fill.
 *
 * Reads go through the gateway's cached /v1/perps/positions (never venue APIs directly — the 30s
 * activity cadence would hammer them; the gateway cache absorbs it). First sight = baseline; a
 * degraded venue keeps its prior snapshot (a venue outage is NOT "positions closed"); hard total
 * failure returns ok:false so the engine keeps the prior slice.
 */
import { fetchPerpPositions } from '../../../lib/perps/perpsClient'
import { perpsAvailable, perpsPath, PERP_VENUES } from '../../../config/perps'
import { drainPerpsActions, isVenueConfirmed } from '../../../lib/perps/perpsActivityBuffer'
import { ORDER_STATE } from '../../../lib/perps/orderState'
import { getBlockscoutUrl } from '../../../config/blockExplorer'

const EMPTY = { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} }

/** Stable per-venue fingerprint of the account's open positions. */
function fingerprint(positions) {
  return positions
    .map((p) => `${p.id}:${p.direction}:${p.sizeUsd ?? '-'}`)
    .sort()
    .join('|')
}

export function createPerpsSource({ deps } = {}) {
  const io = {
    fetchPositions: fetchPerpPositions,
    available: perpsAvailable,
    drainActions: drainPerpsActions,
    ...deps,
  }
  return {
    key: 'perps',
    label: 'Perps',
    async detect({ account, nowMs, prior }) {
      if (!account || !io.available()) return EMPTY

      let body
      try {
        body = await io.fetchPositions(account)
      } catch {
        // Total read failure — keep the prior slice, never fake "no positions". The buffer is NOT
        // drained on this path: the engine discards the whole result, so draining here would throw
        // the member's own actions away. They keep until a cycle that can publish them.
        return { ok: false }
      }

      const positions = Array.isArray(body?.positions) ? body.positions : []
      const sources = body?.sources ?? {}
      const priorSnapshots = prior?.snapshots || {}
      const entries = []
      const nextSnapshots = {}
      const currentIds = []

      // 1) What the member did in the app, in the venue's own terms.
      //    A venue that CONFIRMED an action this cycle has its position change already explained,
      //    so the generic diff entry below is suppressed for it — the precise entry is better.
      const confirmedVenues = new Set()
      for (const record of io.drainActions(account)) {
        const entry = actionEntry(record, nowMs)
        if (!entry) continue
        entries.push(entry)
        if (isVenueConfirmed(record)) confirmedVenues.add(record.venue)
      }

      // 2) Anything that happened elsewhere.
      for (const [venue, source] of Object.entries(sources)) {
        const sid = `perps:${venue}`
        currentIds.push(sid)
        if (source?.status !== 'read' || source?.partial === true) {
          // Venue unreadable this cycle: keep the baseline — an outage is not a position change.
          //
          // `partial` counts as unreadable HERE and nowhere else. Hyperliquid is read per perp dex
          // (HIP-3), so a dex that drops out removes its positions from the list without any of
          // them closing: diffing that fingerprint would tell a member "a perp position was closed
          // on Hyperliquid" because a book went quiet, and tell them again when it came back. The
          // rows still RENDER (the gateway read them, or read around them) — this only refuses to
          // narrate a change we cannot attribute.
          if (priorSnapshots[sid]) nextSnapshots[sid] = priorSnapshots[sid]
          continue
        }
        const venuePositions = positions.filter((p) => p.venue === venue)
        const print = fingerprint(venuePositions)
        const prev = priorSnapshots[sid]
        nextSnapshots[sid] = { print, count: venuePositions.length, snappedAt: nowMs }

        // First sight = baseline (no retroactive entries).
        if (prev?.print != null && prev.print !== print && !confirmedVenues.has(venue)) {
          const label = venueLabel(venue)
          const grew = venuePositions.length > (prev.count ?? 0)
          const shrank = venuePositions.length < (prev.count ?? 0)
          entries.push({
            id: `perps:${venue}:position-changed:${nowMs}`,
            domain: 'perps',
            refId: venue,
            type: 'perps-position-changed',
            message:
              (grew
                ? `A perp position was opened on ${label}.`
                : shrank
                  ? `A perp position was closed on ${label}.`
                  : `Your perp positions changed on ${label}.`) + noRecordNote(label),
            severity: 'info',
            actionable: false,
            link: { to: perpsPath({ venue }) },
            createdAt: nowMs,
            read: false,
          })
        }
      }

      return { ok: true, entries, nextSnapshots, currentIds, actionNeededById: {} }
    },
  }
}

/* ------------------------------------------------------------------------------------------- *
 * Wording
 *
 * Separate from the machine on purpose (the `orderState.js` convention): the tables below choose a
 * line for a state, and nothing here can move a record between states. A state with no line
 * renders as no entry rather than as a guess.
 * ------------------------------------------------------------------------------------------- */

/** What the member asked for, named the way the member would name it. */
const ACTION_NOUN = Object.freeze({
  open: 'open order',
  close: 'close order',
  reduce: 'reduce order',
  protect: 'protection change',
  cancel: 'recovery request',
})

/** The venue DID it. Only `executed` reaches these, and only a venue event reaches `executed`. */
const EXECUTED_MESSAGE = Object.freeze({
  open: (venue) => `${venue} opened your position.`,
  close: (venue) => `${venue} closed your position.`,
  reduce: (venue) => `${venue} reduced your position.`,
  protect: (venue) => `${venue} updated your stop-loss / take-profit.`,
  cancel: (venue) => `${venue} returned your collateral.`,
})

/**
 * Everything the venue has NOT executed. Each line has to survive being read in a hurry: none of
 * them may be mistakable for "done", including the two pending ones, which is the whole point of
 * the buffer storing a state instead of a message.
 */
const MESSAGE_BY_STATE = Object.freeze({
  [ORDER_STATE.EXECUTED]: ({ venue, action, noun }) =>
    (EXECUTED_MESSAGE[action] ?? ((v) => `${v} executed your ${noun}.`))(venue),
  [ORDER_STATE.SUBMITTED]: ({ venue, noun }) => `Your ${noun} was sent to ${venue} — not confirmed yet.`,
  [ORDER_STATE.VENUE_PENDING]: ({ venue, noun }) => `${venue} received your ${noun} — no outcome yet.`,
  // The venue's own words, verbatim, wherever it gave any (FR-008) — never our paraphrase of them.
  [ORDER_STATE.REJECTED]: ({ venue, noun, reason }) =>
    reason
      ? `${venue} did not go ahead with your ${noun}: ${reason}`
      : `${venue} did not go ahead with your ${noun}.`,
  [ORDER_STATE.FROZEN]: ({ venue, noun }) => `Your ${noun} on ${venue} is stuck and needs your attention.`,
  [ORDER_STATE.TIMED_OUT]: ({ venue, noun }) =>
    `${venue} did not act on your ${noun} in time — you can recover your collateral.`,
  [ORDER_STATE.UNKNOWN]: ({ venue, noun }) =>
    `We can’t confirm what happened to your ${noun} — check on ${venue}.`,
})

const SEVERITY_BY_STATE = Object.freeze({
  [ORDER_STATE.EXECUTED]: 'success',
  [ORDER_STATE.SUBMITTED]: 'info',
  [ORDER_STATE.VENUE_PENDING]: 'info',
  [ORDER_STATE.REJECTED]: 'warning',
  [ORDER_STATE.FROZEN]: 'warning',
  [ORDER_STATE.TIMED_OUT]: 'warning',
  [ORDER_STATE.UNKNOWN]: 'warning',
})

/** The states that ask the member to do something, so the feed marks them as needing a look. */
const ACTIONABLE_STATES = Object.freeze([ORDER_STATE.FROZEN, ORDER_STATE.TIMED_OUT])

/** One buffered record → one entry, or `null` when there is no honest line to write. */
function actionEntry(record, nowMs) {
  const state = record?.state
  const write = MESSAGE_BY_STATE[state]
  if (!write || !record?.venue) return null

  const label = record.venueLabel || venueLabel(record.venue)
  const noun = ACTION_NOUN[record.action] ?? 'order'
  const txUrl = explorerUrl(record)
  const message = write({ venue: label, action: record.action, noun, reason: record.reason?.text || null })

  return {
    // Keyed by the order and the state it reached, never by the poll: the same outcome always has
    // the same id, so the engine's append-dedup is exact.
    id: `perps:${record.venue}:${state}:${record.key}`,
    domain: 'perps',
    refId: record.venue,
    type: `perps-${record.action || 'order'}-${state}`,
    // A link is only ever offered for a transaction we hold; otherwise the gap is stated.
    message: txUrl ? message : message + noRecordNote(label),
    severity: SEVERITY_BY_STATE[state] ?? 'info',
    actionable: ACTIONABLE_STATES.includes(state),
    link: { to: perpsPath({ venue: record.venue }) },
    txUrl,
    createdAt: record.at || nowMs,
    read: false,
  }
}

/**
 * The FR-023 disclosure. An absent link is not a disclosure — a member cannot tell "no record
 * exists" from "we did not bother to link one", so the entry says which it is.
 */
function noRecordNote(label) {
  return ` FairWins holds no transaction record for this — ${label} is the only record of it.`
}

function explorerUrl(record) {
  if (record?.txUrl) return record.txUrl
  if (!record?.txHash || !record?.chainId) return null
  return getBlockscoutUrl(record.chainId, record.txHash, 'tx') || null
}

/** A venue's full name, or the id rather than a fabricated label. */
function venueLabel(venue) {
  return PERP_VENUES[venue]?.label ?? venue
}

export const perpsSource = createPerpsSource()

export default perpsSource
