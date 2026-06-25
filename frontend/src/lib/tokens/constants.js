/**
 * Token watchlist constants (Spec 034).
 *
 * Client-side, per-wallet token watchlist ("My Tokens" assets). These constants
 * are shared by the pure store, the registry/list fetcher, the logo policy, and
 * the UI. Mirrors lib/addressBook/constants.js.
 */

// Per-wallet localStorage key suffix used with utils/userStorage.js
// (resolves to `fw_user_<address>_watchlist`).
export const STORAGE_KEY = 'watchlist'

// On-disk schema version for forward migration of the persisted watchlist.
export const SCHEMA_VERSION = 1

// How long a fetched token list stays fresh in the client cache before re-fetch.
export const LIST_TTL_MS = 12 * 60 * 60 * 1000 // 12h — token lists are slow-moving

// Networks the watchlist supports. A fetched list row whose chainId is not in
// this set is dropped during sanitization (defense against hostile lists).
export const SUPPORTED_CHAIN_IDS = [137, 80002, 61, 63]

// The ONLY hosts a registry logo <img> may load from (FR-024). Enforced at the
// application layer by tokenLogo.js#resolveLogoSrc and, defense-in-depth, by the
// nginx CSP img-src directive. ipfs.io covers Uniswap ipfs:// logos (rewritten).
export const TRUSTED_LOGO_HOSTS = ['raw.githubusercontent.com', 'ipfs.io']

// Field caps applied when sanitizing list entries / custom tokens.
export const MAX_SYMBOL_LENGTH = 20
export const MAX_NAME_LENGTH = 60

// localStorage key prefix for the cached, validated token lists (global, not
// per-wallet — the catalog is the same for every user on a chain).
export const LIST_CACHE_PREFIX = 'fw_tokenlist_'
