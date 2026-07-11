# Contract: Morpho GraphQL consumption (`frontend/src/lib/earn/morphoApi.js`)

Endpoint: `POST https://api.morpho.org/graphql` (public, no auth; 750 req/min — we issue a handful
per session). All queries filter by the active `chainId`; responses are normalized into the
`Vault` / position-enrichment shapes in [data-model.md](../data-model.md).

## Vault list (curated)

```graphql
query EarnVaults($chainIds: [Int!]!, $first: Int!) {
  vaults(
    first: $first
    orderBy: TotalAssetsUsd
    orderDirection: Desc
    where: { chainId_in: $chainIds, whitelisted: true }
  ) {
    items {
      address symbol name listed whitelisted
      state {
        totalAssetsUsd apy netApy curator
        allRewards { asset { address symbol } supplyApr }
      }
      asset { name address decimals symbol }
      chain { id }
    }
  }
}
```

Normalizer rules:
- Drop items with `listed !== true` or `chain.id !== chainId` (defense against API drift).
- `netApy`/`apy`/`totalAssetsUsd` may be null → keep null (render "—"), never 0.
- Order preserved (TVL desc), capped at `VAULT_LIST_LIMIT`.

## Position enrichment (USD value + earnings)

```graphql
query EarnPositions($address: String!, $chainId: Int!) {
  userByAddress(address: $address, chainId: $chainId) {
    vaultPositions {
      vault { address }
      state { shares assets assetsUsd pnlUsd }
    }
  }
}
```

- Enrichment only: the authoritative "member has a position" signal is the on-chain
  `balanceOf`/`convertToAssets` read. A missing/failed enrichment degrades to on-chain values with
  USD/pnl rendered "—" (honest), position still shown.
- Unknown user (never deposited) returns null user — treated as empty enrichment, not an error.

## Failure contract

- Network/HTTP/GraphQL-errors ⇒ throw a typed `MorphoApiError`; hooks map it to status
  `unavailable`. Components MUST show the explicit unavailable state and disable deposit entry
  points; they MUST NOT render cached numbers as current or substitute zeros.
- No retries beyond one immediate retry; manual refresh affordance instead (rate-limit courtesy).
