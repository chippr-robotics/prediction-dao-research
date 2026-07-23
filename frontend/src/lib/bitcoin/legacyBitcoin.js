/**
 * Legacy Bitcoin end-to-end glue (spec 063, US2 / T025-T027).
 *
 * Ties the recovered-seed derivation (legacyDerivation.js) to the PROVEN spec-061
 * Bitcoin stack — gateway lookup, gap-limit discovery, ledger, coin selection,
 * PSBT signing, broadcast — WITHOUT touching any of it. The spec-061 modules are
 * address-keyed and closure-injected, so recovery is just: a legacy `deriveAddress`
 * closure into `createBitcoinWallet`, and a legacy `keyFor` closure into
 * `executeSend`. Everything downstream (balances, UTXO classification, coin
 * selection, sign, broadcast, fee ceiling) is reused verbatim.
 *
 * Scope: native-segwit (BIP84, bc1q…) + taproot (BIP86, bc1p…) — the types the
 * spec-061 signer supports drop-in — at BIP44 account 0. The derivation library
 * additionally supports BIP44/49 and higher accounts; spending those needs
 * P2PKH/P2SH signing support in the spec-061 signer (a documented follow-up).
 *
 * Key material is memory-only (FR-017/018): the seed lives only in the caller's
 * unlocked session; private keys are produced transiently inside `keyFor` and
 * dropped after signing. The gateway sees only bare addresses + signed raw txs.
 */

import { HDKey } from '@scure/bip32'
import { createBitcoinWallet, ledgerStore } from './wallet'
import { loadBitcoinHoldings } from './portfolioSource'
import { prepareSend, executeSend } from './send'
import { deriveLegacyAccount, deriveChildNode, legacySigningKeyAt } from './legacyDerivation'
import { encodeLegacyAddress } from './legacyAddresses'

/** spec-061 wallet type → derivation type + PSBT scriptType. */
const WALLET_TYPE = { segwit: 'segwit', taproot: 'taproot' }
const SCRIPT_TYPE = { segwit: 'p2wpkh', taproot: 'p2tr' }

/**
 * A stable, collision-free ledger account id for a recovered seed, so its
 * Bitcoin ledger never mixes with the passkey wallet's (which is keyed by the
 * EVM address). Derived from the BIP-32 master fingerprint — public, not secret.
 */
export function bitcoinAccountId(seed) {
  const fp = HDKey.fromMasterSeed(seed).fingerprint >>> 0
  return `legacy:${fp.toString(16).padStart(8, '0')}`
}

/**
 * Build the `deriveAddress(type, index)` closure the spec-061 wallet needs, bound
 * to a recovered seed + BIP44 account, caching the account nodes.
 */
function makeDeriveAddress(seed, { account = 0, network = 'bitcoin' } = {}) {
  const nodes = {}
  const nodeFor = (type) => (nodes[type] ??= deriveLegacyAccount(seed, { type: WALLET_TYPE[type], account, network }))
  return (type, index) => encodeLegacyAddress(deriveChildNode(nodeFor(type), { chain: 0, index }).publicKey, { type: WALLET_TYPE[type], network })
}

/**
 * Run gap-limit discovery for a recovered seed's segwit + taproot addresses.
 * @returns {Promise<{ ok:boolean, stale:boolean, accountId:string }>}
 */
export async function discoverLegacyBitcoin({ seed, network = 'bitcoin', account = 0, gateway, store = ledgerStore() }) {
  const accountId = bitcoinAccountId(seed)
  const wallet = createBitcoinWallet({
    account: accountId,
    networkId: network,
    deriveAddress: makeDeriveAddress(seed, { account, network }),
    gateway,
    store,
  })
  const res = await wallet.discover(['segwit', 'taproot'])
  return { ok: res.ok !== false, stale: Boolean(res.stale), accountId }
}

/**
 * Portfolio holdings for the recovered Bitcoin account (reads the ledger + gateway;
 * never key material). Surfaces as its own row, keyed off {@link bitcoinAccountId}.
 */
export async function legacyBitcoinHoldings({ seed, networkIds = ['bitcoin'], gateway, store = ledgerStore() }) {
  return loadBitcoinHoldings({ account: bitcoinAccountId(seed), networkIds, gateway, store })
}

/**
 * Build the `keyFor(address)` closure `executeSend` needs — resolves a discovered
 * address back to its (type, index) via the ledger and derives the signing key
 * transiently. Memory-only.
 */
export function makeLegacyKeyFor({ seed, network = 'bitcoin', account = 0, store = ledgerStore() }) {
  const issued = store.get(bitcoinAccountId(seed), network).issued || []
  const byAddress = new Map(issued.map((e) => [e.address, e]))
  return (address) => {
    const entry = byAddress.get(address)
    if (!entry) return null
    const { privkey, pubkey } = legacySigningKeyAt(seed, {
      type: WALLET_TYPE[entry.type],
      account,
      chain: 0,
      index: entry.index,
      network,
    })
    return { privateKey: privkey, publicKey: pubkey, scriptType: SCRIPT_TYPE[entry.type] }
  }
}

/**
 * Prepare + sign + broadcast a spend from the recovered Bitcoin account. Reuses
 * the spec-061 send pipeline; the confirmed fee is a hard ceiling (FR-012) and the
 * member pays it (BTC is never gasless — disclose in the UI).
 *
 * @returns {Promise<{ok:true, txid, feeSats}|{ok:false, error, message?}>}
 */
export async function sendLegacyBitcoin({
  seed, network = 'bitcoin', account = 0, coins, destination, amountSats, feeRate, quote,
  changeAddress, gateway, store = ledgerStore(), nowMs,
}) {
  const prepared = prepareSend({ coins, destination, amountSats, feeRate, quote, changeAddress, networkId: network, nowMs })
  if (!prepared.ok) return prepared
  const keyFor = makeLegacyKeyFor({ seed, network, account, store })
  return executeSend({ plan: prepared.plan, keyFor, gateway })
}
