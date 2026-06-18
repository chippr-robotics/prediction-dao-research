# Implementation Plan: v2 WagerRegistry subgraph + per-transfer transaction records

**Branch**: `017-subgraph-v2-wager-transfers` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-subgraph-v2-wager-transfers/spec.md` (implements GitHub issue #704; follow-up to spec `016-wager-tax-report`, superseding the interim mitigation in PR #703)

## Summary

Migrate the indexing subgraph off the legacy v1 `FriendGroupMarketFactory` and onto the
live v2 `WagerRegistry` on every supported network (Polygon 137, Amoy 80002, Mordor 63,
local 1337), with each network configured at its real contract address and deployment
start block. Add an immutable `WagerTransfer` entity that records one row per value-moving
event (creator deposit, opponent deposit, payout, refund) carrying the **transaction hash**,
counterparties, amount, token, direction, and timestamp. The v1 events carry no amounts on
accept/refund/draw/cancel, so the mappings record `creatorStake`/`opponentStake` on the
`Wager` at creation and derive every transfer amount from event payloads or the stored wager
— **no `try_*` contract reads**, so a mapping can never revert. The tax/activity report
(spec 016) then enumerates and builds line items from the subgraph and makes exactly one
receipt call per transfer (gas fee only), eliminating the `eth_getLogs` scans that flood
public RPCs.

## Technical Context

**Language/Version**: AssemblyScript (subgraph mappings, `graph-ts` 0.35.1); JavaScript/ES2022 (frontend, Node for the sync script)

**Primary Dependencies**: The Graph — `@graphprotocol/graph-cli` 0.80.0, `@graphprotocol/graph-ts` 0.35.1, `matchstick-as` 0.6.0 (already in `subgraph/package.json`); React + Vite + Vitest (frontend, unchanged); `ethers` for the single per-transfer receipt call

**Storage**: The Graph store (subgraph entities); no new on-chain or backend storage. Report history remains `localStorage` (owned by spec 016)

**Testing**: Matchstick (`graph test`) for mapping handlers; Vitest for `reportDataSource` and any touched frontend consumers

**Target Platform**: The Graph hosted/Studio endpoint per network (one deployment per chain); frontend SPA on existing footprint (no backend — per [[no-backend-footprint]])

**Project Type**: Web app + off-chain indexer. No `contracts/` (Solidity) changes — read-only indexing of already-deployed v2 events

**Performance Goals**: Report generation issues **zero** open-ended log scans and **≤1** receipt call per transfer; a party's transfers are retrievable in a single GraphQL round trip ordered by time

**Constraints**: Per-network real address + deployment-block start (no `0x0`, no block 0); mappings must not call back into the contract (no revert risk, faster sync); network-scoped data only (no testnet/mainnet bleed); ABIs/addresses come from generated sync artifacts, never hand-copied (constitution V)

**Scale/Scope**: 4 networks; ~8 indexed v2 events; 1 new entity + 1 enum; 1 rewritten mapping file; 1 generated JSON ABI; sync-script + manifest/networks config; frontend report data-source rewrite plus query updates to the two other subgraph consumers (`SubgraphSource`, `useSiteStats`) so the v2 schema does not regress them

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passing.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)** — ✅ N/A to `contracts/`: no Solidity
  changes. This feature only *reads* already-deployed v2 events. No fund custody, access
  control, or oracle path is touched. Mappings deliberately avoid contract reads, so there is
  no new failure surface on-chain. (Slither/Medusa not applicable; no `contracts/` diff.)
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)** — ✅ Plan commits to Matchstick
  unit tests for every value-moving handler (deposit/payout/refund/draw/cancel, including the
  two-row draw/refund and cancel-before-accept edge cases) and Vitest coverage for the
  rewritten `reportDataSource` (zero-scan path, one-receipt-per-transfer). Tests land with the
  behavior, in the same PR.
- **III. Honest State, No Mocks or Placeholders (NON-NEGOTIABLE)** — ✅ This feature's *purpose*
  is to remove the placeholder (`0x0`, block 0) config and index real on-chain state per real
  network. Data stays network-scoped (one subgraph deployment per chain; report scoped to the
  active chain). `WagerTransfer` records reflect canonical chain state and are immutable. No
  mocks in shipped paths.
- **IV. Fail Loudly in CI** — ✅ Subgraph `graph codegen && graph build` and `graph test`, plus
  frontend Vitest, must run as failing gates (see Phase 1 / quickstart). No `continue-on-error`
  added. A CI step that builds the subgraph is added/confirmed (see research R8).
- **V. Accessible, Consistent Frontend** — ✅ No new UI (the report UI is owned by spec 016);
  changes are data-layer only. The subgraph's JSON ABI becomes a **generated** sync artifact
  (`npm run sync:frontend-contracts`), satisfying "config from generated artifacts, never
  hand-copied." `VITE_SUBGRAPH_URL` documented per network in `.env.example`; the deploy key is
  a secret kept in `.env` only.

**Additional constraints**: The Graph subgraph is the constitution's sanctioned indexer — no
new core technology introduced. Deployments artifacts remain the source of truth for addresses;
this plan extends them (or a derived `networks.json`) to also carry the per-network start block.

**Result**: PASS — no violations. Complexity Tracking section intentionally omitted (nothing to justify).

## Project Structure

### Documentation (this feature)

```text
specs/017-subgraph-v2-wager-transfers/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R8
├── data-model.md        # Phase 1 — subgraph entities (Wager v2, WagerTransfer, enums)
├── quickstart.md        # Phase 1 — build / deploy-per-network / validate guide
├── contracts/           # Phase 1 — interface contracts
│   ├── subgraph-schema.md      # GraphQL SDL: entities, enums, derived fields, indexed queries
│   ├── subgraph-manifest.md    # Per-network data source + event→handler mapping
│   └── report-data-source.md   # Frontend WagerTransfer query + reportDataSource method contract
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
subgraph/
├── subgraph.yaml            # REWRITE: WagerRegistry data source; per-network address/startBlock
│                            #   (template + networks.json, see research R2)
├── networks.json            # NEW: per-network { address, startBlock } sourced from deployments/
├── schema.graphql           # REWRITE: v2 Wager entity + WagerTransfer + TransferDirection enum
├── src/mappings/
│   ├── wagerRegistry.ts      # NEW (replaces factory.ts): v2 handlers emitting WagerTransfer rows
│   └── factory.ts            # REMOVE (legacy v1 FriendGroupMarketFactory mappings)
├── tests/
│   └── wagerRegistry.test.ts # NEW: Matchstick unit tests for each handler + edge cases
├── package.json             # scripts unchanged (codegen/build/test/deploy); description updated
└── README.md                # UPDATE: v2 contract, per-network deploy, WagerTransfer overview

