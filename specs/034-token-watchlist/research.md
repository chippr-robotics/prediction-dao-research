# Phase 0 Research: Token Watchlist (My Tokens Assets)

**Feature**: 034-token-watchlist | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)

This document resolves every unknown the spec deferred to planning. Each section is
**Decision → Rationale → Alternatives considered**, grounded in the existing codebase
(file:line) and verified external sources (URLs). The headline finding: this feature is
**100% frontend, no backend, no smart-contract change** — it plugs into infrastructure that
already exists (the spec 032 encrypted-backup registry, the spec 027 membership manager,
the `networks.js` config source-of-truth, and the ethers v6 read path used by the Swap panel).

---

## 1. Backup integration — how a new "tokens" synced domain plugs in

**Decision**: Add a `tokens` entry to the synced-objects registry and persist locally with the
established per-wallet localStorage helper. No backup/restore redesign, **no on-chain change**.

- New pure store: `frontend/src/lib/tokens/tokenWatchlistStore.js` mirroring
  `frontend/src/lib/addressBook/addressBookStore.js`. Exports `loadWatchlist(account)`,
  `saveWatchlist(account, list)`, `createEmptyWatchlist()`, `entryKey(address, chainId)`,
  `addEntry`, `removeEntry`, `mergeWatchlists(current, incoming)`.
- Local persistence via `frontend/src/utils/userStorage.js`
  (`getUserPreference/saveUserPreference(account, 'watchlist', value, true)`), key resolves to
  `fw_user_<lowercase_address>_watchlist` (`utils/userStorage.js:16-40`).
- Register in `frontend/src/lib/backup/syncedObjects.js` as
  `{ key: 'tokens', label: 'Token watchlist', networkScoped: true, load, apply, merge }`
  (the file's own header comment at `syncedObjects.js:3` already names `tokens` as the
  intended next domain).
- Add a `tokens` branch to `assertNetworkTagged` in
  `frontend/src/lib/backup/backupBundle.js:42-52` validating every entry carries a numeric
  `chainId` (same guard addressBook gets today).
- React surface: `frontend/src/hooks/useTokenWatchlist.js` mirroring
  `frontend/src/hooks/useAddressBook.js:26-116` (useState initializer loads from storage,
  render-time address-change reload, synchronous `commit()` on every mutation).

**Rationale**: The backup system is explicitly domain-pluggable: the encrypted bundle is
`{schema:'fairwins-data-backup', version:1, wallet, objects:{<key>:value}}`
(`backupBundle.js:1-65`); encryption (ChaCha20-Poly1305, wallet-signature-derived key,
`backupCrypto.js:1-40`) and the on-chain `BackupPointerRegistry` pointer
(`backupRegistry.js`, canonical chain 137) are domain-agnostic — a new domain inherits
encryption, IPFS storage, and the on-chain pointer for free (FR-013, FR-020). This is exactly
the extension path spec 032 designed for (FR-016 of spec 032).

**Alternatives considered**: A bespoke `WatchlistContext` with its own IPFS lifecycle —
rejected: it would duplicate the unified per-wallet bundle and the encryption/pointer flow,
violating "reuse platform infrastructure" and the no-backend footprint.

### Merge / conflict strategy

**Decision**: `networkScoped: true`, identity key `(lowercased address, chainId)`.
`mergeWatchlists` is an **idempotent union** by that key, keeping the earliest `addedAt`;
it returns `{ value, conflicts: [] }` — **no user-facing conflict resolution** (FR-015).

**Rationale**: A watchlist entry is essentially an identity reference, not editable rich data
like an address-book contact (nickname/notes). Two devices adding the same token converge to
one entry; two devices adding different tokens union cleanly. Address-book-style conflict
prompts (`addressBookStore.js:292-343`) would be friction with no payoff here.

**Alternatives considered**: Surfacing conflicts like addressBook — rejected (no meaningful
per-field conflict exists for a reference set).

---

## 2. Per-network token-list sources (the "Uniswap registries")

**Decision** (verified by fetching the live artifacts):

