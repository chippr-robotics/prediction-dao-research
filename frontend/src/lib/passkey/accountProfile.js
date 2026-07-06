/**
 * Local AccountProfile niceties for passkey accounts (spec 041, data-model):
 * device-loss warning dismissals per FR-021 moment. Never authorization state.
 */

const PROFILE_KEY = 'fairwins.passkey.profile.v1'

export const WARNING_MOMENTS = Object.freeze(['creation', 'first-funding', 'membership-purchase'])

function readProfile(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(PROFILE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function dismissedAt(account, moment, storage = globalThis.localStorage) {
  return Boolean(readProfile(storage)?.[account?.toLowerCase()]?.dismissedWarnings?.[moment])
}

export function recordDismissal(account, moment, storage = globalThis.localStorage) {
  const all = readProfile(storage)
  const key = account.toLowerCase()
  all[key] = all[key] || {}
  all[key].dismissedWarnings = { ...(all[key].dismissedWarnings || {}), [moment]: Date.now() }
  storage.setItem(PROFILE_KEY, JSON.stringify(all))
}

/** Clear dismissals when a second controller appears — re-arms if it drops back to one. */
export function resetDismissals(account, storage = globalThis.localStorage) {
  const all = readProfile(storage)
  const key = account?.toLowerCase()
  if (all[key]) {
    delete all[key].dismissedWarnings
    storage.setItem(PROFILE_KEY, JSON.stringify(all))
  }
}
