# Implementation Plan: Distributed Mini-App Platform (Apps Section Redesign)

**Branch**: `claude/miniapp-platform-redesign-3o6769` (feature id `073-miniapp-platform`) | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/073-miniapp-platform/spec.md`

## Summary

Replace the hardcoded Apps nav group (ClearPath, Token Mint, Wagers) with a curated
mini-app platform: a new fund-free UUPS `MiniAppRegistry` contract (one designated
chain per cohort, `miniAppChainId()` derived like `membershipChainId()`) is the single
source of truth for app records — vendor, metadata, an **approved** package tuple
(IPFS CID + keccak256 manifest hash + version) that is the only tuple ever served, a
**proposed** tuple awaiting curator promotion, and lifecycle status
(Pending/Approved/Suspended/Deprecated) gated by `APP_CURATOR_ROLE`. The host gains a
Catalog panel (`/wallet?tab=apps`) and a workspace route (`/apps/:appId`) whose loader
fetches packages from configured IPFS gateways (with failover), verifies
keccak256(manifest) against the registry and per-file SHA-256 against the manifest
**before** creating a Blob URL and dynamically importing the ESM entry — shared deps
(React, ethers) come from a frozen host module scope, never bundled per app. Mounted
apps receive a restricted host context (active-account `submit`, namespaced
`userStorage`-backed store joined to backup, automatic client-ledger audit entries
under a new `miniapp` class, toasts, navigation). AdminPanel's Compliance group gains
a curator review tab; a developer submission surface creates Pending records. The
service worker adds a content-addressed package cache (cache-first, verification still
on every launch). Token Mint converts first, then ClearPath, then (after refactor
prerequisites) Wagers. Full decisions with rationale: [research.md](./research.md).

## Technical Context

**Language/Version**: Solidity 0.8.x (Hardhat, OZ 5.4 upgradeable) · JavaScript ESM, React 19.2, Vite 7.2

**Primary Dependencies**: `UUPSManaged.sol`, ethers 6.17, wagmi 3.6/viem 2.53, `@noble/hashes` (SHA-256), `@pinata/sdk` (publish script), existing IPFS seam (`constants/ipfs.js`, nginx `/api/pinata` proxy)

**Storage**: On-chain registry state (append-only + `__gap`); client `userStorage` (`miniapp_<appId>_v1`) + `lib/backup/syncedObjects.js` entry; client ledger (`activity_ledger_v1_<chainId>`); SW CacheStorage (`fairwins-miniapp-packages-v1`)

**Testing**: Hardhat unit + `test/upgradeable/` upgrade-lifecycle tests + Slither (automatic) · Vitest (loader/integrity against built fixtures, store, ledger source, CSP gating test, panel tests)

**Target Platform**: Existing multi-tenant PWA (desktop-installable); registry on the cohort reference chain (Polygon mainnet-cohort / Amoy testnet-cohort; dedicated tenants via spec-072 contract sets)

**Project Type**: Web app (contracts + frontend + scripts); no relay-gateway module in v1 (R7)

**Performance Goals**: Catalog interactive < 2 s (direct RPC paged reads, in-memory cache); cached relaunch < 1 s (SW cache-first on immutable CIDs); first launch < 5 s; per-app payloads small via host-scope dependency dedup (R2)

**Constraints**: Integrity verification MUST precede any package code execution (fetch → verify → Blob import; no direct remote imports); CSP `script-src` gains only `blob:` (never `https:`); gateway is untrusted; approved-tuple-only serving; honest degradation when registry/gateway unconfigured or unreachable; no mocks in shipped paths (dev gateway serves real built+hashed packages)

**Scale/Scope**: Curated enterprise catalog (tens of apps, 6 categories); 3 first-party conversions (~1.8k, ~2.8k, ~13.5k LOC trees); 1 new contract; ~6 new frontend modules + 2 panels + 1 admin tab

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.0.0 — PASS (pre-Phase-0 and re-checked post-design).*

- **I. Security-first contracts**: `MiniAppRegistry` is fund-free and standalone (no custody, no oracle path). CEI trivially holds (no external value calls); access control via OZ roles (`APP_CURATOR_ROLE`, vendor-only submission updates, bounded strings/params); Slither runs automatically; Medusa harness deferred with rationale (stateful but fund-free — documented in research R4); security-agent review required before merge. The trust boundary (curation) and its enforcement (on-chain role) are reasoned explicitly in spec §Assumptions and research R4/R12.
- **II. Test-first**: contract unit tests keyed to user stories + upgrade-lifecycle suite + storage-layout gate; frontend Vitest for loader/integrity (tamper cases), store isolation, ledger source, deep-link aliases, CSP config test; conversion parity tests per app.
- **III. Honest state**: only Approved (approved-tuple) packages ever execute; unreachable registry ⇒ launches refused with disclosure, never stale-as-verified; unconfigured gateway ⇒ section degrades honestly; dev path uses real built packages through the same verification (no mock loader); network-scoped reads confined to the cohort reference chain.
- **IV. Fail loudly in CI**: new tests join existing gates; `check:storage-layout` registration; no `continue-on-error`.
- **V. Accessible, consistent frontend**: catalog/workspace/review surfaces reuse `PortalNav`/panel patterns, WCAG 2.1 AA + axe/Lighthouse CI; addresses/ABIs only via `sync:frontend-contracts` artifacts (`miniAppRegistry` key, `abis/miniAppRegistry.js`).
- **Additional constraints**: no new core technology (React/Vite/Hardhat unchanged; no module-federation dependency — R1/R2 use platform primitives); deployment via `deployProxy` + recorded `deployments/` keys; no secrets in manifests or client (Pinata JWT stays nginx-side; `pinataSecretGuard` already enforces).

**Deviations**: none requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/073-miniapp-platform/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R12
├── data-model.md        # Phase 1 — registry state, manifest schema, client records
├── quickstart.md        # Phase 1 — end-to-end validation guide
├── contracts/           # Phase 1 — IMiniAppRegistry surface, manifest + host-context contracts
└── tasks.md             # Phase 2 (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
contracts/
├── apps/MiniAppRegistry.sol            # UUPS registry (R4)
└── interfaces/IMiniAppRegistry.sol     # enum/status, structs, events, errors

test/
├── miniAppRegistry.test.js             # story-keyed unit suite
└── upgradeable/MiniAppRegistry.upgrade.test.js   # + contracts/mocks/MiniAppRegistryUpgradeMock.sol

scripts/
├── deploy/deploy-miniapp-registry.js   # callsign-pattern append deploy; seeds curator role
├── deploy/check-storage-layout.js      # + { name: 'MiniAppRegistry', deploymentsKey: 'miniAppRegistry' }
├── utils/sync-frontend-contracts.js    # + miniAppRegistry mapping + tenant key
└── miniapps/publish.js                 # build → hash → pin → print CID + manifestHash

tools/miniapp-build/                    # shared Vite build preset: externals → host scope (R2)

frontend/
├── miniapps/
│   ├── token-mint/                     # phase 1 conversion (from components/tokens/)
│   ├── clearpath/                      # phase 2 conversion (from components/clearpath/)
│   └── wagers/                         # phase 3 conversion (after refactor prerequisites)
├── src/lib/miniapps/
│   ├── registryClient.js               # paged reads via getReadProvider(miniAppChainId())
│   ├── manifest.js                     # manifest schema parse/validate
│   ├── integrity.js                    # keccak256 + sha256 verification chain (R3)
│   ├── loader.js                       # fetch → verify → Blob import; gateway failover (R1, R7)
│   ├── hostScope.js                    # frozen shared-module scope install (R2)
│   ├── hostContext.jsx                 # per-app context provider (R8)
│   └── store.js                        # namespaced userStorage store + backup entry
├── src/data/ledger/sources/miniAppSource.js   # + LEDGER_CLASS 'miniapp'; registered in index.js
├── src/components/miniapps/
│   ├── CatalogPanel.jsx                # ?tab=apps — search, category filters, cards, submit entry
│   ├── MiniAppWorkspace.jsx            # /apps/:appId — boundary, mount, remount-safe
│   └── SubmitAppPanel.jsx              # developer submission → Pending record
├── src/components/admin/MiniAppReviewTab.jsx  # Compliance group tab (adminNav 3-edit pattern)
├── src/abis/miniAppRegistry.js         # hand-maintained ABI (+ generated .json)
├── src/config/{networks,contracts,appNav}.js  # miniAppChainId(); keys; Apps group → 'apps' item
└── public/sw.js                        # + fairwins-miniapp-packages-v1 cache (R10)

tenants/features.json                   # + 'miniapps' feature id
```

