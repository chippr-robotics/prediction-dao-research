# Quickstart & Validation: Membership Purchase Progress Indicator

A run/validation guide proving the feature end-to-end. Implementation details live
in `tasks.md` and the code; this file is how you confirm it works.

## Prerequisites

- Repo installed: `npm install` (root) and `cd frontend && npm install`.
- For automated tests: no chain needed (wallet/service calls are mocked in Vitest).
- For manual validation: a wallet (e.g. MetaMask) on a supported network with test
  USDC, per the existing local dev flow (`specs/006-local-dev-environment`).

## Automated validation

Run from `frontend/`:

```bash
npm run test:run -- src/test/PurchaseProgressView.test.jsx \
                    src/test/usePurchaseFlow.test.js \
                    src/test/blockchainService.purchase.test.js
```

Expected: all pass, including the accessibility (axe) assertions. Then run the full
suite and lint to satisfy constitution IV:

```bash
npm run test:run
npm run lint
```

### Scenarios the automated tests must cover

| Scenario | Maps to | Expected outcome |
|----------|---------|------------------|
| Fresh purchase, no prior allowance | US1, US2, FR-001/003/004/005 | Step list = approve → pay → sign → register; each step's label, kind, and state render and advance; "step N of M" increments |
| Purchase with sufficient allowance | FR-009 | Approve step **omitted**; list = pay → sign → register; total reflects 3 steps |
| Reject the payment prompt | US3, FR-007 | `pay` marked failed with a reason; earlier steps stay completed; Retry offered; retry does not re-approve |
| Payment succeeds, key registration fails | US3, FR-008/010 | `register` marked failed; **Retry** re-runs only key registration (no re-payment); **Continue anyway** advances to Complete with membership active + "register later" notice |
| Signature step vs transaction step | FR-003 | `sign` shows signature indicator (no gas); `approve`/`pay`/`register` show transaction indicator |
| Accessibility | FR-013, constitution V | aria-live announces active step/state; zero axe violations |

## Manual validation (happy path)

1. `cd frontend && npm run dev`; open the app and connect a wallet on a supported
   network with test USDC and **no existing membership**.
2. Open **Get Wager Access**, choose a tier, proceed through **Review**, and click
   **Confirm Purchase**.
3. Observe the **Processing view** appears between Review and Complete showing the
   ordered steps. As each wallet prompt opens, confirm the highlighted step matches
   it ("Approve…", then "Pay…", then "Sign…", then "Register…") and the progress
   position advances.
4. Approve each prompt; confirm all steps reach completed and the modal advances to
   the existing **Complete** screen with the transaction link and key-registration
   status.

## Manual validation (recovery)

1. Repeat steps 1–2 above.
2. When the **encryption-key signature/registration** prompt appears, **reject** it.
3. Confirm the Processing view marks that step **failed** with a reason, the
   already-paid steps remain completed, and both **Retry** and **Continue anyway**
   are offered.
4. Click **Continue anyway**; confirm the modal advances to Complete, the membership
   is shown active, and the "register key later in Security settings" notice is
   present. (Alternatively click **Retry** and confirm no second payment prompt
   appears.)

## Definition of done (validation)

- All scenarios in the table pass in CI (Vitest + axe), lint clean.
- Manual happy-path and recovery walkthroughs behave as described.
- No change to pricing, contracts called, or the order/number of underlying wallet
  interactions (FR-001a) — confirmed by the unchanged `purchaseRoleWithStablecoin`
  on-chain calls and the regression test that runs it without `onProgress`.
