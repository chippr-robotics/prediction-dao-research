# Tasks: Distributed Mini-App Platform (Apps Section Redesign)

**Input**: Design documents from `specs/073-miniapp-platform/` (plan.md, research.md R1–R12, data-model.md, contracts/, quickstart.md)

**Tests**: Included — the constitution makes test-first NON-NEGOTIABLE (Principle II).

**Organization**: Grouped by user story from spec.md. US1/US2 are P1; US3/US4 are P2; US5/US6 are P3. The namespaced store ships inside the US1 runtime (US2's ClearPath migration and US5's hardening depend on it); US5 hardens isolation/backup/audit rather than introducing the store.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (config plumbing)

- [x] T001 [P] Register feature id `miniapps` in `tenants/features.json` and enable it in `tenants/fairwins/manifest.json`; run `npm run tenants:validate`
- [x] T002 [P] Add `miniAppChainId()` to `frontend/src/config/networks.js`, derived from the existing `MAINNET_CHAIN_ID`/`TESTNET_CHAIN_ID` pair (spec-071 `membershipChainId()` pattern — never a second literal), with doc comment; unit-cover in `frontend/src/test/networks.miniapps.test.js`
- [x] T003 [P] Seed `miniAppRegistry: ''` (+ spec-073 comment) across the per-chain contract objects in `frontend/src/config/contracts.js` and add a `DEPLOYMENT_BLOCKS_BY_CHAIN` placeholder entry

---

## Phase 2: Foundational (registry contract + build tooling — blocks all stories)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create `contracts/interfaces/IMiniAppRegistry.sol` — `Status`/`Category` enums, `PackageRef`/`AppView` structs, all events and errors per `specs/073-miniapp-platform/contracts/IMiniAppRegistry.md`
- [x] T005 Implement `contracts/apps/MiniAppRegistry.sol` (`is IMiniAppRegistry, UUPSManaged`): approved/proposed tuple model (invariants I1–I5 in data-model.md), `APP_CURATOR_ROLE`, vendor-only submit/update, bounded strings, duplicate-name guard, optional membership gate + `ISanctionsGuard` (`address(0)` ⇒ disabled), paged views, append-only storage + trailing `__gap`, EthTrust-SL2 NatSpec
- [x] T006 Write `test/miniAppRegistry.test.js` — story-keyed describes: submission (US3), lifecycle promotion/suspension/deprecation (US4), approved-tuple-serving invariant under pending updates (US1/FR-003), role reverts, duplicate/bounds/gating reverts
- [x] T007 [P] Write `test/upgradeable/MiniAppRegistry.upgrade.test.js` + `contracts/mocks/MiniAppRegistryUpgradeMock.sol` — the standard four cases (state preserved, non-UPGRADER revert, re-initialize revert, bare impl locked)
- [x] T008 [P] Register `{ name: "MiniAppRegistry", deploymentsKey: "miniAppRegistry" }` in `scripts/deploy/check-storage-layout.js` `UPGRADEABLE_CONTRACTS`
- [x] T009 Create `scripts/deploy/deploy-miniapp-registry.js` (model: `deploy-callsign-registry.js`): prerequisite reads (membershipManager required, sanctionsGuard optional), abort-if-exists, `deployProxy`, grant `APP_CURATOR_ROLE` (deployer for seeding; document multisig transfer), append `miniAppRegistry`/`miniAppRegistryImpl`/deploy block via `saveDeployment`
- [x] T010 Add `miniAppRegistry` to `scripts/utils/sync-frontend-contracts.js` (shared-estate mapping + tenant `keys` array) and create hand-maintained `frontend/src/abis/miniAppRegistry.js` (ABI + generated `.json` via `emitAbiJson`)
- [x] T011 Create `tools/miniapp-build/` — shared Vite build preset for mini-app packages: single ESM entry output, externalize `react`/`react-dom`/`react/jsx-runtime`/`ethers`/`@fairwins/miniapp-sdk` to reads from `globalThis[Symbol.for('fairwins.miniapp.host')]` (R2), emit `manifest.json` (schema `fairwins-miniapp-manifest/1`, per-file sha256, `hostApi: 1`) per data-model.md §2
- [x] T012 Create `scripts/miniapps/publish.js` — build via the preset, compute per-file sha256 + `keccak256(manifest bytes)`, pin to IPFS via the existing Pinata seam or `--dev` local staging dir, print `{appId, cid, manifestHash}` for on-chain submission (R7)
- [x] T013 Create `frontend/src/lib/miniapps/hostScope.js` — install the frozen shared-module scope at bootstrap (wired in `frontend/src/main.jsx`); export scope symbol + `hostApiVersion`
- [x] T014 [P] Build a minimal fixture package via the preset for Vitest (`frontend/src/test/miniapps/fixtures/` — valid package + tampered-entry + tampered-manifest variants, committed as built artifacts with a regen script)

