/**
 * Passkey batch executor (spec 041) — fulfills WalletContext.sendCalls for
 * passkey sessions: one WebAuthn ceremony authorizes the WHOLE batch (FR-016),
 * routed per the submission decision table, tracked to an honest terminal
 * state (FR-017).
 *
 * First-action activation (FR-007): viem's smart-account plumbing includes the
 * factory initCode automatically while the account is counterfactual — the
 * user never sees a separate "deploy" step.
 */

import { knownCredentials, isTransactComplete } from './credentials'
import { buildAccount, buildAction, resolveOwnerIndex, CredentialRecordIncomplete } from './smartAccount'
import {
  chooseRoute,
  defaultRelayerProbe,
  defaultBundlerProbe,
  trackToInclusion,
  LIFECYCLE,
  SubmissionUnavailable,
} from './submission'
import { getNetwork } from '../../config/networks'

/**
 * @param {object} opts
 *   chainId, address       the active session identity
 *   calls                  [{ target|to, data, value? }]
 *   intent                 optional { intentCapable, submitIntent } — provided by
 *                          action-specific callers (intentSigner.js) when the
 *                          batch corresponds to an 035 action; plain batches
 *                          (account management, unsupported actions) go UserOp.
 *   accountNative          true for controller/upgrade ops (row 2)
 *   onState                lifecycle observer (UI progress)
 *   deps                   injectable clients for tests
 */
export async function sendPasskeyBatch({
  chainId,
  address,
  calls,
  credentialId = null,
  intent = null,
  accountNative = false,
  onState,
  deps = {},
}) {
  // Pin to the SESSION's credential when the caller knows it (spec 045 US3 —
  // multiple passkeys may map to the same address book entry set); fall back
  // to the address match for older callers.
  const book = (deps.knownCredentials ?? knownCredentials)(deps.storage)
  const credential =
    (credentialId && book.find((c) => c.credentialId === credentialId)) ||
    book.find((c) => c.address?.toLowerCase() === address?.toLowerCase())
  if (!credential) {
    throw new Error('No passkey credential is linked to this account on this browser — sign in again.')
  }
  // Refuse incomplete records with an actionable message BEFORE any ceremony
  // (spec 045 FR-006 — previously crashed as "reading 'id'" inside the signer).
  if (!isTransactComplete(credential)) throw new CredentialRecordIncomplete()

  const net = getNetwork(chainId)
  const bundlerUrls = net?.passkey?.bundlerUrls ?? []
  const intentCapable = Boolean(intent?.intentCapable)

  let route
  try {
    route = await chooseRoute({
      intentCapable,
      accountNative,
      probeRelayer: deps.probeRelayer ?? defaultRelayerProbe(chainId),
      probeBundler: deps.probeBundler ?? defaultBundlerProbe(bundlerUrls),
    })
  } catch (error) {
    // Some bundlers block/flake health probes (especially mobile webviews) while
    // still accepting sendUserOperation. If we have a configured bundler rail and
    // no intent path to take, optimistically attempt the UserOp rather than fail
    // before submission.
    if (
      error instanceof SubmissionUnavailable &&
      // Only force the UserOp route when it's the sole viable route:
      // no intent leg, non-account-native action, and a configured bundler.
      !intentCapable &&
      !accountNative &&
      bundlerUrls.length > 0
    ) {
      route = 'userop'
    } else {
      throw error
    }
  }

  onState?.({ state: LIFECYCLE.DRAFT, route })

  if (route === 'intent') {
    // Row 1: the caller supplied the 035 intent leg (ERC-1271 signature +
    // relay client submission) — the ceremony happens inside submitIntent.
    const { intentId, checkIncluded } = await intent.submitIntent()
    onState?.({ state: LIFECYCLE.SUBMITTED, route, intentId })
    return { route, intentId, ...(await trackToInclusion({ checkIncluded, onState })) }
  }

  // Row 2/3: UserOperation. buildAccount wires the WebAuthn owner — the
  // sendUserOperation call below triggers exactly ONE assertion ceremony
  // covering the whole batch (FR-008/FR-016). The credential's real owner
  // slot is resolved from the chain (FR-009) — accounts that added
  // controllers sign with the correct index, not a hardcoded 0.
  const ownerIndex = await (deps.resolveOwnerIndex ?? resolveOwnerIndex)({
    chainId,
    accountAddress: address,
    credential,
    deps,
  })
  const { bundlerClient } = await (deps.buildAccount ?? buildAccount)({
    chainId,
    credential,
    ownerIndex,
    deps,
  })
  const { calls: shaped } = buildAction(calls)
  const hash = await bundlerClient.sendUserOperation({ calls: shaped })
  onState?.({ state: LIFECYCLE.SUBMITTED, route, userOpHash: hash })

  const outcome = await trackToInclusion({
    checkIncluded: async () => {
      const receipt = await bundlerClient.getUserOperationReceipt({ hash }).catch(() => null)
      if (!receipt) return { state: 'pending' }
      return receipt.success
        ? { state: 'included', txHash: receipt.receipt.transactionHash }
        : { state: 'failed', reason: 'user operation reverted' }
    },
    onState,
  })
  return { route, userOpHash: hash, ...outcome }
}
