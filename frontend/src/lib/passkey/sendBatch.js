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

import { knownCredentials } from './credentials'
import { buildAccount, buildAction } from './smartAccount'
import {
  chooseRoute,
  defaultRelayerProbe,
  defaultBundlerProbe,
  trackToInclusion,
  LIFECYCLE,
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
  intent = null,
  accountNative = false,
  onState,
  deps = {},
}) {
  const credential = (deps.knownCredentials ?? knownCredentials)().find(
    (c) => c.address?.toLowerCase() === address?.toLowerCase()
  )
  if (!credential) {
    throw new Error('No passkey credential is linked to this account on this browser — sign in again.')
  }

  const net = getNetwork(chainId)
  const bundlerUrls = net?.passkey?.bundlerUrls ?? []

  const route = await chooseRoute({
    intentCapable: Boolean(intent?.intentCapable),
    accountNative,
    probeRelayer: deps.probeRelayer ?? defaultRelayerProbe(chainId),
    probeBundler: deps.probeBundler ?? defaultBundlerProbe(bundlerUrls),
  })

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
  // covering the whole batch (FR-008/FR-016).
  const { bundlerClient } = await (deps.buildAccount ?? buildAccount)({
    chainId,
    credential,
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
