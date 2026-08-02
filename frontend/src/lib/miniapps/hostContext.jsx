/**
 * The mini-app host context (spec 073, `contracts/host-context.md` · FR-013,
 * FR-018, FR-019).
 *
 * A mounted mini-app is third-party code running in the member's own tab, with
 * the member's own wallet one function call away. The object built here is the
 * ENTIRE privileged surface that code gets: seven keys, each a wrapper the host
 * wrote, over a seam the host already owns. Anything not on it is unreachable —
 * not by policy, but because the app was never handed a reference to it.
 *
 * Four rules shape every line below.
 *
 * **1. Wrappers, never handles.** `navigate` is a function, not the router;
 * `toast` is a function, not the UI context; `readProvider` returns a read
 * provider, never a signer. No context object, no router object, no storage
 * handle and above all no signer or key material is reachable from the host
 * object — a mini-app that captured a signer would not need the rest of this
 * file. `wallet.submit` routes through `useActiveAccount().submit`, the same
 * seam every first-party surface uses, so a personal wallet, a Safe vault and a
 * recovered legacy account all work with no app-visible difference except the
 * shape of the result.
 *
 * **2. The payload is REBUILT, never forwarded.** `submit` reads four named
 * fields off the app's argument and constructs its own `{to, value, data}`.
 * That is a security boundary, not tidiness: `submitAsActiveAccount` also
 * honors `batch` and `operation`, and `operation: 1` is a Safe DELEGATECALL —
 * an app that could pass its payload through to a vault could execute arbitrary
 * code in the vault's own context. Extra properties are therefore dropped on
 * the floor, and the only thing an app can ask for is one plain call.
 *
 * **3. Refusals are typed, and they are loud where silence would mislead.**
 * Every refusal is a {@link MiniAppHostError} carrying a stable
 * {@link HOST_REFUSAL} code and a member-facing `userMessage`, so an app can
 * branch on the cause and the workspace can explain itself. Which refusals
 * throw is a deliberate split:
 *   - `submit` and `navigate` THROW. Both change what the member experiences —
 *     one moves value, the other moves the member — so a silent no-op would
 *     read as success and leave a button that does nothing.
 *   - `audit.log` and `toast.show` WARN and drop. Both are bookkeeping and
 *     chrome; throwing out of a log line can abort the very flow being logged,
 *     which is a worse failure than the line not landing (the same reasoning
 *     that makes `store.set` return `false` instead of throwing).
 *
 * **4. The host audits, the app does not have to.** FR-019 is only satisfiable
 * if the trail is written by the party the app cannot decline to use, so
 * `submit` records every outcome — sent, proposed, and failed — through
 * `data/ledger/sources/miniAppSource.js` before the result or the error reaches
 * the app, and the `store` an app receives is a wrapper that records its
 * significant writes (see {@link STATE_AUDIT_WINDOW_MS}) rather than the raw
 * namespace. `audit.log` exists on top of that for the app's own contextual
 * entries; because those entries share a ledger with host-written ones, the
 * `host:` kind prefix is reserved and refused from apps.
 *
 * The provider is per-app: `appId` is the store namespace root, the audit
 * attribution, and the only identity the app is ever told about itself. It is
 * closed over here, so nothing an app passes to any method can name another
 * app's namespace (FR-018).
 */

