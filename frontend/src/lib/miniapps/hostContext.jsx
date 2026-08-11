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
import { useAddressScreening } from '../../hooks/useAddressScreening'
import { getReadProvider } from '../../utils/rpcProvider'
import { NETWORKS, cohortChainIds } from '../../config/networks'
import { getContractAddressForChain } from '../../config/contracts'
import { createAppStore } from './store'
import { HOST_REFUSAL, MiniAppHostError } from './hostRefusal.js'
import {
  captureMiniAppLog,
  captureMiniAppStateChange,
  captureMiniAppTxSubmitted,
} from '../../data/ledger/sources/miniAppSource'


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

/**
 * Attach `wait()` to a submission result (hostApi 2).
 *
 * `submit` resolves at BROADCAST — `kind: 'sent'` means the network accepted
 * the transaction, not that it mined, and not that it succeeded. An app that
 * awaits `submit` and reports success is lying, which is the trap this removes.
 *
 * It grants NO new capability: `host.readProvider(chainId).waitForTransaction`
 * already allows exactly this read, and this is that call with the chain and
 * hash filled in. It is NON-ENUMERABLE so the result stays a plain serialisable
 * data object — `JSON.stringify`, structured clone and equality assertions all
 * see the same three fields they saw before.
 *
 * A `proposed` result rejects rather than hanging: nothing was broadcast, a
 * vault action is waiting on its threshold, and there is no hash to wait for.
 * Waiting forever on a transaction that does not exist is the worst answer.
 *
 * The provider is resolved INTERNALLY and never handed to the app, so the raw
 * instance is used rather than the guarded wrapper — there is nothing here for
 * an app to call `destroy()` on.
 *
 * @param {{kind: string, txHash: string|null, safeTxHash: string|null}} result
 * @param {number} chainId - the chain the submission named
 */
function withWait(result, chainId) {
  Object.defineProperty(result, 'wait', {
    enumerable: false,
    value: async (confirmations = 1) => {
      if (result.kind === 'proposed') {
        throw new MiniAppHostError(
          HOST_REFUSAL.BAD_PAYLOAD,
          'miniapp host: a proposed vault action has no transaction to wait for',
          {
            userMessage:
              'This action is waiting for the vault’s approvals; there is no transaction to confirm yet.',
          },
        )
      }
      if (!result.txHash) {
        throw new MiniAppHostError(
          HOST_REFUSAL.BAD_PAYLOAD,
          'miniapp host: the transaction rail returned no hash to wait for',
          { userMessage: 'This transaction was sent, but the wallet did not report an identifier for it.' },
        )
      }
      const provider = getReadProvider(chainId)
      if (!provider) {
        throw new MiniAppHostError(
          HOST_REFUSAL.NO_READ_PROVIDER,
          `miniapp host: no RPC endpoint configured for chain ${chainId}`,
          { userMessage: `No network connection is configured for network ${chainId}.` },
        )
      }
      return provider.waitForTransaction(result.txHash, confirmations)
    },
  })
  return Object.freeze(result)
}

/**
 * Default contract allowlist: empty. A package that declared nothing can
 * resolve nothing — the gate fails closed, so a workspace that forgot to pass
 * the manifest's list withholds the capability rather than opening the whole
 * address book. Module-level and frozen so it is a stable dependency identity.
 */
const EMPTY_CONTRACTS = Object.freeze([])

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
/**
 * One guard per underlying provider, so the wrapper has a STABLE identity.
 *
 * Without this every `readProvider()` call returned a fresh Proxy, and any app that put the
 * provider in a `useEffect`/`useMemo` dependency array — the obvious thing to do with it — re-ran
 * that effect on every render. In a component whose effect also sets state, that is an infinite
 * loop: it hangs the app, not just a test. Found exactly that way, as a worker that never
 * finished.
 *
 * A WeakMap keyed on the provider preserves the reason the wrapper is not memoized by chain: the
 * host resolves the endpoint on every call (spec 069 — a member who repoints must see the next
 * read take it), and a repointed endpoint yields a DIFFERENT underlying provider, which gets its
 * own wrapper. Same provider, same wrapper; new provider, new wrapper.
 */
const GUARDED_PROVIDERS = new WeakMap()

