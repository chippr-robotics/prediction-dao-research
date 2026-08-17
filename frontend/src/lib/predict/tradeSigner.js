/**
 * Trade-eligibility seam (spec 057, FR-019) — decides whether the connected account can trade on the
 * CLOB, and honestly reports when it can't (never a dead button). The official viem-native
 * `@polymarket/clob-client` performs the actual EIP-712 order signing + L1 credential derivation through
 * the signer we hand it, so this seam does not sign — it only gates and names the signing rail.
 *
 * EOA sessions trade with the wagmi/viem `walletClient` (signatureType 0). Passkey smart accounts trade
 * as CLOB smart-wallet makers (signatureType 3, POLY_1271): the account itself is maker, signer AND
 * funder, and every signature is the account's ERC-1271 WebAuthn envelope produced by
 * `lib/predict/passkeyClobSigner.js` — per-account, exactly as FR-019 requires (an account whose
 * signatures the CLOB rejects gets an honest error + the Polymarket link-out, not a blanket exclusion).
 */

// Passkey Predict trading rides the CLOB's smart-wallet rail (signatureType 3 / ERC-1271). Flip to
// false to fall back to the honest "not available yet" notice for every passkey session at once.
export const PASSKEY_PREDICT_ENABLED = true

/**
 * @param {object} args
 * @param {string} args.loginMethod       'passkey' | other
 * @param {object|null} args.walletClient  viem WalletClient (wagmi useWalletClient) for EOA sessions
 * @param {string|null} args.address
 * @param {string|null} [args.credentialId] the passkey session's credential (connectors/passkey readSession)
 * @param {boolean} [args.enablePasskey]  test seam; defaults to PASSKEY_PREDICT_ENABLED
 * @returns {{ canSign: boolean, kind: 'eoa'|'passkey'|'none', address?: string, credentialId?: string, reason?: string }}
 */
export function resolveTradeSigner({
  loginMethod,
  walletClient,
  address,
  credentialId = null,
  enablePasskey = PASSKEY_PREDICT_ENABLED,
}) {
  if (!address) return { canSign: false, kind: 'none', reason: 'Connect a wallet to trade.' }

  if (loginMethod === 'passkey') {
    if (!enablePasskey) {
      return { canSign: false, kind: 'passkey', address, reason: "Trading isn't available for passkey accounts yet." }
    }
    // The ceremony must be pinned to the session credential (spec 045 US3) — a session that lost its
    // credential record cannot sign, and pretending otherwise would be the dead button FR-019 forbids.
    if (!credentialId) {
      return { canSign: false, kind: 'passkey', address, reason: 'Sign in again with your passkey to trade.' }
    }
    return { canSign: true, kind: 'passkey', address, credentialId }
  }

  if (!walletClient) return { canSign: false, kind: 'eoa', address, reason: 'Connect a wallet to trade.' }
  return { canSign: true, kind: 'eoa', address }
}