| Chain | Source | Notes |
|------|--------|-------|
| Polygon **137** | `https://tokens.uniswap.org` (Uniswap Labs Default, v22.x, ~550 tokens) | Filter `tokens` to `chainId === 137`. Logos are mostly `ipfs://…`. |
| ETC **61** + Mordor **63** | `https://raw.githubusercontent.com/etcswap/tokens/main/ethereum-classic/all.json` | One file carries **both** 61 (12 tokens) and 63 (5 tokens). Logos at `raw.githubusercontent.com/etcswap/tokens/.../logo.png`. Entries match our `networks.js` WETC/USC defaults (sanity-checked). |
| Polygon Amoy **80002** | **Custom-add only** + tiny in-repo seed | No maintained upstream testnet list exists. Seed with addresses already in `networks.js` (Amoy USDC `0x41E94…7582`, WMATIC). UI states honestly that no curated catalog exists here. |
| Hardhat **1337** | Feature hidden | No list, no DEX, and membership manager not deployed — matches how Swap is gated off there. |

URLs are added to `networks.js` per chain as `tokenListUrl` (env-overridable
`VITE_TOKENLIST_URL_POLYGON` / `_ETC` / `_MORDOR`), following the existing stablecoin/DEX
override precedent (`networks.js:55-60`, `:194-198`), with a `getTokenListUrl(chainId)` helper
mirroring `getSubgraphUrl` (`networks.js:330-341`). `null` → custom-only mode.

**Rationale**: These are the real, maintained "token registries from the uniswap exchanges"
for the chains we support; chainId is per-token in the standard, so one list filters per
network (verified against both artifacts). Amoy honestly has none — consistent with spec 033's
honest-disabled-state philosophy.

**Alternatives considered**: An aggregated multi-source list (CoinGecko, Trust Wallet) —
rejected for v1: larger trust/CSP surface, slower, and unnecessary when the canonical
per-DEX lists already cover the mainnets. The dead `token-list-public.json` URL surfaced by
web search is a 404 — **not used**.

### Token-list schema, fetch, validate, cache

**Decision**: Model the standard subset; fetch from **pinned hosts only**; **hand-roll strict
sanitization** (no new validation dependency); cache in localStorage with version+timestamp +
TTL; degrade to last-good cache, then to the in-repo seed.

- Consume only: `name, version{major,minor,patch}, timestamp, tokens[]` and per-token
  `chainId, address, name, symbol, decimals, logoURI`.
- **Sanitize each token** (reject silently if it fails): `chainId` in the supported set
  `{137,80002,61,63}`, `ethers.isAddress(address)`, `Number.isInteger(decimals)` in `0..255`,
  `symbol`/`name` bounded strings, then filter to the active chain and de-dupe by lowercased
  address.
