/**
 * Per-app shared state for mounted mini-apps (spec 073, data-model.md §3 ·
 * FR-018/FR-016).
 *
 * A mini-app is third-party code running inside the member's session. It gets
 * exactly one place to keep state, and the isolation between apps has to be a
 * property of the API rather than a rule authors are asked to respect.
 *
 * THE NAMESPACE IS STRUCTURAL, NOT A CONVENTION (FR-018). `createAppStore`
 * closes over the app id and returns three methods that take a KEY — never a
 * namespace, never a storage key, never an app id. There is no argument a
 * mini-app can construct that reaches another app's data, because the only
 * place `appId` appears is inside this module's own closure: the storage key
 * (`miniapp_<appId>_v1`) is built here, the in-memory namespace is looked up
 * here, and neither is derived from anything the caller passes to `get`/`set`.
 * A prefix an app is *asked* not to escape is a convention; a prefix an app
 * cannot name is a guarantee, and only the second one survives a hostile
 * package.
 *
 * The other deliberate choices:
 *
 * - **Two tiers, session first.** The session tier (in memory, keyed by
 *   account+app) is the working copy; `userStorage` localStorage is the durable
 *   tier written behind it. That ordering is what makes `get` after `set`
 *   truthful: `saveUserPreference` swallows its own storage errors (quota,
 *   private mode, disabled storage), so a store that read back through
 *   localStorage would silently serve the pre-write value and the app would
 *   render state the member never chose. It is also what lets an app run at all
 *   with no wallet connected — there is no account to attribute durable state
 *   to, so nothing is persisted, and the app still works for the session
 *   (FR-016 across unmount/remount).
 * - **Writes never throw into the app.** Every refusal (bad key, unserializable
 *   value, over-budget namespace) is a `false` return and a console warning.
 *   A mini-app crashing because it stored the wrong shape is a worse failure
 *   than the write not landing, and the host cannot rely on third-party code to
 *   catch what this module throws.
 * - **Values are JSON snapshots, deep-frozen.** `set` stores a serialized copy,
 *   so an app mutating the object it passed in cannot retroactively change
 *   stored state, and what `get` returns is exactly what a reload would give
 *   back. Freezing also makes the returned reference safe to hand out and
 *   stable between writes, which is what `useSyncExternalStore` needs from a
 *   snapshot.
 * - **A corrupt stored shape resets, it does not throw** (the
 *   `ledgerClientStore` convention). A member with a damaged blob gets an empty
 *   app, not a workspace that cannot mount.
 *
 * This module holds app *state*, never app *packages* and never anything
 * privileged: no key material, no session secrets, no host internals ever pass
 * through it.
 */

import { getUserPreference, saveUserPreference } from '../../utils/userStorage'
import { APP_ID_PATTERN, STORE_KEY_PATTERN } from './manifest'

/** Stored shape version; a blob declaring anything else is reset, not migrated. */
export const STORE_VERSION = 1

/**
 * Ceiling on one app's persisted namespace, serialized.
 *
 * localStorage is a single ~5 MB origin budget shared with the member's own
 * preferences, address book, activity ledger and backup pointers. Without a
 * bound, one runaway mini-app writing in a loop would evict the host's own
 * data — an app cannot be allowed to break the wallet around it. 256 KB is far
 * more than a workspace's UI state and far less than the origin budget.
 */
export const MAX_NAMESPACE_BYTES = 256 * 1024

/**
 * Keys that must never become own properties of the data object.
 *
 * `STORE_KEY_PATTERN` admits `__proto__` (it is ordinary word characters), and
 * a value assigned under that name reaches `Object.prototype` through any code
 * path that uses `[[Set]]` (`Object.assign`, `obj[key] = v`). This module builds
 * its objects with null prototypes and own-property definition, so it is not
 * currently reachable — the refusal exists so a later refactor to a plain
 * spread cannot quietly reintroduce prototype pollution from untrusted keys.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * `userStorage`'s own key prefix, mirrored so the cross-tab `storage` filter can
 * recognise this namespace's key (the `ledgerClientStore` precedent —
 * `userStorage` does not export its key builder).
 */
