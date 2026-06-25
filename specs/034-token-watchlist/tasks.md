---
description: "Task list for spec 034 — Token Watchlist (My Tokens Assets)"
---

# Tasks: Token Watchlist (My Tokens Assets)

**Input**: Design documents from `/specs/034-token-watchlist/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED — the constitution's Test-First principle is NON-NEGOTIABLE and the plan's Constitution Check enumerates the required Vitest specs. Write each test task FIRST and confirm it FAILS before the matching implementation task.

**Organization**: Grouped by user story (US1 P1 → US2 P2 → US3 P3) for independent implementation and testing. Frontend-only; no backend, no smart-contract change.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)
- Exact file paths are included in every task.

## Path Conventions

Single existing React app under `frontend/`. New module lives in `frontend/src/lib/tokens/`; hooks in `frontend/src/hooks/`; components in `frontend/src/components/tokens/`; tests co-located in `__tests__/` or under `frontend/src/test/` per existing convention.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffolding and shared assets/config docs.

- [x] T001 Create the `frontend/src/lib/tokens/` module with `frontend/src/lib/tokens/constants.js` exporting `STORAGE_KEY='watchlist'`, `SCHEMA_VERSION=1`, `LIST_TTL_MS=12*60*60*1000`, `SUPPORTED_CHAIN_IDS=[137,80002,61,63]`, and `TRUSTED_LOGO_HOSTS=['raw.githubusercontent.com','ipfs.io']`.
- [x] T002 [P] Create a bundled neutral placeholder logo as an inline SVG React component at `frontend/src/components/tokens/TokenLogoPlaceholder.jsx` (no remote fetch; used for custom/unknown/fallback).
- [x] T003 [P] Add a documented token-list override block (`VITE_TOKENLIST_URL_POLYGON`, `VITE_TOKENLIST_URL_ETC`, `VITE_TOKENLIST_URL_MORDOR`) to `frontend/.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The storage layer, the React hook, and the gated panel shell that every user story renders inside.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Write failing unit tests for the watchlist store in `frontend/src/test/tokenWatchlistStore.test.js` (dedupe by `(lowercased address, chainId)`, `removeEntry`, `mergeWatchlists` idempotent union with earliest-`addedAt` wins and `conflicts: []`).
- [x] T005 Implement the pure store in `frontend/src/lib/tokens/tokenWatchlistStore.js` (`createEmptyWatchlist`, `loadWatchlist`/`saveWatchlist` via `frontend/src/utils/userStorage.js` key `watchlist`, `entryKey`, `addEntry`, `removeEntry`, `mergeWatchlists`) to pass T004 — per [contracts/watchlist-store-and-hook.md](./contracts/watchlist-store-and-hook.md).
- [x] T006 [P] Write failing tests for the hook in `frontend/src/test/useTokenWatchlist.test.jsx` (filters `entries` to active chainId, persists on every mutation, no-op when no wallet) — mock `getContractAddress`/chain per the frontend-test gotchas memo.
- [x] T007 Implement `frontend/src/hooks/useTokenWatchlist.js` (mirror `useAddressBook`: useState initializer + render-time address-change reload + synchronous commit; derive active-chain `entries`) to pass T006 (depends on T005).
- [x] T008 Relabel and mount tabs in `frontend/src/components/tokens/TokensPanel.jsx`: rename the existing `{ id: 'mine', label: 'My Tokens' }` to label `'Issued'` (keep `id:'mine'`), add a new FIRST tab `{ id: 'watched', label: 'My Tokens' }` rendering `WatchedTokensPanel`, and update any copy referencing the old label.
- [x] T009 Implement the gated shell `frontend/src/components/tokens/WatchedTokensPanel.jsx` — membership gate via `useRoleDetails().getRoleDetails('WAGER_PARTICIPANT')` (`isActive && tier > 0`), honest gated state + `PremiumPurchaseModal` CTA, loading state, and empty-watchlist state — per [contracts/backup-tokens-domain.md](./contracts/backup-tokens-domain.md) §B (depends on T007).
- [x] T010 [P] Write tests for the gate/shell in `frontend/src/components/tokens/__tests__/WatchedTokensPanel.test.jsx` (non-member → gated notice + CTA, no add controls; member → empty watchlist).

**Checkpoint**: "My Tokens" tab renders; non-members see the honest gate; members see an empty watchlist. No add capability yet.

---