**Checkpoint**: contract suite green (`npx hardhat test test/miniAppRegistry.test.js test/upgradeable/MiniAppRegistry.upgrade.test.js`), `npm run check:storage-layout` green, local deploy + sync works (quickstart §1–§2)

---

## Phase 3: User Story 1 — Browse the Catalog and Launch an Approved Mini-App (P1) 🎯 MVP

**Goal**: Curated catalog of Approved apps; integrity-verified launch into a workspace with the restricted host context.

**Independent Test**: quickstart §4.1–.5 — seed one Approved app, browse/search/launch, tamper package ⇒ refusal, suspend ⇒ refusal, tx ⇒ audit entry.

- [x] T015 [P] [US1] Implement `frontend/src/lib/miniapps/registryClient.js` — paged catalog reads + single-record launch read via `getReadProvider(miniAppChainId())` + `getContractAddressForChain('miniAppRegistry', …)`; in-memory cache with `fetchedAt` staleness; distinct `read`/`unreachable`/`not-deployed` outcomes (never zero-as-absence); test `frontend/src/test/miniapps/registryClient.test.js`
- [x] T016 [P] [US1] Implement `frontend/src/lib/miniapps/manifest.js` — parse/validate manifest schema, refuse unknown `schema`/unsupported `hostApi`; test `frontend/src/test/miniapps/manifest.test.js`
- [x] T017 [P] [US1] Implement `frontend/src/lib/miniapps/integrity.js` — `keccak256(manifestBytes)` vs on-chain hash, per-file sha256 via `@noble/hashes` (R3); tamper-case tests in `frontend/src/test/miniapps/integrity.test.js` using T014 fixtures
- [x] T018 [US1] Implement `frontend/src/lib/miniapps/loader.js` — gateway list resolution (`VITE_MINIAPP_GATEWAY` → existing `IPFS_GATEWAY` fallbacks), ordered failover (FR-012), fetch → verify (T016/T017) → Blob-URL `import()` (R1); typed failures (integrity/availability/status); tests `frontend/src/test/miniapps/loader.test.js` incl. failover and nothing-executes-on-mismatch
- [x] T019 [US1] CSP: add `blob:` to `script-src` (ONLY `blob:`) in `frontend/nginx.conf.template` and `frontend/nginx.conf`; add gating test `frontend/src/test/nginxCspScriptSrc.test.js` (model: `nginxCspConnectSrc.test.js`) asserting both files carry `blob:` and never `https:` in `script-src`
- [x] T020 [P] [US1] Implement `frontend/src/lib/miniapps/store.js` — namespaced per-app store on `userStorage` key `miniapp_<appId>_v1` (localStorage, versioned shape, defensive reset, never-throws, subscribe seam) per data-model.md §3; test `frontend/src/test/miniapps/store.test.js`
- [x] T021 [P] [US1] Add `LEDGER_CLASS.miniapp` to `frontend/src/data/ledger/constants.js` (append-only), create `frontend/src/data/ledger/sources/miniAppSource.js` (kinds: `miniapp_launched`/`miniapp_tx_submitted`/`miniapp_integrity_failed`, stable `clientEntryId('miniapp:…')`), register it in `frontend/src/data/ledger/index.js`; test `frontend/src/test/ledger/miniAppSource.test.js`
- [x] T022 [US1] Implement `frontend/src/lib/miniapps/hostContext.jsx` — `MiniAppHostProvider` building the frozen `host` object per `specs/073-miniapp-platform/contracts/host-context.md`: `wallet.submit` wrapping `useActiveAccount().submit` with auto-audit + absent/wrong-network typed rejection, `readProvider`, `store` (T020), `audit.log`, `toast` (`useNotification`), in-app-only `navigate`; test `frontend/src/test/miniapps/hostContext.test.jsx`
- [x] T023 [US1] Create `frontend/src/components/miniapps/CatalogPanel.jsx` (+ `miniapps.css`) — Approved-only cards (name/vendor/version/category), text search, six category filters, honest degradation states (registry unreachable ⇒ "cannot verify listings", launches refused; not-deployed ⇒ section explains); a11y per WCAG 2.1 AA; test `frontend/src/test/miniapps/CatalogPanel.test.jsx`
- [x] T024 [US1] Create `frontend/src/components/miniapps/MiniAppWorkspace.jsx` — route `/apps/:appId` in `frontend/src/App.jsx` under `AppLayout`: launch-time status re-read (FR-010), loader invocation, error boundary containing app failures (FR-015), scoped style injection, unmount/remount-safe mount (FR-016); test `frontend/src/test/miniapps/MiniAppWorkspace.test.jsx`
- [x] T025 [US1] Rewire nav: replace the Apps group in `frontend/src/config/appNav.js` with `{ id: 'apps', label: 'Apps', icon: 'grid' }` (+ `NAV_FEATURE_IDS.apps = 'miniapps'`, NavIcon glyph if new), add `apps` tab to `WALLET_TABS` + render branch in `frontend/src/pages/WalletPage.jsx`; update `frontend/src/config/__tests__/appNav.test.js` + `frontend/src/test/PortalNav.test.jsx`

