/**
 * useBitcoinWallet (spec 061, tasks T013 + T025) — the orchestration hook for
 * the member's Bitcoin wallet: availability, unlock (one PRF ceremony),
 * receive rotation, balances, and the send pipeline.
 *
 * Architecture: all wallet state lives in ONE module-level session store
 * shared by every hook instance (receive modal, transfer form, portfolio
 * surfaces…), so a single unlock serves the whole app and no instance ever
 * re-runs the PRF ceremony or diverges on locks/activity. Components read the
 * store through useSyncExternalStore; key material (master seed, account
 * nodes) lives in non-reactive module internals and is NEVER placed in React
 * state, persisted, logged, or transmitted (contracts/key-derivation-btc.md
 * invariant 3).
 *
 * Availability matrix (drives FR-020 honest disclosure):
 *  - non-passkey login (injected / WalletConnect)  → 'unavailable'
 *  - passkey on a non-PRF authenticator            → 'unavailable'
 *  - passkey whose credential has no key material  → 'unavailable'
 *  - gateway module unconfigured / killswitched    → 'unavailable'
 *  - passkey + PRF, seed not yet resolved          → 'locked'
 *  - after unlock()                                → 'ready'
 *
 * Testnet/mainnet (FR-021): the active Bitcoin network mirrors the app's EVM
 * testnet mode (NETWORKS[chainId].isTestnet) via BITCOIN_TESTNET_MAINNET_PAIR;
 * flipping the mode re-derives for the paired network and resets all view
 * state — balances/addresses/activity are strictly scoped per side.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useWallet } from './useWalletManagement'
import { getNetwork } from '../config/networks'
import { getActiveBitcoinNetworkId } from '../config/bitcoinNetworks'
import { capability } from '../lib/passkey/prfKeys'
import { knownCredentials } from '../lib/passkey/credentials'
import { readSession } from '../connectors/passkey'
import { resolveMasterSeed } from '../lib/passkey/encryption'
import { deriveAccount, receivePubkey, receivePrivkey } from '../lib/bitcoin/derivation'
import { encodeAddress, formatBip21 } from '../lib/bitcoin/addresses'
import { createBitcoinWallet, ledgerStore, classifyUtxos, nextIndex } from '../lib/bitcoin/wallet'
import { balanceComponents } from '../lib/bitcoin/coinSelection'
import { prepareSend, executeSend, isQuoteFresh } from '../lib/bitcoin/send'
import { createBitcoinGatewayClient } from '../lib/bitcoin/gatewayClient'

const DEFAULT_POLL_INTERVAL_MS = 15_000
const DEFAULT_POLL_MAX_MS = 30 * 60_000

const GATEWAY_OFF_REASON =
  'The Bitcoin service is temporarily disabled — balances and sends will return when it is back.'

const ZERO_BALANCES = Object.freeze({
  confirmedSats: 0,
  pendingSats: 0,
  protectedSats: 0,
  spendableSats: 0,
})

const EMPTY_VIEW = Object.freeze({
  unlocked: false,
  discovering: false,
  coins: [],
  balances: ZERO_BALANCES,
  stale: false,
  stampsDegraded: false,
  activity: [],
  current: null, // { address, type, index } shown on the receive surface
  preferredType: 'segwit',
  gatewayOff: null,
  feeQuote: null, // { rates, tipHeight, fetchedAt }
})

// ---- module-level session store (shared across hook instances) -------------

let view = { ...EMPTY_VIEW }
const listeners = new Set()

function emit() {
  for (const listener of [...listeners]) listener()
}

function setView(patch) {
  view = { ...view, ...patch }
  emit()
}

function getSnapshot() {
  return view
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Non-reactive internals: key material and per-session bookkeeping. Never
 * mirrored into React state. `epoch` guards async work across lock/relock.
 */
