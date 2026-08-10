# Phase 1 Data Model: Legacy Account Recovery

All data is **device-local** (`localStorage` via `utils/userStorage.js`, per-account key
`fw_user_<owner>_<key>`) and, where noted, rides the spec-032 encrypted backup. No on-chain schema.

## Entity: Encrypted Vault Entry (the recovered secret)

The at-rest, passphrase-protected form of a legacy secret. **This is the only place key material
lives, and only as ciphertext.** Stored in the vault under `legacy_recovered_keys`.

| Field | Type | Notes |
|---|---|---|
| `v` | number | Schema version (`1`). |
| `kind` | `'privateKey' \| 'mnemonic'` | Recovery type. |
| `address` | string (checksummed) | The account the secret controls. Vault key = lowercased. |
| `salt` | base64 (16 bytes) | Per-entry PBKDF2 salt. |
| `iv` | base64 (12 bytes) | AES-GCM IV. |
| `ct` | base64 | AES-GCM ciphertext of the raw secret (0x-key or phrase). |
| `iterations` | number | PBKDF2 iterations used (`650000`), stored for forward-compat. |
| `importedAt` | number (epoch ms) | Used for merge tie-break and list ordering. |

**Invariants**: never contains plaintext secret; wrong passphrase fails the GCM tag (no substitute
material returned); one entry per lowercased address (re-import replaces).

**Validation**: `classifySecret(input)` must return `kind ∈ {privateKey, mnemonic}` with a derived
`address` before an entry is created; passphrase ≥ 8 chars and confirmed.

## Entity: Recovered Account (list view)

The non-secret projection the panel lists. Derived from vault entries — no separate store.

| Field | Source | Notes |
|---|---|---|
| `address` | entry.address | Displayed shortened; full on hover. |
| `kind` | entry.kind | "private key" / "word list" label. |
| `importedAt` | entry.importedAt | "saved <date>". |

## Backup domain: `legacyRecoveredKeys` (synced object)

Registered in `lib/backup/syncedObjects.js`.

| Property | Value |
|---|---|
| `key` | `'legacyRecoveredKeys'` |
| `label` | `'Recovered accounts'` |
| `networkScoped` | `false` (a legacy EOA address is chain-independent) |
| `load(account)` | return the vault as `{ [lowerAddress]: entry }` (ciphertext only) |
| `apply(account, value, 'replace')` | overwrite the local vault with `value` |
| `apply(account, value, 'merge')` | union by lowercased address; newest `importedAt` wins; returns `{ conflicts }` |
| `merge(current, incoming)` | pure union helper (same rule), returns `{ value, conflicts }` |

**Backup safety**: only ciphertext blobs travel; a restore alone never exposes a secret (still
passphrase-locked). No `assertNetworkTagged` branch needed (not network-scoped).

## Reused entity: Address Book Entry (contact-centric)

Created/updated via `useAddressBook()` — **not** a new store (see research R4).

- `Contact = { id, nickname, addresses: SavedAddress[], createdAt, updatedAt }`
- `SavedAddress = { address (checksummed), chainId, notes, addedAt }`
- Identity: `(lowercase(address), chainId)`. Upsert = `findByAddress` → `addContact` or `addAddress`.
- Recovered-account defaults: `nickname` member-editable (default "Recovered account"),
  `notes = "Recovered from legacy <private key|word list>"`, `chainId` = active chain.

## Reused entity: Activity Ledger Record (audit)

Appended via `appendClientRecord` (spec 051). Non-secret fields only.

| Field | Value |
|---|---|
| `entryId` | `clientEntryId('legacy-recovered:'+chainId+':'+lowerAddress)` (stable ⇒ idempotent) |
| `chainId` | active chain (number) |
| `account` | session account (lowercased) |
| `class` | `LEDGER_CLASS.MEMBERSHIP` |
| `kind` | `'legacy_account_recovered'` |
| `direction` | `LEDGER_DIRECTION.NONE` |
| `status` | `LEDGER_STATUS.SETTLED` |
| `provenance` | `PROVENANCE.CLIENT` |
| `timestamp` | `Date.now()` |
| `timestampProvenance` | `TS_PROVENANCE.DEVICE` |
| `refs` | `{ recoveredAddress: lowerAddress, source: 'privateKey'|'mnemonic' }` |

**Invariant**: no field (including `refs`) may ever contain a private key, mnemonic, or seed.

## Entity: Asset Sweep Plan / Outcome (transient, not persisted)

Produced by `quoteAllAssets` and consumed by `sweepAllAssets`.

- **Holding** `{ asset, balance }` — `asset` is a `getPortfolioRegistry` descriptor
  (`{ kind, address|null, symbol, decimals, chainId }`); only non-zero balances are included.
- **Quote** `{ holdings: Holding[], nativeGasReserve: bigint, hasNative: boolean }`.
- **Outcome** `{ asset, status: 'sent'|'skipped'|'failed', txHash?, error? }[]` — one per holding,
  order = ERC-20s then native.

## State transitions (import wizard)

```
intro ──▶ enter ──▶ secure ──▶ SAVED (recovery complete: vault + optional book entry + audit)
                                   │
                                   ├─(optional)─▶ transfer(all assets) ──▶ done
                                   └─(later, from stored-key list) ─▶ unlock ─▶ transfer ─▶ done
```

Terminal, spec-complete state is **SAVED**; `transfer`/`done` are optional continuations (FR-011).
