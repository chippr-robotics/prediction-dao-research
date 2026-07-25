/**
 * Entry-gate acknowledgement record (spec 007 US4) as a shared, observable store.
 *
 * The gate component still owns the dialog; this module owns the record so other
 * surfaces can read it and react to it. The auto-connect prompt depends on that:
 * the connect dialog must never stack on top of the eligibility gate, and it has
 * to open the moment the visitor presses "Enter" — in the same visit, without a
 * reload — so the acknowledgement is broadcast rather than merely written.
 */

export const ENTRY_GATE_ACK_KEY = 'fairwins.entryGate.ack.v1'
const ACK_EVENT = 'fairwins:entry-gate-ack'

/** The stored acknowledgement, or null when this browser has never entered. */
export function readAck() {
  try {
    return JSON.parse(localStorage.getItem(ENTRY_GATE_ACK_KEY) || 'null')
  } catch {
    return null
  }
}

export function hasAcknowledged() {
  return Boolean(readAck())
}

/** Persist the acknowledgement and notify subscribers in this tab. */
export function writeAck(record) {
  try {
    localStorage.setItem(ENTRY_GATE_ACK_KEY, JSON.stringify(record))
  } catch {
    /* storage disabled — the gate still un-blocks for this session */
  }
  try {
    window.dispatchEvent(new CustomEvent(ACK_EVENT, { detail: record }))
  } catch {
    /* no window (SSR/tests) — subscribers simply never fire */
  }
  return record
}

/** Subscribe to acknowledgement changes. Returns an unsubscribe function. */
export function subscribeAck(listener) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => listener(readAck())
  window.addEventListener(ACK_EVENT, handler)
  return () => window.removeEventListener(ACK_EVENT, handler)
}