import { createContext, useCallback, useContext, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { useWallet } from '../../hooks/useWalletManagement'
import { useActiveAccount } from '../../hooks/useActiveAccount'
import { useEffectiveAccount } from '../../hooks/useEffectiveAccount'
import { useNotification } from '../../hooks/useUI'
import { getReadProvider } from '../../utils/rpcProvider'
import { createAppStore } from './store'
import {
  captureMiniAppLog,
  captureMiniAppStateChange,
  captureMiniAppTxSubmitted,
} from '../../data/ledger/sources/miniAppSource'

/**
 * Stable machine codes for every refusal this host can produce. Exported so a
 * mini-app can branch on a cause without importing a class (the shared scope
 * publishes only `useMiniAppHost`, by design), and so the workspace can render
 * the right recovery affordance.
 */
export const HOST_REFUSAL = Object.freeze({
  /** No wallet is connected, or the acting identity has no address here. */
  WALLET_ABSENT: 'wallet_absent',
  /** The wallet is on a different chain than the action names. */
  WRONG_CHAIN: 'wrong_chain',
  /** The acting identity exists but cannot sign right now (recovered account re-lock). */
  IDENTITY_LOCKED: 'identity_locked',
  /** The app asked for something this contract does not describe. */
  BAD_PAYLOAD: 'bad_payload',
  /** No RPC endpoint is configured for the requested chain (spec 069 resolution). */
  NO_READ_PROVIDER: 'no_read_provider',
  /** `navigate` was handed something that leaves the host. */
  EXTERNAL_TARGET: 'external_target',
  /** A read provider member that would mutate the host's shared instance. */
  PROVIDER_MEMBER_BLOCKED: 'provider_member_blocked',
})

/**
 * A capability was refused. Terminal for the call that raised it; never fatal
 * to the host, and never fatal to the app beyond the surface that called it
 * (FR-015 contains the rest).
 */
export class MiniAppHostError extends Error {
  /**
   * @param {string} reason - one of {@link HOST_REFUSAL}
   * @param {string} message - developer/log detail
   * @param {{userMessage?: string}} [detail]
   */
  constructor(reason, message, detail = {}) {
    super(message)
    this.name = 'MiniAppHostError'
    this.reason = reason
    this.userMessage = detail.userMessage ?? message
  }
}

/**
 * Notification types the host chrome can render. The value becomes a CSS class
 * on the host's own notification element (`notification-${type}`), so an
 * unclamped string from a mini-app would put app-chosen selectors into host
 * presentation — exactly what FR-014 forbids. Anything else falls back to
 * `info`.
 */
const TOAST_TYPES = new Set(['info', 'success', 'error', 'warning'])

/** Bound on an app-supplied toast; the host's notification bar is one line. */
const MAX_TOAST_MESSAGE = 200

/** Bound on an in-app navigation target — long enough for any real route + query. */
const MAX_NAVIGATE_LENGTH = 512

/**
 * Characters a URL parser STRIPS rather than rejects. `'/\n/evil.example'`
 * becomes `'//evil.example'` — a protocol-relative URL — by the time the router
 * sees it, so they are refused before the protocol-relative check rather than
 * after it.
 */
const URL_STRIPPED_CHARS = /[\t\n\r]/

/**
 * A kind an app may write through `audit.log`. Lowercase and colon-free, which
 * is what reserves the `host:` prefix for entries the HOST wrote: a reviewer
 * reading the ledger must be able to tell "the app said this happened" from
 * "the host observed this happen", and an app that could mint `host:tx_proposed`
 * would erase that distinction.
 */
const APP_LOG_KIND_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/

/**
 * Audit kinds the host writes for outcomes that have no transaction hash to key
 * on (`captureMiniAppTxSubmitted` is keyed on a real on-chain hash, and a Safe
 * proposal or a rejected signature never produces one). The `host:` prefix is
 * reserved above so these can never be confused with an app's own entries.
 */
const HOST_AUDIT_KIND = Object.freeze({
  TX_PROPOSED: 'host:tx_proposed',
  TX_FAILED: 'host:tx_failed',
})

/**
 * How long one shared-state key stays "already recorded" after an audit entry
 * for it lands.
 *
 * FR-019 asks the host to audit *significant* shared-state changes, and the host
 * — not the app — has to decide what significant means. The decision has real
 * consequences: these entries go into the member's DURABLE client ledger, which
 * rides the spec-032 encrypted backup, so a per-write entry would not be a noisy
 * log, it would be permanent damage. A draft form that saves on every keystroke
 * is an entirely ordinary mini-app, and it would mint hundreds of entries a
 * minute, in perpetuity, for one member editing one field.
 *
 * So the rule is deliberately coarse, and it is two rules:
 *
 * 1. **Significant means the value actually changed.** `store.set` already
 *    distinguishes that from a refused or no-op write (it returns `false` for a
 *    bad key, an unserializable value, an over-budget namespace, or a write of
 *    the value already there), so the host audits exactly the writes that
 *    changed the member's data and nothing else. Nothing is guessed about the
 *    value's meaning — the host cannot know which of an app's keys matter.
 * 2. **One entry per key per window, coalescing the burst into its first
 *    write.** A reviewer's question is "did this app change its `drafts` state
 *    while I was away", not "how many keystrokes did it take"; a minute is short
 *    enough that two genuinely separate edits stay two entries and long enough
 *    that a typing burst is one. Worst-case growth becomes (keys × minutes)
 *    rather than (writes).
 *
 * LEADING EDGE, AND NO TIMER. The obvious implementation — a trailing debounce
 * that writes the entry once the burst goes quiet — is wrong here: it holds the
 * only record of a change inside a timer that a tab close, a navigation or an
 * unmount destroys, so the ledger would silently lose exactly the changes made
 * just before the member left. Recording the FIRST write of a window
 * synchronously means an audit entry exists the instant a key changes, there is
 * nothing pending to flush, and nothing to clean up on unmount.
 *
 * The VALUE is never recorded, in any of this — see `miniAppSource.js`, which
 * takes only the key.
 *
 * WHAT THIS DOES NOT BUY. Coalescing is per key, so an app that ROTATED keys
 * would still produce an entry per key per window. That residual is accepted
 * rather than hidden: the number of keys an app can hold is already bounded by
 * the store's own 256 KB namespace budget, and a package deliberately
 * manufacturing keys to bloat a member's ledger is a hostile package — which
 * curation, not this window, is the platform's boundary against (spec 073
 * assumptions: iframe/zero-trust sandboxing is explicitly out of scope for v1).
 * A per-app ceiling was considered and rejected: silently DROPPING audit entries
 * to stay under a quota is worse than recording too many, because the trail
 * would then lie by omission about a real change.
 */
export const STATE_AUDIT_WINDOW_MS = 60_000

/** `to` must be a plain EVM address; the contract has no deployment form. */
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

/** Calldata: 0x-prefixed, whole bytes. */
const HEX_DATA_PATTERN = /^0x([0-9a-fA-F]{2})*$/

/**
 * Provider members a mini-app must not reach. The host caches ONE provider per
 * resolved endpoint and every host read shares it, so `destroy()` from an app
 * would take the wallet's own reads down with it, and `removeAllListeners()`
 * would silently cancel host subscriptions. Everything else a provider exposes
 * is a read the app is entitled to make.
 */
const BLOCKED_PROVIDER_MEMBERS = new Set(['destroy', 'removeAllListeners'])

/**
 * Wrap a shared read provider so an app can read through it but cannot change
 * or dismantle it.
 *
 * This is a lifecycle guard, not a sandbox: an app can still make any read the
 * endpoint allows, which is the capability it was granted. What it cannot do is
 * mutate the instance the host depends on.
 *
 * @param {object} provider - the host's cached provider for a chain
 * @returns {object} proxy with the same interface
 */
function guardReadProvider(provider) {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      if (BLOCKED_PROVIDER_MEMBERS.has(prop)) {
        // A stub that throws when CALLED, rather than a throw on the property
        // read: reading a property is something serializers, deep-equality
        // checks and devtools all do incidentally, and an object that explodes
        // when merely inspected is a debugging trap. Calling it is deliberate,
        // so that is where the refusal belongs.
        return function blockedProviderMember() {
          throw new MiniAppHostError(
            HOST_REFUSAL.PROVIDER_MEMBER_BLOCKED,
            `miniapp host: provider.${String(prop)} is not available to mini-apps`,
            { userMessage: 'This app tried to change a shared network connection, which is not permitted.' },
          )
        }
      }
      // Read with the REAL provider as the receiver: ethers keeps provider state
      // in private (`#`) fields, which are unreachable when `this` is a proxy.
      const value = Reflect.get(target, prop, target)
      // `AbstractProvider` has a self-returning `provider` getter; handing back
      // the raw instance there would route straight around this guard.
      if (value === target) return receiver
      return typeof value === 'function' ? value.bind(target) : value
    },
    set(target, prop) {
      throw new MiniAppHostError(
        HOST_REFUSAL.PROVIDER_MEMBER_BLOCKED,
        `miniapp host: provider.${String(prop)} cannot be set by a mini-app`,
        { userMessage: 'This app tried to change a shared network connection, which is not permitted.' },
      )
    },
    defineProperty(target, prop) {
      throw new MiniAppHostError(
        HOST_REFUSAL.PROVIDER_MEMBER_BLOCKED,
        `miniapp host: provider.${String(prop)} cannot be redefined by a mini-app`,
      )
    },
    deleteProperty(target, prop) {
      throw new MiniAppHostError(
        HOST_REFUSAL.PROVIDER_MEMBER_BLOCKED,
        `miniapp host: provider.${String(prop)} cannot be deleted by a mini-app`,
      )
    },
  })
}

