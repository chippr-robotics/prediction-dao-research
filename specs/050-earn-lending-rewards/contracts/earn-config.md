# Contract: per-network earn configuration (`frontend/src/config/networks.js`)

The earn capability follows the `dex` precedent: a per-network config block whose presence flips
the capability, resolved strictly per-chain (no cross-network leakage).

## Shape

```js
// On NETWORKS[1] and NETWORKS[137] only (Morpho + Morpho API coverage — research.md R2):
earn: {
  // Attribution identity (mandated by Morpho's integration terms) + outbound link.
  provider: { name: 'Morpho', url: 'https://app.morpho.org' },
  // Canonical Merkl Distributor (same address on all supported chains). Config-fixed;
  // never derived from user input or API responses.
  merklDistributor: '0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae',
  // Where members claim pre-MIP-111 legacy rewards (we link out, never re-implement).
  legacyRewardsUrl: 'https://rewards-legacy.morpho.org/',
},
get capabilities() {
  return {
    ...,
    earn: Boolean(this.earn),
  }
},
```

## Helpers (exported from networks.js)

```js
isEarnAvailable(chainId)  // Boolean(getNetwork(chainId)?.earn)
getEarnConfig(chainId)    // the block above, or null
getEarnNetworks()         // NETWORKS entries with earn — names used by honest unavailable copy
```

## Global constants (`frontend/src/config/earn.js`)

```js
MORPHO_API_URL = 'https://api.morpho.org/graphql'
MERKL_API_URL = 'https://api.merkl.xyz/v4'
VAULT_LIST_LIMIT      // cap on curated vaults surfaced per chain (TVL-ordered)
POSITIONS_POLL_MS     // 60_000, aligned with usePortfolio
earnPath({ view, chainId, tokenSymbol })  // builds /wallet?tab=earn&… deep links
```

## Rules

- Networks WITHOUT an `earn` block MUST render the honest unavailable state naming
  `getEarnNetworks()` — never a mock list, never a hidden tab (nav item is always present).
- Adding a network later (e.g. Base 8453) = one `earn` block + Morpho API chain support check;
  no component changes (spec FR-008).
- Env overrides are not needed for v1 (all values are public canonical constants); introducing
  per-env overrides later must keep the "missing value ⇒ capability off" gating rule.
