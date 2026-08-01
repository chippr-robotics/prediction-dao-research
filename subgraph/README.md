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

Addresses + start blocks live in [`networks.json`](./networks.json). Never `0x0` /
`startBlock: 0` — indexing from genesis is what caused the RPC issue this work removed.
**Never a placeholder address either**: a sentinel like `0x…0034` indexes nothing forever
and does it with a 200 and no errors, which is indistinguishable from a truthful empty
result. `frontend/src/test/subgraphNetworksParity.test.js` fails the build on both.

Use The Graph's **canonical** network ids (Studio rejects aliases): Polygon mainnet is
`matic` (not `polygon`); Amoy is `polygon-amoy`.

### `graph build --network <net>` requires EVERY data source (graph-cli 0.80)

The CLI does **not** defer a data source that is missing from the network config — it
fails the build:

```
✖ Failed to update sources network: 'TokenFactory' was not found in the 'polygon-amoy'
  configuration, please update!
```

So a network is buildable only when `networks.json` names all eight data sources.
**Today only `matic` is.** `--network mordor` fails on the oracle adapters and
`--network polygon-amoy` fails on `TokenFactory`; both were already true before the
2026-08-01 Polygon redeploy. Note `graph build --network <net>` also REWRITES
`subgraph.yaml` in place (network, address, startBlock) and strips its comments — the
checked-in manifest therefore reflects whichever network was built last, currently
`matic`, and durable guidance belongs in this README rather than in the manifest.

### Where each network stands (measured 2026-08-01)

| Network | chainId | Graph deployment | Buildable | Notes |
|---|--:|---|---|---|
| `matic` (Polygon) | 137 | `fairwins-polygon` **v0.3.0** | yes | all 8 data sources |
| `mordor` | 63 | **none, and none planned** | no (adapters) | `subgraphUrl` is null; the app reads over RPC |
| `polygon-amoy` | 80002 | `fairwins-amoy` v0.3.0 | no (TokenFactory) | no `WagerPoolFactory` exists on Amoy |

**Mordor and Ethereum Classic have no subgraph and are not getting one.** The `mordor`
block in `networks.json` is build config for a self-hosted node only; nothing the app
reads is served from it. Consumers must degrade honestly there — see
`frontend/src/components/tokens/tokenSubgraph.js` for the three-outcome pattern
(`no-subgraph` / `not-indexed` / `unreachable`).

### Start blocks are MEASURED, not reported

Polygon's blocks were bisected with `eth_getCode` against an archive node rather than
taken from a deploy script's report. The two disagreed by up to ten blocks, and a
recorded block LATER than the real creation silently drops every event in between
(`membershipVoucher` was reported ten blocks late). The `wagerRegistry` bisection matched
its recorded value exactly, which is what validates the rest.

| matic data source | address | startBlock |
|---|---|--:|
| `WagerRegistry` | `0xE878b628…` | 89717915 |
| `MembershipVoucher` | `0xCB28DC43…` | 89717905 |
| `MembershipManager` | `0xEfd1a880…` | 89717895 |
| `TokenFactory` | `0x5806e76c…` | 89717942 |
| `WagerPoolFactory` | `0x420aEC3c…` | 89720740 |
| `ChainlinkDataFeedOracleAdapter` | `0x7ae8220D…` | 87937162 |
| `ChainlinkFunctionsOracleAdapter` | `0x148C2E34…` | 87937176 |
| `UMAOptimisticOracleV3Adapter` | `0x8224433d…` | 87937184 |

### Why v0.2.0 was replaced

`matic` indexed WagerRegistry `0x5023765809…` — the abandoned **pre-UUPS** registry
(`nextWagerId() == 1`, no wager ever created) — while the app reads `0xE878b628…`
(`nextWagerId() == 3`). The subgraph answered every Polygon wager query with an empty
list: HTTP 200, no GraphQL errors, `hasIndexingErrors: false`, minutes behind head. The
Account dashboard told members with live wagers "No activity yet", and the tax report
omitted every Polygon wager with no coverage note.

**No client-side defence can catch that** — a well-formed `{"data":{"wagers":[]}}` is
byte-identical to a truthful zero. The only place the two are distinguishable is this
config, which is why the parity test above compares every address and start block
against `frontend/src/config/contracts.js`.

## Build, test, deploy