frontend/
├── src/abis/WagerRegistry.json   # NEW (generated): JSON ABI emitted by the sync script
├── src/data/reports/reportDataSource.js  # REWRITE: source transfers from WagerTransfer;
│                                         #   drop bounded getWagerEvents scan; keep getTransactionReceipt
├── src/data/wagers/SubgraphSource.js     # UPDATE: MyWagers GraphQL query → v2 Wager fields
├── src/hooks/useSiteStats.js             # UPDATE: stats GraphQL query → v2 Wager fields
├── src/test/reports/reportDataSource.test.js  # UPDATE/EXTEND: zero-scan + one-receipt assertions
└── .env.example                          # ADD: VITE_SUBGRAPH_URL per network (documented)

scripts/utils/sync-frontend-contracts.js  # UPDATE: also emit frontend/src/abis/WagerRegistry.json
deployments/*-v2.json                      # UPDATE: record wagerRegistry deployBlock per network
.env.example                               # ADD: VITE_SUBGRAPH_URL note (root, if applicable)
```

**Structure Decision**: Off-chain indexer + web app. All work lands under `subgraph/`,
`frontend/src/data/` (+ two existing subgraph consumers), the `scripts/` sync utility, and the
`deployments/` records. No `contracts/` (Solidity) directory is touched. The legacy
`subgraph/src/mappings/factory.ts` is replaced by `wagerRegistry.ts`; the wager-level entity is
rewritten to v2 fields and a new immutable `WagerTransfer` entity is added.

## Key design decisions (detail in research.md)

1. **Amounts without amount-bearing events (R3)** — `WagerAccepted`, `WagerRefunded`,
   `WagerDrawn`, `WagerCancelled` emit no value. Record `creatorStake`/`opponentStake` on the
   `Wager` at `WagerCreated`; derive the opponent-deposit amount and all refund amounts from the
   stored wager. `WagerCreated` (creatorStake) and `PayoutClaimed` (amount) carry their amounts
   directly. No `try_*` contract calls anywhere → mappings cannot revert and sync faster.
2. **Escrow = contract address (R4)** — deposits go `party → event.address`; payouts/refunds go
   `event.address → party`, where `event.address` is the `WagerRegistry` that holds escrow.
3. **Transfer identity (R6)** — `id = event.transaction.hash.concatI32(event.logIndex.toI32())`
   so co-located transfers in one transaction stay distinct (FR-009).
4. **Two-row events (R7)** — `WagerDrawn`/`WagerRefunded` emit a refund row per party;
   `WagerCancelled` emits a single creator-refund row.
5. **Per-network config (R1, R2)** — `networks.json` carries each chain's address + startBlock
   (Polygon 137 startBlock = 88118344, already known in the frontend; Amoy/Mordor must be
   resolved from explorers; local 1337 from the local deployment). Built per network via
   `graph build --network <name>`.
6. **Backward compatibility (R5)** — the v2 `Wager` rewrite changes field names, so
   `SubgraphSource` and `useSiteStats` queries are updated to the v2 schema in this PR; My Wagers
   keeps its RPC fallback for any field the v2 schema does not yet provide (e.g. trading
   deadlines), which is treated as a known limitation, not regressed silently.

## Complexity Tracking

No constitution violations — section intentionally empty.
