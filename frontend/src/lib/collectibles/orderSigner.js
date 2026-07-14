/**
 * Order-signer seam (spec 056, FR-019) — resolves how to sign a Seaport order for the connected
 * account, and honestly reports when an account type can't sign (never a dead button).
 *
 * EOA sessions sign with the ethers wallet signer. Passkey smart accounts sign through the existing
 * `passkeyIntentSigner` adapter, which wraps the order hash in the account's `replaySafeHash` and
 * returns the ERC-1271 envelope OpenSea validates on-chain (research D3). Passkey selling stays behind
 * `PASSKEY_SELL_ENABLED` until OpenSea's ERC-1271 validation of our account is confirmed end-to-end;
 * until then passkey users see an honest "not available yet" (FR-019), never a failed signature.
 */
import { passkeyIntentSigner } from '../passkey/intentSigner'

// Flip to true only after an ERC-1271 listing from our account implementation is confirmed accepted
// by OpenSea's orderbook end-to-end (research D3). The adapter mechanism is unit-tested regardless.
export const PASSKEY_SELL_ENABLED = false

/**
 * @param {object} args
 * @param {string} args.loginMethod   'passkey' | other
 * @param {object|null} args.signer   ethers signer for EOA sessions
 * @param {string|null} args.address
 * @param {number} args.chainId
 * @param {{ credentialId?: string, ownerIndex?: number }} [args.passkey]
 * @param {boolean} [args.enablePasskey]   test seam; defaults to PASSKEY_SELL_ENABLED
 * @param {Function} [args.makePasskeySigner]  test seam; defaults to passkeyIntentSigner
 * @returns {{ canSign: boolean, kind: 'eoa'|'passkey'|'none', address?: string, reason?: string, sign?: Function }}
 */
export function resolveOrderSigner({
  loginMethod,
  signer,
  address,
  chainId,
  passkey,
  enablePasskey = PASSKEY_SELL_ENABLED,
  makePasskeySigner = passkeyIntentSigner,
}) {
  if (!address) return { canSign: false, kind: 'none', reason: 'Connect a wallet to sell.' }

  if (loginMethod === 'passkey') {
    if (!enablePasskey) {
      return { canSign: false, kind: 'passkey', reason: "Selling isn't available for passkey accounts yet." }
    }
    const { credentialId, ownerIndex = 0 } = passkey || {}
    if (!credentialId) {
      return { canSign: false, kind: 'passkey', reason: "Selling isn't available for this passkey account yet." }
    }
    const ps = makePasskeySigner({ chainId, address, credentialId, ownerIndex })
    // The adapter computes the order hash, wraps it in replaySafeHash, WebAuthn-signs, and returns the
    // ERC-1271 envelope — so this is the SAME signTypedData shape as an EOA (research D3).
    return { canSign: true, kind: 'passkey', address, sign: (domain, types, message) => ps.signTypedData(domain, types, message) }
  }

  if (!signer) return { canSign: false, kind: 'eoa', reason: 'Connect a wallet to sell.' }
  return { canSign: true, kind: 'eoa', address, sign: (domain, types, message) => signer.signTypedData(domain, types, message) }
}