const internals = {
  epoch: 0,
  account: null, // owning FairWins account (EVM address string)
  networkId: null,
  seed: null, // Uint8Array(32) — memory-only, zeroed on lock
  accounts: null, // { segwit: HDKey, taproot: HDKey } — memory-only
  wallet: null, // createBitcoinWallet controller
  gateway: null,
  store: null,
  now: Date.now,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  pollMaxMs: DEFAULT_POLL_MAX_MS,
  locks: new Set(), // "txid:vout" outpoints committed to in-flight sends
  txLocks: new Map(), // txid → outpoints[] (to release on confirmation)
  timers: new Map(), // txid → timeout handle (pending-tx polling)
  // Addresses already shown this session per `${networkId}:${type}` — lets the
  // receive type toggle re-show the address it already displayed instead of
  // burning a fresh index on every flip.
  sessionCurrent: new Map(),
}

/** Zero the seed, wipe key material, stop polling, reset all view state. */
function lockSession() {
  internals.epoch += 1
  try {
    internals.seed?.fill(0)
  } catch {
    /* zeroize is best-effort */
  }
  internals.seed = null
  try {
    internals.accounts?.segwit?.wipePrivateData?.()
    internals.accounts?.taproot?.wipePrivateData?.()
  } catch {
    /* wipe is best-effort */
  }
  internals.accounts = null
  internals.wallet = null
  internals.account = null
  internals.networkId = null
  for (const timer of internals.timers.values()) clearTimeout(timer)
  internals.timers.clear()
  internals.locks = new Set()
  internals.txLocks.clear()
  internals.sessionCurrent.clear()
  setView({ ...EMPTY_VIEW })
}

/** Test-only: reset the shared session between test cases. */
export function __resetBitcoinWalletForTests() {
  lockSession()
  internals.gateway = null
  internals.store = null
  internals.now = Date.now
  internals.pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
  internals.pollMaxMs = DEFAULT_POLL_MAX_MS
}

function scriptTypeOf(type) {
  return type === 'taproot' ? 'p2tr' : 'p2wpkh'
}

/**
 * Re-lookup + re-classify the wallet's coins. With `discover: true` runs the
 * gap-limit scan (unlock/recovery path); otherwise re-queries the issued
 * ledger only. Stale results keep the last-known coins (stale-not-zero,
 * FR-010); disabled verdicts surface the honest gateway-off reason.
 */
async function refreshSession({ discover = false } = {}) {
  const epoch = internals.epoch
  const { wallet, gateway, networkId } = internals
  if (!wallet || !gateway) return

  let utxos
  if (discover) {
    const res = await wallet.discover()
    if (epoch !== internals.epoch) return
    if (res.stale) {
      setView({ stale: true, discovering: false })
      return
    }
    utxos = res.utxos
  } else {
    const issued = wallet.issuedAddresses()
    const typeByAddress = new Map(issued.map((a) => [a.address, a.type]))
    const res = await gateway.lookupAddresses(networkId, issued.map((a) => a.address))
    if (epoch !== internals.epoch) return
    if (!res.ok) {
      setView({
        stale: true,
        discovering: false,
        ...(res.disabled ? { gatewayOff: GATEWAY_OFF_REASON } : {}),
      })
      return
    }
    utxos = res.results.flatMap((r) =>
      (r.utxos ?? []).map((u) => ({
        ...u,
        address: r.address,
        scriptType: scriptTypeOf(typeByAddress.get(r.address)),
      }))
    )
  }

  const addresses = wallet.issuedAddresses().map((a) => a.address)
  const stamps = await gateway.getStamps(networkId, addresses)
  if (epoch !== internals.epoch) return

  // Fail-safe: a failed/disabled stamps result classifies every confirmed coin
  // 'unverified' (treated as protected by selection) — FR-019.
  const coins = classifyUtxos(utxos, stamps, internals.locks)
  setView({
    coins,
    balances: balanceComponents(coins),
    stale: false,
    discovering: false,
    stampsDegraded: !stamps?.ok || Boolean(stamps?.degraded),
    ...(stamps?.disabled ? { gatewayOff: GATEWAY_OFF_REASON } : {}),
  })
}

