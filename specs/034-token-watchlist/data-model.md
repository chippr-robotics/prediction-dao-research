# Phase 1 Data Model: Token Watchlist (My Tokens Assets)

**Feature**: 034-token-watchlist | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md) · [research.md](./research.md)

All entities are **client-side** (localStorage + the encrypted IPFS backup bundle) or
**transient** (fetched/derived at render). There is **no database and no smart-contract storage**
introduced by this feature. Types are described as JS object shapes (the repo is JavaScript).

---

## Entity 1 — `WatchlistEntry` (persisted)

One user decision to track one token on one network. This is the only thing persisted per token.

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `address` | string | yes | Token contract address, **stored lowercased**. |
| `chainId` | number | yes | The network this entry belongs to. Network-tag (FR-007, FR-014). |
| `source` | `'registry' \| 'custom'` | yes | How it was added; `custom` ⇒ "unverified" treatment (FR-025). |
| `symbol` | string | yes | Cached snapshot. Authoritative for `custom`; fallback for `registry` when the live list is unavailable (FR-016). |
| `name` | string | no | Cached snapshot (same authority rule as `symbol`). |
| `decimals` | number | yes | Cached snapshot; `0..255`. Authoritative for `custom`. |
| `addedAt` | number | yes | epoch ms; drives ordering and merge tie-break. |

- **Identity / uniqueness**: `(address_lowercased, chainId)`. Adding the same pair twice is a
  no-op (FR-010). The same address on two chains = two distinct entries (FR-007).
- **Not persisted**: logo (resolved at render from the trusted list only, FR-024) and balance
  (read live, never stored, FR-005).
- **Validation on add**: `ethers.isAddress(address)` must pass; for `custom`, on-chain
  metadata must resolve or the add is rejected (FR-011).

### Container — `Watchlist` (per wallet, the synced object)

```text
{
  schemaVersion: 1,
  entries: WatchlistEntry[],   // ALL networks; filtered to active chain at render
  updatedAt: number            // epoch ms
}
```

- Persisted locally at `fw_user_<lowercase_wallet>_watchlist` (via `utils/userStorage.js`).
- Carried in the encrypted backup bundle under `objects.tokens` (see Entity 5).
- **State transitions**: `add(entry)` (union by identity) → `remove(address, chainId)` →
  `merge(incoming)` (idempotent union, earliest `addedAt` wins, FR-015).

---

## Entity 2 — `TokenListSource` (config, per network)

Declares where a network's catalog comes from. Lives in `frontend/src/config/networks.js`
alongside `stablecoin`/`dexProvider`, env-overridable.

| Field | Type | Notes |
|------|------|-------|
| `sourceType` | `'remote' \| 'custom-only'` | `custom-only` ⇒ no catalog browse; custom-add still works (FR-017). |
| `url` | string \| null | The token-list URL for `remote`. |
| `seed` | `TokenInfo[]` | Tiny in-repo fallback (also the Amoy catalog). |

Resolved per chain (see [contracts/networks-token-config.md](./contracts/networks-token-config.md)):

| chainId | sourceType | url | seed |
|--------:|-----------|-----|------|
| 137 | remote | `https://tokens.uniswap.org` (env `VITE_TOKENLIST_URL_POLYGON`) | USDC |
| 61 | remote | ETCswap `…/ethereum-classic/all.json` (env `VITE_TOKENLIST_URL_ETC`) | WETC, USC |
| 63 | remote | same ETCswap list (env `VITE_TOKENLIST_URL_MORDOR`) | WETC, USC |
| 80002 | custom-only | `null` | USDC, WMATIC |
| 1337 | custom-only | `null` | — (feature hidden; no membership) |

---

## Entity 3 — `TokenInfo` (transient, from the fetched list / seed)

The catalog row, modeled on the tokenlists.org standard (subset we consume).

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `chainId` | number | yes | Must be in `{137,80002,61,63}` or the row is dropped. |
| `address` | string | yes | Must pass `ethers.isAddress`. |
| `symbol` | string | yes | ≤ 20 chars. |
| `name` | string | no | ≤ 60 chars. |
| `decimals` | number | yes | integer `0..255`. |
| `logoURI` | string | no | Rendered **only** if host is allowlisted (Entity 6); else placeholder. |

