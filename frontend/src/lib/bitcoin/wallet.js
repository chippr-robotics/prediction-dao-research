/**
 * Bitcoin wallet state: issued-address ledger, rotation, discovery, and UTXO
 * classification (spec 061, tasks T011/T017/T029 — research.md R5/R6).
 *
 * Invariants (contracts/key-derivation-btc.md + data-model.md):
 *  - The rotation cursor per (account, network, type) NEVER decreases; a fresh
 *    receive address is the lowest index never yet displayed.
 *  - The persisted ledger is a cache, never the source of truth: discovery
 *    (gap-limit-20 scan) rebuilds issued addresses and the cursor from chain
 *    state on unlock, so recovery on a new device finds all funds (FR-003).
 *  - Classification fails safe: a coin is 'spendable' only when confirmed AND
 *    positively known stamp-free; degraded stamps recognition ⇒ 'unverified'
 *    (treated exactly like 'protected' by coin selection) (FR-018/FR-019).
 *
 * Pure logic with injected collaborators (derive fn, gateway client, storage)
 * — no React, no direct network IO; the useBitcoinWallet hook wires the real
 * dependencies.
 */

export const GAP_LIMIT = 20
const LEDGER_KEY = 'fairwins.bitcoin.ledger.v1'

/** Persistent issued-address ledger, keyed per (account, network). */
export function ledgerStore(storage = globalThis.localStorage) {
  const read = () => {
    try {
      return JSON.parse(storage.getItem(LEDGER_KEY) || '{}')
    } catch {
      return {}
    }
  }
  const keyOf = (account, networkId) => `${String(account).toLowerCase()}:${networkId}`
  return {
    get(account, networkId) {
      return read()[keyOf(account, networkId)] ?? { issued: [], preferredType: 'segwit' }
    },
    set(account, networkId, value) {
      const all = read()
      all[keyOf(account, networkId)] = value
      storage.setItem(LEDGER_KEY, JSON.stringify(all))
    },
  }
}

/** Rotation cursor per type: max issued index + 1, never negative. */
export function nextIndex(issued, type) {
  const indexes = issued.filter((a) => a.type === type).map((a) => a.index)
  return indexes.length === 0 ? 0 : Math.max(...indexes) + 1
}

/**
 * Create the wallet controller.
 *
 * @param {object} p
 * @param {string} p.account   owning FairWins account id (EVM address string)
 * @param {string} p.networkId 'bitcoin' | 'bitcoin-testnet'
 * @param {(type: 'segwit'|'taproot', index: number) => string} p.deriveAddress
 * @param {object} p.gateway   bitcoin gateway client (lookupAddresses, getStamps)
 * @param {object} [p.store]   ledgerStore-compatible persistence (injectable)
 * @param {() => string} [p.now] ISO timestamp source (injectable for tests)
 */
