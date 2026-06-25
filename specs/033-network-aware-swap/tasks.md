---

description: "Task list for Network-Aware Swap Provider"
---

# Tasks: Network-Aware Swap Provider

**Input**: Design documents from `/specs/033-network-aware-swap/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: INCLUDED — required by Constitution Principle II (Test-First, NON-NEGOTIABLE). Write each
test task first and confirm it FAILS before the matching implementation task.

**Organization**: Tasks are grouped by user story (US1=P1, US2=P2, US3=P3) so each story is an
independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (omitted for Setup, Foundational, Polish)
- Exact file paths are included in each task.

## Path Conventions

Single React app under `frontend/`. All source paths are repo-relative: `frontend/src/...`.

---

## Phase 1: Setup

**Purpose**: Branch hygiene before any edits.

- [X] T001 Create and switch to feature branch `033-network-aware-swap` off `origin/main` (never commit to `main`; fetch first so the branch is current).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared provider-resolution mechanism every story consumes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Add the `getDexProvider(chainId)` helper and a `DexProvider` JSDoc shape comment (`{ name, url }`) to `frontend/src/config/networks.js`; export `getDexProvider` returning `getNetwork(chainId)?.dexProvider ?? null` (no per-network data yet — added per story).
- [X] T003 [P] Expose `dexProvider` in the DexContext value in `frontend/src/contexts/DexContext.jsx`, derived from the active `network` (`network?.dexProvider ?? null`); keep all existing keys unchanged.
- [X] T004 Add foundational unit test in `frontend/src/test/networks.test.js` asserting `getDexProvider` is a pure per-chain lookup that returns `null` for `1337` and for an unknown chain id (depends on T002).

**Checkpoint**: Provider plumbing exists (returns `null` everywhere until stories supply data); UI stories can begin.

---

## Phase 3: User Story 1 - Swap on Ethereum Classic shows and uses ETCswap (Priority: P1) 🎯 MVP

**Goal**: On ETC-family networks the Swap surface is identified as **ETCswap**, links to ETCswap / the ETC explorer, and routes through the ETCswap deployment. Adds ETC mainnet (61) as a selectable network.

**Independent Test**: With the wallet/mock on chain 61 (or 63 with ETCswap configured), open Swap → panel says "ETCswap", "Open ETCswap ↗" → `v3.etcswap.org`, contract links use `etc.blockscout.com`, and no "Uniswap" text appears.

### Tests for User Story 1 (write first, confirm FAIL)

- [X] T005 [P] [US1] Add ETC mapping assertions to `frontend/src/test/networks.test.js`: `NETWORKS[61]` exists and is `selectable`; `getDexProvider(61)`/`getDexProvider(63)` → `{ name: 'ETCswap' }`; `getSelectableNetworks()` includes `61`; `isDexAvailable(61) === true` (depends on T002).
- [X] T006 [P] [US1] Create `frontend/src/test/SwapPanel.test.jsx`: mock chain `61`, render `SwapPanel` (connected, DEX available) and assert the provider name "ETCswap" appears, the provider link href is `v3.etcswap.org`, the router-link label reads `ETCswap Router ↗`, and there is no "Uniswap" text (use `frontend/src/test/helpers/chainMocks.js`).

### Implementation for User Story 1

- [X] T007 [US1] Add the `NETWORKS[61]` (Ethereum Classic mainnet) entry to `frontend/src/config/networks.js`: `isTestnet:false`, `selectable:true`, `nativeCurrency {18,'Ethereum Classic','ETC'}`, `rpcUrl = VITE_RPC_URL_ETC || 'https://etc.rivet.link'`, `explorer {Blockscout, https://etc.blockscout.com}`, `subgraphUrl:null`, `stablecoin` USC `0xDE093684c796204224BC081f937aa059D903c52a`/USC/6 (`VITE_ETC_USC` override), `dex` = verified ETCswap V3 addresses from research.md (`VITE_ETC_ETCSWAP_FACTORY/SWAP_ROUTER/QUOTER/POSITION_MANAGER` + `VITE_ETC_WETC` overrides), `dexProvider {name:'ETCswap', url: VITE_ETC_ETCSWAP_URL || 'https://v3.etcswap.org'}`, and a `capabilities` getter (`polymarketSidebets:false`, `dex:Boolean(this.dex)`, `friendMarkets:true`) (depends on T002).
- [X] T008 [US1] Add `dexProvider: { name: 'ETCswap', url: VITE_MORDOR_ETCSWAP_URL || 'https://etcswap.org' }` to the existing Mordor (63) entry in `frontend/src/config/networks.js` so its identity is correct even while its `dex` is env-unconfigured (depends on T007 — same file).
- [X] T009 [US1] Make the active (DEX-available) view of `frontend/src/components/fairwins/SwapPanel.jsx` provider-aware: read `dexProvider` from `useDex()`; use `dexProvider.name` in the subtitle and the router-link label (`{name} Router ↗`); add an `Open {name} ↗` link → `dexProvider.url` (`target="_blank" rel="noopener noreferrer"`); remove the hardcoded "Uniswap" wording from this view (depends on T003).
- [X] T010 [P] [US1] Add a `VITE_ETC_*` override block (RPC, USC, `ETCSWAP_FACTORY/SWAP_ROUTER/QUOTER/POSITION_MANAGER`, `WETC`, `ETCSWAP_URL`) to `frontend/.env.example`, mirroring the existing Mordor block and noting the verified defaults are optional overrides.
- [X] T011 [US1] Re-confirm ETCswap `SwapRouter02` (`0xEd88…24d1`) and `QuoterV2` (`0x4d8c…d39B`) source-verification on `etc.blockscout.com`; record the result in the research.md R1 caveat (verification only — change addresses solely if a mismatch is found).

**Checkpoint**: ETC mainnet is selectable; ETC-family Swap shows/links ETCswap; T005/T006 pass.

---

## Phase 4: User Story 2 - Swap on non-ETC networks shows and uses Uniswap (Priority: P2)

**Goal**: Polygon/Amoy Swap is identified as **Uniswap** with Uniswap links, via the same provider-aware panel built in US1.

**Independent Test**: Mock chain `137`, open Swap → panel says "Uniswap", provider link → `app.uniswap.org`, no "ETCswap" text.

### Tests for User Story 2 (write first, confirm FAIL)

- [X] T012 [P] [US2] Add to `frontend/src/test/networks.test.js`: `getDexProvider(137)` and `getDexProvider(80002)` → `{ name: 'Uniswap' }`.
- [X] T013 [P] [US2] Add to `frontend/src/test/SwapPanel.test.jsx`: mock chain `137`, assert provider name "Uniswap", provider link href contains `app.uniswap.org`, and no "ETCswap" text.

### Implementation for User Story 2

- [X] T014 [US2] Add `dexProvider: { name: 'Uniswap', url }` to the Polygon (`137` → `https://app.uniswap.org/swap?chain=polygon`) and Amoy (`80002` → `https://app.uniswap.org/swap`) entries in `frontend/src/config/networks.js` (depends on T007/T008 — same file, sequential).

**Checkpoint**: US1 (ETC) and US2 (Uniswap) both render correct provider identity; T012/T013 pass.

> Note: US2 reuses the provider-aware panel from US1 (T009); it is independently *testable* but builds on T009.

---

## Phase 5: User Story 3 - Network switch re-targets the provider; unavailable DEX explained honestly (Priority: P3)

**Goal**: Switching networks re-targets provider identity/links with no stale text; an unconfigured DEX is explained with the provider that actually applies to that network; the Network tab and capability tags are provider-correct.

**Independent Test**: Re-render across an ETC and a non-ETC chain and confirm provider name/links update with no leftovers; on a chain with `dex === null`, the disabled message names that chain's provider (never "Uniswap on Polygon").

### Tests for User Story 3 (write first, confirm FAIL)

- [X] T015 [P] [US3] Add to `frontend/src/test/SwapPanel.test.jsx`: (a) disabled-state — mock an ETC-family chain with `isDexAvailable=false`, assert the message names "ETCswap" + the network name and contains no "Uniswap"/"Polygon"; (b) re-target — re-render from chain `63` to `137` and assert provider name/link switch from ETCswap to Uniswap with no stale ETCswap text.
- [X] T016 [P] [US3] Extend `frontend/src/test/NetworkSettings.test.jsx`: the DEX link is rendered from `dexProvider` (label includes the provider name, href = `dexProvider.url`), gated on `capabilities.dex`; an ETC row shows the ETCswap link.

### Implementation for User Story 3

- [X] T017 [US3] Rework the `!isDexAvailable` branch of `frontend/src/components/fairwins/SwapPanel.jsx` to be provider/network-correct using `dexProvider?.name` and `network?.name`; remove the hardcoded "Uniswap V3 is wired on Polygon Mainnet…/VITE_AMOY_UNISWAP_*" copy in favor of an honest, provider-named message (depends on T009).
- [X] T018 [US3] Update `frontend/src/components/wallet/NetworkSettings.jsx` to render the DEX link from `dexProvider` (`Open {dexProvider.name} ↗`, `href={dexProvider.url}`), gated on `capabilities.dex`, replacing the `net.resources.dexUrl` usage (depends on T003, T014).
- [X] T019 [US3] Remove the now-redundant `resources.dexUrl` from the Mordor (63) entry in `frontend/src/config/networks.js` (retain `resources.faucet`) (depends on T018).
- [X] T020 [US3] Change the `swap` feature `description` in `frontend/src/config/networkCapabilities.js` from "In-app token swaps via Uniswap V3." to provider-neutral wording (e.g. "In-app token swaps via the network's DEX (Uniswap or ETCswap).").

**Checkpoint**: All three stories functional; provider identity correct across Swap panel, disabled-state, network switch, and Network tab.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Update non-user-facing comments that say "Uniswap V3" to be provider-neutral in `frontend/src/constants/dex.js` and `frontend/src/contexts/DexContext.jsx`.
- [X] T022 [P] (Optional enablement) Verify the deterministic ETCswap V3 addresses on `etc-mordor.blockscout.com`; if confirmed, add them as Mordor (63) `dex` defaults (env-overridable) in `frontend/src/config/networks.js` to enable Mordor swaps. Skip (leave Mordor env-gated) if not independently verifiable — do not guess (Honest-State).
- [X] T023 Run the gauntlet from repo root: `npm run lint` (frontend) and `npm run test:frontend`; both green. Fix any regressions.
- [ ] T024 Execute `specs/033-network-aware-swap/quickstart.md` manual smoke (ETC→ETCswap, Polygon→Uniswap, switch re-target, honest disabled-state, ETC mainnet selectable) and verify SC-003 (no cross-provider text on any chain).
- [X] T025 [P] Grep `docs/` for swap/DEX copy that implies "Uniswap only" and update to mention ETC mainnet + ETCswap where relevant.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: none.
- **Foundational (P2)**: after Setup — BLOCKS all stories.
- **US1 (P3)**: after Foundational. MVP.
- **US2 (P4)**: after Foundational; reuses US1's `SwapPanel` change (T009).
- **US3 (P5)**: after Foundational; reuses US1's `SwapPanel` change (T009) and US2's Uniswap config (for the re-target test).
- **Polish (P6)**: after the desired stories.

### Key task-level dependencies

- T004, T005 → T002. T007 → T002. T008 → T007. T009 → T003.
- T014 → T007/T008 (same file). T017 → T009. T018 → T003/T014. T019 → T018.
- T022 (optional) → independent verification of Mordor addresses.

### Within each story

- Write tests (FAIL) → implement → checkpoint. Config (`networks.js`) before the UI that reads it; same-file edits to `networks.js` and `SwapPanel.test.jsx`/`SwapPanel.jsx` are sequential (not parallel).

### Parallel Opportunities

- Foundational: T003 ∥ (T002 then T004).
- US1: T005 ∥ T006 ∥ T010 (different files). Implementation T007→T008 sequential; T009, T011 independent.
- US2: T012 ∥ T013.
- US3: T015 ∥ T016.
- Polish: T021 ∥ T022 ∥ T025.

---

## Parallel Example: User Story 1

```bash
# Tests first (different files → parallel):
Task: "networks.test.js ETC mapping assertions (T005)"
Task: "SwapPanel.test.jsx ETCswap rendering (T006)"
Task: "frontend/.env.example VITE_ETC_* block (T010)"
# Then implementation (networks.js edits are sequential):
Task: "Add NETWORKS[61] entry (T007)"  →  "Add Mordor dexProvider (T008)"
Task: "SwapPanel provider-aware active view (T009)"   # parallel with T007/T008 (different file)
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE** ETC→ETCswap on its own (the most-broken case). Demo-able MVP: ETC mainnet selectable, ETCswap correctly named/linked.

### Incremental Delivery

US1 (ETC/ETCswap, MVP) → US2 (Uniswap parity) → US3 (switch re-target, honest disabled-state, Network-tab consistency) → Polish (comment/doc cleanup, optional Mordor enablement). Each story is testable before the next.

---

## Notes

- `[P]` = different files, no incomplete dependency. Same-file tasks (`networks.js`, `SwapPanel.jsx`, `SwapPanel.test.jsx`) are intentionally sequential.
- Honest-State: ETC mainnet ships with **on-chain-verified** ETCswap addresses (research.md), never mocks; DEX stays gated on configured addresses; provider identity is per-chain and never leaks.
- No `contracts/` (Solidity) changes; no new dependencies; frontend-only — consistent with the no-backend footprint.
- Commit after each task or logical group; open a PR (never push to `main`).
