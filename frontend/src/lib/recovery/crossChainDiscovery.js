/**
 * Cross-chain balance discovery for a recovered secret (spec 063 / T009).
 *
 * Pure logic: given the derived accounts (from deriveCrossChainAccounts) and injected
 * network clients, find which accounts hold funds and return per-chain results with
 * HONEST states — 'found'/'complete' vs 'unreachable' (never zero-as-error, never
 * error-as-zero, FR-014). A slow/unreachable chain never blocks the others (SC-008):
 * every chain is probed independently and its failure is isolated.
 *
 * Only PUBLIC addresses cross the client boundary — never keys (FR-021).
 */

import { discoverLegacyBitcoin, scanBitcoinBalances } from '../bitcoin/legacyBitcoin'

/**
 * @param {{
 *   derived: object,                         // from deriveCrossChainAccounts
 *   solanaRpc?: object,                      // createSolanaRpc(...) or null
 *   bitcoinGateway?: object,                 // createBitcoinGatewayClient(...) or null
 *   bitcoinStore?: object,                   // ledgerStore(...)
 *   bitcoinNetworkIds?: string[],
 * }} args
 * @returns {Promise<{ evm:object, solana:Array, bitcoin:(object|null) }>}
 */
export async function discoverCrossChain({
  derived,
  solanaRpc = null,
  bitcoinGateway = null,
  bitcoinStore,
}) {
  const results = { evm: derived.evm, solana: [], bitcoin: null }

  // Solana: probe each candidate account for balance OR prior activity, in parallel.
  if (derived.solana?.length && solanaRpc) {
    const probes = await Promise.all(
      derived.solana.map(async (c) => {
        try {
          const [balance, sigs] = await Promise.all([
            solanaRpc.getBalance(c.address),
            solanaRpc.getSignaturesForAddress(c.address, { limit: 1 }).catch(() => []),
          ])
          const active = balance > 0n || sigs.length > 0
          return active ? { scheme: c.scheme, account: c.account, address: c.address, balanceLamports: balance, status: 'found' } : null
        } catch {
          return { scheme: c.scheme, account: c.account, address: c.address, status: 'unreachable' }
        }
      }),
    )
    results.solana = probes.filter(Boolean)
  }

  // Bitcoin: FULL hardware-wallet scan (all purposes/accounts) for the balance VIEW,
  // plus segwit/taproot account-0 discovery to populate the ledger the SEND path uses.
  if (derived.bitcoin && derived.seed && bitcoinGateway) {
    try {
      const [full, disc] = await Promise.all([
        scanBitcoinBalances({ seed: derived.seed, network: derived.bitcoin.network, gateway: bitcoinGateway }),
        discoverLegacyBitcoin({ seed: derived.seed, network: derived.bitcoin.network, gateway: bitcoinGateway, store: bitcoinStore }),
      ])
      results.bitcoin = {
        accountId: derived.bitcoin.accountId,
        confirmedSats: full.confirmedSats,
        pendingSats: full.pendingSats,
        spendableSats: full.spendableSats,
        byType: full.byType,
        status: full.stale || disc.stale ? 'partial' : 'complete',
      }
    } catch {
      results.bitcoin = { accountId: derived.bitcoin.accountId, confirmedSats: 0, spendableSats: 0, byType: {}, status: 'unreachable' }
    }
  }

  return results
}
