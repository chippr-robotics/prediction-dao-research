# Contract: My Wagers Aggregation

Consolidates wagers, open challenges, and pools into the existing My Wagers view (FR-015–019, 024).

## Module: `lib/lookup/myWagersAggregation.js`

```
aggregateMyItems(sources: {
  wagers: FriendMarket[],                 // from FriendMarketsContext (existing)
  createdChallenges: SubgraphWager[],     // Wager(creator=account, status=open)
  deviceChallenges: VaultEntry[],         // useOpenChallengeCodeVault.recoverCodes()
  createdPools: SubgraphPool[],           // Pool(creator=account)
  joinedPools: SubgraphPool[],            // Pool ∩ PoolJoin reconciled w/ own commitment
}, account: string): MyWagersItem[]
```

### `MyWagersItem`
```
{ type: 'wager'|'challenge'|'pool',
  id: string,                    // on-chain id/address
  title?: string, status: string,
  bucket: 'active'|'history',
  source: 'context'|'subgraph'|'device',
  route: string }
```

### Rules (MUST)
- **Union then de-dup** by (`type`,`id`). On conflict prefer `context`/`subgraph` over `device`
  (richer/authoritative), so a device-vault challenge that is also on-chain shows once.
- **Bucketing**: terminal statuses → `history` (wager RESOLVED/CANCELLED/REFUNDED/DRAWN; challenge
  accepted-elsewhere/expired/cancelled; pool state Resolved/Cancelled); else `active` (FR-017).
- **Type indicator + status** present on every item (FR-016).
- **Empty/absent types** MUST NOT error; a user with no challenges/pools sees today's wager-only
  view unchanged (FR-019).
- **Device-scoped provenance**: items whose only source is `device`/identity-derived are flagged so
  the UI can note they may not appear on another device (FR-024).
- **Network scoping**: all subgraph/on-chain reads scoped to the active network (Constitution III).

## Data sources (existing; no schema change)
| Item | Source | Reference |
|------|--------|-----------|
| Wagers | `FriendMarketsContext` / `useFriendMarkets` (30s refetch) | `MyMarketsModal.jsx:43-70` |
| Created open challenges | subgraph `Wager(creator, status=open, opponent=0x0)` | `schema.graphql:41-71`; `wagerRegistry.ts:96-127` |
| Device-only challenges | `useOpenChallengeCodeVault.recoverCodes()` | `useOpenChallengeCodeVault.js:21-78` |
| Created pools | subgraph `Pool(creator)` | `schema.graphql:244-272` |
| Joined pools | subgraph `Pool`+`PoolJoin` ∩ `usePools.getMemberCommitments` | `schema.graphql:274-282`; `usePools.js` |

## UI (`MyMarketsModal.jsx`)
- Extend tab/section rendering to include `challenge` and `pool` items alongside wagers, using the
  existing sort/status controls (`:914-945`) across all types (FR-017).
- Selecting an item routes by `type` to the correct surface (wager detail/resolution; challenge
  take/resolve; pool page) — FR-018.
- Accept-tab labels/statuses reflect real state (Constitution III — honest finality).

## Acceptance mapping
US2 AS1 (all three types listed), AS2 (active/history grouping), AS3 (routes), AS4 (no challenges/pools → unchanged).