## Phase 3: User Story 1 - Build a watchlist from the network's token registry (Priority: P1) 🎯 MVP

**Goal**: A member browses the per-network Uniswap/ETCswap registry, adds tokens, and sees them in "My Tokens" with live balances, scoped to the active network.

**Independent Test**: Connect a member wallet on Polygon, add USDC from the registry → it shows with symbol, logo, and balance; switch to Amoy → it is hidden; switch back → it returns.

### Tests for User Story 1 (write first, ensure they FAIL)

- [x] T011 [P] [US1] Failing tests for token-list fetch/sanitize/cache in `frontend/src/test/tokenList.test.js` (drops rows with unsupported chainId / bad address / out-of-range decimals, de-dupes by lowercased address, caches by URL with TTL, degrades to last-good cache then seed).
- [x] T012 [P] [US1] Failing tests for logo policy in `frontend/src/test/tokenLogo.test.js` (`source:'custom'`→null; `ipfs://cid`→`https://ipfs.io/ipfs/cid`; allowlisted host→https URL; untrusted host/missing→null).
- [x] T013 [P] [US1] Failing tests for AddTokenDialog browse mode in `frontend/src/components/tokens/__tests__/AddTokenDialog.test.jsx` (search returns matches, clicking adds a `source:'registry'` entry, already-watched rows show "Added", `custom-only`/`unavailable` honest notices render).
- [x] T014 [P] [US1] CSP regression tests: new `frontend/src/test/nginxCspImgSrc.test.js` (iterate both nginx configs; assert `img-src` contains `https://raw.githubusercontent.com`) and extend `frontend/src/test/nginxCspConnectSrc.test.js` (assert `connect-src` contains `https://tokens.uniswap.org` and `https://raw.githubusercontent.com` in both configs).

### Implementation for User Story 1

- [x] T015 [P] [US1] Add per-network `tokenList: { sourceType, url, seed }` to each chain and a `getTokenListSource(chainId)` helper in `frontend/src/config/networks.js` (137→uniswap, 61/63→ETCswap all.json, 80002→custom-only+seed, 1337→custom-only) — per [contracts/networks-token-config.md](./contracts/networks-token-config.md).
- [x] T016 [P] [US1] Implement `frontend/src/lib/tokens/tokenList.js` (`sanitizeTokenList`, `fetchTokenList`, `getCachedList`/`putCachedList`, degrade order) to pass T011 — per [contracts/token-registry-and-logo.md](./contracts/token-registry-and-logo.md).
- [x] T017 [P] [US1] Implement `frontend/src/lib/tokens/tokenLogo.js` (`resolveLogoSrc` allowlist + `ipfs://` rewrite) to pass T012.
- [x] T018 [US1] Implement `frontend/src/hooks/useTokenRegistry.js` (`catalog`/`status`/`isCustomOnly`/`search`/`refresh`, fetch+cache+seed degrade) (depends on T015, T016).
- [x] T019 [US1] Implement `frontend/src/hooks/useTokenBalances.js` reading `ERC20.balanceOf` via ethers v6 (`frontend/src/abis/ERC20.js`) with Multicall3 batching (`frontend/src/abis/Multicall3.js`) and serial fallback, `ethers.formatUnits`, status `ok|loading|unavailable` (never fake `0`).
- [x] T020 [US1] Implement `frontend/src/components/tokens/WatchedTokenRow.jsx` (logo via `resolveLogoSrc` with `TokenLogoPlaceholder` on null/`onError`, symbol/name, balance "—" when unavailable) (depends on T017, T019).
- [x] T021 [US1] Implement `frontend/src/components/tokens/AddTokenDialog.jsx` browse mode (search `useTokenRegistry`, add registry token, already-added state, honest `custom-only`/`unavailable` notices) to pass T013 (depends on T018).
- [x] T022 [US1] Wire registry-add and network-scoped rendering into `frontend/src/components/tokens/WatchedTokensPanel.jsx` (render `useTokenWatchlist().entries` as `WatchedTokenRow`s, balances via `useTokenBalances`, open `AddTokenDialog`; order: non-zero balance first then newest) (depends on T020, T021).
- [x] T023 [P] [US1] Update CSP in BOTH `frontend/nginx.conf` and `frontend/nginx.conf.template`: `connect-src` += `https://tokens.uniswap.org https://raw.githubusercontent.com`; `img-src` += `https://raw.githubusercontent.com`. Keep both files identical — pass T014.
- [x] T024 [P] [US1] Extend `frontend/src/components/tokens/tokens.css` with `.tm-logo` and `.tm-balance` (+ states) within the `.token-mint` scope.

