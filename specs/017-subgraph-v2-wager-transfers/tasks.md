---

description: "Task list for v2 WagerRegistry subgraph + per-transfer transaction records"
---

# Tasks: v2 WagerRegistry subgraph + per-transfer transaction records

**Input**: Design documents from `specs/017-subgraph-v2-wager-transfers/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R8), data-model.md, contracts/ (subgraph-schema, subgraph-manifest, report-data-source)

**Tests**: INCLUDED. Constitution II (Test-First) is NON-NEGOTIABLE and the plan commits to Matchstick (subgraph) + Vitest (frontend). Write tests first; ensure they fail before implementation.

**Branch**: `017-subgraph-v2-wager-transfers`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)

## Path Conventions

Off-chain indexer + web app. Subgraph work under `subgraph/`; frontend under `frontend/src/`; sync utility under `scripts/utils/`; on-chain address/block records under `deployments/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Generated ABI + per-network address/start-block inputs the subgraph build needs.

- [X] T001 Extend `scripts/utils/sync-frontend-contracts.js` to also emit `frontend/src/abis/WagerRegistry.json` (JSON ABI) alongside the existing JS ABI/address outputs (research R8; constitution V — generated artifact, never hand-copied).
- [X] T002 Generate the artifact by running `npm run sync:frontend-contracts:polygon` (and per-network variants) and confirm `frontend/src/abis/WagerRegistry.json` exists and matches `frontend/src/abis/WagerRegistry.js`.
- [X] T003 [P] Record the `wagerRegistry` deployment block in each `deployments/*-v2.json`: Polygon (137) = **88118344** (from `frontend/src/config/contracts.js`); resolve Amoy (80002) and Mordor (63) creation blocks from their explorers; local (1337) from the local deployment. NEVER leave `0` (SC-005).
- [X] T004 [P] Create `subgraph/networks.json` mapping each network slug → `{ WagerRegistry: { address, startBlock } }`, sourced from the `deployments/*-v2.json` values in T003 (research R1/R2; see `contracts/subgraph-manifest.md`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared v2 subgraph scaffold (schema, manifest, generated types) that both US1 and US2 build on.

**⚠️ CRITICAL**: No story-level mapping work can begin until codegen succeeds against the new schema + ABI.

- [X] T005 Rewrite `subgraph/schema.graphql` to the v2 SDL: `enum TransferDirection`, `enum WagerStatus`, the v2 `Wager` entity, and the immutable `WagerTransfer` entity with `transfers: @derivedFrom(field: "wager")` (exact SDL in `contracts/subgraph-schema.md` / `data-model.md`).
- [X] T006 Rewrite `subgraph/subgraph.yaml`: replace the `FriendGroupMarketFactory` data source with `WagerRegistry`; `abi.file` → `../frontend/src/abis/WagerRegistry.json`; entities `[Wager, WagerTransfer]`; register the v2 `eventHandlers` (create/accept/payout/refund/drawn/cancelled/resolved + optional declined/draw); `file: ./src/mappings/wagerRegistry.ts`; wire `network`/address/startBlock from `networks.json` (per `contracts/subgraph-manifest.md`). No `0x0`, no `startBlock: 0`.
- [X] T007 Create the mapping module `subgraph/src/mappings/wagerRegistry.ts` with handler stubs (`handleWagerCreated`, `handleWagerAccepted`, `handlePayoutClaimed`, `handleWagerRefunded`, `handleWagerDrawn`, `handleWagerCancelled`, `handleWagerResolved`, and optional `handleWagerDeclined`/`handleDrawProposed`/`handleDrawRevoked`) importing from `../../generated`, and delete the legacy `subgraph/src/mappings/factory.ts`.
- [X] T008 Run `cd subgraph && npm run codegen` and confirm `generated/schema.ts` and `generated/WagerRegistry/WagerRegistry.ts` are produced cleanly against the new schema + ABI.
- [X] T009 [P] Add the Matchstick test scaffold: `subgraph/matchstick.yaml` and `subgraph/tests/wagerRegistry.test.ts` skeleton (helpers to build mock v2 events), so story phases can add failing tests.

**Checkpoint**: Schema + manifest + generated types ready; `npm run codegen` is green.

---

## Phase 3: User Story 1 - Indexed view reflects the live v2 wagers (Priority: P1) 🎯 MVP

**Goal**: The subgraph indexes the live v2 `WagerRegistry` per network and tracks each wager's identity, stakes, and lifecycle status — replacing the placeholder v1 config that returned nothing.

**Independent Test**: On a network with ≥1 v2 wager, query `wagers` and confirm correct creator/opponent/token/stakes and a status that tracks created → accepted → resolved/refunded/cancelled.

### Tests for User Story 1 (write first, must FAIL)

- [X] T010 [P] [US1] Matchstick tests in `subgraph/tests/wagerRegistry.test.ts`: `handleWagerCreated` stores creator/opponent/token/creatorStake/opponentStake/resolutionType/createdAt and `status = open`; assert these fail pre-implementation.
- [X] T011 [P] [US1] Matchstick tests for status transitions in `subgraph/tests/wagerRegistry.test.ts`: accepted→`active`, resolved→`resolved` (+winner, resolvedAt), refunded/drawn/cancelled→terminal, declined→`declined`.

### Implementation for User Story 1

- [X] T012 [US1] Implement `handleWagerCreated` in `subgraph/src/mappings/wagerRegistry.ts`: create/load `Wager`, set all v2 fields and stakes from event params, `createdAt = event.block.timestamp`, `status = open` (stakes stored here per research R3 for later refund derivation).
- [X] T013 [US1] Implement status-updating handlers in `subgraph/src/mappings/wagerRegistry.ts`: `handleWagerAccepted` (→active), `handleWagerResolved` (→resolved, set winner + resolvedAt), `handleWagerRefunded`/`handleWagerDrawn`/`handleWagerCancelled` (terminal status), and optional `handleWagerDeclined`/`handleDrawProposed`/`handleDrawRevoked` (status only, no transfer).
- [X] T014 [US1] Run `cd subgraph && npm run build && npm test`; confirm build compiles and the US1 Matchstick tests pass.
- [ ] T015 [US1] Deploy to one network (e.g. Amoy) per `quickstart.md` step 2 and run the `wagers` probe query (quickstart step 3); confirm live v2 wagers return with non-genesis `startBlock` (SC-001, SC-005).

**Checkpoint**: The subgraph returns live v2 wagers with correct lifecycle status — independently demonstrable.

---

## Phase 4: User Story 2 - Every value-moving event is a queryable transfer record with its transaction hash (Priority: P1)

**Goal**: Each deposit/payout/refund produces a `WagerTransfer` row carrying `txHash`, party, direction, token, amount, from/to, block, timestamp — queryable by party.

**Independent Test**: For an account that created → had accepted → resolved (or refunded) a wager, `wagerTransfers(where:{party})` returns one row per value movement with correct fields and a resolvable `txHash`, time-ordered.

**Depends on**: US1 (handlers exist and store stakes on `Wager`).

### Tests for User Story 2 (write first, must FAIL)

- [X] T016 [P] [US2] Matchstick tests in `subgraph/tests/wagerRegistry.test.ts`: `WagerCreated`→creator deposit row; `WagerAccepted`→opponent deposit (amount = stored `opponentStake`); `PayoutClaimed`→payout row (amount = event); assert `id = txHash-logIndex`, correct `from`/`to`, `direction`, `txHash`, `timestamp`.
- [X] T017 [P] [US2] Matchstick edge-case tests: `WagerRefunded`/`WagerDrawn` emit **two** refund rows (one per party, each their own stored stake); `WagerCancelled` emits **one** creator-refund row; two transfers in one tx get distinct ids (FR-009).

### Implementation for User Story 2

- [X] T018 [US2] Add a `createTransfer(...)` helper in `subgraph/src/mappings/wagerRegistry.ts` that builds an immutable `WagerTransfer` with `id = event.transaction.hash.concatI32(event.logIndex.toI32())`, sets wager/party/direction/token/amount/from/to/txHash/blockNumber/timestamp, and `from`/`to` per research R4 (escrow = `event.address`).
- [X] T019 [US2] Extend `handleWagerCreated` (creator deposit, amount = `creatorStake`) and `handleWagerAccepted` (opponent deposit, amount = stored `opponentStake`) to emit deposit transfers via the helper.
- [X] T020 [US2] Extend `handlePayoutClaimed` (payout to winner, amount = event `amount`), `handleWagerRefunded`/`handleWagerDrawn` (refund per party from stored stakes), and `handleWagerCancelled` (creator refund from stored stake) to emit transfers (per `data-model.md` production-rules table).
- [X] T021 [US2] Run `cd subgraph && npm run build && npm test`; confirm US2 Matchstick tests (incl. edge cases) pass. Redeploy and run **both** probes (quickstart step 3): `wagerTransfers(where:{party})` — verify rows + resolvable `txHash`, time-ordered (SC-002, SC-003, FR-010); and `wager(id){ transfers { … } }` — verify the per-wager `@derivedFrom` transfers resolve (FR-011).

**Checkpoint**: Both US1 and US2 are independently demonstrable from the deployed subgraph.

---

## Phase 5: User Story 3 - The activity/tax report is built without scanning chain logs (Priority: P2)

**Goal**: The report sources enumeration + per-transfer details (incl. `txHash`) from `WagerTransfer`; the only per-transfer node call is one `getTransactionReceipt` for the gas fee. Zero `eth_getLogs`.

**Independent Test**: Generate a report over a period with several wagers; observe zero open-ended log scans and ≤1 receipt call per transfer; line items/totals reconcile to the subgraph transfers.

**Depends on**: US2 (the `WagerTransfer` data exists to read).

### Tests for User Story 3 (write first, must FAIL)

- [X] T022 [P] [US3] Vitest in `frontend/src/test/reports/reportDataSource.test.js`: assert report generation issues a `wagerTransfers(where:{party})` query, performs **zero** `eth_getLogs`/`queryFilter` calls, and **≤1** `getTransactionReceipt` per transfer (SC-004); `feeNative` only for user-sent txs (FR-015).
- [X] T023 [P] [US3] Vitest: no-subgraph fallback (FR-016) — with `VITE_SUBGRAPH_URL` unset, the report surfaces the "index required" message or the retained #703 bounded scan, never an unbounded scan.
- [X] T023a [P] [US3] Vitest in `frontend/src/test/SubgraphSource.v2.test.js` (new) and `frontend/src/test/useSiteStats.chain.test.js` (extend): assert the migrated MyWagers + SiteStats queries request the v2 `Wager` fields, the normalizer maps `participants ⇐ [creator, opponent]` and `stakeToken ⇐ token`, and a subgraph GraphQL `json.errors` response degrades to the `EventsSource` RPC fallback rather than surfacing broken or zeroed data (constitution II + III). Write first; must FAIL.

### Implementation for User Story 3

- [X] T024 [US3] Rewrite `frontend/src/data/reports/reportDataSource.js`: add `listTransfers({account, from, to})` sourcing transfers from the subgraph `WagerTransfer` (shape per `contracts/report-data-source.md`); remove the bounded `getWagerEvents` log scan; keep `getTransactionReceipt(txHash)` for `feeNative` only; retain the #703 bounded scan solely as the no-subgraph fallback.
- [X] T025 [US3] Update `frontend/src/data/reports/transferDerivation.js` (and any caller) to build `TransferLineItem`s from `listTransfers` output (`txHash`/`from`/`to`/`amount`/`timestamp` now come from the subgraph; only fee from the receipt).
- [X] T026 [P] [US3] Migrate `frontend/src/data/wagers/SubgraphSource.js` MyWagers GraphQL query to the v2 `Wager` fields (creator/opponent/token/creatorStake/opponentStake/status/createdAt/resolutionType); map `participants ⇐ [creator,opponent]`, `stakeToken ⇐ token`; keep the `EventsSource` RPC fallback for deadline/`endTime` fields the v2 schema doesn't provide (research R5). (tested by T023a)
- [X] T027 [P] [US3] Migrate `frontend/src/hooks/useSiteStats.js` stats query to v2 `Wager` fields (status/creator/createdAt) AND make it detect GraphQL `json.errors` (throw → existing chain-count fallback), so a v2 schema mismatch degrades to the fallback instead of silently reporting zero (constitution III — honest state). (tested by T023a)
- [ ] T028 [US3] Run `npm run test:frontend`; confirm US3 Vitest passes. Then exercise the report manually with `VITE_SUBGRAPH_URL` set (quickstart step 4) — verify zero `eth_getLogs`, ≤1 receipt/transfer, totals reconcile (SC-004, SC-006).

**Checkpoint**: The report generates RPC-light from the subgraph; all three stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T029 [P] Document `VITE_SUBGRAPH_URL` per network in `frontend/.env.example` (and note the Graph deploy key belongs in local `.env` only) and add a subgraph note to root `.env.example` (FR-017; constitution key-management).
- [X] T030 [P] Update `subgraph/README.md` and `subgraph/package.json` description: v2 `WagerRegistry`, per-network deploy via `networks.json`, and the `WagerTransfer` entity overview.
- [X] T031 [P] Update spec 016's `specs/016-wager-tax-report/data-model.md` field-availability matrix so `txHash`, per-transfer `timestamp`, and `from`/`to` are subgraph-sourced (only `fee` receipt-only), mirroring this feature's `data-model.md`.
- [X] T032 Add a CI job (e.g. a `subgraph` job in `.github/workflows/`) running `graph codegen && graph build && graph test` as failing gates — no `continue-on-error` (constitution IV).
- [ ] T033 Run the full `quickstart.md` validation end-to-end on each supported network (or document Mordor as no-subgraph fallback per research R2) and tick the Definition-of-Done checklist.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T003/T004 are [P].
- **Foundational (Phase 2)**: Depends on Setup (needs the generated ABI + networks.json). BLOCKS all stories. Codegen (T008) must be green before any handler work.
- **US1 (Phase 3)**: Depends on Foundational. The MVP.
- **US2 (Phase 4)**: Depends on US1 (extends the same handlers; reads stakes stored on `Wager`).
- **US3 (Phase 5)**: Depends on US2 (consumes `WagerTransfer`).
- **Polish (Phase 6)**: Depends on the stories it documents/validates; T029–T031 are [P].

### User Story Dependencies

- **US1 (P1)** → after Foundational. No story deps.
- **US2 (P1)** → builds on US1 (shared mapping file + stored stakes). Not independent of US1, but independently *testable* (transfer queries).
- **US3 (P2)** → builds on US2 (needs indexed transfers). Independently *testable* (report behavior).

> Note: unlike a typical fan-out feature, these stories are inherently sequential (schema → wagers → transfers → report). They remain independently *verifiable* at each checkpoint.

### Within Each Story

- Tests written first and FAIL before implementation (constitution II).
- US1/US2 mapping handlers share `wagerRegistry.ts` → tasks within a story are sequential, not [P], where they touch that file.
- `graph build` only succeeds once handlers exist (after US1), so build/test runs land at the end of each story.

> **Sequencing (I1)**: the v2 schema lands in Foundational (T005); consumer migration (T026/T027) is in US3. `SubgraphSource.js` already throws on GraphQL `json.errors` and falls back to `EventsSource` (RPC), so MyWagers does not break in the interim window; `useSiteStats` is hardened to do the same in T027. If a v2 `VITE_SUBGRAPH_URL` will be configured on any network before US3 lands, pull T026/T027 forward to immediately after T005.

### Parallel Opportunities

- Setup: T003 + T004 in parallel.
- Foundational: T009 [P] alongside schema/manifest work.
- US1 tests: T010 + T011 in parallel (same file, but independent test blocks — coordinate if one editor).
- US2 tests: T016 + T017 in parallel.
- US3: T026 + T027 in parallel (different files); T022 + T023 in parallel.
- Polish: T029 + T030 + T031 in parallel.

---

## Parallel Example: User Story 3

```bash
# Frontend consumer migrations touch different files — run together:
Task: "Migrate SubgraphSource.js MyWagers query to v2 Wager fields"   # T026
Task: "Migrate useSiteStats.js stats query to v2 Wager fields"        # T027

# US3 tests (write first):
Task: "reportDataSource zero-scan / one-receipt Vitest"               # T022
Task: "no-subgraph fallback Vitest"                                    # T023
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (codegen green) → 3. Phase 3 US1.
4. **STOP and VALIDATE**: deploy + query `wagers` on one network; confirm live v2 wagers return (SC-001). This alone fixes the "subgraph returns nothing for v2" gap.

### Incremental Delivery

1. Setup + Foundational → scaffold ready.
2. US1 → subgraph indexes live v2 wagers (MVP).
3. US2 → per-transfer `WagerTransfer` rows with `txHash`.
4. US3 → report builds RPC-light from the subgraph.
   Each step adds value without breaking the prior.

---

## Notes

- [P] = different files, no incomplete-task dependency. US1/US2 share `wagerRegistry.ts`, so their *implementation* tasks are sequential.
- Mappings perform **no contract reads** (research R3) — amounts come from event payloads or stakes stored on `Wager` at creation.
- No `contracts/` (Solidity) changes — this is read-only indexing of deployed v2 events; no Slither/Medusa gate applies.
- Keep the #703 bounded scan only as the no-subgraph fallback; remove once all live networks have the v2 subgraph (tracked separately, not in this feature).
- Commit after each task or logical group; branch is `017-subgraph-v2-wager-transfers` (open a PR — never push to main).