- Cache key = source URL; store validated list + `version` + `timestamp`; **TTL 12h**; on
  fetch failure use last-good cache, then the seed (mirrors the app's subgraph→RPC degrade).

**Rationale**: We touch a tiny field subset and already filter+de-dupe, so a 30-line
allowlist sanitizer is auditable and adds **zero dependencies** — aligning with the
constitution's Simplicity/YAGNI rule. Pinning to known hosts (no user-supplied URLs in v1)
closes the SSRF/supply-chain surface.

**Alternatives considered**: Adding `ajv` + `ajv-formats` + `@uniswap/token-lists` (schema +
TS types) — the textbook approach, **rejected** here: it adds runtime/bundle weight and a TS
types package into a JS codebase to validate ~6 fields we already constrain by hand. Noted as
the fallback if the sanitizer proves insufficient.

---

## 3. Token metadata & balance reads (custom tokens + live balances)

**Decision**: Reuse the existing ethers v6 read path.

- **Custom-token metadata**: reuse `resolveTokenMeta(address, chainId, { fetchOnChain })` from
  `frontend/src/data/reports/tokenMeta.js:50-87` (per-`chainId:address` memo, safe fallback).
  Supply a `fetchOnChain` that builds `new ethers.Contract(address, ERC20_ABI, provider)` and
  reads `symbol()/name()/decimals()` (pattern at `useOpenChallengeCreate.js:51-58`).
- **ERC-20 ABI**: reuse `frontend/src/abis/ERC20.js` (`balanceOf/decimals/symbol/name`).
- **Balances**: mirror `DexContext` (`contexts/DexContext.jsx:110-156`) — `balanceOf(wallet)`
  formatted via `ethers.formatUnits(raw, decimals)`, stored in state, refetched on a 300s
  interval and on account/chain switch (plus a manual refresh). Batch with `Multicall3`
  (`abis/Multicall3.js`) when watching many tokens; serial fallback otherwise.
- **Address validation**: `ethers.isAddress` (`utils/blockchainService.js:260`) before any read
  or add (FR-011).
- **Provider**: read-only provider from `WalletContext` (`contexts/WalletContext.jsx:44-109`).

**Rationale**: The codebase uses **ethers v6 exclusively** for reads (no wagmi
`useReadContract`, no viem) — `DexContext`, `useOpenChallengeCreate`, report builders all use
`new ethers.Contract(...)`. Reusing it keeps one read idiom and inherits the existing
RPC/provider config. `resolveTokenMeta` already does exactly the custom-token resolution we
need, with caching and a safe fallback.

**Alternatives considered**: Introducing wagmi `useReadContract` for declarative reads —
rejected: would split the read idiom and contradicts the established pattern.

---

## 4. Membership gating

**Decision**: Gate at the watched-tokens panel using `useRoleDetails()`
(`frontend/src/hooks/useRoleDetails.js:64-181`): read
`getRoleDetails('WAGER_PARTICIPANT')`, allow when `roleDetail.isActive && roleDetail.tier > 0`
("any paid tier"). Non-members get an honest gated state with a CTA to purchase membership
(`PremiumPurchaseModal`), mirroring `OpenChallengeModal` TakerPanel
(`OpenChallengeModal.jsx:455-465`).

- Tier enum: `NONE=0, BRONZE=1, SILVER=2, GOLD=3, PLATINUM=4` (`useRoleDetails.js:16-42`);
  "any paid tier" = `tier > 0`.
- Membership is read on-chain via the `MembershipManager` UUPS proxy and is **chain-scoped**
  (`getContractAddressForChain('membershipManager', chainId)`); `useRoleDetails` re-fetches on
  account/chain change, so switching networks re-evaluates the gate live (FR-008, FR-023).

**Rationale**: This is the canonical membership read used across the app; reusing it satisfies
"reuse platform infrastructure" and gives correct per-chain behavior for free. The TakerPanel
"any tier works" gate is the exact UX precedent for an any-paid-tier gate.

**Alternatives considered**: A new membership context/guard — rejected (parallel auth system).
Silver+ gating like token *creation* — rejected: the spec/clarify chose "any paid tier" since
watching is read-only.

> Consequence: on chains where `MembershipManager` is not deployed (1337, and any chain still
> pre-membership), the gate naturally shows the honest "membership required / unavailable here"
> state — the watchlist availability tracks membership availability per chain.

---

## 5. Logos & Content-Security-Policy

**Decision**: Render logos **only** for registry tokens whose `logoURI` resolves to an
**allowlisted host**; everything else (custom/unknown, missing, blocked) renders a **bundled
neutral placeholder SVG**. Expand CSP minimally in **both** nginx configs and add a regression
test.

- **connect-src** (to fetch the lists): add `https://tokens.uniswap.org` and
  `https://raw.githubusercontent.com`.
- **img-src** (to render registry logos): add `https://raw.githubusercontent.com` (ETCswap +
  Trust Wallet logos). Uniswap default `ipfs://…` logoURIs are rewritten client-side to
  `https://ipfs.io/ipfs/<cid>` — **`ipfs.io` is already in img-src**, so no extra image host
  beyond `raw.githubusercontent.com`.
- A `tokenLogo.js` helper enforces an **application-level trusted-host allowlist**
  (`raw.githubusercontent.com`, `ipfs.io` via rewrite); any other `logoURI` → placeholder.
  Custom tokens never attempt a remote image.
- Edit `frontend/nginx.conf:41` (img-src) / `:35` (connect-src) **and**
  `frontend/nginx.conf.template:95` / `:93` — both files, or the QR-camera-style divergence
  bug recurs. Add `frontend/src/test/nginxCspImgSrc.test.js` mirroring
  `frontend/src/test/nginxCspConnectSrc.test.js` (iterate both configs), and extend the
  connect-src test for the two new hosts.

**Rationale**: This matches how the app already allowlists *specific* hosts (WalletConnect,
IPFS gateways, OpenStreetMap) rather than wildcarding. CSP is browser-level defense-in-depth;
the `tokenLogo.js` allowlist is the application-level guard — together they satisfy FR-024
("no arbitrary remote images; within CSP") while still showing recognizable logos for trusted
registry tokens (FR-024) and a plain placeholder that doubles as the "unverified" cue for
custom tokens (FR-025).

**Alternatives considered**:
- **Same-origin nginx logo proxy** — rejected: adds edge logic and an SSRF surface (the proxy
  fetches arbitrary upstreams), more complex than two allowlist entries.
- **Bundle/pin all logos to IPFS at deploy** — rejected: stale-logo maintenance burden and a
  build-time pinning step for a cosmetic feature.

---

## 6. UI placement & relabel (decision from clarify)

**Decision**: In `frontend/src/components/tokens/TokensPanel.jsx:14-18`, relabel the existing
`{ id: 'mine', label: 'My Tokens' }` tab to **"Issued"** (keep `id: 'mine'` internally to avoid
churn) and add a new **first** tab `{ id: 'watched', label: 'My Tokens' }` rendering the new
`WatchedTokensPanel`. Issued/Explorer/Create remain, preserving all factory capabilities
(FR-022). Mount point is unchanged: `WalletPage.jsx:463-467` ("Tokens" section of the Account
Center).

**Rationale**: Smallest change that honors the clarified naming (My Tokens = assets; issuer
view relabeled), reuses the established tab/ARIA conventions (`role="tablist|tab|status|alert"`,
`TokensPanel.jsx:142-145`) and the `.tm-*` plain-CSS system in `tokens.css`.

**Alternatives considered**: A separate top-level Account-Center tab for the watchlist —
rejected: the clarify decision puts assets under "My Tokens" inside the existing Tokens area.

### Default ordering (resolves a deferred spec item)
- **Registry browse** (AddTokenDialog): alphabetical by symbol; client-side substring search
  over symbol/name/address.
- **My Tokens list**: entries with a non-zero balance first, then by `addedAt` descending.

---

## 7. Resolved spec deferrals — summary

| Deferred item (from spec/checklist) | Resolution |
|---|---|
| Token-list source URLs per network | §2 — 137 Uniswap, 61/63 ETCswap, 80002 seed/custom, 1337 hidden |
| Refresh / cache strategy | §2 — localStorage, version+timestamp, 12h TTL, last-good → seed fallback |
| Trusted-logo host allowlist | §5 — `raw.githubusercontent.com` + `ipfs.io` (ipfs:// rewrite) |
| List sorting / ordering | §6 — browse alphabetical; My Tokens balance-first then newest |
| Balance-read latency | §3 — Multicall3 batch, 300s refetch, honest "—" on failure |
| Conflict resolution on restore | §1 — idempotent union, no prompt |
| New dependencies? | §2 — none (hand-rolled sanitizer; ajv/token-lists rejected) |

---

## 8. Open items intentionally left to implementation (non-blocking)

- ETCswap list URL uses `/main`; the repo is low-activity so drift risk is low. A commit-pinned
  raw URL is an optional hardening (env-overridable either way).
- Whether to seed Amoy with more than {USDC, WMATIC} — start minimal; expand only if needed.
- Multicall3 address presence per chain — fall back to serial reads when absent.