/** Derive accounts + build the wallet controller for `networkId`, then discover. */
async function initializeSession({ account, networkId }) {
  internals.epoch += 1
  internals.account = account
  internals.networkId = networkId
  internals.accounts = {
    segwit: deriveAccount(internals.seed, { network: networkId, type: 'segwit' }),
    taproot: deriveAccount(internals.seed, { network: networkId, type: 'taproot' }),
  }
  internals.wallet = createBitcoinWallet({
    account,
    networkId,
    // Same output as derivation.addressAt, but from the in-memory account
    // nodes so discovery loops don't repeat the HKDF + full BIP32 walk.
    deriveAddress: (type, index) =>
      encodeAddress(receivePubkey(internals.accounts[type], index).pubkey, {
        type,
        network: networkId,
      }),
    gateway: internals.gateway,
    store: internals.store,
  })
  internals.sessionCurrent.clear()
  for (const timer of internals.timers.values()) clearTimeout(timer)
  internals.timers.clear()
  setView({
    ...EMPTY_VIEW,
    unlocked: true,
    discovering: true,
    preferredType: internals.wallet.preferredType(),
  })
  await refreshSession({ discover: true })
}

/** Poll a broadcast tx until confirmed (or ~30min), then release its locks. */
function schedulePoll(txid, startedAt = internals.now()) {
  const epoch = internals.epoch
  const timer = setTimeout(async () => {
    internals.timers.delete(txid)
    if (epoch !== internals.epoch || !internals.gateway || !internals.wallet) return
    let status = null
    try {
      status = await internals.gateway.getTxStatus(internals.networkId, txid)
    } catch {
      status = null
    }
    if (epoch !== internals.epoch) return
    if (status?.ok && status.confirmed) {
      const outpoints = internals.txLocks.get(txid) ?? []
      for (const op of outpoints) internals.locks.delete(op)
      internals.txLocks.delete(txid)
      setView({
        activity: getSnapshot().activity.map((e) =>
          e.txid === txid ? { ...e, status: 'confirmed' } : e
        ),
      })
      refreshSession().catch(() => {})
      return
    }
    if (internals.now() - startedAt >= internals.pollMaxMs) return // stays honestly 'pending'
    schedulePoll(txid, startedAt)
  }, internals.pollIntervalMs)
  internals.timers.set(txid, timer)
}

// ---- the hook --------------------------------------------------------------

/**
 * @param {object} [deps] injectable collaborators for tests:
 *   { gateway, store, resolveSeed, now, pollIntervalMs, pollMaxMs }
 */
