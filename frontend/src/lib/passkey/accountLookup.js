/**
 * Which account does this passkey control? (spec 104)
 *
 * The seam that replaces the derive-then-sanity-check logic inside
 * `connectors/passkey.js#resolveAccountForCredential`. The distinction it exists to make is
 * between an address the chain CONFIRMED and an address we computed and hoped for: the old code
 * derived an address on the assumption that the key was the account's sole initial owner and,
 * when that address turned out to hold no contract, returned it anyway — signing a member who had
 * lost their device into a brand-new empty account with nothing said.
 *
 * So the return type carries a value in exactly ONE of its four shapes. Three of the four
 * constructors below take no address at all, which is what makes "return the derived one anyway"
 * impossible rather than merely discouraged — the same device as spec 089's `reading.js` (one of
 * three constructors takes a number) and spec 071's estate reads.
 *
 * Reads go through the spec-069 endpoint seam, so a member's own RPC applies. That matters more
 * here than almost anywhere: recovery is read-heavy, and an `unverified` that the member's working
 * endpoint would have turned into `resolved` is a member turned away for no reason.
 */

import { publicKeyToOwnerBytes, readControllers, computeAccountAddress } from './smartAccount'

/** Default bound on the whole resolution. Expiry yields `unverified`, never `none-found`. */
export const RESOLUTION_DEADLINE_MS = 20_000

export const OUTCOMES = Object.freeze({
  RESOLVED: 'resolved',
  NONE_FOUND: 'none-found',
  UNVERIFIED: 'unverified',
  NOT_CONTROLLER: 'not-controller',
})

/**
 * The one place an address may enter a result.
 * @param {Array<{address: string, ownerIndex: number, chainId: number}>} accounts 1..n
 */
export function resolved(accounts) {
  return { outcome: OUTCOMES.RESOLVED, accounts }
}

/** The chain was read and nothing on it lists this key. */
export function noneFound(reason) {
  return { outcome: OUTCOMES.NONE_FOUND, reason }
}

/**
 * The chain could NOT be read. Deliberately not `none-found`: an unreachable chain is not
 * evidence of absence, and collapsing the two tells a member with a perfectly good account that
 * they have none — the identity equivalent of rendering an unreadable balance as $0.
 */
export function unverified(reason) {
  return { outcome: OUTCOMES.UNVERIFIED, reason }
}

/**
 * A NAMED account exists and this key is not among its current owners. Carries the address
 * because the member supplied it: naming it back is what makes the refusal legible rather than
 * a bare no.
 */
export function notController(reason, address) {
  return { outcome: OUTCOMES.NOT_CONTROLLER, reason, address }
}

/** True only for the one outcome a session may be opened on. */
export function isResolved(resolution) {
  return resolution?.outcome === OUTCOMES.RESOLVED && resolution.accounts?.length > 0
}

const REASONS = {
  noCode: 'No account is deployed at that address yet.',
  notOwner: 'That account exists, but this passkey is not one of its owners.',
  unreadable:
    'We could not reach the network to check. This does not mean you have no account — try again, ' +
    'or check your network settings.',
  timedOut:
    'The network did not answer in time. This does not mean you have no account — try again in a moment.',
  nothingFound:
    'No account on this network lists this passkey as an owner. A passkey that was added to an ' +
    'existing account after it was created cannot be found this way — enter the account address instead.',
}

/** Deadline that rejects rather than hanging, so a slow chain degrades to `unverified`. */
function withDeadline(promise, deadlineMs, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!deadlineMs) return promise
  let timer
  const expiry = new Promise((_resolve, reject) => {
    timer = setTimer(() => reject(new DeadlineExpired()), deadlineMs)
  })
  return Promise.race([promise, expiry]).finally(() => clearTimer(timer))
}

class DeadlineExpired extends Error {
  constructor() {
    super('deadline expired')
    this.name = 'DeadlineExpired'
  }
}

/**
 * Confirm ONE named address against its CURRENT owner set.
 *
 * The primitive behind both the confirmation step of a search and the address a member types in.
 * Where the address came from changes nothing about the check performed — an address is a hint,
 * never a claim.
 *
 * Verification is against the current set, not history: a key that once owned an account and was
 * rotated off does not control it, and offering it would send the member somewhere they can no
 * longer sign for.
 *
 * @returns {object} a Resolution narrowed to `resolved` (exactly one account),
 *   `not-controller`, or `unverified`.
 */
export async function verifyAccountForKey({ ownerBytes, address, chainId, deadlineMs = RESOLUTION_DEADLINE_MS, deps = {} }) {
  const wanted = String(ownerBytes || '').toLowerCase()
  if (!wanted) return unverified(REASONS.unreadable)

  let result
  try {
    result = await withDeadline(
      (deps.readControllers ?? readControllers)({ chainId, accountAddress: address, deps }),
      deadlineMs,
      deps
    )
  } catch (err) {
    // An RPC timeout is not a fact about the member's account. Both branches are `unverified`;
    // only the wording differs, so the member knows whether to wait or to look at their settings.
    return unverified(err instanceof DeadlineExpired ? REASONS.timedOut : REASONS.unreadable)
  }

  // Nothing deployed there. A member who mistyped an address and one whose passkey was rotated
  // off need different next steps, so the two refusals never share a sentence.
  if (!result?.deployed) return notController(REASONS.noCode, address)

  const match = (result.controllers || []).find((c) => c.ownerBytes?.toLowerCase() === wanted)
  if (!match) return notController(REASONS.notOwner, address)

  // The slot the CHAIN reported. Never 0 by assumption — signatures depend on the real index
  // (spec 045 FR-009), and an account that gained controllers does not put this key at 0.
  return resolved([{ address, ownerIndex: Number(match.index), chainId }])
}

/**
 * Search for accounts this key controls, then confirm each one.
 *
 * Release 1 runs a single candidate: the address the key would own had it been the sole initial
 * owner at nonce 0. That candidate is a HINT and is confirmed like any other — which is the whole
 * change, because the old code treated it as an answer. An undeployed candidate is therefore
 * `none-found` (we looked and found nothing), not an account to sign into.
 *
 * Release 2 adds nonce enumeration and an `AccountCreated` scan behind the same signature; a leg
 * that fails contributes nothing rather than failing the resolution, and the resolver never
 * reports `none-found` on the strength of legs it did not run.
 *
 * @returns {object} a Resolution. Never throws for a chain condition — a thrown error here is a
 *   programming fault, not something a member did.
 */
export async function resolveAccounts({ ownerBytes, chainId, deadlineMs = RESOLUTION_DEADLINE_MS, deps = {} }) {
  const candidate =
    deps.deriveCandidate?.({ ownerBytes, chainId }) ??
    computeAccountAddress({ ownersBytes: [ownerBytes], chainId })

  const verdict = await verifyAccountForKey({ ownerBytes, address: candidate, chainId, deadlineMs, deps })

  if (verdict.outcome === OUTCOMES.NOT_CONTROLLER) {
    // The chain was READ and this key does not control the address it would have created. That is
    // an absence, not a refusal of something the member named: they never named this address, we
    // computed it. Reporting `not-controller` here would show a member an address they have never
    // seen and tell them they do not own it.
    return noneFound(REASONS.nothingFound)
  }
  return verdict
}

/** Owner bytes for a recovered P-256 key, lowercased for comparison. */
export function ownerBytesForPublicKey(publicKey) {
  return publicKeyToOwnerBytes(publicKey).toLowerCase()
}

export const __reasons = REASONS
