/**
 * Bitcoin upstream -> gateway DTO normalization for the /v1/bitcoin/* proxy (spec 061).
 *
 * The gateway never passes upstream response shapes through to clients: every field the SPA
 * consumes is mapped here, so Esplora/indexer schema drift breaks THIS module's tests, not the
 * frontend. All amounts are integer satoshis (never floats, never BTC decimals).
 *
 * Contract: specs/061-bitcoin-transactions/contracts/bitcoin-gateway-api.md.
 */

// bech32 data charset (BIP-173): excludes 1, b, i, o. Lowercase only — the client normalizes
// user input to lowercase before calling; mixed/upper-case is rejected here as a sanity check.
const BECH32_DATA_RE = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/
const TXID_RE = /^[0-9a-fA-F]{64}$/
const RAWTX_HEX_RE = /^(?:[0-9a-fA-F]{2})+$/

export const MAX_ADDRESSES_PER_REQUEST = 50
// Contract cap: raw tx <= 100 kB of transaction bytes = 200k hex characters.
export const MAX_RAWTX_HEX_CHARS = 200_000

/**
 * Syntactic address validation per network: prefix + charset + length sanity ONLY.
 * Full bech32/bech32m checksum validation lives CLIENT-side (@scure/btc-signer codecs,
 * research R7/FR-011) — the gateway just refuses obviously-wrong input (EVM 0x addresses,
 * wrong-network prefixes, junk) before spending quota or upstream calls.
 *
 * mainnet:  bech32/bech32m `bc1…`; base58 `1…` (P2PKH) / `3…` (P2SH)
 * testnet:  bech32/bech32m `tb1…` (testnet4); base58 `m…`/`n…` (P2PKH) / `2…` (P2SH)
 */
export function isValidBitcoinAddress(address, network) {
  if (typeof address !== 'string') return false
  const bech32Hrp = network === 'mainnet' ? 'bc1' : 'tb1'
  if (address.startsWith(bech32Hrp)) {
    const data = address.slice(bech32Hrp.length)
    // P2WPKH is 42 chars total, P2TR 62; BIP-173 caps the whole string at 90.
    return address.length >= 14 && address.length <= 90 && BECH32_DATA_RE.test(data)
  }
  const base58Lead = network === 'mainnet' ? /^[13]/ : /^[mn2]/
  if (base58Lead.test(address)) {
    return address.length >= 26 && address.length <= 35 && BASE58_RE.test(address)
  }
  return false
}

export const isTxid = (v) => typeof v === 'string' && TXID_RE.test(v)

/** Validated raw-tx hex within the contract's 100 kB cap. */
export const isRawTxHex = (v) =>
  typeof v === 'string' && v.length >= 2 && v.length <= MAX_RAWTX_HEX_CHARS && RAWTX_HEX_RE.test(v)

const intOr = (v, fallback = 0) => (Number.isInteger(v) ? v : Number.isInteger(Number(v)) ? Number(v) : fallback)

/** Confirmations from the tip: the tip block itself counts as 1 (standard convention). */
const confirmationsFrom = (tipHeight, blockHeight) =>
  blockHeight == null ? 0 : Math.max(0, tipHeight - blockHeight + 1)

/**
 * Esplora GET /address/:addr + /address/:addr/utxo -> one batch-result entry.
 * confirmedSats = confirmed funded - confirmed spent; pendingSats is the SIGNED mempool net
 * (an unconfirmed spend of a confirmed coin makes it negative). Malformed UTXO records are
 * dropped rather than 500ing the whole batch.
 */
export function normalizeAddressResult(address, info, utxosRaw, tipHeight) {
  const chain = info?.chain_stats ?? {}
  const mempool = info?.mempool_stats ?? {}
  const confirmedSats = intOr(chain.funded_txo_sum) - intOr(chain.spent_txo_sum)
  const pendingSats = intOr(mempool.funded_txo_sum) - intOr(mempool.spent_txo_sum)
  const utxos = (Array.isArray(utxosRaw) ? utxosRaw : [])
    .map((u) => {
      if (!u || !isTxid(u.txid) || !Number.isInteger(u.vout)) return null
      const confirmed = Boolean(u.status?.confirmed)
      const blockHeight = confirmed && Number.isInteger(u.status?.block_height) ? u.status.block_height : null
      return {
        txid: u.txid,
        vout: u.vout,
        valueSats: intOr(u.value),
        confirmations: confirmationsFrom(tipHeight, blockHeight),
        blockHeight,
      }
    })
    .filter(Boolean)
  return { address, confirmedSats, pendingSats, utxos }
}