const USER_STORAGE_PREFIX = 'fw_user_'

/** The `userStorage` feature key holding one app's namespace (data-model.md §3). */
export function appStoreFeatureKey(appId) {
  return `miniapp_${appId}_v1`
}

/**
 * The raw localStorage key a namespace lands on, or null when there is no
 * account (nothing durable exists to name). Exported for the cross-tab filter,
 * tests, and any surface that has to reason about the stored blob itself.
 */
export function appStoreStorageKey(account, appId) {
  if (!account) return null
  return `${USER_STORAGE_PREFIX}${String(account).toLowerCase()}_${appStoreFeatureKey(appId)}`
}

/**
 * Session tier: `namespaceId -> { account, appId, data, listeners, revision }`.
 * Shared by every `createAppStore` call for the same (account, app), which is
 * what makes state survive an unmount/remount inside one session (FR-016).
 */
const namespaces = new Map()

/** Attached lazily on first `subscribe`; removed by the test seam. */
let storageHandler = null

function namespaceId(account, appId) {
  return `${account || ''}|${appId}`
}

/** An object we can safely iterate as a bag of own properties. */
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function emptyData() {
  return Object.create(null)
}

/** Own-property read that works on a null-prototype bag. */
function hasKey(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key)
}

/**
 * A key a mini-app may address. Bounded and character-restricted by
 * `STORE_KEY_PATTERN` (the same pattern `manifest.storeKeys` is validated
 * against, so a declared key is always an addressable one), minus the names
 * that would touch the prototype chain.
 */
function isStoreKey(key) {
  return typeof key === 'string' && STORE_KEY_PATTERN.test(key) && !FORBIDDEN_KEYS.has(key)
}

/** Recursively freeze a JSON value so a handed-out reference cannot be mutated. */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

/**
 * Rebuild a stored bag as a null-prototype object of frozen values, dropping
 * any key this module would refuse to write. A blob restored from a backup (or
 * hand-edited) is untrusted input like any other.
 */
function sanitizeData(stored) {
  const data = emptyData()
  if (!isPlainObject(stored)) return data
  for (const [key, value] of Object.entries(stored)) {
    if (!isStoreKey(key)) continue
    data[key] = deepFreeze(value)
  }
  return data
}

/**
 * The durable tier for one namespace, or an empty bag when there is nothing to
 * read (no account, nothing stored) or what is there cannot be honored.
 */
function readPersisted(account, appId) {
  if (!account) return emptyData()
  let stored
  try {
    stored = getUserPreference(account, appStoreFeatureKey(appId), null, true)
  } catch {
    // getUserPreference already contains its own failures; this is belt and braces.
    return emptyData()
  }
  if (stored == null) return emptyData()
  if (!isPlainObject(stored) || stored.version !== STORE_VERSION || !isPlainObject(stored.data)) {
    // Reset rather than throw: a damaged blob must not stop the app mounting.
    console.warn(`[miniapps/store] Unsupported store shape for "${appId}" — resetting to defaults`)
    return emptyData()
  }
  return sanitizeData(stored.data)
}

/** The session record for a namespace, hydrated from the durable tier once. */
function namespaceFor(account, appId) {
  const id = namespaceId(account, appId)
  let ns = namespaces.get(id)
  if (!ns) {
    ns = { account, appId, data: readPersisted(account, appId), listeners: new Set(), revision: 0 }
    namespaces.set(id, ns)
  }
  return ns
}

/**
 * Best-effort durable write. `saveUserPreference` swallows storage failures, so
 * this cannot report one — which is exactly why the session tier, not this, is
 * what `get` reads.
 */
function persist(ns) {
  if (!ns.account) return
  try {
    saveUserPreference(ns.account, appStoreFeatureKey(ns.appId), { version: STORE_VERSION, data: ns.data }, true)
  } catch {
    // Storage full/disabled — persistence is best-effort and must never break
    // the app that wrote (the transferStore/ledgerClientStore rule).
  }
}

function notify(ns) {
  ns.revision += 1
  // Copy first: a listener that unsubscribes itself must not perturb the walk.
  for (const listener of [...ns.listeners]) {
    try {
      listener()
    } catch {
      // A bad subscriber must not break the write that triggered it.
    }
  }
}

