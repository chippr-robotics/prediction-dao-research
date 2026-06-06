# Contract: Subgraph delta for Draw (conditional)

**Gate first**: confirm whether the deployed subgraph indexes `WagerRegistry` (`Wager*` events) or a `ConditionalMarketFactory` (`Market*` events). The current mappings (`subgraph/src/mappings/factory.ts`) handle `Market*` events, so the subgraph may not track `WagerRegistry` at all. If it does not, **this entire slice is out of scope** — draw state is read directly from chain via `getUserWagers`/`getUserWagerIds`, and no subgraph change ships. Only apply the deltas below if `WagerRegistry` is an indexed datasource.

## schema.graphql

```graphql
enum WagerStatus {
  pending_acceptance
  active
  pending_resolution
  challenged
  resolved
  cancelled
  refunded
  draw            # NEW
  oracle_timed_out
}

type Wager @entity {
  # ...existing...
  status: WagerStatus!
  winner: Bytes          # null on a draw
  isDraw: Boolean        # NEW — true when settled as a draw
  drawnAt: BigInt        # NEW — block timestamp of the draw
}
```

## subgraph.yaml

Add a handler under the `WagerRegistry` datasource `eventHandlers`:

```yaml
- event: WagerDrawn(indexed uint256,indexed address,indexed address,address)
  handler: handleWagerDrawn
# (optionally) DrawProposed / DrawRevoked if pending-state indexing is wanted
```

Datasource `address` for the v3 registry; `startBlock` = v3 deploy block.

## mappings

```ts
export function handleWagerDrawn(event: WagerDrawn): void {
  let w = Wager.load(event.params.wagerId.toString())
  if (w == null) return
  w.status = 'draw'
  w.isDraw = true
  w.winner = null
  w.drawnAt = event.block.timestamp
  w.save()
}
```

Also add `'draw'` at index 6 of any numeric-status → string array so other handlers decode it consistently.

## Behavioral contract

- A drawn wager has `status == 'draw'`, `isDraw == true`, `winner == null`, `drawnAt` set — queryable as distinct from `refunded` and `resolved`.
