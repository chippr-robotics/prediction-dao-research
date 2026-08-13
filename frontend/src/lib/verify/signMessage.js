/**
 * Message-signing seam (Protect ▸ Verify) — resolves HOW the current identity signs an
 * arbitrary message, and reports honestly when it can't. Mirrors `lib/collectibles/orderSigner.js`
 * (spec 056 FR-019): never a dead button, always a named reason.
 *
 * Three identities, three answers:
 *
 *   classic wallet / recovered legacy key  ethers `signMessage` → EIP-191 ECDSA. Verifiable by
 *                                          anyone, anywhere, offline.
 *   passkey smart account (spec 041)       one WebAuthn ceremony via `passkeyIntentSigner`, which
 *                                          wraps `hashMessage(m)` in the account's replaySafeHash
 *                                          and returns the ERC-1271 envelope. Verifiable only by
 *                                          asking the account on ITS chain — so the chain travels
 *                                          with the signature in the document.
 *   Safe vault (operate-as, spec 043)      REFUSED, with the reason stated. A Safe has no signing
 *                                          key: an on-chain message needs a threshold of owners to
 *                                          approve it, which is a proposal flow, not a signature
 *                                          box. Signing here would silently prove control of the
 *                                          member's OWN account while the UI said "vault" — the
 *                                          exact misattribution this whole surface exists to prevent.
 */

import { passkeyIntentSigner } from '../passkey/intentSigner'
import { SIGN_SCHEMES, buildSignedMessage } from './signedMessage'

/**
 * @param {object} args
 * @param {string|null} args.loginMethod  'passkey' | 'injected' | 'walletconnect' | null
 * @param {object|null} args.signer       ethers signer for classic sessions
 * @param {string|null} args.address      the identity that will be attributed
 * @param {number|null} args.chainId
 * @param {{ mode: string }} [args.identity]  active account (spec 043) — vault mode is refused
 * @param {{ credentialId?: string, ownerIndex?: number }} [args.passkey]
 * @param {Function} [args.makePasskeySigner]  test seam
 * @returns {{ canSign: boolean, kind: 'eoa'|'passkey'|'vault'|'none', scheme?: string,
 *             address?: string, reason?: string, sign?: (message: string) => Promise<string> }}
 */
export function resolveMessageSigner({
  loginMethod,
  signer,
  address,
  chainId,
  identity = null,
  passkey = null,
  makePasskeySigner = passkeyIntentSigner,
}) {
  if (identity?.mode === 'vault') {
    return {
      canSign: false,
      kind: 'vault',
      reason:
        "A vault has no signing key of its own — proving control of one takes a threshold of its owners, not a signature. Switch back to acting as yourself to sign as your own account.",
    }
  }
  if (!address) {
    return { canSign: false, kind: 'none', reason: 'Connect your account to sign a message.' }
  }

  if (loginMethod === 'passkey') {
    const { credentialId, ownerIndex = 0 } = passkey || {}
    if (!credentialId) {
      return {
        canSign: false,
        kind: 'passkey',
        reason: 'This passkey session has no credential on this device, so it cannot sign. Sign in again with your passkey.',
      }
    }
    if (chainId == null) {
      return {
        canSign: false,
        kind: 'passkey',
        reason: 'Your account signs through its contract, so a network is needed. Connect to a network and try again.',
      }
    }
    const ps = makePasskeySigner({ chainId, address, credentialId, ownerIndex })
    return {
      canSign: true,
      kind: 'passkey',
      scheme: SIGN_SCHEMES.ERC1271,
      address,
      sign: (message) => ps.signMessage(message),
    }
  }

  if (!signer) return { canSign: false, kind: 'eoa', reason: 'Connect your wallet to sign a message.' }
  return {
    canSign: true,
    kind: 'eoa',
    scheme: SIGN_SCHEMES.EIP191,
    address,
    sign: (message) => signer.signMessage(message),
  }
}

/** Thrown when the member (or their authenticator) dismisses the signing prompt. */
export class SignatureDeclined extends Error {
  constructor(cause) {
    super('Signing was cancelled.')
    this.name = 'SignatureDeclined'
    this.cause = cause
  }
}

// Wallet rejections arrive in several shapes; EIP-1193 code 4001 is the reliable one, the rest
// are the strings the popular wallets and WebAuthn use.
function isDeclined(error) {
  const code = error?.code ?? error?.cause?.code
  if (code === 4001 || code === 'ACTION_REJECTED') return true
  if (error?.name === 'NotAllowedError' || error?.name === 'CeremonyCancelled') return true
  return /user (rejected|denied|cancel)|cancell?ed|abort/i.test(String(error?.message ?? ''))
}

/**
 * Sign `message` with the resolved signer and return the portable document.
 *
 * The message is signed EXACTLY as given — no trimming, no appended nonce, no domain wrapper.
 * A member proving control of a key is usually answering a challenge someone else composed, and
 * altering a single byte of it makes the resulting proof useless to the person who asked.
 */
export async function signMessageAsAccount({ message, resolved, chainId, now = () => new Date() }) {
  if (typeof message !== 'string' || message.length === 0) {
    throw new Error('Write a message to sign.')
  }
  if (!resolved?.canSign) {
    throw new Error(resolved?.reason || 'This account cannot sign messages.')
  }
  let signature
  try {
    signature = await resolved.sign(message)
  } catch (error) {
    if (isDeclined(error)) throw new SignatureDeclined(error)
    throw error
  }
  return buildSignedMessage({
    address: resolved.address,
    // An EIP-191 signature is chain-independent, but the chain is still recorded: it is the
    // provenance a counterparty reads, and for the ERC-1271 path it is load-bearing.
    chainId,
    message,
    signature,
    scheme: resolved.scheme,
    signedAt: now().toISOString(),
  })
}