/**
 * One module-level `storage` listener, attached on first subscribe.
 *
 * Per-subscriber listeners would fan out quadratically (N subscribers × N
 * notifications for one cross-tab write). A cross-tab change replaces the whole
 * blob, so the namespace is re-read rather than patched — and listeners are
 * called with no arguments precisely because this path cannot honestly say
 * which key changed.
 */
function ensureStorageListener() {
  if (storageHandler || typeof window === 'undefined') return
  storageHandler = (event) => {
    for (const ns of namespaces.values()) {
      if (!ns.account) continue
      const key = appStoreStorageKey(ns.account, ns.appId)
      // A null key means the other tab cleared storage entirely.
      if (event && event.key != null && event.key !== key) continue
      ns.data = readPersisted(ns.account, ns.appId)
      notify(ns)
    }
  }
  window.addEventListener('storage', storageHandler)
}

/**
 * The store handed to one mounted mini-app.
 *
 * @param {string|null} account - active identity; `null` runs session-only (nothing persisted)
 * @param {string} appId - registry/manifest app id; the namespace root
 * @returns {{get: (key: string, fallback?: any) => any,
 *            set: (key: string, value: any) => boolean,
 *            subscribe: (listener: () => void) => () => void}} frozen store
 * @throws {Error} when `appId` is not a valid app id — a malformed id would
 *   produce a storage key that could collide with another app's, so it is
 *   refused loudly at construction (the host's error boundary catches it)
 *   rather than silently handing back a store with no isolation. Nothing the
 *   returned store DOES ever throws.
 */
export function createAppStore(account, appId) {
  if (typeof appId !== 'string' || !APP_ID_PATTERN.test(appId)) {
    throw new Error(`miniapps/store: invalid app id "${appId}" — refusing to open a namespace for it`)
  }
  const owner = account ? String(account).toLowerCase() : null

  /**
   * Read one key. Returns the caller's fallback for an unknown or unaddressable
   * key. The returned value is frozen and stable until the next write, so it is
   * safe as a `useSyncExternalStore` snapshot.
   */
  function get(key, fallback = null) {
    if (!isStoreKey(key)) return fallback
    const ns = namespaceFor(owner, appId)
    return hasKey(ns.data, key) ? ns.data[key] : fallback
  }

  /**
   * Write one key. `undefined` removes it (JSON has no `undefined`, so storing
   * one would read back as a missing key anyway — removal is the honest
   * interpretation).
   *
   * @returns {boolean} whether anything actually changed. A no-op write is
   *   reported as `false` so the host does not audit a state change that did
   *   not happen (FR-019) and React consumers are not woken for nothing.
   */
  function set(key, value) {
    if (!isStoreKey(key)) {
      console.warn(`[miniapps/store] "${appId}" tried to write an unsupported key — ignored`)
      return false
    }
    const ns = namespaceFor(owner, appId)
    const had = hasKey(ns.data, key)

    if (value === undefined) {
      if (!had) return false
      const next = emptyData()
      for (const [k, v] of Object.entries(ns.data)) if (k !== key) next[k] = v
      ns.data = next
      persist(ns)
      notify(ns)
      return true
    }

    let json
    try {
      json = JSON.stringify(value)
    } catch {
      json = undefined // cyclic, or a BigInt/toJSON that throws
    }
    if (json === undefined) {
      // Functions, symbols and undefined serialize to nothing. Keeping such a
      // value in memory only would mean `get` returns something a reload cannot.
      console.warn(`[miniapps/store] "${appId}" tried to store a value that cannot be persisted — ignored`)
      return false
    }
    if (had && JSON.stringify(ns.data[key]) === json) return false

    const next = emptyData()
    for (const [k, v] of Object.entries(ns.data)) if (k !== key) next[k] = v
    next[key] = deepFreeze(JSON.parse(json))

    const serialized = JSON.stringify({ version: STORE_VERSION, data: next })
    if (serialized.length > MAX_NAMESPACE_BYTES) {
      console.warn(
        `[miniapps/store] "${appId}" exceeded its ${MAX_NAMESPACE_BYTES}-byte state budget — write ignored`,
      )
      return false
    }

    ns.data = next
    persist(ns)
    notify(ns)
    return true
  }

  /**
   * Observe changes to THIS app's namespace (same tab and, when the state is
   * persisted, other tabs). The listener takes no arguments — it re-reads what
   * it needs through `get`, which is the only thing a cross-tab change can
   * honestly support.
   *
   * @returns {() => void} unsubscribe
   */
  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {}
    const ns = namespaceFor(owner, appId)
    ns.listeners.add(listener)
    if (owner) ensureStorageListener()
    return () => ns.listeners.delete(listener)
  }

  // Frozen: the app receives a capability, not an object it can re-point.
  return Object.freeze({ get, set, subscribe })
}