/** A positive integer EVM chain id, or null. Bitcoin ids are strings (spec 061) and never valid here. */
function evmChainId(value) {
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Coerce an app-supplied `value` to wei. Accepts what an app can honestly
 * express in JSON or JS — a bigint, a safe integer, or a decimal/hex string —
 * and refuses anything ambiguous (a float would silently truncate someone's
 * money).
 */
function toWeiValue(value) {
  if (value == null) return 0n
  let wei
  if (typeof value === 'bigint') {
    wei = value
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new MiniAppHostError(
        HOST_REFUSAL.BAD_PAYLOAD,
        `miniapp host: value ${value} is not an exact integer amount of wei`,
        { userMessage: 'This app requested a transaction with an amount that could not be read exactly.' },
      )
    }
    wei = BigInt(value)
  } else if (typeof value === 'string') {
    try {
      wei = BigInt(value.trim())
    } catch {
      throw new MiniAppHostError(
        HOST_REFUSAL.BAD_PAYLOAD,
        `miniapp host: value "${value}" is not an amount of wei`,
        { userMessage: 'This app requested a transaction with an amount that could not be read exactly.' },
      )
    }
  } else {
    throw new MiniAppHostError(
      HOST_REFUSAL.BAD_PAYLOAD,
      `miniapp host: value must be a bigint, integer or numeric string, got ${typeof value}`,
      { userMessage: 'This app requested a transaction with an amount that could not be read exactly.' },
    )
  }
  if (wei < 0n) {
    throw new MiniAppHostError(HOST_REFUSAL.BAD_PAYLOAD, 'miniapp host: value cannot be negative', {
      userMessage: 'This app requested a transaction with a negative amount.',
    })
  }
  return wei
}

