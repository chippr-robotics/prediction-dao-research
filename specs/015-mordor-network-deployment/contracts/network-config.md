# Contract: Mordor Network Config (`frontend/src/config/networks.js` → `NETWORKS[63]`)

The frontend config entry that makes Mordor a selectable network and feeds the Network-tab card, swap context, and capability tags.

## Required shape

```js
63: {
  chainId: 63,
  name: 'Ethereum Classic Mordor',
  isTestnet: true,
  isPrimary: false,
  selectable: true,                                  // → appears on My Account → Network
  nativeCurrency: { decimals: 18, name: 'Ethereum Classic', symbol: 'ETC' },
  rpcUrl: import.meta.env?.VITE_RPC_URL_MORDOR || 'https://rpc.mordor.etccooperative.org',
  explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' },
  stablecoin: {
    address: import.meta.env?.VITE_MORDOR_USC || '0x…',  // REAL Classic USD on Mordor (VERIFY)
    symbol: 'USC',
    name: 'Classic USD',
    decimals: /* 6 or 18 — VERIFY on-chain */,
  },
  dex: (() => {
    const factory = import.meta.env?.VITE_MORDOR_ETCSWAP_FACTORY
    const router = import.meta.env?.VITE_MORDOR_ETCSWAP_SWAP_ROUTER
    const quoter = import.meta.env?.VITE_MORDOR_ETCSWAP_QUOTER
    const positionManager = import.meta.env?.VITE_MORDOR_ETCSWAP_POSITION_MANAGER
    const wnative = import.meta.env?.VITE_MORDOR_WETC
    if (!factory || !router || !quoter || !wnative) return null   // swap hidden when incomplete
    return { factory, swapRouter: router, quoter, positionManager: positionManager || null, wnative }
  })(),
  contracts: {},
  polymarket: null,                                  // no Polymarket on ETC
  resources: {                                       // NEW — card links not on other fields
    faucet: 'https://…mordor…faucet…',               // VERIFY
    dexUrl: 'https://etcswap.org',                   // VERIFY (Mordor app URL)
  },
  get capabilities() {
    return { polymarketSidebets: false, dex: Boolean(this.dex), friendMarkets: true }
  },
},
```

## Contract guarantees

- `selectable: true` ⇒ `getSelectableNetworks()` includes Mordor ⇒ a card renders on the Network tab.
- `polymarketSidebets: false` ⇒ Polymarket side-bet UI off on Mordor.
- `dex` is all-or-nothing: any missing ETCswap address ⇒ `dex = null` ⇒ Token Swap tag grey + swap UI hidden (no mock DEX).
- Amounts everywhere use `stablecoin.decimals`; this MUST match the real Classic USD decimals.

## Second-testnet handling

`TESTNET_MAINNET_PAIR = { testnet: 80002, mainnet: 137 }` stays as-is. `useNetworkMode()` returns `mode:'other'` / `isOtherChain:true` when active chain is 63. The legacy Testnet/Mainnet toggle MUST hide or disable itself on `isOtherChain` (switching for Mordor is done from the Network-tab cards), never render a broken toggle.
