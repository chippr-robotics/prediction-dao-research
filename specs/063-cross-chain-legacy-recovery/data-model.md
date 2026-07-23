# Data Model: Universal Acting-Account + Cross-Chain Legacy Recovery

**Feature**: 063 | **Phase**: 1 | **Date**: 2026-07-23

Client-side entities only (no database, no smart contracts). "Persisted" = browser userStorage;
"memory-only" = held in non-reactive session internals, never serialized. Key material is
**always** memory-only.

---

## 1. EffectiveAccount (derived, memory)

The account a given surface acts as. Computed from `useActiveAccount().identity`.

| Field | Type | Notes |
|-------|------|-------|
| `type` | `'personal' \| 'vault' \| 'legacy' \| 'derived'` | `derived` = a non-EVM account derived from a recovered seed |
| `label` | string | Display name |
| `addressForChain` | `(chainRef) => string \| null` | Address on a chain, or `null` if the account has no address there (FR-007) |
| `chainScope` | `ChainRef[]` | Chains this account can hold/transact on |
| `canSignOn` | `(chainRef) => boolean` | Whether it can currently sign (unlocked + right network) |

**Rules**: A surface MUST use `addressForChain`; when it returns `null`, disclose "no address for
this account on this chain" — never substitute another account (FR-002/003/007).

---

## 2. RecoveredLegacySecret (persisted ciphertext; cleartext memory-only)

Extends the existing spec-062 entry. No schema change to the stored ciphertext; the mnemonic case
gains an in-memory derivation capability.

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `'mnemonic' \| 'privateKey'` | Only `mnemonic` is re-derivable across chains/paths (FR-013) |
| `address` | string | The default EVM address (unchanged) |
| `protection` | `'passphrase' \| 'passkey'` | Unlock method (unchanged) |
| `ciphertext` | bytes | AES-GCM of the original secret (unchanged; the ONLY persisted secret form) |
| *(memory)* `seed` | bytes | BIP-39 seed, present only while unlocked; dropped on lock/switch/disconnect (FR-018) |

---

## 3. DerivedExternalAccount (memory keys; public parts may cache)

A per-chain account derived from a recovered mnemonic.

| Field | Type | Notes |
|-------|------|-------|
| `sourceLegacyAddress` | string | The EVM address of the recovering secret — namespaces this account so it never collides with the passkey-derived wallet |
| `chain` | `'bitcoin' \| 'solana' \| 'zcash'` | (`monero` deferred to a follow-up spec) |
| `scheme` | string | e.g. `bip84`/`bip44`/`bip49`/`bip86` (BTC/ZEC), `bip44Change`/`bip44`/`bareSeed` (SOL) |
| `accountIndex` | integer | BIP44 account (where applicable) |
| `addresses` | `DerivedAddress[]` | Discovered/used receive addresses |
| `balance` | `{ confirmed, spendable, unit }` | Per-chain units (sats, lamports, zats, atomic XMR) |
| *(memory)* `keys` | opaque | Signing material; never persisted/logged (FR-017) |

**DerivedAddress**: `{ address, path, index, used: boolean, balance }`.

---

## 4. ChainDiscoveryResult (transient)

Outcome of scanning a seed against one chain (drives honest UI, FR-014).

| Field | Type | Notes |
|-------|------|-------|
| `chain` | ChainRef | |
| `status` | `'scanning' \| 'complete' \| 'unreachable' \| 'unsupported-holdings'` | `unsupported-holdings` = e.g. shielded-only ZEC found (FR-016) |
| `accountsFound` | `DerivedExternalAccount[]` | Empty + `complete` ⇒ "no funds found" (NOT an error, NOT a phantom row) |
| `scannedTo` | `{ accountIndex, addressGap }` | Proof of gap-limit completeness |
| `progress` | 0..1 | For the progress indicator (SC-008) |

**State machine**: `scanning → complete | unreachable`. `unreachable` MUST NOT render as zero
(FR-014); `complete` with no accounts MUST render as an explicit "nothing found" state.

---

## 5. ChainRef & network identity

Non-EVM networks are **string ids**, parallel to the numeric EVM `NETWORKS` map, each guarded by an
`isXNetworkId` predicate (mirrors `bitcoinNetworks.js`).

| id | kind | testnet id | coinType |
|----|------|-----------|----------|
| `solana` | solana | `solana-devnet` | 501 |
| `zcash` | zcash | `zcash-testnet` | 133 (and 1 on testnet, dual) |

*(`monero` / coin type 128 deferred to a follow-up spec.)*

**Invariant**: string ids MUST NEVER be passed to `getContractAddressForChain`, wagmi, or subgraph
code (all numeric-chainId typed). Guard every boundary with `isEvmChainId` / the per-chain predicate.

---

## 6. SendRequest (per chain, transient)

| Field | Type | Notes |
|-------|------|-------|
| `sourceAccount` | DerivedExternalAccount \| EffectiveAccount | |
| `destination` | string | Validated per chain (base58 32-byte for SOL; t-addr for ZEC; BTC address) |
| `amount` | bigint | Atomic units |
| `feeQuote` | `{ fee, unit, payer: 'member' }` | Disclosed before signing (FR-012) |
| `feeCeiling` | bigint | Hard ceiling — signing refuses if actual > ceiling (FR-012, edge case) |

---

## Relationships

```
RecoveredLegacySecret (mnemonic) --unlock--> seed (memory)
  seed --crossChainDerive--> DerivedExternalAccount[] (per chain/scheme/account)
    DerivedExternalAccount --discovery--> ChainDiscoveryResult
    DerivedExternalAccount --select--> EffectiveAccount (Part A: acts everywhere)
      EffectiveAccount --send--> SendRequest --> signed tx --> gateway/broadcast
```
