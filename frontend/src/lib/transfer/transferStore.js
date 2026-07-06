/**
 * Local, per-address history for the Pay & Transfer wallet feature.
 *
 * A wallet-to-wallet payment is a self-contained action with no on-chain "my transfers" index we can
 * cheaply query (a stablecoin `transfer`/`transferWithAuthorization` is an ordinary ERC-20 Transfer event
 * among millions), so the Activity tab is backed by a small localStorage log the sender appends to when it
 * initiates a transfer. This is intentionally honest about scope: it records transfers THIS browser sent,
 * with truthful status transitions (in process → complete/failed), mirroring the reference design. It is
 * NOT a chain-of-record — the on-chain transaction is — and it never blocks a transfer if storage fails.
 *
 * Scoped by lowercased sender address so switching accounts shows the right history; each record also
 * carries its chainId so the list can note the network.
 */

const STORAGE_KEY = 'fairwins.transfers.v1'
const EVENT = 'fairwins:transfers-changed'
const MAX_PER_ADDRESS = 100

export const TRANSFER_STATUS = Object.freeze({
  IN_PROCESS: 'in_process',
  COMPLETE: 'complete',
  FAILED: 'failed',
})

function safeParse(raw) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function readAll() {
  if (typeof localStorage === 'undefined') return {}
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

function writeAll(all) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    // Notify same-tab listeners (the native `storage` event only fires cross-tab).
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(EVENT))
    }
  } catch {
    // Storage full / disabled — history is best-effort and must never break a transfer.
  }
}

function keyFor(address) {
  return (address || '').toLowerCase()
}

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `t_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`
}

/**
 * Append a new transfer record and return it (with generated id + timestamps).
 * @param {string} address - the sender address the history is scoped to.
 * @param {object} entry - { chainId, kind, symbol, decimals, amount, from, to, status, route, txHash?, error? }
 */
export function recordTransfer(address, entry) {
  const now = Date.now()
  const record = {
    id: makeId(),
    createdAt: now,
    updatedAt: now,
    status: TRANSFER_STATUS.IN_PROCESS,
    txHash: null,
    error: null,
    ...entry,
  }
  const all = readAll()
  const k = keyFor(address)
  const list = Array.isArray(all[k]) ? all[k] : []
  all[k] = [record, ...list].slice(0, MAX_PER_ADDRESS)
  writeAll(all)
  return record
}

/**
 * Patch an existing record (e.g. flip status to complete/failed, attach a txHash). No-op if not found.
 */
export function updateTransfer(address, id, patch) {
  const all = readAll()
  const k = keyFor(address)
  const list = Array.isArray(all[k]) ? all[k] : []
  let changed = false
  all[k] = list.map((r) => {
    if (r.id !== id) return r
    changed = true
    return { ...r, ...patch, updatedAt: Date.now() }
  })
  if (changed) writeAll(all)
}

/**
 * List transfers for an address, newest first. Optionally filter to a chainId.
 */
export function listTransfers(address, chainId) {
  const all = readAll()
  const list = all[keyFor(address)]
  if (!Array.isArray(list)) return []
  const rows = chainId == null ? list : list.filter((r) => Number(r.chainId) === Number(chainId))
  return [...rows].sort((a, b) => b.createdAt - a.createdAt)
}

/** Subscribe to same-tab + cross-tab changes. Returns an unsubscribe function. */
export function subscribeTransfers(listener) {
  if (typeof window === 'undefined') return () => {}
  const onLocal = () => listener()
  const onStorage = (e) => {
    if (!e || e.key === null || e.key === STORAGE_KEY) listener()
  }
  window.addEventListener(EVENT, onLocal)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onLocal)
    window.removeEventListener('storage', onStorage)
  }
}

/** Test/util seam: wipe all stored transfer history. */
export function __clearTransfers() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