**Checkpoint**: quickstart §4.1–.5 + §5 pass with a seeded first-party package — MVP demonstrable

---

## Phase 4: User Story 2 — First-Party Apps Become Mini-Apps (P1)

**Goal**: Token Mint, ClearPath, then Wagers delivered through the standard pipeline; legacy deep links keep resolving; catalog never lies about what is a verified package (R11 phasing).

**Independent Test**: quickstart §7 per app + §4.6 deep links.

- [ ] T026 [US2] Convert Token Mint: move `frontend/src/components/tokens/` tree into `frontend/miniapps/token-mint/` with an `entry.jsx` default-exporting the panel; replace `useWallet`/`useNotification`/direct config imports with `host` context equivalents (wallet.submit, readProvider, toast); scope `tokens.css`; build with the T011 preset; keep the notification adapter (`frontend/src/data/notifications/sources/tokenSource.js`) host-side
- [ ] T027 [US2] Token Mint cutover: alias `?tab=tokens` → `/apps/token-mint` in `TAB_ALIASES` (`frontend/src/pages/WalletPage.jsx` AND `frontend/src/components/nav/AppNavDrawer.jsx`, kept in parity), remove the `tokens` render branch, publish/seed the package in dev; parity + deep-link tests `frontend/src/test/miniapps/tokenMintConversion.test.jsx`
- [ ] T028 [US2] Convert ClearPath: move `frontend/src/components/clearpath/` + `frontend/src/config/clearpath/` into `frontend/miniapps/clearpath/`; migrate `trackedDaoStore.js` from raw `window.localStorage` to the namespaced host store (one-time client migration preserving `(chainId, account)` data); `daoSource.js` notification adapter stays host-side; scope `clearpath.css`
- [ ] T029 [US2] ClearPath cutover: alias `?tab=clearpath` → `/apps/clearpath` (both alias sites), remove render branch, publish/seed; parity + migration tests `frontend/src/test/miniapps/clearpathConversion.test.jsx`
- [ ] T030 [US2] Wagers refactor prerequisite — extract `TradePanel` (used by the non-Apps `trade` tab) and `HomeScreen`'s imports (`MyMarketsModal`, `PolymarketTickerCrawler`, `UnifiedLookupModal`) out of `frontend/src/components/fairwins/` into host-retained locations (e.g. `frontend/src/components/trade/`, `frontend/src/components/home/`) with no behavior change; existing tests updated in place
- [ ] T031 [US2] Wagers refactor prerequisite — scope `FriendMarketsProvider` (currently global in `frontend/src/main.jsx`) so the wagers tree receives it without a global mount requirement (provider wrapper inside the wagers entry, host keeps it only where still consumed)
- [ ] T032 [US2] Convert Wagers: move the remaining `frontend/src/components/fairwins/` wager tree (Dashboard + modals + create/accept flows) into `frontend/miniapps/wagers/` on the host context; build + publish
- [ ] T033 [US2] Wagers cutover: `/wagers` route in `frontend/src/App.jsx` redirects to `/apps/wagers` (drawer `WAGERS_ITEM` updated in `frontend/src/config/appNav.js`); until T032 lands the catalog lists Wagers as launching the host-native surface (honest label); parity tests `frontend/src/test/miniapps/wagersConversion.test.jsx`