/**
 * Run one audit write. The ledger source already contains its own failures, so
 * this is belt and braces: an audit must never be able to break the action it
 * is auditing, including by throwing on the way out of a `finally`.
 */
function safeAudit(write) {
  try {
    write()
  } catch (error) {
    console.warn('[miniapps/host] audit entry could not be recorded', error)
  }
}

/**
 * The context itself is module-private on purpose: exporting it would let any
 * host module (or anything that could reach one) read or re-provide another
 * app's host object. Apps see it only through {@link useMiniAppHost}, which the
 * shared scope publishes as the whole of `@fairwins/miniapp-sdk`.
 */
const MiniAppHostContext = createContext(null)

/**
 * The host object for the mini-app mounted under `appId`.
 *
 * @param {{appId: string, children: React.ReactNode}} props
 * @throws {Error} when `appId` is not a valid app id — `createAppStore` refuses
 *   to open a namespace it cannot isolate, and the workspace's error boundary
 *   (FR-015) is the right place for that to surface. A workspace only ever
 *   mounts an id the catalog and the manifest both validated.
 */
export function MiniAppHostProvider({ appId, children }) {
  const { chainId: walletChainId, isConnected, openConnectModal } = useWallet()
  const { address, connectedAddress, chainId: identityChainId } = useEffectiveAccount()
  const { isVault, isLegacy, canActAsVault, canActAsLegacy, submit: submitAsActive } = useActiveAccount()
  const { showNotification } = useNotification()
  const routerNavigate = useNavigate()

  const walletChain = evmChainId(walletChainId)

  /**
   * The app's namespace, keyed by the identity the app is told it is acting as
   * (`wallet.address`). One identity, one namespace: state written while acting
   * as a vault belongs to the vault, and with no wallet at all the store runs
   * session-only rather than attributing durable state to nobody.
   */
  const namespacedStore = useMemo(() => createAppStore(address, appId), [address, appId])

  /**
   * What the app actually receives: the namespace, with writes routed through
   * the host's audit (FR-019). The raw store is never handed out — an app that
   * held it could change the member's stored state with no trail, which is the
   * one thing the automatic audit exists to prevent.
   *
   * `get` and `subscribe` are passed through untouched: reading is not an
   * auditable event, and the store's methods close over their own namespace
   * rather than `this`, so forwarding the references is safe.
   *
   * The coalescing window lives in this closure, so it is per (identity, chain,
   * app) by construction — switching accounts or networks starts a fresh window
   * and the first write under the new identity is always recorded.
   */
  const store = useMemo(() => {
    /** storeKey -> timestamp of the entry that already covers this key's window. */
    const recordedAt = new Map()

    return Object.freeze({
      get: namespacedStore.get,
      subscribe: namespacedStore.subscribe,

      /**
       * Write one key, then record it if the write was significant. Returns what
       * the underlying store returned, unchanged: auditing must be invisible to
       * the app, including in its return value.
       */
      set(key, value) {
        const changed = namespacedStore.set(key, value)
        // A refused or no-op write changed nothing, so there is nothing to audit
        // (see rule 1 on STATE_AUDIT_WINDOW_MS).
        if (!changed) return changed
        // An entry is attributed to an account on a chain; with neither there is
        // nothing truthful to write, and no window to spend either — the store
        // is running session-only in that case.
        if (!address || walletChain == null) return changed

        const at = Date.now()
        const covered = recordedAt.get(key)
        if (covered != null && at - covered < STATE_AUDIT_WINDOW_MS) return changed

        recordedAt.set(key, at)
        // Key only. The value is the app's own data, may be large, and would
        // otherwise be copied into a ledger that travels in the member's backup.
        safeAudit(() => captureMiniAppStateChange(address, walletChain, { appId, storeKey: key, at }))
        return changed
      },
    })
  }, [namespacedStore, appId, address, walletChain])

  const submit = useCallback(
    async (payload) => {
      if (!payload || typeof payload !== 'object') {
        throw new MiniAppHostError(HOST_REFUSAL.BAD_PAYLOAD, 'miniapp host: submit() needs a payload object', {
          userMessage: 'This app requested a transaction the wallet could not read.',
        })
      }

      // Absent wallet first: everything below reads an identity that may not exist.
      if (!isConnected || !address) {
        throw new MiniAppHostError(
          HOST_REFUSAL.WALLET_ABSENT,
          'miniapp host: no connected wallet to submit with',
          { userMessage: 'Connect your wallet before this app can send a transaction.' },
        )
      }

      const requestedChain = evmChainId(payload.chainId)
      if (requestedChain == null) {
        // Never guessed: a transaction sent on a chain the app did not name is a
        // transaction the member did not agree to.
        throw new MiniAppHostError(
          HOST_REFUSAL.BAD_PAYLOAD,
          `miniapp host: submit() needs an EVM chainId, got ${String(payload.chainId)}`,
          { userMessage: 'This app requested a transaction without saying which network it belongs to.' },
        )
      }
      if (walletChain == null || requestedChain !== walletChain) {
        throw new MiniAppHostError(
          HOST_REFUSAL.WRONG_CHAIN,
          `miniapp host: wallet is on chain ${String(walletChainId)}, action names ${requestedChain}`,
          { userMessage: `Switch your wallet to network ${requestedChain} before this app can send this transaction.` },
        )
      }
      // A vault or recovered account is bound to its own chain; the wallet being
      // on the right chain is necessary but not sufficient.
      if (identityChainId != null && requestedChain !== Number(identityChainId)) {
        throw new MiniAppHostError(
          HOST_REFUSAL.WRONG_CHAIN,
          `miniapp host: acting account lives on chain ${identityChainId}, action names ${requestedChain}`,
          { userMessage: 'The account you are acting as is on a different network than this transaction.' },
        )
      }
      if (isVault && !canActAsVault) {
        throw new MiniAppHostError(
          HOST_REFUSAL.WRONG_CHAIN,
          'miniapp host: wallet is not on the vault network',
          { userMessage: "Switch to the vault's network before this app can propose a transaction from it." },
        )
      }
      if (isLegacy && !canActAsLegacy) {
        throw new MiniAppHostError(
          HOST_REFUSAL.IDENTITY_LOCKED,
          'miniapp host: recovered account is locked',
          { userMessage: 'Unlock the recovered account again before this app can send from it.' },
        )
      }

      const to = typeof payload.to === 'string' ? payload.to.trim() : ''
      if (!ADDRESS_PATTERN.test(to)) {
        throw new MiniAppHostError(HOST_REFUSAL.BAD_PAYLOAD, `miniapp host: submit() needs a "to" address, got ${String(payload.to)}`, {
          userMessage: 'This app requested a transaction without a valid destination address.',
        })
      }
      const data = payload.data == null ? '0x' : payload.data
      if (typeof data !== 'string' || !HEX_DATA_PATTERN.test(data)) {
        throw new MiniAppHostError(HOST_REFUSAL.BAD_PAYLOAD, 'miniapp host: submit() data must be 0x-prefixed hex', {
          userMessage: 'This app requested a transaction the wallet could not read.',
        })
      }
      const value = toWeiValue(payload.value)

      // Rebuilt, never forwarded — see rule 2 in the module header. `batch` and
      // `operation` are host-only concepts and stop here.
      let result
      try {
        result = await submitAsActive({ to, value, data })
      } catch (error) {
        safeAudit(() =>
          captureMiniAppLog(address, requestedChain, {
            appId,
            kind: HOST_AUDIT_KIND.TX_FAILED,
            refs: { to: to.toLowerCase(), reason: error?.shortMessage || error?.message || 'unknown' },
          }),
        )
        throw error
      }

      if (result?.kind === 'proposed') {
        safeAudit(() =>
          captureMiniAppLog(address, requestedChain, {
            appId,
            kind: HOST_AUDIT_KIND.TX_PROPOSED,
            dedupeKey: result.safeTxHash,
            refs: { safeTxHash: result.safeTxHash, to: to.toLowerCase() },
          }),
        )
        // Nothing has moved yet: a vault action waits for its threshold. Saying
        // so in the result is the only way an app can report it honestly.
        return Object.freeze({ kind: 'proposed', txHash: null, safeTxHash: result.safeTxHash ?? null })
      }

      safeAudit(() =>
        captureMiniAppTxSubmitted(address, requestedChain, { appId, txHash: result?.txHash, to }),
      )
      return Object.freeze({ kind: 'sent', txHash: result?.txHash ?? null, safeTxHash: null })
    },
    [
      appId,
      address,
      isConnected,
      walletChain,
      walletChainId,
      identityChainId,
      isVault,
      isLegacy,
      canActAsVault,
      canActAsLegacy,
      submitAsActive,
    ],
  )

  const requestConnect = useCallback(() => {
    if (typeof openConnectModal === 'function') openConnectModal()
  }, [openConnectModal])

  const readProvider = useCallback(
    (requestedChainId) => {
      const target = evmChainId(requestedChainId == null ? walletChain : requestedChainId)
      if (target == null) {
        throw new MiniAppHostError(
          HOST_REFUSAL.BAD_PAYLOAD,
          `miniapp host: readProvider() needs an EVM chain id, got ${String(requestedChainId ?? walletChainId)}`,
          { userMessage: 'This app asked to read from a network the wallet does not recognise.' },
        )
      }
      // Resolved on every call, never memoized: endpoint resolution is the
      // member's (spec 069), and a member who repoints an endpoint must see the
      // next read take it — a cached wrapper would pin the app to the old route.
      const provider = getReadProvider(target)
      if (!provider) {
        throw new MiniAppHostError(
          HOST_REFUSAL.NO_READ_PROVIDER,
          `miniapp host: no RPC endpoint configured for chain ${target}`,
          { userMessage: `No network connection is configured for network ${target}.` },
        )
      }
      return guardReadProvider(provider)
    },
    [walletChain, walletChainId],
  )

  const audit = useMemo(
    () =>
      Object.freeze({
        /**
         * Record an app-contextual entry. Never throws (see rule 3): a refused
         * kind is a warning, because a logging call must not be able to break
         * the flow that made it.
         */
        log(kind, refs) {
          if (typeof kind !== 'string' || !APP_LOG_KIND_PATTERN.test(kind)) {
            console.warn(`[miniapps/host] "${appId}" tried to log an unsupported audit kind — ignored`)
            return
          }
          if (!address || walletChain == null) {
            // An audit entry is attributed to an account on a chain; with
            // neither there is nothing truthful to write.
            console.warn(`[miniapps/host] "${appId}" logged an entry with no account or network — ignored`)
            return
          }
          safeAudit(() => captureMiniAppLog(address, walletChain, { appId, kind, refs }))
        },
      }),
    [appId, address, walletChain],
  )

  const toast = useMemo(
    () =>
      Object.freeze({
        /** Show one line in the host's notification bar. Never throws. */
        show(message, type) {
          const text = message == null ? '' : String(message).slice(0, MAX_TOAST_MESSAGE)
          if (!text) return
          if (typeof showNotification !== 'function') return
          showNotification(text, TOAST_TYPES.has(type) ? type : 'info')
        },
      }),
    [showNotification],
  )

  const navigate = useCallback(
    (to) => {
      if (typeof to !== 'string' || to.length === 0 || to.length > MAX_NAVIGATE_LENGTH) {
        throw new MiniAppHostError(HOST_REFUSAL.BAD_PAYLOAD, `miniapp host: navigate() needs an in-app path, got ${String(to)}`, {
          userMessage: 'This app tried to navigate somewhere the platform could not read.',
        })
      }
      // Order matters: strip-characters first (a parser would remove them and
      // change what the rest of these checks are looking at), then anything that
      // could leave the host — a scheme (`https:`, `javascript:`), a
      // protocol-relative `//host`, or a backslash a browser normalizes to `/`.
      if (
        URL_STRIPPED_CHARS.test(to) ||
        to.includes('\\') ||
        !to.startsWith('/') ||
        to.startsWith('//')
      ) {
        throw new MiniAppHostError(
          HOST_REFUSAL.EXTERNAL_TARGET,
          `miniapp host: refusing to navigate outside the host ("${to}")`,
          { userMessage: 'This app tried to send you to a site outside FairWins, so nothing was opened.' },
        )
      }
      routerNavigate(to)
    },
    [routerNavigate],
  )

  const host = useMemo(() => {
    const wallet = Object.freeze({
      address: address ?? null,
      connectedAddress: connectedAddress ?? null,
      chainId: walletChain,
      isConnected: Boolean(isConnected && address),
      submit,
      requestConnect,
    })
    // Frozen: the app receives a capability set, not an object it can re-point.
    // Everything reachable from here is a wrapper — no context, no router, no
    // signer, no storage handle (see rule 1).
    return Object.freeze({
      appId,
      wallet,
      readProvider,
      store,
      audit,
      toast,
      navigate,
    })
  }, [
    appId,
    address,
    connectedAddress,
    walletChain,
    isConnected,
    submit,
    requestConnect,
    readProvider,
    store,
    audit,
    toast,
    navigate,
  ])

  return <MiniAppHostContext.Provider value={host}>{children}</MiniAppHostContext.Provider>
}

/**
 * The mounted app's host object. This is the whole of `@fairwins/miniapp-sdk`
 * as published on the shared module scope, and the only supported way for a
 * mini-app to reach a privileged capability.
 *
 * @returns {object} the frozen host object
 * @throws {Error} when called outside a mini-app workspace — a component that
 *   is not inside a `MiniAppHostProvider` has no app identity, so there is no
 *   namespace to give it and no attribution for anything it does.
 */
// The hook must live with the context it reads, and it IS the published SDK surface (`hostScope.js` puts
// this exact function on the shared scope). Splitting it out to satisfy fast refresh would put the two
// halves of one contract in two files.
// eslint-disable-next-line react-refresh/only-export-components -- see above
export function useMiniAppHost() {
  const host = useContext(MiniAppHostContext)
  if (!host) {
    throw new Error('useMiniAppHost() is only available inside a mounted mini-app workspace')
  }
  return host
}

export default MiniAppHostProvider
