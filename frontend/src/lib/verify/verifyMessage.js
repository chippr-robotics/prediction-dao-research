/**
 * Message verification (Protect ▸ Verify) — does this address really stand behind this message?
 *
 * Verification returns one of THREE states, never two. The tempting binary (valid / invalid)
 * is dishonest here, because the ERC-1271 leg is a network read: an RPC timeout is not a
 * forged signature, and rendering one as the other would tell a member their counterparty
 * lied when in fact we could not look. So:
 *
 *   'valid'         we checked and the claim holds
 *   'invalid'       we checked and the claim does NOT hold — a definite negative
 *   'unverifiable'  we could not complete the check (no chain, no route, node unreachable)
 *
 * A negative is only reported when it is knowable offline (ECDSA recovered someone else AND
 * the claimed address is a plain account) or the account contract itself said no. Everything
 * else degrades to 'unverifiable' with the reason named.
 *
 * Two paths, tried in the order that can answer without a network round-trip first:
 *
 *   EIP-191  65-byte ECDSA over the personal-message digest. Recovers to an address; comparing
 *            it to the claim is a pure computation — no chain, no provider, works offline.
 *   ERC-1271 A contract account's own opinion (spec 041 passkey accounts, Safe vaults). Does not
 *            recover to anything; the account is asked `isValidSignature(hashMessage(m), sig)` on
 *            the chain the document names, and only the magic value counts.
 */

import { ethers } from 'ethers'
import { getReadProvider } from '../../utils/rpcProvider'
import { SIGN_SCHEMES } from './signedMessage'

/** bytes4(keccak256("isValidSignature(bytes32,bytes)")) — the ONLY accepted success value. */
export const ERC1271_MAGIC = '0x1626ba7e'

const ERC1271_IFACE = new ethers.Interface([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
])

export const VERIFY_STATUS = Object.freeze({
  VALID: 'valid',
  INVALID: 'invalid',
  UNVERIFIABLE: 'unverifiable',
})

const isHex = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)

const sameAddress = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())

/**
 * Recover the EIP-191 signer, or null when the bytes are not a recoverable ECDSA signature.
 * Never throws: a 900-byte WebAuthn envelope reaching here is expected, not exceptional.
 */
export function recoverPersonalSigner(message, signature) {
  try {
    return ethers.verifyMessage(message, signature)
  } catch {
    return null
  }
}

/**
 * Ask a contract account whether it stands behind the signature.
 *
 * Returns `{ answered: true, valid }` when the contract gave a verdict, or
 * `{ answered: false, reason }` when the chain could not be reached / has no route / the
 * address holds no code. Callers MUST NOT collapse `answered: false` into `valid: false` —
 * that is the whole point of the third state.
 */
export async function checkErc1271({ message, signature, address, chainId, provider }) {
  if (chainId == null) {
    return { answered: false, reason: 'no-chain' }
  }
  let node = provider
  if (!node) {
    try {
      node = getReadProvider(Number(chainId))
    } catch {
      node = null
    }
  }
  if (!node) return { answered: false, reason: 'no-provider' }

  const digest = ethers.hashMessage(message)
  const data = ERC1271_IFACE.encodeFunctionData('isValidSignature', [digest, signature])
  let code
  try {
    code = await node.getCode(address)
  } catch {
    return { answered: false, reason: 'unreachable' }
  }
  // No code: the address is a plain account on this chain, so ERC-1271 does not apply. That IS
  // an answer — a definite "this account cannot have signed it that way" — and lets the caller
  // report a real negative instead of hiding behind "couldn't check".
  if (!code || code === '0x') return { answered: true, valid: false, reason: 'no-code' }

  let returned
  try {
    returned = await node.call({ to: address, data })
  } catch {
    // A revert and a dead node are indistinguishable at this seam in the general case, and a
    // dead node must never read as a forged signature — so this stays unverifiable rather than
    // invalid. (A reverting `isValidSignature` is itself a broken account, worth surfacing.)
    return { answered: false, reason: 'call-failed' }
  }
  if (!returned || returned === '0x' || returned.length < 10) {
    return { answered: true, valid: false, reason: 'no-answer' }
  }
  return { answered: true, valid: returned.slice(0, 10).toLowerCase() === ERC1271_MAGIC }
}

const UNVERIFIABLE_REASON = {
  'no-chain':
    'This signature can only be checked on-chain, but the document does not say which network the account is on.',
  'no-provider': 'No network route is configured for that chain, so the account could not be asked.',
  unreachable: 'That network could not be reached, so the account could not be asked. Try again.',
  'call-failed':
    'That network could not answer for the account, so the signature could not be checked. Try again.',
}

