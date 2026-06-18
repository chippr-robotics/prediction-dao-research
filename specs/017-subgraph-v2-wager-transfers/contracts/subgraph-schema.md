# Contract: Subgraph GraphQL Schema (`subgraph/schema.graphql`)

The public interface the frontend queries. Entities and enums below are the SDL contract;
field types are GraphQL/Graph scalar types. See [data-model.md](../data-model.md) for sources.

## SDL

```graphql
enum TransferDirection {
  deposit
  payout
  refund
}

enum WagerStatus {
  open
  active
  draw_proposed
  resolved
  drawn
  refunded
  cancelled
  declined
}

type Wager @entity(immutable: false) {
  "on-chain wager id"
  id: ID!

  creator: Bytes!
  opponent: Bytes!
  token: Bytes!

  "stakes in token base units, recorded at creation to derive refund/accept amounts"
  creatorStake: BigInt!
  opponentStake: BigInt!

  resolutionType: Int!
  metadataUri: String
  metadataHash: Bytes

  status: WagerStatus!
  winner: Bytes

  createdAt: BigInt!
  resolvedAt: BigInt

  "reverse relation — not stored"
  transfers: [WagerTransfer!]! @derivedFrom(field: "wager")
}

type WagerTransfer @entity(immutable: true) {
  "txHash-logIndex"
  id: ID!
  wager: Wager!
  "the user whose value moved"
  party: Bytes!
  direction: TransferDirection!
  token: Bytes!
  "base units"
  amount: BigInt!
  "party (deposit) or escrow registry (payout/refund)"
  from: Bytes!
  "escrow registry (deposit) or party (payout/refund)"
  to: Bytes!
  "event.transaction.hash — the key addition that removes the client log scan"
  txHash: Bytes!
  blockNumber: BigInt!
  "event.block.timestamp (unix seconds)"
  timestamp: BigInt!
}
```

## Query contract (consumers MUST be able to run)

```graphql
# Report enumeration — a party's transfers, time-ordered (FR-010, SC-003)
query PartyTransfers($user: Bytes!, $first: Int!, $skip: Int!) {
  wagerTransfers(
    where: { party: $user }
    orderBy: timestamp
    orderDirection: asc
    first: $first
    skip: $skip
  ) {
    id
    direction
    token
    amount
    from
    to
    txHash
    blockNumber
    timestamp
    wager { id status winner }
  }
}

# Wager's transfers (FR-011)
query WagerWithTransfers($id: ID!) {
  wager(id: $id) {
    id creator opponent token creatorStake opponentStake status winner createdAt resolvedAt
    transfers { id party direction amount txHash timestamp }
  }
}
```

## Compatibility note

The pre-existing `MyWagers` (`SubgraphSource.js`) and `SiteStats` (`useSiteStats.js`) queries
target v1 field names (`marketType`, `participants`, `stakePerParticipant`, `stakeToken`,
`endTime`, `metadataCipher`, `description`). They MUST be migrated to the v2 fields above
(`creator`/`opponent`/`token`/`creatorStake`/`opponentStake`/`status`/`createdAt`/
`resolutionType`). Fields with no v2 source (trading/resolution deadlines, `endTime`) are not
provided by this schema; My Wagers keeps RPC fallback for those (research R5).
