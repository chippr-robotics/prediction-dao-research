# Contract: Supported-Stablecoin Config & Helpers

Front-end config contract for the curated, network-scoped supported-stablecoin set. No new Solidity. Source of truth for **presentation/enumeration**; the on-chain `WagerRegistry` allow-list remains the **enforcement** layer.

## Config shape — `frontend/src/config/networks.js`

Each network entry keeps its existing `stablecoin` (default) and gains a `stablecoins` array:

```js
// chain 137 (Polygon) — illustrative; addresses verified on-chain at seed time
stablecoin: { address: '0x3c49…', symbol: 'USDC', name: 'USD Coin', decimals: 6 }, // unchanged default
stablecoins: [
  { address: '0x3c49…', symbol: 'USDC', name: 'USD Coin', decimals: 6, peg: 'USD',
    isDefault: true,  issuer: 'Circle', complianceBasis: 'GENIUS: permitted US issuer', standardErc20: true },
  { address: '0xc2132…', symbol: 'USDT', name: 'Tether USD', decimals: 6, peg: 'USD',
    isDefault: false, issuer: 'Tether', complianceBasis: 'GENIUS: pending issuer sign-off', standardErc20: true },
  { address: '0x…EURC', symbol: 'EURC', name: 'Euro Coin', decimals: 6, peg: 'EUR',
    isDefault: false, issuer: 'Circle', complianceBasis: 'GENIUS: comparable-regime non-USD', standardErc20: true },
],
```

- Testnets (Amoy 80002, Mordor 63) keep their single existing stablecoin as both `stablecoin` and the sole `stablecoins` entry unless additional test tokens are configured. Hardhat (1337) stays `null`.
- `VITE_*` env overrides continue to apply to addresses.

## Helper API — `frontend/src/config/stablecoins.js` (new)

| Function | Returns | Contract |
|----------|---------|----------|
| `getSupportedStablecoins(chainId)` | `StablecoinConfig[]` | All curated coins for the network (empty if none). Never throws. |
| `getDefaultStablecoin(chainId)` | `StablecoinConfig \| null` | The `isDefault` entry (USDC); falls back to the network's `stablecoin`. |
| `findStablecoin(chainId, key)` | `StablecoinConfig \| null` | Look up by address (checksum-insensitive) or symbol. |
| `isCuratedStablecoin(chainId, address)` | `boolean` | Whether an address is in the curated set for the network. |

## Invariants (asserted by config test)

- IC-1: Each network with a `stablecoins` array has **exactly one** `isDefault: true`, and it is USDC on chains that have USDC. (FR-001)
- IC-2: Every entry has `standardErc20 === true`. (FR-002b)
- IC-3: `stablecoin` (legacy default object) deep-equals the `isDefault` entry's `{address, symbol, name, decimals}`. (SC-004 backward-compat)
- IC-4: Addresses are unique per network and checksummed.
- IC-5: No address appears for a network on which it is not deployed (network-scoping). (FR-014)

## Consumers

- `useChainTokens()` — unchanged return (default stable).
- `useSupportedStablecoins()` / `useVisibleStablecoins()` (new hooks) — wrap the helpers + member visibility prefs.
- `StablecoinSelector`, `StablecoinPreferences`, `TokenAmount`.
