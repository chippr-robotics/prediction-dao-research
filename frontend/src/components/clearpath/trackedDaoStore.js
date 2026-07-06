// Spec 042 — device-local tracked-DAO store.
//
// On a network with no on-chain ExternalDAORegistry (e.g. Ethereum mainnet), a member tracks a DAO by address
// here instead of paying for an on-chain register. The list is per-member + per-network (keyed by wallet +
// chainId) and lives in the browser (no backend, no cross-device sync in this cut — a deliberate follow-on that
// could ride spec 032). Strict scoping in the key guarantees nothing leaks across networks or accounts (FR-014).
//
// Record shape: { address, framework, label, addedAt } — see specs/042 data-model §3.

const PREFIX = 'clearpath.tracked.v1' // versioned so a future sync migration can coexist

const isBrowser = () => typeof window !== 'undefined' && !!window.localStorage

/** The storage key for a (chainId, wallet) scope. Wallet is lowercased so casing never splits a member's list. */
function keyFor(chainId, account) {
  return `${PREFIX}.${chainId}.${String(account || '').toLowerCase()}`
}

function readRaw(chainId, account) {
  if (!isBrowser() || chainId == null || !account) return []
  try {
    const raw = window.localStorage.getItem(keyFor(chainId, account))
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    // Corrupt/unreadable storage → treat as empty rather than throwing (never fabricates rows).
    return []
  }
}

function writeRaw(chainId, account, list) {
  if (!isBrowser() || chainId == null || !account) return
  try {
    window.localStorage.setItem(keyFor(chainId, account), JSON.stringify(list))
  } catch {
    // Quota/serialization failure — surface via the caller's notification path, not a crash.
  }
}

const norm = (a) => String(a || '').toLowerCase()

/**
 * Every DAO tracked device-local for (chainId, account), newest first. Network- + account-scoped. Reverse
 * insertion order before the stable sort so two adds within the same second (equal `addedAt`) still order
 * newest-first (the later-inserted wins the tie) rather than falling back to insertion order.
 */
export function list(chainId, account) {
  return readRaw(chainId, account)
    .slice()
    .reverse()
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
}

/** Whether `address` is already tracked in this scope (case-insensitive). */
export function has(chainId, account, address) {
  const target = norm(address)
  return readRaw(chainId, account).some((e) => norm(e.address) === target)
}

/**
 * Add a tracked DAO. Idempotent: returns { added:false, reason:'exists' } for a duplicate (the caller surfaces a
 * truthful "already tracked" notice — no duplicate/phantom row). Stores a normalized record.
 */
export function add(chainId, account, { address, framework = null, label = '' }) {
  if (chainId == null || !account || !address) return { added: false, reason: 'invalid' }
  if (has(chainId, account, address)) return { added: false, reason: 'exists' }
  const list_ = readRaw(chainId, account)
  const entry = {
    address,
    framework: framework == null ? null : Number(framework),
    label: String(label || '').trim().slice(0, 120),
    addedAt: Math.floor(Date.now() / 1000),
  }
  list_.push(entry)
  writeRaw(chainId, account, list_)
  return { added: true, entry }
}

/** Remove a tracked DAO by address (case-insensitive). Returns whether anything was removed. */
export function remove(chainId, account, address) {
  const target = norm(address)
  const list_ = readRaw(chainId, account)
  const next = list_.filter((e) => norm(e.address) !== target)
  if (next.length === list_.length) return { removed: false }
  writeRaw(chainId, account, next)
  return { removed: true }
}

export default { list, has, add, remove }
