# Quickstart: Validating the Unified Activity Ledger (spec 051)

Prerequisites: repo installed (`npm install`), frontend deps
(`cd frontend && npm install`), a test network configured (one subgraph
network, e.g. Polygon/Amoy-class, and one subgraph-less network, e.g. Mordor,
to exercise both wager paths).

## 1. Unit / integration tests (fast signal)

```bash
npm run test:frontend
```

Expected green suites (added by this feature):

- `data/ledger/identity` — entryId builders, `oc:`>`dv:` precedence, `cl:` txHash linking
- `data/ledger/ledgerRepository` — assembly, dedup, per-source degradation (`staleClasses`), filters
- `data/ledger/ledgerClientStore` — append-only, supersede resolution, chainId scoping, FR-013 pruning disclosure
- `data/ledger/migrate` — idempotent import of `fairwins.transfers.v1`
- `data/ledger/timestamps` — hydration fallback → `null` + `unavailable` (never `0`)
- `lib/account/format` — `formatRelativeTime(0|null|-1) === null`
- Parity test — same (account, chainId, period): report line set ≡ Account tab entry set; totals equal (SC-002)
- Backup round-trip — client records → synced object → restore → union dedup (SC-003)

## 2. Manual validation — Account tab (US1)

```bash
npm run frontend
```

1. Seed activity: create/accept/resolve a wager; send a wallet transfer;
   trigger a failing gasless transfer (underfunded smart account); make an
   earn vault deposit; join a pool.
2. Open `/wallet?tab=account` → every action above appears once in the
   activity record with class, amount, token, status, timestamp, and (where
   on-chain) a working block-explorer link.
3. The failed gasless entry shows status Failed + the verbatim reason, and
   dashboard totals are identical before/after the failure (SC-006).
4. Switch networks → only the active network's entries render (FR-007).
5. Apply a class filter → list and displayed totals follow the filter.

## 3. Manual validation — timestamps on a subgraph-less network (US4)

On the RPC-only network: create + refund a wager, open the Account tab.
Expected: real dates matching the block explorer; if hydration is exhausted,
an explicit "date unavailable" label — grep the rendered page for `20645d`
must find nothing (SC-004).

## 4. Manual validation — report parity (US2)

Open `/wallet?tab=reports`, generate CSV for a period covering step 2.
Expected: every ledger entry in the period is a CSV row (all classes, failed
rows flagged, `valuationStatus` column present); totals equal the Account tab
figures for the same period/network (SC-002); unvalued entries flagged, not
zeroed.

## 5. Manual validation — backup & recovery (US3)

1. Run an encrypted backup (spec-032 flow) after step 2.
2. Clear site data (or use a fresh browser profile), restore from backup.
3. Expected: full activity record returns, including the failed gasless
   entry (SC-003); repeating the restore creates no duplicates (FR-011).
4. Negative path: fresh profile, no restore → on-chain entries rebuild and
   the UI states device-local history was not recovered (FR-012).

## 6. Migration check (FR-017)

On a profile that has pre-feature `fairwins.transfers.v1` history: load the
app once → old transfer entries (statuses, errors, txHashes) appear in the
ledger; reloading does not duplicate them (SC-007).
