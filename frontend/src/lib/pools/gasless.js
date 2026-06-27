/**
 * Client-side gasless join for ZK-Wager Pools (spec 034, US3) — WITHOUT an app backend.
 *
 * The "no-backend footprint" directive forbids a FairWins server, so there is no "Payload Packer"
 * service. Instead the client signs an EIP-3009 `ReceiveWithAuthorization` here; a THIRD-PARTY relayer
 * (e.g. Gelato/Biconomy/OZ Defender, or the user's own) submits `ZKWagerPool.joinWithAuthorization` and
 * pays gas. The signed authorization binds amount + recipient and is replay-protected by the token, so
 * the relayer is untrusted (it can censor, never steal). When no relayer is configured, the member joins
 * normally (paying gas) — gasless is purely additive.
 */
import { ethers } from 'ethers'

export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
}

/**
 * Produce a signed EIP-3009 authorization that lets a relayer pull `value` from the member into the pool.
 * @returns {Promise<object>} { from, to, value, validAfter, validBefore, nonce, v, r, s }
 */
export async function signReceiveAuthorization({
  signer,
  token,
  tokenName = 'USD Coin',
  tokenVersion = '2',
  chainId,
  to,
  value,
  nowSeconds,
  validitySeconds = 3600,
}) {
  const from = await signer.getAddress()
  const now = nowSeconds != null ? nowSeconds : Math.floor(Date.now() / 1000)
  const nonce = ethers.hexlify(ethers.randomBytes(32))
  const domain = { name: tokenName, version: tokenVersion, chainId, verifyingContract: token }
  const message = { from, to, value: value.toString(), validAfter: 0, validBefore: now + validitySeconds, nonce }
  const sig = ethers.Signature.from(await signer.signTypedData(domain, RECEIVE_WITH_AUTHORIZATION_TYPES, message))
  return { from, to, value, validAfter: 0, validBefore: message.validBefore, nonce, v: sig.v, r: sig.r, s: sig.s }
}

/**
 * Relay a gasless join via a pluggable third-party relayer. `relayer` is a function
 * (authorization, { pool, identityCommitment }) => Promise<{ txHash }>. No relayer ⇒ a clear error so
 * the UI falls back to a normal (gas-paying) join. This keeps gas abstraction entirely off the FairWins
 * footprint (no app backend).
 */
export async function relayGaslessJoin(relayer, authorization, { pool, identityCommitment }) {
  if (typeof relayer !== 'function') {
    throw new Error('No gasless relayer configured. Join normally (you pay gas), or configure a third-party relayer.')
  }
  return relayer(authorization, { pool, identityCommitment })
}
