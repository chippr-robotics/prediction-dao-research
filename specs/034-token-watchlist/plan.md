# Implementation Plan: Token Watchlist (My Tokens Assets)

**Branch**: `034-token-watchlist` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/034-token-watchlist/spec.md`

## Summary

Turn the account's **"My Tokens"** view into a user-curated **watchlist of assets**: members add
tokens from per-network **Uniswap/ETCswap token registries** or by **custom contract address**,
and see them with **live balances**, scoped to the active network. The list is stored
**client-side** and rides the existing **encrypted backup** bundle (network-tagged), so nothing
is auto-discovered and the system stays unburdened. The existing issuer/admin view (today's
"My Tokens" tab) is **relabeled "Issued"** and preserved.

**Technical approach** (frontend-only, no backend, no smart-contract change — see
[research.md](./research.md)):
- **New `tokens` synced domain** in the spec-032 backup registry (`syncedObjects.js` +
  `assertNetworkTagged`), persisted locally via the per-wallet `userStorage` helper. A pure
  `tokenWatchlistStore.js` + a `useTokenWatchlist` hook mirror the address-book precedent.
  Identity is `(lowercased address, chainId)`; merge is an idempotent union.
- **Per-network catalog config** added to `networks.js` (`tokenList: {sourceType, url, seed}`,
  env-overridable): Polygon → `tokens.uniswap.org`, ETC/Mordor → the ETCswap `all.json`, Amoy →
  custom-add + tiny in-repo seed, Hardhat → hidden. A `useTokenRegistry` hook fetches, **strictly
  sanitizes (no new dependency)**, caches (12h TTL), and degrades to last-good cache → seed.
- **Reads via existing ethers v6 path**: `resolveTokenMeta` for custom-token metadata, `ERC20_ABI`
  + optional `Multicall3` for live balances, `ethers.isAddress` for validation. Balances are
  display-only, never stored; "—" on failure.
- **Membership gate** via the existing `useRoleDetails('WAGER_PARTICIPANT')` (`isActive && tier>0`,
  chain-scoped) with an honest gated state + purchase CTA.
- **Logos**: registry-only, from an allowlisted host (`raw.githubusercontent.com`, `ipfs.io` via
  `ipfs://` rewrite); custom/unknown → bundled placeholder. Minimal CSP additions to **both**
  nginx files + a regression test.
- **UI**: relabel the issuer tab to "Issued", add a new first **"My Tokens"** tab rendering
  `WatchedTokensPanel` + `AddTokenDialog`, reusing the `.tm-*` CSS and ARIA conventions.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 18, Node 20 toolchain.

