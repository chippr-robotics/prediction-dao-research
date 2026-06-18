# Wagers Subgraph (v2 WagerRegistry)

Indexes the **v2 `WagerRegistry`** contract for The Graph. Powers three things in
the frontend:

1. the paginated "My Wagers" list (`SubgraphSource`),
2. the landing-page stats band (`useSiteStats`), and
3. the **tax/activity report** (spec 016) — via the `WagerTransfer` entity below.

## Why `WagerTransfer` matters (spec 017 / issue #704)

Each value-moving event (creator deposit, opponent deposit, payout, refund) is
recorded as one immutable `WagerTransfer` row carrying its **transaction hash**,
party, direction, token, amount, from/to, block, and timestamp. The report reads
a user's transfers straight from the index (`wagerTransfers(where: { party })`)
and then fetches **exactly one transaction receipt per transfer** for the gas fee
— it never scans chain logs (`eth_getLogs`), which previously flooded public RPCs
(issue #703).

Transfer amounts come from the event payload (`creatorStake`, `PayoutClaimed.amount`)
or from the stakes recorded on the `Wager` at creation (opponent deposit, refunds) —
**the mappings make no contract calls**, so a handler can never revert.

## Per-network config (no genesis indexing)

Addresses + start blocks live in [`networks.json`](./networks.json), sourced from
`deployments/<net>-v2.json` (`deployBlocks.wagerRegistry`). Never `0x0` / `startBlock: 0`
— indexing from genesis is what caused the RPC issue this work removes.

| Network | chainId | startBlock |
|---------|--------:|-----------:|
| polygon | 137 | 88118344 |
| mordor | 63 | 16376172 |
| polygon-amoy | 80002 | **resolve from explorer before deploy** (needs `ETHERSCAN_API_KEY`) |

## Build, test, deploy

```sh
cd subgraph && npm install

# 1. Generate the JSON ABI the manifest consumes (generated artifact, never hand-copied):
npm --prefix .. run sync:frontend-contracts:polygon   # emits ../frontend/src/abis/WagerRegistry.json

# 2. Codegen + build + unit tests:
npm run codegen
npm run build            # or: graph build --network <polygon|mordor|polygon-amoy>
npm test                 # Matchstick (graph test). On platforms whose prebuilt
                         # binary is unsupported, run: npx graph test -d  (Docker)

# 3. Deploy one subgraph per network (Graph Studio):
graph auth <DEPLOY_KEY>  # secret — keep in local .env, never commit
graph build --network polygon
npm run deploy:studio
```

Set the resulting endpoint as `VITE_SUBGRAPH_URL` (per network) in the frontend
`.env`; see `frontend/.env.example`.

## Entities

- **Wager** — identity, both parties, per-side stakes, lifecycle status, winner,
  createdAt/resolvedAt. Stakes are stored at creation so refund/accept transfers
  derive amounts without contract reads.
- **WagerTransfer** (immutable) — one row per value movement, keyed by
  `txHash-logIndex-party` (unique even when one log refunds two parties).

See `schema.graphql` and `specs/017-subgraph-v2-wager-transfers/` for the full
contract.

## Fallback

When `VITE_SUBGRAPH_URL` is unset or unreachable for a network, the frontend
degrades gracefully: the report uses a bounded per-wager log scan (#703) and the
wager list falls back to `EventsSource` (direct RPC).
