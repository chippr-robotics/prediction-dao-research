# Contract: Token Registry (catalog) & Logo Policy

**Type**: Frontend module interfaces (JavaScript).

---

## `frontend/src/lib/tokens/tokenList.js` (pure + fetch)

```text
sanitizeTokenList(raw: unknown, supportedChainIds: number[]): TokenInfo[]
  // accepts a parsed token-list document; returns only well-formed TokenInfo rows:
  //   chainId ∈ supportedChainIds, ethers.isAddress(address),
  //   Number.isInteger(decimals) ∈ [0,255], symbol ≤20, name ≤60
  // de-dupes by lowercased address; drops everything else SILENTLY (no throw)

fetchTokenList(url: string, { now, fetchImpl }): Promise<{ tokens: TokenInfo[], version, timestamp }>
  // GET url → JSON → sanitizeTokenList; throws on network/parse failure (caller degrades)

getCachedList(url): { tokens, version, timestamp, fetchedAt } | null   // localStorage
putCachedList(url, payload): void
LIST_TTL_MS = 12 * 60 * 60 * 1000
```

## `frontend/src/hooks/useTokenRegistry.js` (React)

```text
useTokenRegistry(chainId): {
  catalog: TokenInfo[],          // tokens for chainId only (from remote+seed, sanitized)
  status: 'idle'|'loading'|'ready'|'unavailable',  // 'unavailable' = remote failed AND no cache (FR-016)
  isCustomOnly: boolean,         // TokenListSource.sourceType === 'custom-only' (FR-017)
  search(query): TokenInfo[],    // substring over symbol/name/address; alpha by symbol
  refresh(): void,
}
```

**Degradation order (FR-016)**: fresh fetch (if TTL expired) → last-good cache → in-repo
`seed`. `status:'unavailable'` only when remote is configured, fails, AND no cache exists; the
UI then shows an honest "catalog unavailable — you can still add a custom token" notice while
custom-add stays enabled. For `custom-only` chains (Amoy/Hardhat), `catalog` = `seed`, and the
UI states no curated list exists (no error).

---

## `frontend/src/lib/tokens/tokenLogo.js` (pure)

```text
TRUSTED_LOGO_HOSTS = ['raw.githubusercontent.com', 'ipfs.io']

resolveLogoSrc(token: { source, logoURI? }): string | null
  // returns null  → caller renders the bundled placeholder (no <img>)
  // source==='custom'                → null  (FR-024/025)
  // logoURI startsWith 'ipfs://'     → rewrite to https://ipfs.io/ipfs/<cid>, then host-check
  // URL host ∈ TRUSTED_LOGO_HOSTS    → return https URL
  // otherwise                        → null
```

**Guarantee**: `resolveLogoSrc` NEVER returns a URL outside `TRUSTED_LOGO_HOSTS`. This is the
application-level guard; nginx CSP `img-src` is the defense-in-depth layer (see
[csp-and-deps.md](./csp-and-deps.md)). An `<img>` `onError` falls back to the placeholder.

---

## `frontend/src/components/tokens/AddTokenDialog.jsx` (UI contract)

Two modes, reusing `.tm-*` styles and existing ARIA conventions:
- **Browse**: search `useTokenRegistry(chainId).catalog`; clicking a row calls
  `addToken({ ...tokenInfo, source: 'registry' })`. Already-watched rows show "Added".
- **Custom**: address input → `ethers.isAddress` gate → `resolveTokenMeta(addr, chainId, {fetchOnChain})`;
  on success `addToken({ address, chainId, source:'custom', symbol, name, decimals })` and show
  the inline **"unverified — not in the token registry"** badge (FR-025); on failure show an
  honest error and add nothing (FR-011). No blocking confirmation step (FR-025).