/**
 * Verify a claim: "`address` signed `message`, and here is the signature".
 *
 * @param {object} args
 * @param {string} args.message    exact signed text — never normalized
 * @param {string} args.signature  0x-hex signature bytes
 * @param {string} [args.address]  the claimed signer; omit to just ask "who signed this?"
 * @param {number} [args.chainId]  chain hosting a contract account (required for the ERC-1271 leg)
 * @param {object} [args.provider] test/injection seam; defaults to the member's own route
 * @returns {Promise<{status: string, method: string|null, signer: string|null, reason: string|null}>}
 *   `method` is how the verdict was reached ('eip191' | 'erc1271' | null).
 *   `signer` is the recovered address when ECDSA recovery worked — evidence, shown even on a
 *   negative, because "signed by 0xother" is far more useful than "invalid".
 */
export async function verifyMessage({ message, signature, address = null, chainId = null, provider = null }) {
  if (typeof message !== 'string') {
    return { status: VERIFY_STATUS.INVALID, method: null, signer: null, reason: 'There is no message to check.' }
  }
  if (!isHex(signature) || signature.length < 4) {
    return {
      status: VERIFY_STATUS.INVALID,
      method: null,
      signer: null,
      reason: 'The signature is not valid hex — it should start with 0x.',
    }
  }

  let claimed = null
  if (address) {
    try {
      claimed = ethers.getAddress(address)
    } catch {
      return {
        status: VERIFY_STATUS.INVALID,
        method: null,
        signer: null,
        reason: 'The address to check is not a valid address.',
      }
    }
  }

  const recovered = recoverPersonalSigner(message, signature)

  // No claimed address: this is the "who signed this?" question, not a verdict on anyone.
  if (!claimed) {
    if (recovered) {
      return { status: VERIFY_STATUS.VALID, method: SIGN_SCHEMES.EIP191, signer: recovered, reason: null }
    }
    return {
      status: VERIFY_STATUS.UNVERIFIABLE,
      method: null,
      signer: null,
      reason:
        'These bytes are not a recoverable wallet signature, so no signer can be named. Enter the address that is claimed to have signed and it can be checked against the account itself.',
    }
  }

  if (recovered && sameAddress(recovered, claimed)) {
    return { status: VERIFY_STATUS.VALID, method: SIGN_SCHEMES.EIP191, signer: recovered, reason: null }
  }

  // Either the bytes are not ECDSA (a contract-account envelope) or they recovered to somebody
  // else. Both are answered by the same question: does the claimed account itself accept them?
  // A smart-account owner is not the account, so a mismatch here is NOT yet a negative.
  const onChain = await checkErc1271({ message, signature, address: claimed, chainId, provider })

  if (!onChain.answered) {
    // Note what is NOT happening here: a mismatching ECDSA recovery is not promoted to a negative
    // just because the on-chain leg couldn't run. The claimed address may well be a contract
    // account we were simply never told where to find, and its owner key recovering instead is
    // exactly what that looks like. The recovery is reported as EVIDENCE, not as a verdict.
    const base = UNVERIFIABLE_REASON[onChain.reason] ?? 'The signature could not be checked.'
    return {
      status: VERIFY_STATUS.UNVERIFIABLE,
      method: null,
      signer: recovered,
      reason: recovered
        ? `${base} As a wallet signature it recovers to ${recovered} — which may be an owner of the account you entered, or an unrelated address.`
        : base,
    }
  }
  if (onChain.valid) {
    return { status: VERIFY_STATUS.VALID, method: SIGN_SCHEMES.ERC1271, signer: null, reason: null }
  }

  const plainAccount = onChain.reason === 'no-code'
  let reason
  if (recovered) {
    reason = `This signature was produced by ${recovered}, not by the address you entered.`
  } else if (plainAccount) {
    // Non-recoverable bytes against an address that holds no code on the named chain: nothing
    // there could have produced them. Say that, rather than implying a contract refused.
    reason =
      'These bytes are not a wallet signature, and that address holds no contract on the chain given — so it cannot have signed this message.'
  } else {
    reason = 'That account does not accept this signature for this message.'
  }
  return {
    status: VERIFY_STATUS.INVALID,
    method: plainAccount ? SIGN_SCHEMES.EIP191 : SIGN_SCHEMES.ERC1271,
    signer: recovered,
    reason,
  }
}

/** Verify straight from a parsed document (`parseSignedMessage().doc`). */
export function verifySignedMessage(doc, { provider = null } = {}) {
  return verifyMessage({
    message: doc.message,
    signature: doc.signature,
    address: doc.address,
    chainId: doc.chainId,
    provider,
  })
}
