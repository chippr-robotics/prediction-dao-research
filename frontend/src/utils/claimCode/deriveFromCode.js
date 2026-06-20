/**
 * Claim-code key derivation (feature 024 — open-challenge wagers).
 *
 * The same four-word code deterministically derives, on any device with no server state:
 *   - a secp256k1 claim keypair — `claimAddress` is the on-chain commitment (`claimAuthority`) and the
 *     discovery key; the private key signs the EIP-712 acceptance.
 *   - a symmetric key — seals/opens the code-keyed terms envelope (see crypto/envelopeEncryption.js).
 *
 * v1 derivation is FAST (entropy-only, FR-003a): two domain-separated keccak passes. The `v1` domain tags
 * keep it swappable for a future memory-hard KDF without breaking already-created wagers. The signing key
 * and the encryption key are independent keccak outputs with distinct domain tags, so neither leaks the
 * other.
 */
import { keccak256, toUtf8Bytes, getBytes, SigningKey, computeAddress, Wallet } from 'ethers'
import { normalizeCode } from './wordlist.js'

const CLAIM_DOMAIN = 'FairWins/claim/v1'
const TERMS_DOMAIN = 'FairWins/terms/v1'

// EIP-712 — MUST match the registry's OPEN_ACCEPT_TYPEHASH and EIP712 domain exactly.
const EIP712_DOMAIN_NAME = 'FairWins WagerRegistry'
const EIP712_DOMAIN_VERSION = '1'
const OPEN_ACCEPT_TYPES = {
  OpenAccept: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'taker', type: 'address' }
  ]
}

/**
 * Derive the claim keypair and symmetric key from a four-word code.
 * @param {string} code
 * @returns {{ claimPrivateKey: string, claimAddress: string, symKey: Uint8Array }}
 *   claimPrivateKey: 0x-hex secp256k1 private key; claimAddress: the on-chain claimAuthority + discovery key;
 *   symKey: 32-byte AEAD key for the code-keyed envelope.
 */
export function deriveFromCode(code) {
  const normalized = normalizeCode(code)
  if (!normalized) throw new Error('deriveFromCode: empty code')

  // secp256k1 private key: keccak("FairWins/claim/v1" || normalized). The keccak output is a valid scalar
  // (1..n-1) with overwhelming probability (~1 - 2^-128); SigningKey validates and would throw otherwise.
  const claimPrivateKey = keccak256(toUtf8Bytes(CLAIM_DOMAIN + normalized))
  const claimAddress = computeAddress(new SigningKey(claimPrivateKey).publicKey)

  // Symmetric key: independent domain-separated keccak output.
  const symKey = getBytes(keccak256(toUtf8Bytes(TERMS_DOMAIN + normalized)))

  return { claimPrivateKey, claimAddress, symKey }
}

/**
 * Sign an open-challenge acceptance with the code-derived key. The signature is bound to `taker` (= the
 * wallet that will send acceptOpenWager), so a mempool observer who copies it cannot reuse it for their own
 * address — they would need the code to re-sign (front-running defense, FR-011/SC-006).
 *
 * @param {string} code
 * @param {{ wagerId: bigint|number|string, taker: string, chainId: bigint|number, verifyingContract: string }} params
 * @returns {Promise<string>} 0x-hex signature for acceptOpenWager(wagerId, signature)
 */
export async function signOpenAccept(code, { wagerId, taker, chainId, verifyingContract }) {
  const { claimPrivateKey } = deriveFromCode(code)
  const wallet = new Wallet(claimPrivateKey)
  const domain = {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract
  }
  return wallet.signTypedData(domain, OPEN_ACCEPT_TYPES, { wagerId, taker })
}

export { OPEN_ACCEPT_TYPES, EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION }
