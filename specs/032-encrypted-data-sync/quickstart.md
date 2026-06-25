# Quickstart & Validation: Encrypted Data Backup & Restore

How to run and prove the feature. A frontend backup/restore flow + one value-free contract on the canonical
network (Polygon mainnet 137; Amoy/Mordor at the same CREATE2 address for testing). No backend. Shapes live in
`data-model.md` and `contracts/`.

## Prerequisites

- Branch `feat/encrypted-data-sync-032`; `npm install` (root) and `cd frontend && npm install`.
- A wallet with a little **POL on Polygon** (or test gas on the chosen test network) for the backup tx; restore
  needs no gas.
- The `BackupPointerRegistry` deployed (or use a local Hardhat deploy for the contract tests).

## Automated validation (the gates)

```bash
# Contract — unit + fuzz + static analysis
npx hardhat test test/BackupPointerRegistry.test.js
npm run medusa            # BackupPointerRegistryFuzzTest invariant (write only changes caller's slot)
npm run slither           # expect zero high/critical (no calls/arithmetic/roles)
npm run check:storage-layout  # N/A (non-upgradeable) — confirm it is NOT registered as a proxy

# Frontend — bundle/crypto/registry/restore + a11y
cd frontend
npx vitest run src/test/backup        # buildBundle/parseBundle, encrypt/decrypt round-trip, merge-by-(id,chainId), restore merge/replace, honest-failure
npx vitest run --run accessibility    # BackupPanel axe (WCAG 2.1 AA)
npx eslint src/lib/backup src/hooks/useDataBackup.js src/components/account/BackupPanel.jsx
```
All green + lint clean is the CI-equivalent local gauntlet.

## Scenario validations (map to Success Criteria)

### V1 — Back up (US1 / SC-001, SC-003)
1. With an address book + preferences, open the Backup panel → "Back up my data"; sign the key message; sign
   the pointer tx on Polygon.
2. **Expect**: success + last-backup time shown **only after** the pin and the `setPointer` tx both confirm;
   the stored file is an encrypted envelope (no plaintext); the registry `getPointer(wallet)` returns the CID.

### V2 — Restore on a fresh device (US2 / SC-002, SC-011)
1. On a fresh browser controlling the same wallet, open Backup → "Restore"; sign the key message.
2. **Expect**: the app reads the pointer **from chain only** (no platform service), fetches by CID, decrypts,
   and loads the data — using only the wallet, no copied reference. A different wallet cannot decrypt.

### V3 — Network-aware restore (FR-015a / SC-012, SC-012a)
1. Have contacts on two networks (e.g. a Polygon contact and a Mordor contact, plus the same address saved on
   both). Back up; restore on a fresh device.
2. **Expect**: one unified restore brings **all** networks' contacts; each lands on its original `chainId`; the
   address saved on two networks restores as **two** distinct entries (zero cross-network mis-attribution).

### V4 — Restore safely: merge vs replace (US3 / SC-004)
1. With non-empty local data, restore; choose **merge** → additive collections keep both backup + local
   entries (reconciled by `(address, chainId)`), scalar prefs resolve deterministically. Then test **replace**
   → warned before overwrite; cancel leaves local untouched.

### V5 — Honest failure is non-destructive (US5 / SC-005)
1. Inject failures: offline during pin; reject the pointer tx; corrupt the stored envelope; wrong-wallet
   decrypt.
2. **Expect**: in every case local data is unchanged, nothing is shown "backed up" that wasn't stored, and a
   corrupt/undecryptable backup is reported as "no usable backup" (local untouched).

### V6 — Privacy & control (US4 / SC-003, SC-006)
1. Fresh install: confirm nothing is stored off-device until "Back up" is triggered. View status. Request
   removal → `setPointer("")`; confirm `hasPointer(wallet)` is false and local data still works.
2. **Expect**: the registry publicly shows the pointer/CID/times (accepted, FR-005b) but the content stays
   encrypted.

### V7 — Per-wallet isolation + no-gas + size (SC-007, FR-019, FR-021)
1. Switch wallets → only that wallet's backup is read. On a wallet without Polygon gas → backup is blocked
   clearly; restore (read-only) still works. Back up >1 MB of data → warned, still proceeds.

### V8 — No backend (SC-010)
1. Inspect network traffic during backup/restore.
2. **Expect**: only IPFS (Pinata) + chain RPC; no application backend.

### V9 — Contract invariants (SC, Constitution I)
1. Run the contract suite: owner-only writes, overwrite-latest-wins, per-wallet isolation, length-bound revert,
   event emission, Slither clean.

## Definition of done (this plan's artifacts)

- `BackupPointerRegistry` deployed (CREATE2, canonical Polygon) + recorded in `deployments/` + ABI/address
  synced to the frontend.
- `lib/backup/{syncedObjects,backupBundle,backupCrypto,backupRegistry}.js` + `useDataBackup` + `BackupPanel`
  implemented, reusing existing encryption/IPFS/merge.
- All scenarios pass; lint + a11y + contract gates green; no backend; honest-state contract upheld.
