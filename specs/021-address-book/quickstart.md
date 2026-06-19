# Quickstart: Address Book — validation guide

How to run and validate the Address Book feature end-to-end. Implementation details
live in `contracts/`, `data-model.md`, and (later) `tasks.md`.

## Prerequisites

- Repo set up; from repo root: `npm install` (and `cd frontend && npm install` if the
  frontend has its own lockfile).
- A wallet with at least one supported network configured (the active chain defaults
  from `VITE_NETWORK_ID`).
- For sanctions tags against a real guard, a network where `sanctionsGuard` is
  deployed (see `config/contracts.js`); otherwise addresses show the **uncertain**
  tag (fail-closed), which is itself a valid thing to verify.

## Run

```bash
npm run frontend            # start the dev server (Vite)
npm run test:frontend       # run the Vitest suite (unit + component + axe)
```

## Validation scenarios (map to spec user stories)

### US1 — Manage contacts (P1)

1. Connect a wallet, open **My Account** → **Address Book**.
2. Add a contact "Alex" with one address, the network prefilled to the active chain,
   and a note. → Appears in the list.
3. Add a second address (different network) under "Alex". → Both grouped under the
   one contact (FR-002).
4. Edit the nickname/notes; reload the page. → Changes persist (localStorage,
   FR-006).
5. Delete one address, then the whole contact. → Only the targeted data is removed
   (FR-004).
6. Try to save `not-an-address`. → Field-level validation error; nothing saved
   (FR-005).

**Expected**: All of the above succeed; data survives reload; invalid input rejected.

### US2 — Sanctions/compliance warnings (P1)

1. Save an address known-restricted by the guard and one known-clear (or use a mock
   in tests). → Restricted shows a warning tag (icon + text); clear shows none
   (FR-010).
2. On a network where the guard is not configured, view an address. → Shows
   **Unscreened/uncertain**, NOT clear (FR-011).
3. Give a contact two addresses, one restricted. → That address is flagged and the
   contact is marked as containing a restricted address (FR-012).

**Expected**: Warnings are accurate, fail-closed, network-scoped, and conveyed by
more than colour.

### US3 — Select a contact anywhere an address is required (P2)

1. With ≥1 saved contact, open **Create/Accept Wager** (FriendMarketsModal).
2. In the opponent address field, search by nickname or partial address. → Matches
   shown (FR-015).
3. Select one. → Field populates with that exact address; a restricted selection
   surfaces its warning in-flow (FR-016).
4. With an empty book, the field still works for manual entry (edge case).

**Expected**: Selection populates the field; warnings travel with the selection; no
regression to manual entry.

### US4 — Save prompt after a successful action (P2)

1. Enter a brand-new (unsaved) opponent address and complete a wager create/accept so
   it confirms on-chain.
2. → A dismissible, non-blocking toast offers to save it (nickname required, network
   prefilled, optional notes) (FR-017).
3. Dismiss it. → Address not saved; the completed action is unaffected (FR-018).
4. Repeat with an already-saved address. → No toast (FR-017).

**Expected**: Toast appears only for new addresses, never blocks the flow.

### US5 — Encrypted export/import (P3)

1. Populate a book, click **Export**, sign the backup message. → An encrypted file
   downloads; opening it shows no readable names/addresses/notes (FR-019).
2. In a second browser profile (or after clearing local data) with the **same**
   wallet, **Import** the file. → All contacts/addresses/networks/notes restored
   (FR-020).
3. Try importing with a **different** wallet, or a corrupted file. → Clear error; no
   data revealed; existing book unchanged (FR-021).
4. Import a file that overlaps existing contacts. → New addresses added, existing
   kept (no duplicates); differing nickname/notes prompt keep/take per conflict
   (FR-022).

**Expected**: Same-wallet round-trip restores 100%; wrong wallet/corrupt fails
safely; overlap merges additively.

## Accessibility & quality gates

```bash
npm run test:frontend       # includes vitest-axe checks (expect no violations)
cd frontend && npm run lint  # ESLint must be clean
```

- Verify keyboard operability of the panel, picker, and toast.
- Verify tags are distinguishable without colour (icon + text).

## Done / acceptance

- All five scenario groups pass manually and via Vitest.
- `npm run test:frontend` green (unit + component + axe).
- ESLint clean; no `continue-on-error` added to CI.
- No contract/subgraph/backend changes in the diff.