/**
 * Fee recommendations -> {fast, normal, slow} integer sat/vB, clamped to [1, maxFeeRate].
 * Accepts BOTH upstream dialects (client.getFees() may return either):
 * - mempool.space GET /fees/recommended: {fastestFee, halfHourFee, hourFee, ...}
 * - Esplora GET /fee-estimates: {"1": satPerVb, "3": ..., "6": ..., "144": ...} by conf target
 * Returns null when neither shape yields a usable fast rate (route answers upstream_unavailable
 * — the client must never see an invented fee).
 */
export function normalizeFeeRates(body, maxFeeRate) {
  let fast
  let normal
  let slow
  if (body && Number.isFinite(Number(body.fastestFee))) {
    fast = Number(body.fastestFee)
    normal = Number(body.halfHourFee)
    slow = Number(body.hourFee)
  } else if (body && typeof body === 'object') {
    const estimate = (targets) => {
      for (const t of targets) {
        const v = Number(body[String(t)])
        if (Number.isFinite(v) && v > 0) return v
      }
      return NaN
    }
    fast = estimate([1, 2]) // next block
    normal = estimate([3, 4, 5, 6]) // ~half hour
    slow = estimate([6, 10, 12, 24, 144]) // ~an hour or better
  }
  if (!Number.isFinite(fast) || fast <= 0) return null
  const clamp = (v, fallback) => {
    const n = Number.isFinite(v) && v > 0 ? Math.ceil(v) : fallback
    return Math.min(Math.max(n, 1), maxFeeRate)
  }
  const fastClamped = clamp(fast, 1)
  const normalClamped = clamp(normal, fastClamped)
  return { fast: fastClamped, normal: normalClamped, slow: clamp(slow, normalClamped) }
}

/** Esplora GET /tx/:txid/status -> confirmation DTO (confirmations derived from the tip). */
export function normalizeTxStatus(txid, status, tipHeight) {
  const confirmed = Boolean(status?.confirmed)
  const blockHeight = confirmed && Number.isInteger(status?.block_height) ? status.block_height : null
  return { txid, confirmed, blockHeight, confirmations: confirmationsFrom(tipHeight, blockHeight) }
}

/** "txid:vout" (or explicit fields) -> {txid, vout}, or null. */
function parseOutpoint(raw) {
  const packed = raw.utxo ?? raw.outpoint
  if (typeof packed === 'string' && packed.includes(':')) {
    const [txid, voutStr] = packed.split(':')
    const vout = Number.parseInt(voutStr, 10)
    if (isTxid(txid) && Number.isInteger(vout) && vout >= 0) return { txid, vout }
    return null
  }
  const txid = raw.tx_hash ?? raw.txid
  if (!isTxid(txid)) return null
  const vout = Number.isInteger(raw.vout) ? raw.vout : 0
  return { txid, vout }
}

/**
 * Stamps-indexer balance body for ONE address -> {stamps, dropped} | null.
 *
 * DEFENSIVE by design (research R6): the indexer shape is not under our control, and coin
 * PROTECTION rides on this data — so anything unrecognizable degrades rather than silently
 * un-protecting coins. Returns null when the body has no recognizable stamps list (caller
 * marks the whole result degraded); `dropped` counts entries that were present but could not
 * be mapped to an identity + outpoint (caller also degrades, keeping the parsed subset).
 */
export function normalizeStampsBalance(body, address) {
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.stamps) ? body.stamps : Array.isArray(body) ? body : null
  if (!list) return null
  let dropped = 0
  const stamps = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') {
      dropped += 1
      continue
    }
    const stampId = raw.cpid ?? raw.stamp_id ?? raw.stampId ?? (raw.stamp != null ? String(raw.stamp) : null)
    const outpoint = parseOutpoint(raw)
    if (typeof stampId !== 'string' || stampId === '' || !outpoint) {
      dropped += 1
      continue
    }
    stamps.push({
      stampId,
      address,
      outpoint,
      imageUrl: typeof (raw.stamp_url ?? raw.imageUrl) === 'string' ? (raw.stamp_url ?? raw.imageUrl) : null,
      mimeType: typeof (raw.stamp_mimetype ?? raw.mimeType) === 'string' ? (raw.stamp_mimetype ?? raw.mimeType) : null,
    })
  }
  return { stamps, dropped }
}
