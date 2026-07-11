# Data Model: Unified Activity Ledger (spec 051)

## LedgerEntry (canonical, in-memory shape served by `ledgerRepository`)

| Field | Type | Rules |
|---|---|---|
| `entryId` | string | Stable identity — see Identity below. Unique within (account, chainId). |
| `account` | string (address, lowercased) | The user the entry belongs to. |
| `chainId` | number | Strict scoping (FR-007); never mixed across networks unlabeled. |
| `class` | enum `wager \| transfer \| earn \| pool \| membership` | Activity class (FR-001). |
| `kind` | string | Class-specific event, e.g. `deposit`, `payout`, `refund`, `draw`, `cancel`, `send`, `receive`, `vault_deposit`, `vault_withdraw`, `loan_repay`, `reward_claim`, `pool_join`, `pool_claim`, `pool_refund`, `voucher_purchase`. |
| `direction` | enum `in \| out \| none` | Value direction relative to the account; `none` for failed ops. |
| `status` | enum `settled \| pending \| failed \| cancelled` | Failed entries are listed but excluded from all totals (FR-003). |
| `failureReason` | string \| null | Verbatim reason for `failed` entries (e.g. bundler/paymaster message). |
| `tokenAddress` | string \| null | Asset; null for native currency. |
| `tokenSymbol`, `tokenDecimals` | string, number | From existing token-meta enrichment. |
| `amountRaw` | string (integer units) | Exact chain units; formatting at render. |
| `valueUsd` | number \| null | USD value at activity time (D7). |
| `valuationStatus` | enum `valued \| unvalued` | `unvalued` entries are kept and flagged, never zeroed (FR-016). |
| `counterparty` | string \| null | Other address where one exists (FR-004). |
| `txHash` | string \| null | Verifiable reference for anything that reached the chain (FR-004). |
| `logIndex` | number \| null | Disambiguates multiple events per tx. |
| `timestamp` | number (epoch **ms**) \| null | Real activity time. **Never 0.** Null when genuinely unavailable (FR-006). |
| `timestampProvenance` | enum `chain \| device \| unavailable` | `chain` = block time (FR-005); `device` only for client-only events; `unavailable` renders the explicit "date unavailable" state. |
| `provenance` | enum `onchain \| derived \| client` | Matches the `oc:`/`dv:`/`cl:` id namespace; surfaced to auditing (constitution III). |
| `refs` | object | Class-specific links: `{ wagerId?, poolId?, vaultAddress?, voucherId?, route?, supersedes?, linkedTxEntryId?, retryOf? }`. |

**Invariants**
- `status === 'failed'` ⇒ excluded from `computeSummary` / `computePnlSeries`
  / report totals; still present in listings and exports.
- `timestamp === null` ⇔ `timestampProvenance === 'unavailable'`; the value
  `0` is invalid and rejected by normalization.
- `provenance === 'onchain'` ⇒ `txHash` present.
- Entries are value objects: the repository never mutates a returned entry.

## Identity (`identity.js`)

- On-chain: `oc:{chainId}:{txHash}:{logIndex}`; where the subgraph row does
  not expose logIndex, reuse its unique entity id: `oc:{chainId}:wt:{WagerTransfer.id}`.
- Derived fallback: `dv:{chainId}:wager:{wagerId}:{kind}:{party}` —
  deterministic so re-derivation is idempotent (FR-009/011).
- Client-only: `cl:{uuid}` (reuses the `transferStore` record id).

**Merge precedence** (dedup on assembly and on restore):
1. `oc:` beats `dv:` for the same `(wagerId, kind, party)` — derived entry dropped.
2. A `cl:` record whose `txHash` matches an `oc:` entry is not shown twice:
   the on-chain entry wins financial fields and gains
   `refs.linkedTxEntryId`/`refs.route` context from the client record.
3. Identical `entryId`s are identical records (append-only) — last write is
   byte-equal; merge is a set union (FR-011).

## ClientLedgerRecord (persisted, `ledgerClientStore.js`)

The subset of LedgerEntry with `provenance: 'client'`, stored append-only via
`userStorage` per account, elements tagged `chainId` (pattern of
`activityStore`). Additional persistence-only fields:

| Field | Rules |
|---|---|
| `recordedAt` | Device epoch ms when appended. |
| `supersedes` | entryId of the record this one supersedes (status transitions append, never mutate — FR-008). Readers resolve chains to the latest; full chain retained for audit. |

**Retention**: no default cap. A size guard may prune only entries older than
the previous tax year and must record a disclosed `prunedBefore` marker the
UI and reports surface (FR-013).

## TimestampCache (persisted, `timestamps.js`)

`{ [chainId]: { [wagerId]: { createdAtMs, resolvedAtMs? } } }` — pure
performance cache of RPC hydration results (D6); losing it is harmless
(re-derivable).

## Backup object (spec 032)

`syncedObjects` gains `{ key: 'activityLedger', networkScoped: true }`;
payload = all ClientLedgerRecords for the account. Merge = union by
`entryId` (conflict-free by append-only design). On-chain/derived entries are
never included (FR-009 keeps bundles small). Restore-without-backup path
rebuilds `oc:`/`dv:` entries only and surfaces the "device-local history not
recovered" notice (FR-012).

## State transitions

```
Client transfer record:  in_process ──append──▶ settled
                                   └──append──▶ failed (failureReason)
Failed then retried:     failed  ◀─refs.retryOf─ new record (in_process → …)
Derived wager entry:     re-derived each assembly; replaced by oc: when the
                         subgraph/scan later yields the real event (same
                         underlying event, higher-precedence id)
```

## Migration (FR-017, `migrate.js`)

One-time, idempotent (guarded by a `userStorage` marker):
1. `fairwins.transfers.v1` rows → ClientLedgerRecords (`cl:{existing id}`),
   preserving status/error/txHash/createdAt (device provenance).
2. Report-history and notification stores are left in place (different
   concerns); a consistency test asserts every financial event they reference
   resolves to a ledger entry (FR-002).