**Primary Dependencies**: Vite, wagmi v2 + viem (chain/account state via `useChainId`), **ethers
v6** (all contract reads — the codebase's sole read idiom), Vitest + React Testing Library.
**No new runtime dependency** (token lists are sanitized by a hand-rolled allowlist; `ajv` /
`@uniswap/token-lists` considered and rejected — research §2, [contracts/csp-and-deps.md](./contracts/csp-and-deps.md)).

**Storage**: Client-only. Local `localStorage` per wallet (`fw_user_<addr>_watchlist`) + the
existing encrypted IPFS backup bundle (`objects.tokens`, network-tagged). On-chain pointer
(`BackupPointerRegistry`, canonical chain 137) **unchanged**. No DB, no contract storage.

**Testing**: Vitest unit/component (store/merge, list fetch+sanitize+cache, logo allowlist,
`useTokenWatchlist`, `WatchedTokensPanel`, `AddTokenDialog`) + nginx CSP regression across both
configs; axe/Lighthouse a11y in CI. No Hardhat tests (no contract interface change).

**Target Platform**: Browser SPA (fairwins.app), served by nginx on Cloud Run.

**Project Type**: Web frontend (single `frontend/` app). No backend tier (fixed footprint).

**Performance Goals**: Catalog fetch once per chain per TTL (12h), cached; render filtering is
O(n) over a manually-bounded list. Balances batched via Multicall3 where available; 300s
refetch. No added backend round-trips.

**Constraints**: No-backend footprint; honest-state (real on-chain reads, network-scoped, no
mock token data, "—" not fake 0); WCAG 2.1 AA; config (list URLs) from `networks.js`, never
hardcoded in components; CSP stays bounded and both nginx files stay in sync (CI-gated).

**Scale/Scope**: 4 user-facing chains (137, 80002, 61, 63) + Hardhat hidden. ~8 new frontend
modules (lib/hooks/components) + ~6 edited files (`syncedObjects.js`, `backupBundle.js`,
`networks.js`, `TokensPanel.jsx`, two nginx files) + ~9 test files + `.env.example`. No data
migration; watchlist starts empty.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Security-First Smart Contracts** | **N/A (no `contracts/` change) / PASS** — read-only; no on-chain writes; `BackupPointerRegistry` untouched. The real surface is **untrusted remote data** (token lists + logos). Mitigations: fetch only from **pinned hosts** (no user URLs in v1); strict client-side sanitization (chainId∈supported set, `ethers.isAddress`, decimals 0–255, field-length caps, de-dupe); logo `<img>` only from an allowlisted host + bounded CSP (defense-in-depth); custom tokens flagged **unverified** + placeholder; `ethers.isAddress` before any read. |
| **II. Test-First & Coverage** | **PASS** — Vitest specs authored with each unit: store/merge idempotence & dedupe, list sanitize/cache/degrade, logo allowlist + ipfs rewrite, `useTokenWatchlist` (filter/persist), `WatchedTokensPanel` (empty/add-registry/add-custom/dupe/balance-fail/network-filter/gated), `AddTokenDialog`, and nginx CSP regression (both configs). No contract interface change ⇒ no Hardhat. Honors the frontend-test gotchas memo (mock `getContractAddress`, hook deps, `vi.mock` factories). |
| **III. Honest State, No Mocks** | **PASS (central)** — entries carry `chainId` and the view is filtered to the active chain (FR-008); membership is per-chain; custom-token metadata is resolved **live** on-chain (no placeholder metadata); balances are **live**, shown "—" never fake `0`; Amoy honestly has **no curated catalog**; registry-down → honest notice + cached/seed fallback; the seed list contains only **real** addresses already trusted in `networks.js` (not mock data). |
| **IV. Fail Loudly in CI** | **PASS** — no `continue-on-error`; the CSP regression test fails loudly on nginx.conf/template divergence (the documented QR-camera failure mode); `parseBundle` throws on an untagged entry. |
| **V. Accessible, Consistent Frontend** | **PASS** — reuse `role="tablist/tab/status/alert"` and `.tm-*` patterns; logos carry alt text / are decorative with text labels alongside; the unverified badge is text, not color-only; list URLs live in `networks.js` (env-overridable), never hardcoded in components; ESLint clean. |
| **Additional — Tech stack / No-backend / Reuse** | **PASS** — **no new core technology** (explicit no-op on deps; ethers v6 reused); no backend (client + localStorage + existing IPFS backup; CSP at the edge); reuses spec-032 backup, spec-027 membership, `networks.js`, and the ethers read path rather than parallel systems. |

**Result**: PASS — no violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/034-token-watchlist/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — sources, schema, CSP, deps decisions
├── data-model.md        # Phase 1 — entities (WatchlistEntry, TokenListSource, TokenInfo, ...)
├── quickstart.md        # Phase 1 — runnable validation guide (S1–S6)
├── contracts/           # Phase 1 — frontend module/integration interface contracts
│   ├── watchlist-store-and-hook.md
│   ├── token-registry-and-logo.md
│   ├── networks-token-config.md
│   ├── backup-tokens-domain.md
│   └── csp-and-deps.md
├── checklists/
│   └── requirements.md  # from /speckit-specify (+ /speckit-clarify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── config/
│   │   └── networks.js                       # ADD tokenList{sourceType,url,seed} per chain;
│   │                                         #   ADD getTokenListSource(chainId) helper
│   ├── lib/
│   │   ├── backup/
│   │   │   ├── syncedObjects.js              # ADD {key:'tokens', networkScoped:true, load/apply/merge}
│   │   │   └── backupBundle.js               # ADD assertNetworkTagged 'tokens' branch
│   │   └── tokens/                           # NEW module
│   │       ├── constants.js                  # STORAGE_KEY='watchlist', SCHEMA_VERSION, TTLs
│   │       ├── tokenWatchlistStore.js        # NEW pure CRUD + mergeWatchlists
│   │       ├── tokenList.js                  # NEW fetch + sanitize + cache (no new dep)
│   │       └── tokenLogo.js                  # NEW trusted-host allowlist + ipfs:// rewrite
│   ├── hooks/
│   │   ├── useTokenWatchlist.js              # NEW (mirrors useAddressBook)
│   │   ├── useTokenRegistry.js               # NEW (catalog fetch/cache/search per chain)
│   │   └── useTokenBalances.js               # NEW (ERC20 balanceOf via ethers/Multicall3)
│   ├── components/tokens/
│   │   ├── TokensPanel.jsx                   # EDIT tabs: relabel 'mine'→"Issued"; ADD "My Tokens"(watched) first
│   │   ├── WatchedTokensPanel.jsx            # NEW (gate + list + balances + remove)
│   │   ├── AddTokenDialog.jsx                # NEW (browse registry | add custom)
│   │   ├── WatchedTokenRow.jsx               # NEW (logo/placeholder, unverified badge, balance "—")
│   │   ├── tokens.css                        # EDIT add .tm-logo/.tm-unverified-badge/.tm-balance
│   │   └── __tests__/                        # NEW co-located component tests
│   │       ├── WatchedTokensPanel.test.jsx
│   │       └── AddTokenDialog.test.jsx
│   ├── abis/
│   │   ├── ERC20.js                          # REUSE (no change)
│   │   └── Multicall3.js                     # REUSE (no change)
│   ├── data/reports/tokenMeta.js             # REUSE resolveTokenMeta (no change)
│   └── test/
│       ├── tokenWatchlistStore.test.js       # NEW (dedupe/merge/network-tag)
│       ├── tokenList.test.js                 # NEW (sanitize/cache/degrade)
│       ├── tokenLogo.test.js                 # NEW (allowlist/ipfs rewrite/custom→placeholder)
│       ├── useTokenWatchlist.test.jsx        # NEW (filter to active chain, persist)
│       ├── nginxCspImgSrc.test.js            # NEW (img-src raw.githubusercontent.com, both configs)
│       └── nginxCspConnectSrc.test.js        # EXTEND (two new connect-src hosts)
├── nginx.conf                                # EDIT connect-src + img-src (dev/secondary)
├── nginx.conf.template                       # EDIT connect-src + img-src (production) — keep in sync
└── .env.example                              # ADD VITE_TOKENLIST_URL_* block
```

**Structure Decision**: Single existing `frontend/` React app — no new project/module boundary.
The feature is a new self-contained `lib/tokens/` + three hooks + the watched-tokens components,
plugged into four existing seams (the spec-032 backup registry, the spec-027 membership hook,
`networks.js` config, and the ethers read path). New networks opt into a catalog purely by adding
a `tokenList` field — no code change (mirrors the `dexProvider` precedent from spec 033).

## Complexity Tracking

> No constitution violations — no entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _none_    | —          | —                                    |
