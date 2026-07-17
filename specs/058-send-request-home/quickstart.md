# Quickstart: Pay / Request / Wager Home (spec 058)

Validation guide — how to prove the feature works end-to-end. Details live in
[data-model.md](./data-model.md) and [contracts/](./contracts/).

## Prerequisites

- `npm ci` at repo root (workspaces install the frontend).
- A wallet on a supported network (Amoy 80002 is the test target: USDC at the
  configured `VITE_AMOY_USDC`, faucet funds for gas/USDC), or a passkey
  account.

## Run

```bash
npm run frontend           # Vite dev server
# open http://localhost:5173/app
```

## Automated checks

```bash
npm run test:frontend      # Vitest — includes the new suites:
#   src/lib/payments/__tests__/paymentRequest.test.js   (build/parse round-trip)
#   src/utils (homePreference tests)
#   src/test/PayPanel.test.jsx / RequestPanel.test.jsx
#   src/test/HomeScreen.test.jsx (mode switching, default pref, wager extras)
#   axe a11y coverage for the home surface
cd frontend && npx cypress run --spec 'cypress/e2e/home*'   # fast E2E smoke
```

All suites must pass; axe must report no new violations (Constitution V).

## Manual validation scenarios

1. **Default landing (US1/FR-002)** — fresh profile (clear
   `fairwins_home_v1`): `/app` opens in Pay mode — $0 USDC hero, numpad,
   recipient row, note, "Pay" button.
2. **Pay via address book (US1)** — enter amount, pick a saved contact via
   the book button, press Pay → existing transfer flow completes; recipient
   balance increases; activity ledger shows the transfer.
3. **Pay gating (FR-005)** — zero amount, unresolved recipient, amount >
   balance, and a screening-restricted address each block Pay with a clear
   reason; disconnected state shows the connect prompt.
4. **Request → QR (US2)** — switch to Request, enter amount + note, press
   Request → QR appears with the note printed beside it; Copy/Share work.
5. **Scan round-trip (US2/SC-003)** — scan the QR from another
   device/profile's Pay scanner → recipient, amount, currency, note prefill;
   confirm sends the exact requested amount.
6. **Third-party read (best effort)** — scan the QR with a generic wallet →
   it recognizes an EIP-681 payment to the requester's address.
7. **Network mismatch (FR-016)** — generate a request on Amoy, scan while
   connected to another network → mismatch surfaced with a switch affordance;
   no silent wrong-network send. A token-form URI whose token isn't the
   active network's stablecoin shows an error and prefills nothing.
8. **Bottom nav (US3/FR-010)** — at ≤768px width the three-glyph bar shows
   (outgoing / incoming / head-to-head), switches modes in place, marks the
   active glyph, and exposes accessible names; it appears only on the home
   surface. Desktop shows the segmented switcher instead.
9. **Draft retention (FR-015)** — type an amount in Pay, switch to Wager and
   back → the Pay draft is intact; the wager memo never appears in the Pay
   note.
10. **Wager unchanged (FR-012)** — in Wager mode, create a challenge
    end-to-end; Accept-a-challenge / My Wagers / ticker appear only in Wager
    mode; ticker tap from any mode lands in Wager's oracle path.
11. **Preferences (US4/FR-014)** — in Account → Home preferences set default
    view = Wager and default currency = native; reload `/app` → opens in
    Wager; Pay/Request heroes default to the native symbol. Clearing site
    storage restores Pay/USDC defaults without errors.
12. **Honest currency (Constitution III)** — on a network whose stablecoin
    is not USDC (e.g. Mordor/USC), the hero caption shows the real symbol.

## Expected outcomes

- Every scenario passes without touching contracts, `deployments/`, or the
  relay gateway — this feature is `frontend/` only (FR-018).
- `npm run lint` (frontend ESLint) stays clean; CI a11y and unit gates green.
