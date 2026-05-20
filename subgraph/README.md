# Wagers Subgraph

Indexes the `FriendGroupMarketFactory` contract for The Graph's decentralized
network. The frontend's `WagerRepository` (in
`frontend/src/data/wagers/SubgraphSource.js`) queries this subgraph to
power the paginated "My Wagers" view at scale.

## Why this exists

Direct on-chain event scanning works for tens of wagers, not for millions.
This subgraph indexes once on the server and lets the client paginate by
the `createdAt`, `endTime`, `resolutionType`, or `status` fields directly
in GraphQL `where` / `orderBy` clauses — so each page is a single network
round trip regardless of how much history a user has.

## Setup (development — public Graph Network)

1. `cd subgraph && yarn install`
2. Edit `subgraph.yaml`:
   - Set `dataSources[0].source.address` to the deployed
     `FriendGroupMarketFactory` address (see
     `deployments/<network>/FriendGroupMarketFactory.json`).
   - Set `startBlock` to the contract's deployment block.
3. Generate ABIs JSON from the JS export if needed:
   `node -e 'console.log(JSON.stringify(require("../frontend/src/abis/FriendGroupMarketFactory.js").FRIEND_GROUP_MARKET_FACTORY_ABI, null, 2))' > ../frontend/src/abis/FriendGroupMarketFactory.json`
4. `yarn codegen && yarn build`
5. Authenticate the Graph CLI: `graph auth <DEPLOY_KEY>` (from
   [The Graph Studio](https://thegraph.com/studio/)).
6. `yarn deploy:studio` — version label e.g. `v0.1.0`.

The studio URL is the value to set in
`frontend/.env`:

```
VITE_SUBGRAPH_URL=https://api.studio.thegraph.com/query/<id>/prediction-dao-research/v0.1.0
VITE_WAGER_SOURCE=subgraph
```

When `VITE_SUBGRAPH_URL` is unset or the subgraph is unreachable, the
client automatically falls back to `EventsSource` (direct RPC scanning).

## Future: hosted/dedicated graph

The repository interface (`WagerSource`) is identical for any indexer.
Swapping to a hosted (centralized) graph, Goldsky, Envio, or Ponder is a
new file in `frontend/src/data/wagers/` implementing the same three
methods (`syncIndex`, `listPage`, `getById`) — no UI changes required.