/* ------------------------------------------------------------------------ *
 * Backup seam (spec 073 T040 · spec 032)
 *
 * The backup carries app state as ONE object keyed by app id
 * (`{ [appId]: { <storeKey>: value } }`) rather than one synced object per app,
 * because the set of installed apps is open-ended: a registry listing added
 * next week must ride the existing backup with no edit to
 * `lib/backup/syncedObjects.js`.
 *
 * Not network-scoped. App data is chain-agnostic unless an app chooses to
 * namespace its own keys by chain, and claiming otherwise would make the
 * restore UI offer a per-network choice this data cannot honor.
 *
 * Everything crossing this seam is UNTRUSTED, in both directions. A backup blob
 * may have been hand-edited, may come from a build with different apps
 * installed, and — because it is restored into namespaces that third-party code
 * reads — is exactly the input a hostile package would want to influence. So the
 * same `APP_ID_PATTERN` / `isStoreKey` / size checks that guard a live `set`
 * guard a restore, and anything failing them is dropped rather than repaired.
 * ------------------------------------------------------------------------- */

/** Bound on the whole restored bundle, mirroring the per-namespace budget. */
const MAX_APPS_IN_BUNDLE = 128

/**
 * The app ids with something persisted for `account`.
 *
 * Read by scanning localStorage rather than from a registry read: the backup
 * must capture the state of an app that has since been suspended, deprecated,
 * or delisted. State the member's own apps wrote is the member's, and it does
 * not stop being theirs because a curator changed a listing.
 */
export function listStoredAppIds(account) {
  if (!account || typeof window === 'undefined') return []
  const prefix = `${USER_STORAGE_PREFIX}${String(account).toLowerCase()}_miniapp_`
  const out = []
  let storage
  try {
    storage = window.localStorage
    if (!storage) return []
  } catch {
    return [] // storage disabled — no durable state to back up
  }
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (typeof key !== 'string' || !key.startsWith(prefix) || !key.endsWith('_v1')) continue
      // `APP_ID_PATTERN` admits no underscore, so this slice is unambiguous.
      const appId = key.slice(prefix.length, -'_v1'.length)
      if (APP_ID_PATTERN.test(appId)) out.push(appId)
    }
  } catch {
    return out
  }
  return out.sort()
}

/**
 * Every app's persisted state for `account`, as plain JSON for the backup.
 *
 * Reads the DURABLE tier directly, not the session tier: a backup should
 * describe what a reload would restore, and an app mounted right now may hold
 * session-only state (no account) that was deliberately never persisted.
 * Namespaces that are empty are omitted — an empty bag in a backup is noise
 * that survives forever once written.
 */
export function loadMiniAppState(account) {
  const out = {}
  if (!account) return out
  for (const appId of listStoredAppIds(account)) {
    const data = readPersisted(account, appId)
    const entries = Object.entries(data)
    if (entries.length === 0) continue
    out[appId] = Object.fromEntries(entries)
  }
  return out
}