```sh
cd subgraph && npm install

# 1. Generate the JSON ABIs the manifest consumes (generated artifacts, never hand-copied):
npm --prefix .. run sync:frontend-contracts:polygon   # emits ../frontend/src/abis/{WagerRegistry,MembershipVoucher,MembershipManager}.json

# 2. Codegen + build + unit tests:
npm run codegen
npm run build            # builds subgraph.yaml AS CHECKED IN (currently matic)
                         # NOTE: `--network <net>` rewrites subgraph.yaml in place and strips
                         # its comments. Restore afterwards: git checkout -- subgraph.yaml
npm test                 # Matchstick (graph test). On platforms whose prebuilt
                         # binary is unsupported, run: npx graph test -d  (Docker)

# 3. Deploy (Graph Studio). One subgraph per network; the slug differs per network.
#    The deploy key lives in the repo-root .env as GRAPH_DEPLOY (NOT GRAPH_API_KEY,
#    which is a query key) — secret, never committed.
KEY=$(grep '^GRAPH_DEPLOY=' ../.env | cut -d= -f2-)

# Polygon mainnet (matic, 137) — the live deployment, all 8 data sources:
npx graph build --network matic
npx graph deploy fairwins-polygon --node https://api.studio.thegraph.com/deploy/ \
    --deploy-key "$KEY" --version-label v0.3.0
# Do NOT pass --ipfs: the Studio node supplies its own. Passing an unrelated
# gateway fails with "Failed to upload file to IPFS: fetch failed".

# Amoy (80002): NOT currently buildable — networks.json has no TokenFactory entry
# and the CLI refuses to defer it. Add one (or drop the data source) first.
# Mordor (63): no Studio support and no deployment, by decision. `build:mordor`
# is for a self-hosted graph-node only, and also fails today (no oracle adapters).
```

**After deploying, wait for the new version to reach chain head before pointing the app
at it.** A syncing subgraph answers with partial data and no error, which is the same
class of silent wrongness the redeploy was fixing — check
`{ _meta { block { number } hasIndexingErrors } }` against the chain head, then bump
`subgraphUrl` in `frontend/src/config/networks.js`.

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
- **Pool / PoolMember / PoolProposal / PoolPayoutEntry / PoolApproval / PoolClaim
  / PoolRefund / PoolAllowedToken** (spec 034, Group Wager Pools — the
  ZK/Semaphore design was removed) — a **public**, address-based parallel system.
  The `WagerPoolFactory` UUPS proxy (`wagerPoolFactory.ts`) indexes `PoolCreated`
  into a `Pool` (keyed by clone address) and spins up a **`WagerPool` template**
  data source per immutable ERC-1167 clone; `TokenAllowed` → `PoolAllowedToken`.
  The per-pool template (`wagerPool.ts`) indexes joins (`PoolMember`, by public
  wallet), the creator's proposed payout matrix (`PoolProposal` with parallel
  `winners`/`amounts` arrays **and** per-winner `PoolPayoutEntry` children so the
  resolved split is fully queryable), member approvals (`PoolApproval`), `PoolClaim`,
  `PoolRefund`, and the lifecycle state (`JoiningOpen→JoiningClosed→Resolved` /
  `Cancelled`, mirroring the on-chain `PoolState` enum). No anonymity primitive,
  nullifier or commitment; the winner's wallet address **is** the claim code.
  Two-word/BIP-39 nicknames are **client-side only** — only the language-
  independent integer `wordIndices` are stored (FR-009). ABIs are vendored in
  [`abis/`](./abis/) (from the `WagerPoolFactory`/`WagerPool` artifacts). Handlers
  make no contract calls. **Studio note:** Studio does **not** support Mordor/ETC,
  so the Studio subgraph realistically targets `matic` (with `polygon-amoy` for
  indexing validation); Mordor needs a self-hosted graph-node. Real factory
  addresses + deploy blocks are **TODO-on-deploy** placeholders in
  `networks.json` (sentinel `0x…0034`, non-genesis startBlock — never `0x0`/`0`).

See `schema.graphql`, `specs/017-subgraph-v2-wager-transfers/` and
`specs/034-zk-wager-pools/` for the full contract.

## Fallback

When `VITE_SUBGRAPH_URL` is unset or unreachable for a network, the frontend
degrades gracefully: the report uses a bounded per-wager log scan (#703) and the
wager list falls back to `EventsSource` (direct RPC).
