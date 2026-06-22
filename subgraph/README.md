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
`deployments/<net>-v2.json` (`deployBlocks.*`). Never `0x0` / `startBlock: 0`
— indexing from genesis is what caused the RPC issue this work removes.

Use The Graph's **canonical** network ids (Studio rejects aliases): Polygon
mainnet is `matic` (not `polygon`); Amoy is `polygon-amoy`.

The manifest's inline defaults target **`polygon-amoy`** — the membership voucher
feature (spec 026) is live on Amoy + Mordor only, so a bare `graph build` produces
a valid, fully-featured subgraph. `matic` carries `WagerRegistry` only until the
voucher + redemption manager ship to mainnet, so `graph build --network matic`
fails by design (`'MembershipVoucher' was not found in the 'matic' configuration`).

| Network (manifest id) | chainId | WagerRegistry | MembershipVoucher | MembershipManager | Oracle adapters¹ |
|-----------------------|--------:|--------------:|------------------:|------------------:|-----------------:|
| matic (Polygon mainnet) | 137 | 88118344 | — (deferred) | — (deferred) | — (deferred) |
| mordor | 63 | 16404317 | 16404315 | 16404308 | n/a (no adapters) |
| polygon-amoy | 80002 | 40521027 | 40521024 | 40521018 | 38841810 / 38841814 / 38841817 |

¹ **Oracle adapters** (issue #751): `ChainlinkDataFeedOracleAdapter`,
`ChainlinkFunctionsOracleAdapter`, `UMAOptimisticOracleV3Adapter`, indexed into
`OracleCondition` + `OracleMarketLink`. They are deployed on Amoy + Polygon
mainnet only — **Mordor has no oracle adapters** (oracle resolution is out of
scope on ETC per spec 015), so `graph build --network mordor` does not carry
these data sources. On `matic` they are deferred alongside the voucher/manager
until the mainnet UUPS migration lands.

## Build, test, deploy

```sh
cd subgraph && npm install

# 1. Generate the JSON ABIs the manifest consumes (generated artifacts, never hand-copied):
npm --prefix .. run sync:frontend-contracts:polygon   # emits ../frontend/src/abis/{WagerRegistry,MembershipVoucher,MembershipManager}.json

# 2. Codegen + build + unit tests:
npm run codegen
npm run build            # default = polygon-amoy. Other nets: graph build --network <mordor|matic>
                         # NOTE: `--network <net>` rewrites subgraph.yaml in place (and strips
                         # comments). Restore it afterwards: git checkout -- subgraph.yaml
npm test                 # Matchstick (graph test). On platforms whose prebuilt
                         # binary is unsupported, run: npx graph test -d  (Docker)

# 3. Deploy one subgraph per network (Graph Studio). The Studio slug differs per
#    network; build+deploy in one step with --network (reads networks.json):
graph auth <DEPLOY_KEY>  # secret — keep in local .env, never commit
graph deploy fairwins-amoy    --studio --network polygon-amoy -l <ver>   # Amoy testnet (80002) — wagers + vouchers
# Polygon mainnet (matic, 137): wagers only until the voucher + redemption manager
# ship to mainnet (add their matic entries to networks.json first):
graph deploy fairwins-polygon --studio --network matic        -l <ver>
# Mordor (63) is not supported by Studio -> no subgraph; the frontend uses the
# bounded RPC fallback for it (research R2). `npm run build:mordor` is for a
# self-hosted graph-node only.
```

Set the resulting endpoint as `VITE_SUBGRAPH_URL` (per network) in the frontend
`.env`; see `frontend/.env.example`.

## Entities

- **Wager** — identity, both parties, per-side stakes, lifecycle status, winner,
  createdAt/resolvedAt. Stakes are stored at creation so refund/accept transfers
  derive amounts without contract reads. `drawProposer` carries the open-draw
  proposer while `status == draw_proposed` (cleared on revoke), so the wager
  watcher can surface draw proposals without an `eth_getLogs` scan.
- **WagerTransfer** (immutable) — one row per value movement, keyed by
  `txHash-logIndex-party` (unique even when one log refunds two parties).
- **Voucher** (spec 026) — a transferable membership voucher NFT and its
  lifecycle. Created `held` on `VoucherMinted`, ownership tracked across
  gifts/resales via ERC-721 `Transfer`, and flipped to `redeemed` (or `burned`)
  when `MembershipManager.MembershipRedeemed` fires. On-chain/public by nature;
  no contract calls in the handlers.
- **OracleCondition** (issue #751) — an outcome condition pre-registered with an
  oracle adapter, keyed by `<adapterType>-<conditionId>`. Upserted on
  `ConditionRegistered`, flipped to `resolved` (with `outcome`/`confidence`) on
  `ConditionResolved`. Lets the create-wager flow list available conditions per
  adapter without an `eth_getLogs` scan.
- **OracleMarketLink** (immutable, issue #751) — one row per `MarketLinked`,
  associating a `marketId` with an `OracleCondition`. The three adapter handlers
  (`oracleAdapters.ts`) make no contract calls.

See `schema.graphql` and `specs/017-subgraph-v2-wager-transfers/` for the full
contract.

## Fallback

When `VITE_SUBGRAPH_URL` is unset or unreachable for a network, the frontend
degrades gracefully: the report uses a bounded per-wager log scan (#703) and the
wager list falls back to `EventsSource` (direct RPC).