**Checkpoint**: US1 fully functional — browse, add registry token, live balance, network-scoped view. MVP deliverable.

---

## Phase 4: User Story 2 - Add a custom token by contract address (Priority: P2)

**Goal**: A member adds a token not in the registry by pasting its contract address; metadata resolves on-chain and it appears with an inline "unverified" badge and a placeholder logo.

**Independent Test**: Paste a valid ERC-20 address not in the list → resolves symbol/decimals, shows "unverified" badge + placeholder; paste junk → honest error, nothing added; re-add a tracked token → no duplicate.

### Tests for User Story 2 (write first, ensure they FAIL)

- [x] T025 [P] [US2] Failing tests for custom mode in `frontend/src/components/tokens/__tests__/AddTokenDialog.test.jsx` (valid custom address resolves + adds `source:'custom'` with unverified badge; invalid/non-contract rejected with no add; duplicate of a tracked token prevented).

### Implementation for User Story 2

- [x] T026 [US2] Implement `frontend/src/lib/tokens/resolveCustomToken.js` — an `ethers.isAddress` gate plus a `fetchOnChain` wrapper (`new ethers.Contract(addr, ERC20_ABI, provider)` reading `symbol`/`name`/`decimals`) passed into `resolveTokenMeta` from `frontend/src/data/reports/tokenMeta.js`; returns an honest error (adds nothing) on failure.
- [x] T027 [US2] Add custom mode to `frontend/src/components/tokens/AddTokenDialog.jsx` (address input → validate → resolve via T026 → `addToken({ source:'custom', ... })`; honest error; dedupe) to pass T025 (depends on T026).
- [x] T028 [US2] Add the inline "unverified — not in the token registry" badge and forced placeholder for `source:'custom'`/unknown tokens in `frontend/src/components/tokens/WatchedTokenRow.jsx` (depends on T020).
- [x] T029 [P] [US2] Extend `frontend/src/components/tokens/tokens.css` with `.tm-unverified-badge` (text + non-color-only cue) within the `.token-mint` scope.

**Checkpoint**: US1 AND US2 both work — registry adds and custom adds, with honest validation and the unverified cue.

---

## Phase 5: User Story 3 - Persist and restore the watchlist (Priority: P3)

**Goal**: The watchlist rides the encrypted backup (network-tagged) and restores across devices with correct network association; users can remove tokens.

**Independent Test**: Add tokens across two networks, back up, clear local data, restore the same wallet → every token returns under its correct network; remove a token → it disappears from view and the next backup.

### Tests for User Story 3 (write first, ensure they FAIL)

- [x] T030 [P] [US3] Failing tests for the `tokens` synced domain and bundle tagging by extending `frontend/src/test/backup/syncedObjects.test.js` (load/apply in `merge` and `replace` modes; `parseBundle`/`assertNetworkTagged` throws when an entry lacks numeric `chainId`).
- [x] T031 [P] [US3] Failing tests for removal + restore reattach by extending `frontend/src/components/tokens/__tests__/WatchedTokensPanel.test.jsx` (remove updates view + storage; restored multi-network entries reattach to the correct chain).

### Implementation for User Story 3

- [x] T032 [US3] Register the `tokens` domain in `frontend/src/lib/backup/syncedObjects.js` (`{ key:'tokens', label:'Token watchlist', networkScoped:true, load/apply/merge }` wired to the store + `mergeWatchlists`) — per [contracts/backup-tokens-domain.md](./contracts/backup-tokens-domain.md) §A; pass T030.
- [x] T033 [US3] Add the `tokens` branch to `assertNetworkTagged` in `frontend/src/lib/backup/backupBundle.js` (every `entries[i].chainId` must be a number) — pass T030.
- [x] T034 [US3] Wire the remove action (per-row remove button → `useTokenWatchlist().removeToken`) in `frontend/src/components/tokens/WatchedTokenRow.jsx` and `frontend/src/components/tokens/WatchedTokensPanel.jsx` — pass T031.

**Checkpoint**: All three stories independently functional — reload persistence, encrypted backup/restore with network reattach, and removal.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates spanning all stories.