export function useBitcoinWallet(deps = {}) {
  const { address, isConnected, loginMethod, chainId } = useWallet() || {}
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  // FR-021: the active Bitcoin network mirrors the app's EVM testnet mode.
  const networkId = useMemo(
    () => getActiveBitcoinNetworkId(Boolean(getNetwork(chainId)?.isTestnet)),
    [chainId]
  )

  const gateway = useMemo(() => deps.gateway ?? createBitcoinGatewayClient(), [deps.gateway])
  const store = useMemo(() => deps.store ?? ledgerStore(), [deps.store])

  const credentialInfo = useMemo(() => {
    if (loginMethod !== 'passkey' || !address) return null
    const known =
      knownCredentials().find((c) => c.address?.toLowerCase() === address.toLowerCase()) || null
    // Pin ceremonies to the credential this session signed in with (spec 045),
    // falling back to the account's known credential on this browser.
    const credentialId = readSession()?.credentialId ?? known?.credentialId ?? null
    return { credentialId, prfCapable: known?.prfCapable ?? false }
  }, [loginMethod, address])

  const sessionMatches =
    snapshot.unlocked &&
    internals.account != null &&
    address != null &&
    internals.account.toLowerCase() === address.toLowerCase() &&
    internals.networkId === networkId

  const availability = useMemo(() => {
    if (!isConnected || !address) {
      return { status: 'unavailable', reason: 'Connect your FairWins account to use Bitcoin.' }
    }
    if (loginMethod !== 'passkey') {
      return {
        status: 'unavailable',
        reason:
          'Bitcoin requires a FairWins passkey account — external EVM wallets cannot derive the Bitcoin wallet.',
      }
    }
    const cap = capability({
      account: address,
      credentialId: credentialInfo?.credentialId,
      prfCapable: credentialInfo?.prfCapable ?? false,
    })
    if (cap.state === 'unavailable') {
      return { status: 'unavailable', reason: cap.reason }
    }
    const configured = gateway?.baseUrl === undefined || gateway.baseUrl !== ''
    if (!configured) {
      return {
        status: 'unavailable',
        reason: 'The Bitcoin service is not configured on this deployment.',
      }
    }
    if (snapshot.gatewayOff) {
      return { status: 'unavailable', reason: snapshot.gatewayOff }
    }
    return sessionMatches ? { status: 'ready' } : { status: 'locked' }
  }, [
    isConnected,
    address,
    loginMethod,
    credentialInfo,
    gateway,
    snapshot.gatewayOff,
    sessionMatches,
  ])

  // Lock on account change/disconnect; re-derive on testnet/mainnet flips.
  useEffect(() => {
    if (
      internals.account &&
      (!isConnected || !address || internals.account.toLowerCase() !== address.toLowerCase())
    ) {
      lockSession()
      return
    }
    if (internals.seed && internals.account && internals.networkId !== networkId) {
      initializeSession({ account: internals.account, networkId }).catch(() => {})
    }
  }, [address, isConnected, networkId])

  const unlock = useCallback(async () => {
    if (!isConnected || !address || loginMethod !== 'passkey') {
      return { ok: false, error: 'unavailable' }
    }
    if (internals.seed && internals.account?.toLowerCase() === address.toLowerCase()) {
      if (internals.networkId !== networkId) {
        await initializeSession({ account: address, networkId })
      }
      return { ok: true }
    }
    try {
      const resolveSeed = deps.resolveSeed ?? resolveMasterSeed
      // ONE PRF ceremony; the seed lives only in module internals.
      const seed = await resolveSeed({ account: address, credentialId: credentialInfo?.credentialId })
      internals.seed = seed
      internals.gateway = gateway
      internals.store = store
      internals.now = deps.now ?? Date.now
      internals.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
      internals.pollMaxMs = deps.pollMaxMs ?? DEFAULT_POLL_MAX_MS
      await initializeSession({ account: address, networkId })
      return { ok: true }
    } catch (err) {
      lockSession()
      return { ok: false, error: 'unlock_failed', message: err?.message }
    }
  }, [isConnected, address, loginMethod, networkId, credentialInfo, gateway, store, deps.resolveSeed, deps.now, deps.pollIntervalMs, deps.pollMaxMs])

  const refresh = useCallback(() => refreshSession(), [])

  // ---- receive -------------------------------------------------------------

  const nextReceiveAddress = useCallback((type) => {
    const wallet = internals.wallet
    if (!wallet) return null
    const t = type ?? getSnapshot().preferredType
    const entry = wallet.nextReceiveAddress(t)
    internals.sessionCurrent.set(`${internals.networkId}:${t}`, entry)
    setView({ current: entry })
    return entry
  }, [])

  /**
   * Show an address of `type`: re-shows the address already displayed this
   * session for that type, or issues a fresh one. Toggling segwit ↔ taproot
   * therefore never burns extra rotation indexes.
   */
  const selectReceiveType = useCallback((type) => {
    const wallet = internals.wallet
    if (!wallet) return null
    const key = `${internals.networkId}:${type}`
    const entry = internals.sessionCurrent.get(key) ?? wallet.nextReceiveAddress(type)
    internals.sessionCurrent.set(key, entry)
    setView({ current: entry })
    return entry
  }, [])

  const setPreferredType = useCallback(
    (type) => {
      if (internals.wallet) {
        internals.wallet.setPreferredType(type)
      } else if (address) {
        const state = store.get(address, networkId)
        store.set(address, networkId, { ...state, preferredType: type })
      }
      setView({ preferredType: type })
    },
    [address, networkId, store]
  )

  // ---- send ----------------------------------------------------------------

  const getFeeQuote = useCallback(async () => {
    const gw = internals.gateway ?? gateway
    const res = await gw.getFees(networkId)
    if (!res.ok) {
      if (res.disabled) setView({ gatewayOff: GATEWAY_OFF_REASON })
      return { ok: false, error: res.error }
    }
    const quote = { rates: res.rates, tipHeight: res.tipHeight, fetchedAt: internals.now() }
    setView({ feeQuote: quote })
    return { ok: true, quote }
  }, [gateway, networkId])

  const prepare = useCallback(({ destination, amountSats, feeRate }) => {
    const wallet = internals.wallet
    if (!wallet || !internals.accounts) return { ok: false, error: 'locked' }
    const snap = getSnapshot()
    const type = snap.preferredType
    // The change address is PEEKED here (derived, never appended to the
    // ledger) so plans that are abandoned before confirmation don't advance
    // the rotation cursor; the real address is issued at execute time in
    // confirmAndSend.
    const changeIndex = nextIndex(wallet.issuedAddresses(), type)
    const changeAddress = encodeAddress(
      receivePubkey(internals.accounts[type], changeIndex).pubkey,
      { type, network: internals.networkId }
    )
    return prepareSend({
      coins: snap.coins,
      destination,
      amountSats,
      feeRate,
      quote: snap.feeQuote,
      changeAddress,
      changeType: scriptTypeOf(type),
      networkId: internals.networkId,
      nowMs: internals.now(),
    })
  }, [])

  const confirmAndSend = useCallback(async (plan) => {
    const wallet = internals.wallet
    if (!wallet || !internals.accounts) return { ok: false, error: 'locked' }
    // A quote that went stale between preview and confirm forces a re-quote —
    // the member never pays a fee they did not just see (FR-012).
    if (!isQuoteFresh(getSnapshot().feeQuote, internals.now())) {
      return { ok: false, error: 'stale_fee_quote' }
    }
    let planToSend = plan
    if (plan.changeSats > 0) {
      // Issue the change address for real, at execute time only. An
      // issued-for-change address enters the ledger like any other issued
      // address, so it is monitored and rediscovered on recovery (FR-005).
      const change = wallet.nextReceiveAddress(getSnapshot().preferredType)
      planToSend = { ...plan, changeAddress: change.address }
    }
    const ledger = new Map(wallet.issuedAddresses().map((a) => [a.address, a]))
    const accounts = internals.accounts
    const netId = internals.networkId
    const keyFor = (addr) => {
      const entry = ledger.get(addr)
      if (!entry || entry.network !== netId) return null
      // Memory-only: the child key exists only for the duration of signing.
      const { privkey, pubkey } = receivePrivkey(accounts[entry.type], entry.index)
      return { privateKey: privkey, publicKey: pubkey, scriptType: scriptTypeOf(entry.type) }
    }
    const res = await executeSend({ plan: planToSend, keyFor, gateway: internals.gateway })
    if (!res.ok) return res

    // Lock the spent coins against concurrent sends (FR-014) and record the
    // honest pending activity entry (never shown as final early, FR-009).
    for (const op of res.lockedOutpoints) internals.locks.add(op)
    internals.txLocks.set(res.txid, res.lockedOutpoints)
    const coins = getSnapshot().coins.map((c) => {
      const key = `${c.txid}:${c.vout}`
      return internals.locks.has(key) && !c.lockedByTx ? { ...c, lockedByTx: res.txid } : c
    })
    setView({
      coins,
      balances: balanceComponents(coins),
      activity: [
        {
          txid: res.txid,
          direction: 'out',
          amountSats: plan.amountSats,
          feeSats: res.feeSats,
          counterparty: plan.destination,
          status: 'pending',
        },
        ...getSnapshot().activity,
      ],
    })
    schedulePoll(res.txid)
    return res
  }, [])

  return useMemo(
    () => ({
      status: availability.status,
      reason: availability.reason ?? null,
      networkId,
      balances: snapshot.balances,
      stale: snapshot.stale,
      discovering: snapshot.discovering,
      stampsDegraded: snapshot.stampsDegraded,
      coins: snapshot.coins,
      activity: snapshot.activity,
      receive: {
        current: snapshot.current,
        uri: snapshot.current ? formatBip21(snapshot.current.address) : null,
        preferredType: snapshot.preferredType,
        setPreferredType,
        nextReceiveAddress,
        select: selectReceiveType,
      },
      send: {
        feeQuote: snapshot.feeQuote,
        getFeeQuote,
        prepare,
        confirmAndSend,
      },
      unlock,
      refresh,
    }),
    [
      availability,
      networkId,
      snapshot,
      setPreferredType,
      nextReceiveAddress,
      selectReceiveType,
      getFeeQuote,
      prepare,
      confirmAndSend,
      unlock,
      refresh,
    ]
  )
}

export default useBitcoinWallet
