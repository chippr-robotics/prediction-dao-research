# Bitcoin (spec 061)

Native BTC support — the platform's first non-EVM network. Members get a
non-custodial Bitcoin wallet inside their existing passkey account: portfolio,
send, and receive only. No wagers, pools, membership, gasless, contracts, or
subgraph on Bitcoin, ever disclosed otherwise.

## Architecture

```
passkey master seed (spec 041, PRF-recoverable, memory-only)
  └─ HKDF("fairwins-btc-seed-v1") → BIP32 root            frontend/src/lib/bitcoin/derivation.js
       ├─ m/84'/{coin}'/0' native segwit (bc1q…, default)
       └─ m/86'/{coin}'/0' taproot      (bc1p…, opt-in)
frontend/src/lib/bitcoin/     pure libs: addresses, coinSelection, psbt, send,
                              wallet (rotation ledger + gap-limit discovery),
                              portfolioSource, gatewayClient
frontend/src/hooks/useBitcoinWallet.js   orchestration (unlock/receive/send)
frontend/src/config/bitcoinNetworks.js   string-keyed non-EVM registry
services/relay-gateway/src/bitcoin/      /v1/bitcoin/* Esplora + Stamps proxy
```

Normative contracts live in `specs/061-bitcoin-transactions/contracts/`:
`key-derivation-btc.md` (constants are **wallet-breaking** if changed),
`bitcoin-gateway-api.md`, `network-registry.md`.

## Key rules

- **No numeric chainId.** Bitcoin networks are string ids (`'bitcoin'`,
  `'bitcoin-testnet'` = testnet4) in `bitcoinNetworks.js`, parallel to —
  never inside — `NETWORKS`. Guard every shared boundary with
  `isBitcoinNetworkId()`; these ids must never reach
  `getContractAddressForChain`, wagmi, or subgraph routing.
- **Non-custodial, client-side keys.** Private keys, xpubs, and descriptors
  never leave the client; the gateway sees bare addresses (≤50/batch) and
  signed raw transactions only. Key material is memory-only — never persisted
  or logged.
- **Availability = passkey + PRF + gateway.** Injected/WalletConnect wallets
  and non-PRF authenticators get an honest `unavailable` state (matrix in the
  derivation contract). `BTC_ENABLED=false` keeps the whole feature dark.
- **Address rotation.** Fresh receive address per request (never repeated);
  the persisted ledger is a cache — gap-limit-20 discovery rebuilds addresses
  and the never-decreasing cursor on any device (recovery needs no
  Bitcoin-specific backup).
- **Stamps fail-safe.** A coin is spendable only when positively verified
  stamp-free. Degraded/unavailable Stamps recognition ⇒ coins classify
  `unverified` and are protected (excluded from sends and spendable balance,
  shown as protected value). Over-protection beats accidental destruction.
- **Fee honesty.** Quotes (sat/vB tiers) expire after 60s; the confirmed fee
  is a hard ceiling — `buildAndSignTx` refuses to sign above it
  (`FeeOverrunError`). Sub-dust change folds into the fee; sends are RBF-
  signaled. Bitcoin sends are never gasless — the confirm UI says so.
- **Honest state.** Pending (mempool/unconfirmed) value is never presented as
  final; balance-source failure renders stale/failed (`failedAssets`), never
  zero; testnet4 and mainnet never mix (paired with the app's toggle).

## Portfolio integration

`getBitcoinPortfolioAsset(networkId)` (assetTaxonomy) yields the native-BTC
instance (`baselineSymbol: 'BTC'`, category digital-commodities, decimals 8);
`usePortfolio` feeds it from `lib/bitcoin/portfolioSource.js` and the existing
aggregation rolls native BTC + WBTC into one "Bitcoin" row. Pricing reuses the
configured Chainlink BTC/USD feeds — no new price infrastructure.

## Testing

- `npm run test:frontend -- --run src/lib/bitcoin src/config/__tests__/bitcoinNetworks.test.js`
  — derivation vectors (BIP32/84/86 + pinned FairWins vectors), codecs,
  selection properties, PSBT, rotation/discovery, send pipeline.
- `cd services/relay-gateway && npx vitest run` — gateway module route tests.
- End-to-end validation guide: `specs/061-bitcoin-transactions/quickstart.md`
  (testnet4).

## Operations

See `docs/runbooks/bitcoin-operations.md` (upstream swap, killswitch, quotas,
stamps-indexer degradation, testnet4 notes).