- [x] T035 [P] Run `npm run lint` in `frontend/` and clear any ESLint errors across the new modules/components (Constitution V — errors block the build).
- [x] T036 [P] Accessibility pass on the new UI (WCAG 2.1 AA): logo `alt`/decorative handling, the unverified badge conveyed by text not color alone, ARIA roles consistent with existing `.tm-*` patterns.
- [x] T037 [P] Document the watchlist in the developer guide / user-facing note under `docs/` (sources per network, custom-add, network-scoping, membership gate).
- [ ] T038 Execute the [quickstart.md](./quickstart.md) S1–S6 manual validation scenarios and record results.
- [x] T039 Verify the no-backend footprint and that both nginx configs stay in sync by running `frontend/src/test/nginxCspImgSrc.test.js` and `frontend/src/test/nginxCspConnectSrc.test.js`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phase 3–5)**: all depend on Foundational. US1 is the MVP. US2 extends US1's `AddTokenDialog`/`WatchedTokenRow`; US3 is independently testable via store seeding.
- **Polish (Phase 6)**: depends on the desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: starts after Foundational. No dependency on US2/US3.
- **US2 (P2)**: starts after Foundational; builds on US1's `AddTokenDialog` and `WatchedTokenRow` (extends, doesn't break them).
- **US3 (P3)**: starts after Foundational; testable independently by seeding the store (does not require US1/US2 UI).

### Within Each User Story

- Test tasks first (must FAIL), then implementation.
- Pure libs/config (`tokenList`, `tokenLogo`, `networks.js`) before hooks (`useTokenRegistry`, `useTokenBalances`) before components (`WatchedTokenRow`, `AddTokenDialog`) before panel wiring.

### Parallel Opportunities

- Setup: T002, T003 in parallel.
- Foundational: test tasks T004, T006, T010 in parallel; T005→T007→T009 are sequential (store→hook→shell); T008 parallel to the store/hook work.
- US1: tests T011–T014 all parallel; impl T015/T016/T017 parallel, then T018/T019 (T019 parallel to T018), then T020/T021, then T022; T023/T024 parallel anytime after their tests.
- US2: T029 parallel to T026–T028.
- US3: T030, T031 parallel; T032/T033 parallel to each other; T034 after T031.
- Polish: T035, T036, T037 parallel.

---

## Parallel Example: User Story 1

```bash
# Write all US1 tests together first (they must fail):
Task: "tokenList fetch/sanitize/cache tests in frontend/src/test/tokenList.test.js"
Task: "tokenLogo policy tests in frontend/src/test/tokenLogo.test.js"
Task: "AddTokenDialog browse tests in frontend/src/components/tokens/__tests__/AddTokenDialog.test.jsx"
Task: "nginx CSP tests: frontend/src/test/nginxCspImgSrc.test.js (+extend nginxCspConnectSrc.test.js)"

# Then the parallel implementation trio:
Task: "tokenList config + getTokenListSource in frontend/src/config/networks.js"
Task: "frontend/src/lib/tokens/tokenList.js"
Task: "frontend/src/lib/tokens/tokenLogo.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → 2. Phase 2 Foundational (blocks everything) → 3. Phase 3 US1.
4. **STOP and VALIDATE**: a member can build a registry watchlist with live, network-scoped balances.
5. Deploy/demo — this is the MVP.

### Incremental Delivery

- Setup + Foundational → gated empty "My Tokens" shell.
- + US1 → registry watchlist + balances (MVP).
- + US2 → custom tokens with unverified cue.
- + US3 → encrypted backup persistence/restore + removal.
- Each story adds value without breaking the previous one.

---

## Notes

- This feature is **frontend-only**: no `contracts/` change, no backend, no `BackupPointerRegistry`/bundle-version change.
- [P] = different files, no incomplete-task dependency. `[Story]` labels give traceability.
- Verify each test FAILS before implementing (Test-First, NON-NEGOTIABLE).
- The two nginx configs (`nginx.conf` + `nginx.conf.template`) MUST stay identical — the CSP regression test (T014/T039) enforces this; divergence previously broke the QR camera.
- Reuse, don't re-roll: `resolveTokenMeta`, `ERC20.js`, `Multicall3.js`, `useRoleDetails`, `userStorage`, the spec-032 backup registry, and `networks.js` config.
- Per the project git rule: branch off `origin/main` (e.g. `feat/034-token-watchlist`) before implementing; never push to `main`.