**Checkpoint**: all three apps launch from the catalog through the verified pipeline; SC-006 parity workflows pass

---

## Phase 5: User Story 3 — Developer Submits an App or Version Update (P2)

**Goal**: Self-serve Pending submissions and update flow with status visibility.

**Independent Test**: quickstart §4.5 + contract suite submission cases; submit → Pending record + event; update ⇒ Pending while approved version keeps serving.

- [x] T034 [US3] Create `frontend/src/components/miniapps/SubmitAppPanel.jsx` (entry point on CatalogPanel) — submit/update forms (name, description, category, CID, manifestHash, version display), writes `submitApp`/`submitUpdate`/`updateMetadata` on `miniAppChainId()` with wallet-chain check at submit time, client-side CID format + manifest fetch/hash pre-check as a courtesy (chain remains authoritative)
- [x] T035 [US3] Vendor status list in `SubmitAppPanel.jsx` via `registryClient.appIdsByVendor` — lifecycle state, approved vs proposed tuple, versions (FR-023)
- [x] T036 [US3] Tests `frontend/src/test/miniapps/SubmitAppPanel.test.jsx` — form validation, wrong-network block, Pending-after-update rendering

---

## Phase 6: User Story 4 — Compliance Review and Lifecycle Control (P2)

**Goal**: Curator queue + on-chain approve/suspend/deprecate, offered only to accounts holding `APP_CURATOR_ROLE`.

**Independent Test**: quickstart §4.7; non-curator sees no controls and reverts on direct call (contract suite).

- [x] T037 [P] [US4] Add curator authority read: `frontend/src/lib/miniapps/registryAuthority.js` reading `hasRole(APP_CURATOR_ROLE, account)` from the registry itself (spec-067 per-contract-authority pattern; unconfirmed read ⇒ "could not verify" state, never a hidden control), wire `ROLES.MINIAPP_CURATOR` into `frontend/src/contexts/RoleContext.jsx` + `frontend/src/hooks/useRoles.js`
  - **Deviation (deliberate):** `ROLES.MINIAPP_CURATOR` was NOT added to `RoleContext`/`useRoles`. `APP_CURATOR_ROLE` administers itself on the MiniAppRegistry, so no app-wide role implies it and the role-storage sync those two files read could not truthfully report it — a flag there would be a second, weaker source of truth for the one authority that deliberately has no admin backdoor. `AdminPanel.jsx` asks the registry directly via `readCuratorAuthority` (the spec-067 per-contract-authority pattern the same task mandates) and fails closed on every uncertainty.
- [x] T038 [US4] Create `frontend/src/components/admin/MiniAppReviewTab.jsx` — Pending queue (metadata, vendor, tuple detail), per-app package fetch + hash verification result before approval (edge case: unverifiable package ⇒ approve blocked-or-warned), approve/suspend/deprecate writes on `miniAppChainId()` with wallet-chain check; preserves the "no role" vs "no chain answered" distinction
- [x] T039 [US4] Register the tab: `miniapp-review` in the Compliance group of `frontend/src/components/admin/adminNav.js` (+ `ADMIN_TAB_ICONS`), role boolean + nav arg + tabpanel branch in `frontend/src/components/AdminPanel.jsx` (three-edit pattern); tests `frontend/src/test/miniapps/MiniAppReviewTab.test.jsx` + adminNav test update

---

## Phase 7: User Story 5 — Namespaced Shared State and Automatic Audit Trail (P3)

**Goal**: Harden isolation, join backup, complete the audit surface.

**Independent Test**: two-app collision test; cross-namespace denial; state-change + app-contextual entries filterable in Reporting.