function guardReadProvider(provider) {
  const cached = GUARDED_PROVIDERS.get(provider)
  if (cached) return cached
  const guarded = new Proxy(provider, {
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
  GUARDED_PROVIDERS.set(provider, guarded)
  return guarded
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
export function MiniAppHostProvider({ appId, declaredContracts = EMPTY_CONTRACTS, children }) {
  const {
    chainId: walletChainId,
    isConnected,
    openConnectModal,
    loginMethod,
    signer,
    sendCalls,
    switchNetwork,
  } = useWallet()
  const { screenOne } = useAddressScreening()
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

      /*
       * SANCTIONS SCREENING, ENFORCED HERE AND NOT DELEGATED.
       *
       * FairWins' own contracts carry an on-chain `ISanctionsGuard`, but a mini-app's whole point
       * is that it calls contracts FairWins did not write — an external Governor, a third-party
       * router — where no such guard exists. Screening in the app layer would be optional in
       * practice: a package that simply never calls a screening function is unscreened, and the
       * packages most worth screening are the least likely to cooperate. The host cannot be
       * skipped, so the check belongs here.
       *
       * FAIL-OPEN ON UNCERTAINTY, BY POLICY. Only a POSITIVE `restricted` refuses. An unreachable
       * screening endpoint yields `uncertain`, and treating that as a restriction would invent a
       * compliance finding the data does not support — the same rule the address book and the
       * external-DAO surfaces already follow. `force: true` because a submission-time screen has
       * to be a live read: an account deny-listed since the page loaded must still be refused.
       */
      let screening
      try {
        screening = await screenOne(address, requestedChain, { force: true })
      } catch {
        screening = 'uncertain'
      }
      if (screening === 'restricted') {
        safeAudit(() =>
          captureMiniAppLog(address, requestedChain, {
            appId,
            kind: HOST_AUDIT_KIND.TX_FAILED,
            refs: { to: to.toLowerCase(), reason: 'sanctioned_account' },
          }),
        )
        throw new MiniAppHostError(
          HOST_REFUSAL.SANCTIONED_ACCOUNT,
          `miniapp host: acting account ${address} is restricted by sanctions screening`,
          { userMessage: 'This wallet is restricted by sanctions screening and cannot send transactions.' },
        )
      }

      /*
       * THE TWO WRITE RAILS.
       *
       * FairWins has two ways to send a transaction and they are not
       * interchangeable: a classic wallet signs through an ethers `signer`,
       * while a passkey smart account (specs 041/050) has NO signer at all —
       * `WalletContext` sets `signer` and `provider` to null for a passkey
       * session — and writes through `sendCalls`, an ERC-4337 UserOp batch.
       *
       * Every first-party surface branches on this itself before it reaches
       * `submitAsActiveAccount`, whose personal path does `ctx.signer
       * .sendTransaction(...)` unconditionally. A mini-app CANNOT do the same:
       * `sendCalls` lives on `WalletContext` and is deliberately not on the
       * host object, and a bundled copy of that context would be a different
       * context with no provider above it. So if the host does not choose the
       * rail, nothing can — and a passkey member's every mini-app transaction
       * dies on `null.sendTransaction`, surfacing as a raw TypeError that is
       * not a `MiniAppHostError`, carries no refusal code and no member-facing
       * sentence, and that the app has no way to branch on.
       *
       * Choosing the rail here is exactly the host's job as stated in rule 1 of
       * the module header: an app sees one `submit` and no difference between
       * the identities behind it.
       *
       * ORDER MATTERS. Vault and legacy come FIRST and keep going through
       * `submitAsActive`: a passkey member acting as a Safe vault must still
       * produce a vault PROPOSAL, not a UserOp from their own account, and a
       * recovered legacy account carries its own unlocked signer. Only a
       * passkey acting personally takes the UserOp rail — the same precedence
       * the first-party surfaces use.
       */
      const isPasskeyPersonal = !isVault && !isLegacy && loginMethod === 'passkey'

      if (isPasskeyPersonal) {
        if (typeof sendCalls !== 'function') {
          throw new MiniAppHostError(
            HOST_REFUSAL.NO_WRITE_RAIL,
            'miniapp host: passkey session exposes no sendCalls transport',
            { userMessage: 'This wallet cannot send transactions in this browser session.' },
          )
        }
        let sent
        try {
          sent = await sendCalls([{ target: to, data, value }])
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
        // A UserOp has three possible identifiers depending on how far the
        // bundler got; take them in decreasing order of finality, exactly as
        // the first-party token path does. Never fabricate one.
        const txHash = sent?.txHash ?? sent?.userOpHash ?? sent?.intentId ?? null
        safeAudit(() => captureMiniAppTxSubmitted(address, requestedChain, { appId, txHash, to }))
        return withWait({ kind: 'sent', txHash, safeTxHash: null }, requestedChain)
      }

      // A classic personal session with no signer has no rail either — say so
      // in the same typed way rather than letting the null reach ethers.
      if (!isVault && !isLegacy && !signer) {
        throw new MiniAppHostError(
          HOST_REFUSAL.NO_WRITE_RAIL,
          'miniapp host: no signer and no sendCalls transport on this session',
          { userMessage: 'Reconnect your wallet before this app can send a transaction.' },
        )
      }

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
        return withWait({ kind: 'proposed', txHash: null, safeTxHash: result.safeTxHash ?? null }, requestedChain)
      }

      safeAudit(() =>
        captureMiniAppTxSubmitted(address, requestedChain, { appId, txHash: result?.txHash, to }),
      )
      return withWait({ kind: 'sent', txHash: result?.txHash ?? null, safeTxHash: null }, requestedChain)
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
      loginMethod,
      signer,
      sendCalls,
      screenOne,
    ],
  )

  const requestConnect = useCallback(() => {
    if (typeof openConnectModal === 'function') openConnectModal()
  }, [openConnectModal])

  /**
   * Ask the member's wallet to move to `chainId` (hostApi 2).
   *
   * The companion to `submit`'s WRONG_CHAIN refusal: without it an app can name the problem and
   * never offer the fix, which matters for anything that browses across chains (an external-DAO
   * list, a multi-chain portfolio) where the interesting network is routinely not the connected
   * one. `wagmi`'s `useSwitchChain` is unreachable from a package — a bundled copy of wagmi is a
   * different provider context — so the host has to do it.
   *
   * It grants no new authority. Switching networks already requires the member's explicit
   * approval in their own wallet; this only asks. A declined prompt is a typed refusal, not a
   * silent no-op, because the app has to be able to leave its button in the right state.
   */
  const switchChain = useCallback(
    async (requestedChainId) => {
      const target = evmChainId(requestedChainId)
      if (target == null) {
        throw new MiniAppHostError(
          HOST_REFUSAL.BAD_PAYLOAD,
          `miniapp host: switchChain() needs an EVM chain id, got ${String(requestedChainId)}`,
          { userMessage: 'This app asked to switch to a network the wallet does not recognise.' },
        )
      }
      if (typeof switchNetwork !== 'function') {
        throw new MiniAppHostError(
          HOST_REFUSAL.SWITCH_REFUSED,
          'miniapp host: this wallet session cannot switch networks',
          { userMessage: 'This wallet cannot switch networks from inside the app — switch it manually.' },
        )
      }
      try {
        await switchNetwork(target)
      } catch (error) {
        // Declining is the common case and is not an error worth a stack trace; the wallet's own
        // sentence ("Please manually switch to …") is already member-facing, so it is kept.
        throw new MiniAppHostError(
          HOST_REFUSAL.SWITCH_REFUSED,
          `miniapp host: switch to chain ${target} did not complete: ${error?.message || 'unknown'}`,
          { userMessage: error?.message || `Switch your wallet to network ${target} to continue.` },
        )
      }
    },
    [switchNetwork],
  )

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

  /**
   * Resolve a FairWins deployment address (hostApi 2).
   *
   * WHY THE HOST OWNS THIS. A package cannot carry the address book: importing
   * `config/contracts.js` reaches `config/tenant.js`, which imports the
   * `virtual:tenant` module supplied by a Vite plugin the package preset does
   * not register — a hard build failure. And a hand-copied table frozen into
   * immutable IPFS bytes would turn a routine redeploy into a re-publish,
   * re-review and re-approve cycle for every installed app, while `npm run
   * sync:frontend-contracts` kept the host's own copy correct beside it. Here,
   * a redeploy is a host release.
   *
   * WHAT IT REFUSES, AND WHY THE TWO CASES DIFFER:
   *   - an UNDECLARED name throws. The manifest allowlist is what a reviewer
   *     approved; a name outside it is the package asking for something nobody
   *     signed off on, and answering `null` would let that pass as "not
   *     deployed here".
   *   - a DECLARED name with no deployment on that chain returns `null`. That
   *     is a fact about the estate, and the app is expected to render its own
   *     honest unavailable state from it.
   *
   * Never a guess and never a fallback chain: `getContractAddressForChain` is
   * asked about the chain the app named, and nothing else.
   */
  const contracts = useCallback(
    (name, requestedChainId) => {
      if (!declaredContracts.includes(name)) {
        throw new MiniAppHostError(
          HOST_REFUSAL.UNDECLARED_CONTRACT,
          `miniapp host: "${String(name)}" is not declared in this package's manifest contracts`,
          { userMessage: 'This app asked for a contract it is not approved to use.' },
        )
      }
      const target = evmChainId(requestedChainId == null ? walletChain : requestedChainId)
      if (target == null) return null
      const address = getContractAddressForChain(name, target)
      // '' is how the address book spells "not deployed here"; `null` is how
      // this contract spells it, and the two must not be confused by the app.
      return address ? address : null
    },
    [declaredContracts, walletChain],
  )

  /**
   * A chain descriptor (hostApi 2) — display name, testnet flag, native
   * currency, explorer, subgraph endpoint.
   *
   * A flat VALUE PROJECTION, never the `NETWORKS` entry itself: that object also
   * carries rpcUrl, dex, polymarket and passkey configuration, and handing it
   * over would break the host's own rule that an app receives wrappers, never
   * handles.
   *
   * Returns `null` for an unknown chain rather than reproducing `getNetwork`'s
   * default-network fallback. An app must be able to say "unknown network", and
   * must never be able to render one chain's explorer link against another
   * chain's data.
   */
  /**
   * The chains this build may read (hostApi 2), mainnets-first.
   *
   * ADDED AFTER BEING DECLINED ONCE, and the reversal is deliberate rather than drift. It was
   * turned down for Token Mint's cross-chain deployments table — one informational card did not
   * justify a permanent grant to every package. Two things make this different:
   *
   *   1. For an app that is network-agnostic BY DESIGN — an external-DAO list reads every capable
   *      chain in parallel, independent of where the wallet sits — a roster is not a nicety, it is
   *      the model. The alternative is a chain list frozen into an immutable package, so a new
   *      network cannot appear without a re-publish, re-review and re-approve.
   *   2. It grants essentially nothing new. `network(chainId)` already answers for any id an app
   *      cares to try, so the roster is reachable today by enumeration — this only makes it
   *      efficient and honest instead of a guessing loop.
   *
   * `cohortChainIds()` and never `listSupportedChainIds()`: constitution III forbids a read
   * crossing the testnet/mainnet boundary, and that boundary is the host's to enforce rather than
   * something each package has to remember.
   */
  const networks = useCallback(() => Object.freeze(cohortChainIds()), [])

  const network = useCallback(
    (requestedChainId) => {
      const target = evmChainId(requestedChainId == null ? walletChain : requestedChainId)
      if (target == null) return null
      const net = NETWORKS[target]
      if (!net) return null
      return Object.freeze({
        chainId: target,
        name: net.name ?? null,
        isTestnet: Boolean(net.isTestnet),
        nativeCurrency: Object.freeze({
          symbol: net.nativeCurrency?.symbol ?? null,
          decimals: net.nativeCurrency?.decimals ?? null,
        }),
        explorer: net.explorer?.baseUrl
          ? Object.freeze({ name: net.explorer.name ?? null, baseUrl: net.explorer.baseUrl })
          : null,
        subgraphUrl: net.subgraphUrl ?? null,
      })
    },
    [walletChain],
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
      switchChain,
    })
    // Frozen: the app receives a capability set, not an object it can re-point.
    // Everything reachable from here is a wrapper — no context, no router, no
    // signer, no storage handle (see rule 1).
    return Object.freeze({
      appId,
      wallet,
      readProvider,
      contracts,
      network,
      networks,
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
    switchChain,
    readProvider,
    contracts,
    network,
    networks,
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
