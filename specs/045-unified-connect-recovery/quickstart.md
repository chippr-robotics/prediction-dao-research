# Quickstart Validation: Unified Connect & Account Recovery

**Feature**: 045-unified-connect-recovery

## Prerequisites

```bash
npm ci
npm run test:frontend      # full frontend suite must pass
npm run frontend           # dev server for manual checks
```

Manual passkey checks need Chrome or Brave with a platform authenticator
(or chrome://webauthn-internals virtual authenticator).

## Automated validation

```bash
# Focused suites for this feature
npx vitest run frontend/src/lib/passkey frontend/src/connectors \
  frontend/src/contexts/WalletContext.passkey.test.jsx \
  frontend/src/components/wallet frontend/src/components/account
```

Expected: green, including new tests for credential upsert-on-sign-in,
assertion pinning, `CredentialRecordIncomplete`, ownerIndex resolution,
connect serialization, explainer-once, and recovery gating.

## Manual scenarios (maps to spec user stories)

1. **US2 — one surface**: From a disconnected state, tap Connect in the
   header, on the Wallet page, and on the Dashboard welcome view → the same
   modal opens each time, ordered Passkey (Recommended) → WalletConnect →
   Browser Wallet, with honest availability badges. Cancel a WalletConnect
   attempt, then immediately start a passkey sign-in → no stuck state.
2. **US4 — explainer**: Fresh profile → choose Passkey → explainer appears
   once; dismiss; reopen → straight to ceremony.
3. **US1 — actions work**: Sign up with a passkey → transfer succeeds with one
   ceremony. Sign out, sign back in (sign-in branch!) → transfer still
   succeeds. Simulate an incomplete book record (delete `publicKey` in
   devtools localStorage) → action shows the plain-language recovery message,
   not "reading 'id'".
4. **US3 — multiple passkeys (Brave)**: Create two passkey accounts. Sign out.
   Sign in → in-app account picker lists both; pick the second → session
   address matches account 2; a transfer signs with account 2's credential.
5. **US5 — link wallet**: As a passkey user, open Account → Security →
   Controllers → Link wallet → controller list shows the EOA; device-loss
   warning clears.
6. **US6 — recovery**: Clear site data (passkeys remain on device but book is
   empty). Connect the linked EOA via the modal → open Recover access →
   enter the account address (hint offered if known) → create new passkey →
   wallet transaction confirms → sign out, sign in with the new passkey →
   transact. Also review `docs/runbooks/passkey-account-recovery.md` for the
   FairWins-independent path.

## Success criteria spot-checks

- SC-001/002: scenarios 3–4 on both Chrome and Brave.
- SC-003: scenario 1 (three entry points, one surface).
- SC-006: scenario 6 end-to-end without any FairWins-side action.
