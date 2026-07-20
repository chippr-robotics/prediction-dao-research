/**
 * Bitcoin balance source for usePortfolio (spec 061, task T019 — FR-008/009/010).
 *
 * Reads the member's ISSUED-ADDRESS CACHE (ledgerStore) — never key material —
 * so the portfolio can show Bitcoin without a PRF ceremony. A wallet that has
 * never issued/discovered an address contributes nothing (no row, matching
 * the registry-driven discovery disclosure); discovery happens in
 * useBitcoinWallet on unlock, after which the ledger is populated and the
 * portfolio picks it up.
 *
 * Honest-state rules:
 *  - lookup failure ⇒ the BTC instance is reported FAILED (skipped +
 *    surfaced via the portfolio's existing failedAssets channel), never a
 *    zero balance (FR-010);
 *  - stamps recognition degraded ⇒ value still displays, but coins are
 *    classified 'unverified' so protectedSats (and NOT spendableSats)
 *    carries them — total ≠ spendable stays explained (FR-018/FR-019);
 *  - pending (mempool) value is separated from confirmed (FR-009).
 */

import { getBitcoinPortfolioAsset } from '../../config/assetTaxonomy'
import { ledgerStore, classifyUtxos } from './wallet'
import { balanceComponents } from './coinSelection'

/**
 * @param {object} p
 * @param {string} p.account            connected account id (EVM address)
 * @param {string[]} p.networkIds       bitcoin network ids in scope
 * @param {object} p.gateway            bitcoin gateway client
 * @param {object} [p.store]            ledgerStore-compatible (injectable)
 * @returns {Promise<{holdings: Array, failed: string[]}>}
 *   holdings: [{ asset, confirmedSats, pendingSats, protectedSats,
 *                spendableSats, stampsDegraded }]
 */
export async function loadBitcoinHoldings({ account, networkIds, gateway, store = ledgerStore() }) {
  const holdings = []
  const failed = []

  for (const networkId of networkIds) {
    const asset = getBitcoinPortfolioAsset(networkId)
    if (!asset || !account) continue

    const issued = store.get(account, networkId).issued
    if (issued.length === 0) continue // never used ⇒ no row (not a zero claim)

    const addresses = issued.map((a) => a.address)
    const scriptTypeOf = new Map(
      issued.map((a) => [a.address, a.type === 'taproot' ? 'p2tr' : 'p2wpkh'])
    )

    const [lookup, stamps] = await Promise.all([
      gateway.lookupAddresses(networkId, addresses),
      gateway.getStamps(networkId, addresses),
    ])
    if (!lookup?.ok) {
      failed.push(asset.symbol)
      continue
    }

    const utxos = lookup.results.flatMap((r) =>
      (r.utxos ?? []).map((u) => ({
        ...u,
        address: r.address,
        scriptType: scriptTypeOf.get(r.address) ?? 'p2wpkh',
      }))
    )
    const coins = classifyUtxos(utxos, stamps)
    const components = balanceComponents(coins)
    // Mempool-only inbound value isn't a UTXO with confirmations yet in every
    // upstream shape — fold the per-address signed pending too.
    const pendingFromLookup = lookup.results.reduce((s, r) => s + (r.pendingSats ?? 0), 0)

    holdings.push({
      asset,
      confirmedSats: components.confirmedSats,
      pendingSats: components.pendingSats || pendingFromLookup,
      protectedSats: components.protectedSats,
      spendableSats: components.spendableSats,
      stampsDegraded: !stamps?.ok || Boolean(stamps?.degraded),
    })
  }

  return { holdings, failed }
}

/** Sats → holding shape consumed by aggregateHoldings (BTC has 8 decimals). */
export function toBitcoinHolding(entry, priceMap) {
  const { asset } = entry
  const balance = entry.confirmedSats / 1e8
  let usd = null
  if (entry.confirmedSats === 0) {
    usd = 0
  } else {
    const price = priceMap.get('BTC')
    if (price) usd = balance * price.usd
  }
  return {
    asset,
    balance,
    balanceRaw: BigInt(entry.confirmedSats),
    usd,
    network: asset.name,
    bitcoin: {
      pendingSats: entry.pendingSats,
      protectedSats: entry.protectedSats,
      spendableSats: entry.spendableSats,
      stampsDegraded: entry.stampsDegraded,
    },
  }
}
