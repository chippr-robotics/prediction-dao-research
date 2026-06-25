/**
 * Token list fetch / sanitize / cache (Spec 034).
 *
 * Token registries ("the uniswap exchanges") follow the tokenlists.org standard.
 * We fetch ONLY from pinned, known URLs (no user-supplied URLs in v1), strictly
 * sanitize the result against an allowlist of fields/values (no new validation
 * dependency — research §2), cache the validated list client-side with a TTL,
 * and degrade to last-good cache → in-repo seed on failure (FR-016).
 */

import { isAddress } from 'ethers'
import {
  SUPPORTED_CHAIN_IDS,
  LIST_TTL_MS,
  MAX_SYMBOL_LENGTH,
  MAX_NAME_LENGTH,
  LIST_CACHE_PREFIX,
} from './constants'

/**
 * Validate + reduce a raw token-list document to well-formed TokenInfo rows.
 * Drops anything that fails (hostile/malformed lists never reach the UI).
 * @param {unknown} raw parsed token-list JSON
 * @param {number[]} [supportedChainIds]
 * @returns {Array<{chainId:number,address:string,symbol:string,name:string,decimals:number,logoURI?:string}>}
 */
export function sanitizeTokenList(raw, supportedChainIds = SUPPORTED_CHAIN_IDS) {
  const tokens = Array.isArray(raw?.tokens) ? raw.tokens : []
  const seen = new Set()
  const out = []
  for (const t of tokens) {
    const chainId = Number(t?.chainId)
    if (!supportedChainIds.includes(chainId)) continue
    const address = String(t?.address ?? '')
    if (!isAddress(address)) continue
    const decimals = Number(t?.decimals)
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) continue
    const symbol = String(t?.symbol ?? '').slice(0, MAX_SYMBOL_LENGTH)
    if (!symbol) continue
    const key = `${chainId}:${address.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      chainId,
      address: address.toLowerCase(),
      symbol,
      name: String(t?.name ?? '').slice(0, MAX_NAME_LENGTH),
      decimals,
      logoURI: typeof t?.logoURI === 'string' ? t.logoURI : undefined,
    })
  }
  return out
}

/**
 * Fetch + sanitize a token list from a pinned URL. Throws on network/parse
 * failure so the caller can degrade to cache/seed.
 * @returns {Promise<{tokens: TokenInfo[], version: any, timestamp: any}>}
 */
export async function fetchTokenList(url, { fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null)
  if (!doFetch) throw new Error('no fetch implementation available')
  const res = await doFetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`token list fetch failed: ${res.status}`)
  const json = await res.json()
  return {
    tokens: sanitizeTokenList(json),
    version: json?.version ?? null,
    timestamp: json?.timestamp ?? null,
  }
}

function cacheKeyFor(url) {
  return `${LIST_CACHE_PREFIX}${url}`
}

/** Read a cached, validated list payload (or null). */
export function getCachedList(url) {
  try {
    const raw = localStorage.getItem(cacheKeyFor(url))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Persist a validated list payload with a fetch timestamp. */
export function putCachedList(url, payload, { now = Date.now() } = {}) {
  try {
    localStorage.setItem(cacheKeyFor(url), JSON.stringify({ ...payload, fetchedAt: now }))
  } catch {
    /* ignore quota / unavailable storage */
  }
}

/** Whether a cached payload is within the freshness TTL. */
export function isFresh(cached, { now = Date.now(), ttl = LIST_TTL_MS } = {}) {
  return Boolean(cached?.fetchedAt) && now - cached.fetchedAt < ttl
}

/** Filter sanitized tokens to a single chain. */
export function filterByChain(tokens, chainId) {
  return (tokens || []).filter((t) => Number(t.chainId) === Number(chainId))
}
