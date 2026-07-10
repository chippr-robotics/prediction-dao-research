/**
 * First-time passkey explainer marker (spec 045, FR-010).
 *
 * Browser-scoped (pre-account, unlike accountProfile.js warning moments):
 * the explainer teaches what a passkey IS before the user has one. Storage
 * failures are swallowed — a re-shown explainer is acceptable, a blocked
 * connect flow is not.
 */

const EXPLAINER_KEY = 'fairwins.passkey.explainer.v1'

export function hasSeenExplainer(storage = globalThis.localStorage) {
  try {
    return Boolean(JSON.parse(storage.getItem(EXPLAINER_KEY) || 'null')?.seenAt)
  } catch {
    return false
  }
}

export function markExplainerSeen(storage = globalThis.localStorage) {
  try {
    storage.setItem(EXPLAINER_KEY, JSON.stringify({ seenAt: new Date().toISOString() }))
  } catch {
    // Non-fatal by design (spec 045 edge case: storage blocked).
  }
}
