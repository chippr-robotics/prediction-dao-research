/**
 * Wager cache store — bounded localStorage layout for the My Wagers
 * paginated query path.
 *
 * Two keys per user:
 *   wagerIndex_v2_<addr>  → { marketIds, lastBlock, schemaVersion: 2 }
 *   wagerCache_v2_<addr>  → { [id]: Wager } (raw metadataCipher, never decrypted)
 *
 * On first read, migrates from the legacy keys used by blockchainService.js:
 *   friendMarketIndex_<addr>, friendMarketCache_<addr>.
 *
 * Enforces a byte budget (4 MB soft / 8 MB hard) by evicting cache entries
 * via LRU. Index entries (IDs + watermark) are preserved — they're cheap
 * and required for correctness on the next sync.
 */

const INDEX_PREFIX = 'wagerIndex_v2_'
const CACHE_PREFIX = 'wagerCache_v2_'
const LEGACY_INDEX_PREFIX = 'friendMarketIndex_'
const LEGACY_CACHE_PREFIX = 'friendMarketCache_'

const SCHEMA_VERSION = 2

const BYTE_BUDGET_SOFT = 4 * 1024 * 1024
const BYTE_BUDGET_HARD = 8 * 1024 * 1024

function normalize(addr) {
  return String(addr).toLowerCase()
}

function indexKey(addr) {
  return INDEX_PREFIX + normalize(addr)
}

function cacheKey(addr) {
  return CACHE_PREFIX + normalize(addr)
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    console.warn('[wagerCache] write failed for', key, e?.message)
    return false
  }
}

function emptyIndex() {
  return { marketIds: [], lastBlock: 0, schemaVersion: SCHEMA_VERSION }
}

function migrateLegacyIndex(addr) {
  const legacy = readJson(LEGACY_INDEX_PREFIX + normalize(addr))
  if (!legacy || !Array.isArray(legacy.marketIds)) return null
  return {
    marketIds: legacy.marketIds.map(String),
    lastBlock: Number(legacy.lastBlock) || 0,
    schemaVersion: SCHEMA_VERSION,
  }
}

function migrateLegacyCache(addr) {
  const legacy = readJson(LEGACY_CACHE_PREFIX + normalize(addr))
  if (!legacy || typeof legacy !== 'object') return null
  const migrated = {}
  for (const [id, entry] of Object.entries(legacy)) {
    if (!entry || typeof entry !== 'object') continue
    migrated[id] = {
      ...entry,
      id: String(entry.id ?? id),
      lastTouched: Date.now(),
      needsRehydration: true,
    }
  }
  return migrated
}

export function loadIndex(userAddress) {
  if (!userAddress) return emptyIndex()
  const existing = readJson(indexKey(userAddress))
  if (existing && existing.schemaVersion === SCHEMA_VERSION) return existing
  const migrated = migrateLegacyIndex(userAddress)
  if (migrated) {
    writeJson(indexKey(userAddress), migrated)
    return migrated
  }
  return emptyIndex()
}

export function saveIndex(userAddress, { marketIds, lastBlock }) {
  if (!userAddress) return
  writeJson(indexKey(userAddress), {
    marketIds: marketIds.map(String),
    lastBlock: Number(lastBlock) || 0,
    schemaVersion: SCHEMA_VERSION,
  })
}

export function loadCache(userAddress) {
  if (!userAddress) return {}
  const existing = readJson(cacheKey(userAddress))
  if (existing && typeof existing === 'object') return existing
  const migrated = migrateLegacyCache(userAddress)
  if (migrated) {
    writeJson(cacheKey(userAddress), migrated)
    return migrated
  }
  return {}
}

function estimateBytes(obj) {
  try {
    return JSON.stringify(obj).length
  } catch {
    return 0
  }
}

function evictLru(cache, targetBytes) {
  const entries = Object.entries(cache)
  entries.sort((a, b) => (a[1]?.lastTouched ?? 0) - (b[1]?.lastTouched ?? 0))
  const next = { ...cache }
  let bytes = estimateBytes(next)
  for (const [id] of entries) {
    if (bytes <= targetBytes) break
    delete next[id]
    bytes = estimateBytes(next)
  }
  return next
}

export function saveCache(userAddress, cache) {
  if (!userAddress) return
  let toWrite = cache
  let bytes = estimateBytes(toWrite)
  if (bytes > BYTE_BUDGET_HARD) {
    toWrite = evictLru(toWrite, BYTE_BUDGET_SOFT)
  } else if (bytes > BYTE_BUDGET_SOFT) {
    toWrite = evictLru(toWrite, BYTE_BUDGET_SOFT)
  }
  const ok = writeJson(cacheKey(userAddress), toWrite)
  if (!ok) {
    const trimmed = evictLru(toWrite, Math.floor(BYTE_BUDGET_SOFT / 2))
    writeJson(cacheKey(userAddress), trimmed)
  }
}

export function touchCache(userAddress, ids) {
  if (!userAddress || !ids?.length) return
  const cache = loadCache(userAddress)
  const now = Date.now()
  let changed = false
  for (const id of ids) {
    if (cache[id]) {
      cache[id].lastTouched = now
      changed = true
    }
  }
  if (changed) saveCache(userAddress, cache)
}

export function upsertCache(userAddress, wagers) {
  if (!userAddress || !wagers?.length) return
  const cache = loadCache(userAddress)
  const now = Date.now()
  for (const wager of wagers) {
    if (!wager?.id) continue
    cache[String(wager.id)] = { ...wager, lastTouched: now }
  }
  saveCache(userAddress, cache)
}

export const __testing = {
  INDEX_PREFIX,
  CACHE_PREFIX,
  LEGACY_INDEX_PREFIX,
  LEGACY_CACHE_PREFIX,
  SCHEMA_VERSION,
  BYTE_BUDGET_SOFT,
  BYTE_BUDGET_HARD,
  estimateBytes,
  evictLru,
}