- **Provenance**: validated/sanitized output of a fetched `TokenList` (Entity 4) **or** the
  `seed` array. Never persisted; held in `useTokenRegistry` cache.

---

## Entity 4 — `TokenList` (transient, the fetched document)

Top-level shape we read before sanitizing into `TokenInfo[]`:

```text
{
  name: string,
  timestamp: string,                       // ISO date-time
  version: { major: number, minor: number, patch: number },
  logoURI?: string,
  tokens: TokenInfo[]                       // 1..10000 (standard cap)
}
```

- **Cached** in localStorage keyed by source URL with `version` + `timestamp` + a 12h TTL.
- **Sanitization pipeline** (research §2): schema-subset check → filter to supported chainIds →
  filter to active chainId → de-dupe by lowercased address → drop rows failing field validation.

---

## Entity 5 — `tokens` synced-object registration (backup integration)

The registry entry appended to `frontend/src/lib/backup/syncedObjects.js`:

```text
{
  key: 'tokens',
  label: 'Token watchlist',
  networkScoped: true,                       // every entry carries chainId
  load(account)            -> Watchlist,
  apply(account, value, mode) -> { conflicts: [] },   // 'merge' (default) | 'replace'
  merge(current, incoming) -> { value: Watchlist, conflicts: [] }
}
```

- `assertNetworkTagged('tokens', value)` in `backupBundle.js` asserts every
  `value.entries[i].chainId` is a number (parity with the addressBook guard).
- No bundle `version` bump and **no `BackupPointerRegistry` change** — the bundle is
  domain-agnostic (research §1).

---

## Entity 6 — `LogoPolicy` (derived, render-time)

Not stored; encoded in `frontend/src/lib/tokens/tokenLogo.js`.

| Rule | Behavior |
|------|----------|
| `source === 'custom'` | Always neutral placeholder; no remote image (FR-024, FR-025). |
| `logoURI` host ∈ allowlist (`raw.githubusercontent.com`, `ipfs.io`) | Render `<img>`. |
| `logoURI` is `ipfs://<cid>` | Rewrite to `https://ipfs.io/ipfs/<cid>`, then apply allowlist. |
| any other host / missing / load error | Neutral placeholder. |

---

## Entity 7 — `TokenBalance` (transient, display-only)

| Field | Type | Notes |
|------|------|-------|
| `raw` | bigint | `ERC20.balanceOf(wallet)`. |
| `formatted` | string | `ethers.formatUnits(raw, decimals)`. |
| `status` | `'ok' \| 'loading' \| 'unavailable'` | `unavailable` on read failure / no wallet — shown as "—", never a fake `0` (FR-005). |

- Keyed by `(chainId, address)`; refreshed on 300s interval, account/chain switch, and manual
  refresh. Never persisted (FR-005). Batched via Multicall3 when available.

---

## Relationships

```text
Network (networks.js)
  └─ 1 TokenListSource ──fetch+sanitize──▶ TokenList ──▶ TokenInfo[]  (catalog, transient)
                                                              │ user picks / pastes address
                                                              ▼
Wallet ── 1 Watchlist ── * WatchlistEntry {address, chainId, source, snapshot, addedAt}
                                  │  (persist: localStorage + encrypted backup objects.tokens)
                                  │  filter by active chainId at render
                                  ├─▶ LogoPolicy  ──▶ <img> | placeholder
                                  └─▶ TokenBalance (live ERC20.balanceOf, display-only)

Gate: useRoleDetails('WAGER_PARTICIPANT').isActive && tier > 0   (per active chain)
```

## Invariants

1. Every persisted `WatchlistEntry` has a numeric `chainId` (enforced by `assertNetworkTagged`).
2. The displayed set = `entries.filter(e => e.chainId === activeChainId)` — **filtering is at
   render, not storage**, so a network switch instantly re-scopes the view (FR-008).
3. A logo `<img>` is emitted **only** for `source === 'registry'` with an allowlisted host.
4. Balance is never persisted and never displayed as `0` when unread.
5. Identity is `(lowercased address, chainId)` everywhere (dedupe, merge, balance/metadata keys).
