# Quickstart: v2 WagerRegistry subgraph + per-transfer transaction records

Build / deploy-per-network / validate guide. Implementation details (handler bodies, full test
suites) belong in `tasks.md` and the implementation phase — this is a run/validation guide.

## Prerequisites

- Node + the repo installed (`npm install` at root; `cd subgraph && npm install`).
- The generated ABI exists: `npm run sync:frontend-contracts:polygon` (etc.) emits
  `frontend/src/abis/WagerRegistry.json` (the subgraph's `abis[].file`).
- `subgraph/networks.json` has a real `address` + non-zero `startBlock` for the target network
  (see [contracts/subgraph-manifest.md](./contracts/subgraph-manifest.md)). Polygon's startBlock
  is `88118344`; Amoy/Mordor must be resolved from their explorers before deploy.
- A Graph Studio (or hosted) deploy key, supplied via `graph auth` — never committed.

## 1. Build the subgraph

```bash
cd subgraph
npm run codegen          # graph codegen — regenerates AssemblyScript types from schema + ABI
npm run build            # graph build — compiles mappings to WASM (fails loudly on type errors)
npm test                 # graph test — Matchstick unit tests for the handlers
```

**Expected**: codegen produces `generated/schema.ts` + `generated/WagerRegistry/WagerRegistry.ts`;
build succeeds; Matchstick tests pass.

## 2. Deploy per network

```bash
# Build with the network's address/startBlock from networks.json, then deploy.
graph build --network polygon
npm run deploy:studio    # (or the per-network deploy target)
# repeat with --network polygon-amoy, --network mordor, --network <local>
```

**Expected**: each deployment indexes from the contract's deploy block (not genesis) and finishes
syncing without `block range exceeds configured limit` errors.

## 3. Validate indexing (per network)

Run against the deployed endpoint:

```graphql
query Probe($user: Bytes!) {
  wagers(first: 5, orderBy: createdAt, orderDirection: desc) {
    id creator opponent token creatorStake opponentStake status winner createdAt
  }
  wagerTransfers(where: { party: $user }, orderBy: timestamp, orderDirection: asc) {
    direction token amount from to txHash blockNumber timestamp wager { id status }
  }
}
```

**Expected (acceptance criteria):**
- **US1 / SC-001**: `wagers` returns live v2 wagers with correct creator/opponent/token/stakes
  and a status that tracks the lifecycle (where the legacy subgraph returned none).
- **US2 / SC-002, SC-003**: for an account that created → had accepted → resolved (or refunded)
  a wager, `wagerTransfers` returns one row per value movement — creator deposit, opponent
  deposit, payout/refund — each with a correct `direction`, `from`/`to`, `amount` (base units),
  `token`, `timestamp`, and a `txHash` that resolves on-chain. A draw/refund yields **two** rows
  (one per party); a cancel-before-accept yields **one** (creator).
- **SC-005**: confirm the deployed manifest shows a real address and non-zero `startBlock`.

## 4. Validate the report is RPC-light (frontend)

```bash
npm run test:frontend    # Vitest — includes reportDataSource zero-scan / one-receipt assertions
```

Then exercise the report manually with the network's `VITE_SUBGRAPH_URL` set:

```bash
# frontend/.env
VITE_SUBGRAPH_URL=https://api.studio.thegraph.com/query/<id>/prediction-dao-research/<ver>
VITE_WAGER_SOURCE=subgraph
```

Generate a report for an account with several wagers and watch network traffic
(DevTools → Network, or the provider logs):

**Expected (US3 / SC-004, SC-006):**
- **Zero** `eth_getLogs` / `queryFilter` requests.
- **At most one** `eth_getTransactionReceipt` per transfer (gas fee only).
- Line items and totals reconcile to the `WagerTransfer` rows.
- A period that previously failed with node range/rate-limit errors now completes.

## 5. No-subgraph fallback check (FR-016)

Unset `VITE_SUBGRAPH_URL` (or point at a network with no deployment) and request a report:

**Expected**: a clear "index required for this network" message, or the retained #703 bounded
scan — **never** an unbounded scan or a silent flood.

## Definition of done (maps to spec acceptance criteria)

- [ ] Subgraph builds, tests pass, and deploys against v2 `WagerRegistry` with real per-network
      address + non-zero `startBlock` on every supported network (SC-005).
- [ ] Each deposit/payout/refund yields a `WagerTransfer` with correct `txHash`, `from`/`to`,
      `amount`, `token`, `direction`, `timestamp` (SC-002).
- [ ] `wagerTransfers(where:{party})` returns a user's transfers across create/accept/payout/
      refund, time-ordered (SC-003).
- [ ] Report enumerates + builds from the subgraph with zero `eth_getLogs`, one receipt per
      transfer (SC-004), and completes where it previously failed (SC-006).
- [ ] `VITE_SUBGRAPH_URL` documented per network in `.env.example` (FR-017).
- [ ] `SubgraphSource.js` + `useSiteStats.js` migrated to v2 fields; My Wagers RPC fallback intact.
