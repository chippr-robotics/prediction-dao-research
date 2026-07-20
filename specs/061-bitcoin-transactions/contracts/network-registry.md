# Contract: Non-EVM Network Registry (spec 061)

Normative shape of `frontend/src/config/bitcoinNetworks.js` — the platform's
first non-EVM network registry. It is **parallel to** and never merged into
the numeric `NETWORKS` map in `networks.js`; no numeric chainId is ever
assigned to a Bitcoin network.

## Registry shape

```js
export const BITCOIN_NETWORKS = {
  bitcoin: {
    id: 'bitcoin',                 // string id; NEVER a number
    kind: 'bitcoin',
    name: 'Bitcoin',
    isTestnet: false,
    gatewaySegment: 'mainnet',     // /v1/bitcoin/:network path value
    addressHrp: 'bc',              // bech32/bech32m human-readable part
    coinType: 0,                   // BIP44 coin type (hardened)
    explorer: { name: 'mempool.space', baseUrl: 'https://mempool.space',
                tx: (txid) => `…/tx/${txid}`, address: (a) => `…/address/${a}` },
    capabilities: {
      portfolio: true, send: true, receive: true,
      wagers: false, pools: false, membership: false, gasless: false,
      swap: false, earn: false, predict: false, collect: 'stamps-only',
    },
  },
  'bitcoin-testnet': { /* id 'bitcoin-testnet', testnet4, hrp 'tb', coinType 1,
                          gatewaySegment 'testnet', paired with 'bitcoin' */ },
}
export const BITCOIN_TESTNET_MAINNET_PAIR = ['bitcoin-testnet', 'bitcoin']
export function isBitcoinNetworkId(id) { /* string ids above only */ }
export function getBitcoinNetwork(id) { /* lookup or null — soft-fail */ }
```

## Integration rules (enforced in review + tests)

1. **No numeric leakage**: Bitcoin ids MUST never be passed to
   `getContractAddressForChain`, wagmi (`switchChain`, provider construction),
   subgraph routing, or any API typed on EVM chainId. Type guards
   (`isBitcoinNetworkId`) sit at every boundary that now accepts both.
2. **Display-only network rows**: network-listing surfaces render Bitcoin
   entries without a "switch wallet" affordance — there is no wallet chain
   switch for Bitcoin; surfaces activate per-feature (receive/send/portfolio)
   based on `capabilities` + wallet availability.
3. **Capability honesty (FR-020)**: `capabilities` above is the single source
   for what Bitcoin supports; every false capability hides/disables its
   surface exactly as EVM `networkCapabilities.js` entries do. `collect:
   'stamps-only'` means the collectibles surface shows the Stamps section but
   no OpenSea integration.
4. **Testnet separation (FR-021)**: the active Bitcoin network follows the
   app's existing testnet/mainnet mode via `BITCOIN_TESTNET_MAINNET_PAIR`;
   balances, addresses, QR codes, and activity are strictly scoped to the
   active side, and testnet addresses (`tb1…`) are invalid destinations on
   mainnet (and vice versa).
5. **Selection semantics**: Bitcoin availability = passkey master-seed
   capability (see key-derivation contract) AND gateway `BTC_ENABLED`. Either
   missing ⇒ surfaces soft-fail (hide or honest unavailable-state), mirroring
   the spec-054 "undeployed registry" soft-fail pattern.
