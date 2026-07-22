# Quickstart & Validation: Legacy Account Recovery

End-to-end validation for the feature. Run from `frontend/`.

## Prerequisites

- `npm ci` (deps installed).
- Test vectors (Hardhat account #0): private key
  `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`; word list
  `test test test test test test test test test test test junk`; both resolve to
  `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`.

## Automated checks

```bash
# Unit + component suites for this feature
npx vitest run src/test/recovery src/components/account/__tests__/LegacyKeyRecoveryPanel.test.jsx

# Cross-cutting suites touched by the integration
npx vitest run src/test/backup src/test/AppNavDrawer.test.jsx

# Lint + full frontend gate (must be clean, no continue-on-error)
npx eslint src/lib/recovery src/components/account/LegacyKeyRecoveryPanel.jsx src/data/ledger/sources/legacyRecoverySource.js
npm run test:frontend
```

## Scenario 1 — Recover & store (US1, P1)

1. `npm run frontend`, connect a session, open **Recovery** (the renamed section) → "Recover a legacy key".
2. Paste the test private key → **detected as a private key**, address `0xf39F…2266` shown.
3. Set a passphrase (≥ 8, confirmed) → **Encrypt & continue** → lands on the **Saved** screen.
4. **Verify**: DevTools → Application → localStorage → `fw_user_<owner>_legacy_recovered_keys` contains
   a ciphertext blob and **no** `0xac09…` or `test test …` substring.
5. Repeat with the word list → detected as a **word list**, same address.

**Expected**: recovery completes at the Saved screen without any transfer required (FR-011).

## Scenario 2 — Optional move-all-assets (US2, P2)

1. From the Saved screen (or a stored-key row → **Move funds** → unlock), open the transfer step.
2. **Verify**: native + every supported token with a non-zero balance is listed; the destination
   defaults to the session smart account and is editable; the network fee is disclosed; the UI states
   that only supported assets move (NFTs excluded).
3. Confirm → **Verify**: per-asset outcomes appear (sent/failed), ERC-20s before native; a forced
   single-token failure still reports the others as sent (partial-failure path).

**Expected**: all supported assets are transferred or reported failed with retry — none silently
dropped (FR-015); the account is never stranded (FR-016).

## Scenario 3 — Address book & platform availability (US3, P2)

1. On the Saved screen, choose **Save to address book** (edit the name), confirm.
2. Open **Pay & Transfer** (or any `AddressInput` with the book add-on) → the recovered account is
   selectable/resolvable.
3. Save again → **Verify**: the existing entry updates, no duplicate (FR-020).

## Scenario 4 — Backup carries it forward (US4, P3)

1. Recover an account, run **Back up my data** in the Recovery section.
2. In a fresh profile (clear localStorage), **Restore my data (merge)**.
3. **Verify**: the recovered account reappears in the Recovery list; unlocking still requires the
   original passphrase; no duplicate after a second merge restore.

## Scenario 5 — Audit without leakage (US5, P2)

1. After a recovery, open the activity/reporting surface (or inspect
   `fw_user_<owner>_activity_ledger_v1_<chainId>`).
2. **Verify**: exactly one `kind: 'legacy_account_recovered'` record with `refs.recoveredAddress`,
   `timestamp`, and `refs.source`; **no** key/mnemonic in any field. Re-recover the same account →
   no second record (idempotent, FR-025).

## Success mapping

| Scenario | User story | Success criteria |
|---|---|---|
| 1 | US1 | SC-001, SC-002, SC-008 |
| 2 | US2 | SC-003, SC-004 |
| 3 | US3 | SC-005 |
| 4 | US4 | SC-006 |
| 5 | US5 | SC-002, SC-007 |