- [x] T040 [P] [US5] Add `miniAppState` synced object to `frontend/src/lib/backup/syncedObjects.js` (`networkScoped: false`, per-app shallow-union merge) per data-model.md §3; test in `frontend/src/test/backup/`
- [x] T041 [P] [US5] Isolation hardening + tests: cross-namespace access impossible through the store interface (two-app collision scenario), host-internal stores unreachable from the `host` object — `frontend/src/test/miniapps/storeIsolation.test.js`
- [x] T042 [US5] Complete audit: auto `miniapp_state_changed` entries on significant store writes (debounced), `audit.log` → `miniapp_app_logged`, class label in `frontend/src/data/reports/activityClassification.js`, filterable by app/account/time in Reporting; tests extend `frontend/src/test/ledger/miniAppSource.test.js`

---

## Phase 8: User Story 6 — Installable, Cache-Aware Host (P3)

**Goal**: Content-addressed package cache; near-instant relaunches; integrity still verified every launch.

**Independent Test**: quickstart §6.

- [x] T043 [US6] Extend `frontend/public/sw.js` with `fairwins-miniapp-packages-v1`: cache-first for gateway package URLs (immutable CIDs), LRU bound + `activate` sweep; loader (T018) verifies after cache retrieval so stale cache can never bypass FR-010/FR-011 (R10)
- [x] T044 [P] [US6] Cache behavior tests where feasible (`frontend/src/test/miniapps/packageCache.test.js` — URL classification, LRU policy as pure functions extracted from sw.js) and a new-CID-bypasses-old-cache loader test

---

## Phase 9: Polish & Cross-Cutting

- [ ] T045 [P] Write `docs/developer-guide/miniapps.md` (runtime contract, build preset, publish flow, hostApi versioning) and `docs/runbooks/miniapp-registry-operations.md` (curator ops, suspension, deprecation, gateway config)
- [x] T046 [P] Add the spec-073 guardrail entry to `CLAUDE.md` (registry chain rule, approved-tuple-only serving, blob:-only CSP rule, no privileged imports from `frontend/miniapps/`)
- [ ] T047 Accessibility pass on Catalog/Workspace/Review surfaces (axe/Lighthouse CI green, WCAG 2.1 AA)
- [ ] T048 Security review: run `.github/agents/smart-contract-security.agent.md` review over `contracts/apps/` + `contracts/interfaces/IMiniAppRegistry.sol`; Slither clean; document any accepted findings
- [ ] T049 Full-suite gates: `npm test`, `npm run check:storage-layout`, CI frontend suite, `npm run tenants:validate`; quickstart executed end-to-end

---

## Dependencies

```text
Phase 1 (T001–T003) ──► Phase 2 (T004–T014) ──► US1 (T015–T025) ──► US2 (T026–T033)
                                              │                  ├─► US3 (T034–T036)
                                              │                  ├─► US4 (T037–T039)  [T038 needs T015]
                                              │                  ├─► US5 (T040–T042)  [needs T020–T022]
                                              │                  └─► US6 (T043–T044)  [needs T018]
US2 internal: T026→T027; T028→T029; T030,T031→T032→T033
Phase 9 last (T048 may run any time after T005).
```

US3–US6 are mutually independent once US1 is done; US2 conversion pairs are independent of each other except the Wagers chain.

## Parallel Execution Examples

- Phase 2: T006/T007/T008 in parallel after T005; T011–T014 in parallel with the contract track (T004–T010).
- US1: T015, T016, T017, T020, T021 all [P] (different files) → then T018 → T022 → T023/T024 → T025.
- After US1: US3 (T034), US4 (T037), US5 (T040/T041), US6 (T043) can proceed in parallel; Token Mint (T026) and ClearPath (T028) conversions in parallel.

## Implementation Strategy

**MVP** = Phases 1–3 + T026–T027 (US1 with Token Mint as the first real catalog entry): proves registry → publish → verify → mount end-to-end with one converted app. Then deliver US2 conversions incrementally (ClearPath next, Wagers last behind its refactor prerequisites T030/T031 — `/wagers` stays host-native and honestly labeled until T033), with US3/US4 landing the governance surfaces and US5/US6 hardening. Each phase checkpoint maps to a quickstart section, so every increment is independently demonstrable.
