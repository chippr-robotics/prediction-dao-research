/**
 * Trade-signer seam (spec 057, FR-019) — resolves how to sign a CLOB order for the connected account,
 * and honestly reports when an account type can't sign (never a dead button). Mirrors the collectibles
 * `resolveOrderSigner` seam.
 *
 * EOA sessions sign with the ethers wallet signer. Passkey smart accounts sign through the existing
 * `passkeyIntentSigner` adapter (ERC-1271 over `replaySafeHash`). Passkey trading stays behind
 * `PASSKEY_PREDICT_ENABLED` until Polymarket's CLOB is confirmed to validate our account's ERC-1271
 * signatures end-to-end; until then passkey users see an honest "not available yet" (FR-019).
 */
import { passkeyIntentSigner } from '../passkey/intentSigner'

// Flip to true only after a CLOB order signed by our account implementation is confirmed accepted by
// Polymarket end-to-end. The adapter mechanism is unit-tested regardless.
export const PASSKEY_PREDICT_ENABLED = false

/**
 * @param {object} args
 * @param {string} args.loginMethod   'passkey' | other
 * @param {object|null} args.signer   ethers signer for EOA sessions
 * @param {string|null} args.address
 * @param {number} args.chainId
 * @param {{ credentialId?: string, ownerIndex?: number }} [args.passkey]
 * @param {boolean} [args.enablePasskey]   test seam; defaults to PASSKEY_PREDICT_ENABLED
 * @param {Function} [args.makePasskeySigner]  test seam; defaults to passkeyIntentSigner
 * @returns {{ canSign: boolean, kind: 'eoa'|'passkey'|'none', address?: string, reason?: string, sign?: Function }}
 */
export function resolveTradeSigner({
  loginMethod,
  signer,
  address,
  chainId,
  passkey,
  enablePasskey = PASSKEY_PREDICT_ENABLED,
  makePasskeySigner = passkeyIntentSigner,
}) {
  if (!address) return { canSign: false, kind: 'none', reason: 'Connect a wallet to trade.' }

  if (loginMethod === 'passkey') {
    if (!enablePasskey) {
      return { canSign: false, kind: 'passkey', reason: "Trading isn't available for passkey accounts yet." }
    }
    const { credentialId, ownerIndex = 0 } = passkey || {}
    if (!credentialId) {
      return { canSign: false, kind: 'passkey', reason: "Trading isn't available for this passkey account yet." }
    }
    const ps = makePasskeySigner({ chainId, address, credentialId, ownerIndex })
    return { canSign: true, kind: 'passkey', address, sign: (domain, types, message) => ps.signTypedData(domain, types, message) }
  }

  if (!signer) return { canSign: false, kind: 'eoa', reason: 'Connect a wallet to trade.' }
  return { canSign: true, kind: 'eoa', address, sign: (domain, types, message) => signer.signTypedData(domain, types, message) }
}