**Structure Decision**: contracts/frontend/scripts split follows every prior spec.
Mini-app sources live under `frontend/miniapps/` (outside `src/`) to make the
no-privileged-imports rule (FR-030) structural — the build preset is their only path
into the app, and `src/` code cannot deep-import them either.

## Phased Delivery (maps to spec user stories)

1. **Registry + deploy plumbing** (US3/US4 substrate): contract, tests, deploy script, storage-layout + sync registration.
2. **Loader + runtime** (US1): host scope, integrity chain, loader, host context, store, ledger source, CSP `blob:` + gating test.
3. **Catalog + workspace surfaces** (US1): nav/tab/route, deep-link aliases, honest-degradation states.
4. **Review + submission surfaces** (US3/US4): admin tab + curator role wiring, SubmitAppPanel.
5. **PWA package cache** (US6): SW cache + eviction, relaunch fast-path.
6. **Conversions** (US2): Token Mint → ClearPath (store migration) → Wagers (refactor prerequisites first; `/wagers` stays host-native until its phase completes — catalog stays honest, R11).

## Complexity Tracking

No constitution violations to justify. Two watched risks, mitigations chosen for
simplicity: CSP change is confined to adding `blob:` to `script-src` (gated by config
test, R1); Wagers conversion risk is isolated by making it the final phase behind
explicit refactor tasks rather than stretching the runtime contract to fit it (R11).