/** Accept only what a live `set` would have accepted, per app. */
function sanitizeBundle(value) {
  const out = {}
  if (!isPlainObject(value)) return out
  let apps = 0
  for (const [appId, data] of Object.entries(value)) {
    if (apps >= MAX_APPS_IN_BUNDLE) break
    if (!APP_ID_PATTERN.test(appId) || !isPlainObject(data)) continue
    const clean = {}
    for (const [key, v] of Object.entries(data)) {
      if (!isStoreKey(key)) continue
      clean[key] = v
    }
    if (Object.keys(clean).length === 0) continue
    // One app's restored namespace is held to the same ceiling a live write is,
    // so a crafted backup cannot do what `set` refuses to.
    try {
      if (JSON.stringify(clean).length > MAX_NAMESPACE_BYTES) continue
    } catch {
      continue // unserializable — it could never have been written by `set`
    }
    out[appId] = clean
    apps += 1
  }
  return out
}

/**
 * Merge two bundles: union of apps, and within an app a SHALLOW union of keys
 * (data-model.md §3). Incoming wins a same-key disagreement and the
 * disagreement is reported, which is the addressBook convention — a restore
 * that silently discarded local state would be the one failure mode a member
 * cannot detect afterwards.
 *
 * Shallow is deliberate. These values are opaque app-defined JSON; a deep merge
 * would invent a semantics for them (array concat? object union?) that no app
 * agreed to, and could hand a package a shape it never wrote.
 */
export function mergeMiniAppState(current, incoming) {
  const base = sanitizeBundle(current)
  const next = sanitizeBundle(incoming)
  const value = {}
  const conflicts = []
  for (const [appId, data] of Object.entries(base)) value[appId] = { ...data }
  for (const [appId, data] of Object.entries(next)) {
    const existing = value[appId]
    if (!existing) {
      value[appId] = { ...data }
      continue
    }
    for (const [key, v] of Object.entries(data)) {
      if (
        Object.prototype.hasOwnProperty.call(existing, key) &&
        JSON.stringify(existing[key]) !== JSON.stringify(v)
      ) {
        conflicts.push({ appId, key })
      }
      existing[key] = v
    }
  }
  return { value, conflicts }
}

/**
 * Write a restored bundle back to the durable tier.
 *
 * `mode: 'replace'` clears namespaces the bundle does not mention, so a restore
 * reproduces the backed-up device rather than leaving orphan state from this
 * one; `'merge'` is additive and reports conflicts.
 *
 * Mounted apps are refreshed and their subscribers notified. Without this, a
 * restore performed while an app is on screen would land in storage but leave
 * the session tier — the tier `get` actually reads — serving pre-restore values
 * until the member reloaded, which reads as "the restore did nothing".
 */
export function applyMiniAppState(account, value, mode = 'merge') {
  if (!account) return { conflicts: [] }
  const incoming = sanitizeBundle(value)
  let bundle = incoming
  let conflicts = []

  if (mode === 'replace') {
    for (const appId of listStoredAppIds(account)) {
      if (Object.prototype.hasOwnProperty.call(incoming, appId)) continue
      try {
        saveUserPreference(account, appStoreFeatureKey(appId), { version: STORE_VERSION, data: {} }, true)
      } catch {
        // Best-effort, as everywhere else in this module.
      }
    }
  } else {
    const merged = mergeMiniAppState(loadMiniAppState(account), incoming)
    bundle = merged.value
    conflicts = merged.conflicts
  }

  for (const [appId, data] of Object.entries(bundle)) {
    try {
      saveUserPreference(account, appStoreFeatureKey(appId), { version: STORE_VERSION, data }, true)
    } catch {
      // Best-effort.
    }
  }

  // Re-hydrate anything mounted for this account and tell it state moved.
  const owner = String(account).toLowerCase()
  for (const ns of namespaces.values()) {
    if (!ns.account || String(ns.account).toLowerCase() !== owner) continue
    ns.data = readPersisted(ns.account, ns.appId)
    notify(ns)
  }

  return { conflicts }
}

/**
 * Test/util seam: forget every session namespace and detach the cross-tab
 * listener, so the next read hits storage again (the `endpointStore` seam).
 * Does not touch persisted data — tests clear localStorage themselves.
 */
export function __resetMiniAppStores() {
  namespaces.clear()
  if (storageHandler && typeof window !== 'undefined') {
    window.removeEventListener('storage', storageHandler)
  }
  storageHandler = null
}
