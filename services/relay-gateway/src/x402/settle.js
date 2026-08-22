/**
 * x402 settlement — build the EIP-3009 `transferWithAuthorization` calldata and hand it to the
 * EXISTING submission engine (spec 096).
 *
 * Contract: specs/096-x402-agentic-payments/contracts/x402-gateway.md.
 *
 * NO NEW SIGNER, NO NEW RAIL. This is the same engine the intent pipeline uses
 * (`src/engine/client.js`), reached with the same per-chain `engineRelayerId`, and the engine still
 * sees only `{to, value, data}` — never a member, never a token, never a policy decision. The
 * gateway holds no key here any more than it does anywhere else: the value moves because the PAYER
 * signed an authorization the token itself verifies, and the engine only pays the gas to deliver it.
 *
 * WHY `transferWithAuthorization` AND NOT `receiveWithAuthorization`. The `receive…` variant
 * requires `msg.sender == to`, which binds the pull to the recipient contract — exactly right for
 * the intent rail, where the money lands in a FairWins contract that is also the caller. Here the
 * recipient is the platform TREASURY, an address that makes no calls; only `transfer…` can be
 * delivered by a third party. That is also why the type table is
 * `TRANSFER_WITH_AUTHORIZATION_TYPES` and not the `RECEIVE_…` one the intent rail signs.
 *
 * ACCEPTANCE IS BROADCAST, NOT FINALITY. `submitTransaction` resolving means the engine took the
 * transaction, not that a chain mined it — the same posture the intent rail has always had, and
 * `X-PAYMENT-RESPONSE` says `settlement: 'broadcast'` rather than implying otherwise.
 */
import { ethers } from 'ethers'
import { EngineUnavailableError, GatewayError } from '../errors.js'

export const TRANSFER_WITH_AUTHORIZATION_ABI = [
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
]

const tokenInterface = new ethers.Interface(TRANSFER_WITH_AUTHORIZATION_ABI)

/**
 * Encode the settlement calldata. Pure — no network, no engine.
 *
 * @param {{from: string, to: string, value: bigint, validAfter: bigint, validBefore: bigint, nonce: string}} authorization
 * @param {string} signature 65-byte hex
 */
export function encodeSettlement(authorization, signature) {
  const { v, r, s } = ethers.Signature.from(signature)
  return tokenInterface.encodeFunctionData('transferWithAuthorization', [
    authorization.from,
    authorization.to,
    authorization.value,
    authorization.validAfter,
    authorization.validBefore,
    authorization.nonce,
    v,
    r,
    s,
  ])
}

/**
 * Submit the settlement.
 *
 * @param {{
 *   engineClient: {submitTransaction: Function},
 *   chainCfg: object,
 *   authorization: object,
 *   signature: string,
 * }} args
 * @returns {Promise<{transaction: string|null, transactionId: string, status: string}>}
 * @throws {GatewayError} 503 settlement_unavailable — the ONLY failure shape here. An engine that
 *   cannot take the submission must never produce a free serve, and it must never look like the
 *   payer's fault: nothing was charged, so the honest answer is "retry".
 */
export async function settlePayment({ engineClient, chainCfg, authorization, signature }) {
  if (!chainCfg?.engineRelayerId) {
    throw new GatewayError(
      503,
      'settlement_unavailable',
      `no submission lane is configured for chain ${chainCfg?.chainId}; nothing was charged — try again later`
    )
  }
  const data = encodeSettlement(authorization, signature)
  try {
    const tx = await engineClient.submitTransaction({
      relayerId: chainCfg.engineRelayerId,
      to: chainCfg.paymentToken,
      data,
    })
    return { transaction: tx.hash ?? null, transactionId: tx.id, status: tx.status ?? 'pending' }
  } catch (err) {
    if (err instanceof EngineUnavailableError) {
      throw new GatewayError(
        503,
        'settlement_unavailable',
        'the settlement engine could not take this payment; NOTHING was charged and nothing was served — try again'
      )
    }
    throw err
  }
}
