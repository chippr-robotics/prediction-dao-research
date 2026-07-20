# Data Model: Bitcoin Transactions (spec 061)

All entities are client-side (frontend state/persistence) or transient gateway
DTOs — there is no server-side storage and no on-chain contract state.

## BitcoinWallet (client, derived + memory-only keys)

| Field | Type | Notes |
|---|---|---|
| `network` | `'bitcoin' \| 'bitcoin-testnet'` | strict separation (FR-021) |
| `accounts` | `{ segwit: AccountNode, taproot: AccountNode }` | BIP84 / BIP86 account nodes, derived on unlock, memory-only |
| `preferredType` | `'segwit' \| 'taproot'` | persisted preference; default `'segwit'` (FR-006) |
| `status` | `'unavailable' \| 'locked' \| 'ready'` | `unavailable` = no PRF/passkey capability; drives honest gating (FR-020) |

Validation: wallet exists only when spec-041 master-seed capability is
`available`; derivation follows `contracts/key-derivation-btc.md` exactly.

## IssuedAddress (client-persisted ledger + deterministic rescan)

| Field | Type | Notes |
|---|---|---|
| `address` | string | bech32 (`bc1q…`) or bech32m (`bc1p…`) |
| `type` | `'segwit' \| 'taproot'` | which account chain it came from |
| `index` | number | external-chain derivation index `…/0/index` |
| `network` | string | as above |
| `firstShownAt` | ISO timestamp | display metadata only |

Rules: an address is appended when first displayed; the rotation cursor per
`(network, type)` is `max(issued index) + 1` and **never decreases** (FR-004).
Recovery rebuilds this ledger via gap-limit-20 discovery (research R5) — the
persisted copy is a cache, never the source of truth (FR-003).

## Utxo / Coin (gateway DTO → client selection input)

| Field | Type | Notes |
|---|---|---|
| `txid`, `vout` | string, number | outpoint identity |
| `valueSats` | number | integer satoshis |
| `address` | string | owning issued address |
| `confirmations` | number | 0 = mempool |
| `classification` | `'spendable' \| 'pending' \| 'protected' \| 'unverified'` | client-computed (research R6) |
| `stampId` | string \| null | set when a Stamp travels with this coin |
| `lockedByTx` | string \| null | in-flight local send lock (FR-014) |

State transitions: `pending → (1 conf) → unverified → (stamps check ok) →
spendable` or `→ protected`; `spendable → lockedByTx → gone (confirmed spend)`
or `→ spendable (broadcast failed/abandoned)`. `unverified` is treated exactly
like `protected` for selection (fail-safe, FR-019).

## Balance (client aggregate, portfolio input)

| Field | Type | Notes |
|---|---|---|
| `confirmedSats` | number | sum of `spendable + protected` confirmed coins |
| `pendingSats` | number | signed net of mempool inbound/outbound |
| `protectedSats` | number | stamps-bearing + unverified value (FR-018) |
| `spendableSats` | number | `confirmed − protected − locked` |
| `stale` | boolean | upstream unreachable ⇒ render stale, never zero (FR-010) |

## Stamp (gateway DTO)

| Field | Type | Notes |
|---|---|---|
| `stampId` | string | indexer identifier |
| `imageUrl` / `mimeType` | string | preview for collectibles surface |
| `outpoint` | `{ txid, vout }` | the coin it travels with |
| `address` | string | current holding address |

## FeeQuote (gateway DTO + client pin)

| Field | Type | Notes |
|---|---|---|
| `rates` | `{ fast, normal, slow }` | sat/vB integers |
| `tipHeight` | number | freshness anchor |
| `fetchedAt` | timestamp | quote validity window: 60s |
| `pinned` | `{ rate, estFeeSats, estVsize }` | what the member confirmed; actual fee MUST be ≤ `estFeeSats` or re-confirm (FR-012) |

## BitcoinTransaction (client activity entry)

| Field | Type | Notes |
|---|---|---|
| `txid` | string | after broadcast |
| `direction` | `'in' \| 'out'` | |
| `amountSats`, `feeSats` | number | fee for outbound only |
| `counterparty` | string | destination (out) / receiving address (in) |
| `status` | `'pending' \| 'confirmed' \| 'failed'` | pending until ≥1 conf; never shown final early (FR-009) |

## BitcoinNetworkEntry (config, `bitcoinNetworks.js`)

See `contracts/network-registry.md` — id, label, isTestnet, addressPrefix
(`bc1`/`tb1`), explorer URL patterns, gateway path segment, capabilities
(`portfolio/send/receive` true, all else false), toggle pairing.

## Relationships

```
BitcoinWallet 1—n IssuedAddress 1—n Utxo
Utxo 0..1—1 Stamp            (protected coins)
Utxo n—1 BitcoinTransaction  (spends/creates)
Balance = fold(Utxo*)        (pure function, no stored state)
FeeQuote —pins→ outbound BitcoinTransaction
```
