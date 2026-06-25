# Contract: Per-Network Token-List Config (`networks.js`)

**Type**: Config surface added to `frontend/src/config/networks.js` (the established
source-of-truth; never hardcode addresses/URLs in components — Constitution V).

---

## Per-network field `tokenList`

Added to each `NETWORKS[chainId]` entry, alongside `stablecoin` and `dexProvider`, following
the same `import.meta.env?.VITE_* || default` precedent (`networks.js:55-60`, `:194-198`).

```text
tokenList: {
  sourceType: 'remote' | 'custom-only',
  url: string | null,
  seed: TokenInfo[]            // tiny in-repo fallback / Amoy catalog
}
```

| chainId | sourceType | url (env override) | seed |
|--------:|-----------|--------------------|------|
| 137 | `remote` | `https://tokens.uniswap.org` (`VITE_TOKENLIST_URL_POLYGON`) | `[USDC]` |
| 61 | `remote` | `https://raw.githubusercontent.com/etcswap/tokens/main/ethereum-classic/all.json` (`VITE_TOKENLIST_URL_ETC`) | `[WETC, USC]` |
| 63 | `remote` | same ETCswap list (`VITE_TOKENLIST_URL_MORDOR`) | `[WETC, USC]` |
| 80002 | `custom-only` | `null` | `[USDC, WMATIC]` |
| 1337 | `custom-only` | `null` | `[]` |

Seed token addresses reuse the constants already in `networks.js` (Amoy USDC `0x41E94…7582`,
ETC/Mordor WETC `0x1953…7a5a` / USC `0xDE09…c52a`) so the seed contains **only real, already-
trusted addresses** (Honest-State; no mock data in a shipped path).

## Exported helper

```text
getTokenListSource(chainId): TokenListSource | null   // mirrors getSubgraphUrl/getDexProvider
  // → NETWORKS[chainId]?.tokenList ?? null
```

## `.env.example`

Add a documented block:

```text
# Token watchlist catalog sources (spec 034) — override the pinned defaults if needed
VITE_TOKENLIST_URL_POLYGON=
VITE_TOKENLIST_URL_ETC=
VITE_TOKENLIST_URL_MORDOR=
```

**Note**: Amoy (80002) and Hardhat (1337) intentionally have **no** URL — they are
custom-add-only; the UI must state honestly that no curated catalog exists there (FR-017),
never imply one. Hardhat additionally hides the feature (no membership manager).
