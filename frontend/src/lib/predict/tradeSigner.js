/**
 * Trade-eligibility seam (spec 057, FR-019) — decides whether the connected account can trade on the
 * CLOB, and honestly reports when it can't (never a dead button). The official viem-native
 * `@polymarket/clob-client` performs the actual EIP-712 order signing + L1 credential derivation through
 * the wallet client itself, so this seam no longer returns a `sign` function — it only gates.
 *
 * EOA sessions trade with the wagmi/viem `walletClient`. Passkey smart accounts stay behind
 * `PASSKEY_PREDICT_ENABLED`: CLOB binds the API key to the order signer and must be confirmed to validate
 * our ERC-1271 account signatures end-to-end before we enable them; until then passkey users see an honest
 * "not available yet" (FR-019).
 */

// Flip to true only after a CLOB order signed by our passkey account implementation is confirmed accepted
// by Polymarket end-to-end (ERC-1271 / signatureType 3), with per-user creds derived for that account.
export const PASSKEY_PREDICT_ENABLED = false

/**
 * @param {object} args
 * @param {string} args.loginMethod       'passkey' | other
 * @param {object|null} args.walletClient  viem WalletClient (wagmi useWalletClient) for EOA sessions
 * @param {string|null} args.address
 * @param {boolean} [args.enablePasskey]  test seam; defaults to PASSKEY_PREDICT_ENABLED
 * @returns {{ canSign: boolean, kind: 'eoa'|'passkey'|'none', address?: string, reason?: string }}
 */
export function resolveTradeSigner({ loginMethod, walletClient, address, enablePasskey = PASSKEY_PREDICT_ENABLED }) {
  if (!address) return { canSign: false, kind: 'none', reason: 'Connect a wallet to trade.' }

  if (loginMethod === 'passkey') {
    return {
      canSign: false,
      kind: 'passkey',
      address,
      reason: enablePasskey ? undefined : "Trading isn't available for passkey accounts yet.",
      ...(enablePasskey ? { canSign: true } : {}),
    }
  }

  if (!walletClient) return { canSign: false, kind: 'eoa', address, reason: 'Connect a wallet to trade.' }
  return { canSign: true, kind: 'eoa', address }
}
