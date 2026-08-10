// Spec 042 — device-local tracked-DAO store, on the mini-app host store (spec 073 T028).
//
// On a network with no on-chain ExternalDAORegistry (e.g. Ethereum mainnet), a member tracks a DAO
// by address here instead of paying for an on-chain register.
//
// WHAT CHANGED IN THE CONVERSION. This used to own a raw `localStorage` key per (chainId, account):
// `clearpath.tracked.v1.<chainId>.<account>`. A mini-app has no business owning origin-level
// storage — it is the one thing that would let two apps collide, and it is invisible to the
// member's backup. The list now lives in the app's namespaced host store, which is ALREADY scoped
// to the acting account, so only the chain has to be keyed here:
//
//     store['tracked'] = { [chainId]: Entry[] }
//
// The account scoping is therefore no longer this module's job — and that is a real behaviour
// change worth stating: the namespace follows the ACTING identity, so a member operating as a
// vault sees the vault's tracked list, not their personal one. That is the correct reading of
// "whose DAOs are these", and it matches how every other per-account surface behaves.
//
// Entry shape: { address, framework, label, addedAt } — see specs/042 data-model §3.

/** Store key holding the whole per-chain map. */
export const TRACKED_KEY = 'tracked'

/** The legacy raw-localStorage prefix this module used to own. */
const LEGACY_PREFIX = 'clearpath.tracked.v1'

/** Set once a legacy import has run for this namespace, so it never runs twice. */
const MIGRATED_KEY = 'trackedMigratedAt'

const norm = (a) => String(a || '').toLowerCase()
const isBrowser = () => typeof window !== 'undefined' && !!window.localStorage

/**
 * Fold any legacy per-(chain, account) keys for `account` into the host store, once.
 *
 * NON-DESTRUCTIVE ON PURPOSE. The legacy keys are read and left alone rather than deleted:
 *   - the host store's write is best-effort (quota, private mode), so deleting first could lose a
 *     member's list to a failure this module cannot even observe;
 *   - a member who ends up on an older build still finds their DAOs where that build looks.
 * The cost is some dead bytes in localStorage, which is the cheap side of that trade.
 *
 * Reading raw `localStorage` from inside a package is exactly what the platform discourages, and
 * it is done here for the one thing it is legitimate for: importing data this same app wrote
 * before it was a package. It never reads a key that is not ClearPath's own, and never writes one.
 */
function migrateLegacy(store, account) {
  if (store.get(MIGRATED_KEY, null)) return
  if (!isBrowser() || !account) return

  const suffix = `.${norm(account)}`
  const byChain = { ...(store.get(TRACKED_KEY, null) || {}) }
  let found = 0

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (typeof key !== 'string') continue
      if (!key.startsWith(`${LEGACY_PREFIX}.`) || !key.endsWith(suffix)) continue

      // `clearpath.tracked.v1.<chainId>.<account>` — the chain is the segment before the account.
      const chainId = key.slice(LEGACY_PREFIX.length + 1, key.length - suffix.length)
      if (!/^\d+$/.test(chainId)) continue

      let legacy
      try {
        legacy = JSON.parse(window.localStorage.getItem(key) || '[]')
      } catch {
        continue // a corrupt legacy blob is skipped, never allowed to abort the rest
      }
      if (!Array.isArray(legacy) || legacy.length === 0) continue

      // Union by address so a re-run, or a chain already present, cannot duplicate rows.
      const existing = Array.isArray(byChain[chainId]) ? byChain[chainId] : []
      const seen = new Set(existing.map((e) => norm(e.address)))
      const merged = existing.slice()
      for (const entry of legacy) {
        if (!entry?.address || seen.has(norm(entry.address))) continue
        seen.add(norm(entry.address))
        merged.push(entry)
      }
      byChain[chainId] = merged
      found += 1
    }
  } catch {
    // Storage enumeration failed entirely — leave the flag unset so a later mount retries.
    return
  }

  if (found > 0) store.set(TRACKED_KEY, byChain)
  // Marked even when nothing was found: the scan is the expensive part, and "there was nothing to
  // import" is as final an answer as "there was".
  store.set(MIGRATED_KEY, Math.floor(Date.now() / 1000))
}

/**
 * The per-chain map itself, so a caller can see WHICH chains hold tracked DAOs.
 *
 * Exposed because the member's own list must be listable on a chain that has neither a registry
 * nor curated DAOs — without this the aggregate scan would skip exactly the chains device-local
 * tracking exists for.
 */
export function chainsWithEntries(store, account) {
  const map = readMap(store, account)
  return Object.fromEntries(
    Object.entries(map).filter(([, entries]) => Array.isArray(entries) && entries.length > 0),
  )
}

/** Read the per-chain map, importing legacy data on first use. */
function readMap(store, account) {
  if (!store) return {}
  migrateLegacy(store, account)
  const map = store.get(TRACKED_KEY, null)
  return map && typeof map === 'object' ? map : {}
}

function readChain(store, account, chainId) {
  const entries = readMap(store, account)[String(chainId)]
  return Array.isArray(entries) ? entries : []
}

function writeChain(store, account, chainId, entries) {
  const map = { ...readMap(store, account), [String(chainId)]: entries }
  return store.set(TRACKED_KEY, map)
}

/**
 * Every DAO tracked device-local for this chain, newest first. Reverse insertion order before the
 * stable sort so two adds in the same second (equal `addedAt`) still order newest-first.
 */
export function list(store, account, chainId) {
  if (chainId == null) return []
  return readChain(store, account, chainId)
    .slice()
    .reverse()
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
}

/** Whether `address` is already tracked on this chain (case-insensitive). */
export function has(store, account, chainId, address) {
  const target = norm(address)
  return readChain(store, account, chainId).some((e) => norm(e.address) === target)
}

/**
 * Add a tracked DAO. Idempotent: returns `{ added:false, reason:'exists' }` for a duplicate so the
 * caller can say "already tracked" truthfully rather than showing a phantom row.
 */
export function add(store, account, chainId, { address, framework = null, label = '' }) {
  if (!store || chainId == null || !address) return { added: false, reason: 'invalid' }
  if (has(store, account, chainId, address)) return { added: false, reason: 'exists' }
  const entry = {
    address,
    framework: framework == null ? null : Number(framework),
    label: String(label || '').trim().slice(0, 120),
    addedAt: Math.floor(Date.now() / 1000),
  }
  const ok = writeChain(store, account, chainId, [...readChain(store, account, chainId), entry])
  // The host store never throws; it reports. A failed write must not be reported as a tracked DAO.
  return ok === false ? { added: false, reason: 'storage' } : { added: true, entry }
}

/** Remove a tracked DAO by address (case-insensitive). Reports whether anything was removed. */
export function remove(store, account, chainId, address) {
  if (!store || chainId == null) return { removed: false }
  const target = norm(address)
  const current = readChain(store, account, chainId)
  const next = current.filter((e) => norm(e.address) !== target)
  if (next.length === current.length) return { removed: false }
  return writeChain(store, account, chainId, next) === false
    ? { removed: false }
    : { removed: true }
}

export default { list, has, add, remove }