export function createBitcoinWallet({
  account,
  networkId,
  deriveAddress,
  gateway,
  store = ledgerStore(),
  now = () => new Date().toISOString(),
}) {
  if (!account) throw new Error('bitcoin wallet: account is required')

  const load = () => store.get(account, networkId)
  const save = (state) => store.set(account, networkId, state)

  /**
   * Issue a fresh, never-before-displayed receive address of `type`
   * (FR-004). Appends to the ledger and advances the cursor.
   */
  function nextReceiveAddress(type = load().preferredType) {
    const state = load()
    const index = nextIndex(state.issued, type)
    const address = deriveAddress(type, index)
    state.issued = [
      ...state.issued,
      { address, type, index, network: networkId, firstShownAt: now() },
    ]
    save(state)
    return { address, type, index }
  }

  /** Every address we monitor (issued or discovered) — FR-005. */
  function issuedAddresses() {
    return load().issued.slice()
  }

  function preferredType() {
    return load().preferredType
  }

  function setPreferredType(type) {
    if (type !== 'segwit' && type !== 'taproot') {
      throw new Error(`bitcoin wallet: unknown address type "${type}"`)
    }
    const state = load()
    state.preferredType = type
    save(state)
  }

  /**
   * Gap-limit discovery (research R5): walk each type's external chain until
   * GAP_LIMIT consecutive addresses with no history, merging results into the
   * ledger. The cursor only moves FORWARD: used-on-chain indexes count as
   * issued even if the local cache never saw them (sender-paid-ahead edge
   * case), and cached issued entries survive even when unused on chain.
   *
   * Returns { ok, addresses, utxos, stale } — `stale: true` (with the cached
   * ledger) when the gateway is unreachable, so callers render stale-not-zero
   * (FR-010).
   */
  async function discover(types = ['segwit', 'taproot']) {
    const state = load()
    const allUtxos = []
    let anyStale = false

    for (const type of types) {
      const known = new Map(
        state.issued.filter((a) => a.type === type).map((a) => [a.index, a])
      )
      let index = 0
      let gap = 0
      while (gap < GAP_LIMIT) {
        // Scan one gap-window batch at a time.
        const batch = []
        for (let i = 0; i < GAP_LIMIT; i += 1) batch.push(index + i)
        const addresses = batch.map((i) => ({
          index: i,
          address: known.get(i)?.address ?? deriveAddress(type, i),
        }))
        const res = await gateway.lookupAddresses(
          networkId,
          addresses.map((a) => a.address)
        )
        if (!res.ok) {
          anyStale = true
          break
        }
        for (const { index: i, address } of addresses) {
          const entry = res.results.find((r) => r.address === address)
          const used =
            entry &&
            (entry.confirmedSats > 0 ||
              entry.pendingSats !== 0 ||
              (entry.utxos?.length ?? 0) > 0 ||
              entry.hasHistory === true)
          if (used) {
            gap = 0
            if (!known.has(i)) {
              const discovered = {
                address,
                type,
                index: i,
                network: networkId,
                firstShownAt: now(),
              }
              known.set(i, discovered)
              state.issued = [...state.issued, discovered]
            }
            for (const u of entry.utxos ?? []) {
              allUtxos.push({ ...u, address, scriptType: type === 'taproot' ? 'p2tr' : 'p2wpkh' })
            }
          } else {
            gap += 1
            if (gap >= GAP_LIMIT) break
          }
        }
        index += GAP_LIMIT
      }
    }

    save(state)
    return { ok: !anyStale, stale: anyStale, addresses: state.issued.slice(), utxos: allUtxos }
  }

  return {
    nextReceiveAddress,
    issuedAddresses,
    preferredType,
    setPreferredType,
    discover,
  }
}

/**
 * Merge stamps recognition onto raw UTXOs → classified coins (FR-018/FR-019).
 *
 * @param {Array} utxos    [{ txid, vout, valueSats, address, confirmations, scriptType }]
 * @param {object} stamps  gateway stamps result: { ok, degraded, stamps: [{ outpoint, stampId, … }] }
 * @param {Set<string>} [lockedOutpoints] "txid:vout" locked by in-flight sends
 */
export function classifyUtxos(utxos, stamps, lockedOutpoints = new Set()) {
  const stampByOutpoint = new Map()
  if (stamps?.ok && !stamps.degraded) {
    for (const s of stamps.stamps ?? []) {
      stampByOutpoint.set(`${s.outpoint.txid}:${s.outpoint.vout}`, s.stampId)
    }
  }
  const recognitionHealthy = Boolean(stamps?.ok) && !stamps?.degraded

  return utxos.map((u) => {
    const key = `${u.txid}:${u.vout}`
    const lockedByTx = lockedOutpoints.has(key) ? key : null
    let classification
    if ((u.confirmations ?? 0) < 1) {
      classification = 'pending'
    } else if (!recognitionHealthy) {
      // Fail safe: nothing is positively stamp-free while recognition is down.
      classification = 'unverified'
    } else if (stampByOutpoint.has(key)) {
      classification = 'protected'
    } else {
      classification = 'spendable'
    }
    return { ...u, classification, stampId: stampByOutpoint.get(key) ?? null, lockedByTx }
  })
}
