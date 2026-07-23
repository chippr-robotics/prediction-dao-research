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
import { createBitcoinWallet, ledgerStore, classifyUtxos } from './wallet'
import { loadBitcoinHoldings } from './portfolioSource'
import { prepareSend, executeSend } from './send'
import { deriveLegacyAccount, deriveChildNode, legacySigningKeyAt, LEGACY_PURPOSE } from './legacyDerivation'
import { encodeLegacyAddress } from './legacyAddresses'

/** spec-061 wallet type → derivation type + PSBT scriptType. */
const WALLET_TYPE = { segwit: 'segwit', taproot: 'taproot' }
const SCRIPT_TYPE = { segwit: 'p2wpkh', taproot: 'p2tr' }

/** All hardware/legacy address types, and which the spec-061 signer can currently SPEND. */
export const ALL_BTC_TYPES = ['legacy', 'wrapped-segwit', 'segwit', 'taproot']
export const SPENDABLE_BTC_TYPES = ['segwit', 'taproot']
const GAP_LIMIT = 20

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
 * Gap-limit scan of one derivation chain (external or change) for a balance. Batches
 * addresses GAP_LIMIT at a time; stops once a whole window is unused (the gap limit).
 * @returns {Promise<{confirmedSats:number, pendingSats:number, usedAddresses:string[], stale:boolean}>}
 */
async function scanChain(deriveAt, gateway, network) {
  let index = 0
  let confirmedSats = 0
  let pendingSats = 0
  const usedAddresses = []
  // Safety bound: a legitimate wallet never has 500+ addresses on one chain.
  for (let guard = 0; guard < 25; guard += 1) {
    const addrs = Array.from({ length: GAP_LIMIT }, (_, i) => deriveAt(index + i))
    const res = await gateway.lookupAddresses(network, addrs)
    if (!res?.ok) return { confirmedSats, pendingSats, usedAddresses, stale: true }
    let lastUsed = -1
    addrs.forEach((address, i) => {
      const r = res.results.find((x) => x.address === address)
      const used = r && (r.confirmedSats > 0 || r.pendingSats !== 0 || (r.utxos?.length ?? 0) > 0 || r.hasHistory === true)
      if (used) {
        confirmedSats += r.confirmedSats || 0
        pendingSats += r.pendingSats || 0
        usedAddresses.push(address)
        lastUsed = i
      }
    })
    if (lastUsed === -1) break // a full gap window with no activity → done
    index += lastUsed + 1
  }
  return { confirmedSats, pendingSats, usedAddresses, stale: false }
}

/**
 * FULL hardware-wallet scan: sum a recovered seed's Bitcoin across ALL derivation
 * schemes (BIP44 legacy 1…, BIP49 wrapped 3…, BIP84 segwit bc1q…, BIP86 taproot
 * bc1p…), across multiple accounts, external + change chains. This is the VIEW side
 * of "full hardware-wallet scan" — it surfaces funds the account-0-segwit/taproot
 * discovery misses. Spending legacy/wrapped still needs P2PKH/P2SH signer support
 * (documented follow-up); `spendableSats` is the portion sendable today.
 *
 * @returns {Promise<{ confirmedSats:number, pendingSats:number, spendableSats:number,
 *   byType:Record<string,number>, stale:boolean }>}
 */
export async function scanBitcoinBalances({ seed, network = 'bitcoin', accounts = [0, 1, 2], gateway }) {
  const byType = {}
  let confirmedSats = 0
  let pendingSats = 0
  let spendableSats = 0
  let stale = false

  for (const type of ALL_BTC_TYPES) {
    let typeSats = 0
    let accountGap = 0
    for (const account of accounts) {
      // Cache the account node so external+change reuse one derivation.
      const acct = deriveLegacyAccount(seed, { type, account, network })
      const chains = await Promise.all(
        [0, 1].map((chain) =>
          scanChain((i) => encodeLegacyAddress(deriveChildNode(acct, { chain, index: i }).publicKey, { type, network }), gateway, network),
        ),
      )
      const acctSats = chains.reduce((s, c) => s + c.confirmedSats, 0)
      const acctPending = chains.reduce((s, c) => s + c.pendingSats, 0)
      if (chains.some((c) => c.stale)) stale = true
      confirmedSats += acctSats
      pendingSats += acctPending
      typeSats += acctSats
      if (SPENDABLE_BTC_TYPES.includes(type)) spendableSats += acctSats
      // Account-level gap: stop after 2 consecutive empty accounts.
      accountGap = acctSats > 0 || acctPending > 0 ? 0 : accountGap + 1
      if (accountGap >= 2) break
    }
    if (typeSats > 0) byType[type] = typeSats
  }

  return { confirmedSats, pendingSats, spendableSats, byType, stale }
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
 * Assemble what a send needs — spendable coins, a fresh fee quote, and a change
 * address — from the recovered account's discovered ledger. Reuses the spec-061
 * classification (fail-safe stamps) verbatim.
 *
 * @returns {Promise<{ coins:Array, quote:(object|null), changeAddress:(string|null), stale?:boolean }>}
 */
export async function prepareLegacyBitcoinSend({ seed, network = 'bitcoin', account = 0, gateway, store = ledgerStore(), nowMs = Date.now() }) {
  const accountId = bitcoinAccountId(seed)
  const issued = store.get(accountId, network).issued || []
  if (!issued.length) return { coins: [], quote: null, changeAddress: null }

  const addresses = issued.map((a) => a.address)
  const scriptTypeOf = new Map(issued.map((a) => [a.address, a.type === 'taproot' ? 'p2tr' : 'p2wpkh']))
  const [lookup, stamps, fees] = await Promise.all([
    gateway.lookupAddresses(network, addresses),
    gateway.getStamps(network, addresses),
    gateway.getFees(network),
  ])
  if (!lookup?.ok) return { coins: [], quote: null, changeAddress: null, stale: true }

  const utxos = lookup.results.flatMap((r) =>
    (r.utxos ?? []).map((u) => ({ ...u, address: r.address, scriptType: scriptTypeOf.get(r.address) ?? 'p2wpkh' })),
  )
  const coins = classifyUtxos(utxos, stamps)

  // Change goes to a fresh, never-shown segwit address (issued + cursor advanced).
  const wallet = createBitcoinWallet({
    account: accountId,
    networkId: network,
    deriveAddress: makeDeriveAddress(seed, { account, network }),
    gateway,
    store,
  })
  const change = wallet.nextReceiveAddress('segwit')
  const quote = fees?.ok ? { rates: fees.rates, fetchedAt: nowMs } : null
  return { coins, quote, changeAddress: change.address }
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
