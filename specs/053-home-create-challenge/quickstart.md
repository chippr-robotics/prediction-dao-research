# Quickstart / Validation Guide: Create-a-Challenge Home Screen

How to run and validate the home-screen redesign. Implementation detail lives in `tasks.md` and the
code; this is a run/verify guide.

## Prerequisites

- Frontend deps installed (`npm install` in `frontend/` once).
- A supported test network; an account with the required membership for creating (gating unchanged).

## Run

```bash
npm run frontend                 # Vite dev server
npm run test:frontend            # full frontend suite (Vitest)
npm run test:frontend -- CreateChallengePanel
npm run test:frontend -- HomeScreen
npm run test:frontend -- WagersPage
```

Lint + a11y gates run in CI as usual (no `continue-on-error`).

## Manual validation

### Scenario A — App opens on create (US1 / SC-001, SC-002)
- Navigate to `/app`. The **inline create view** (amount hero + number pad, memo, resolution
  selector) is the primary content — **no quick-action grid** on the screen.
- Enter a stake on the pad, add a memo, pick a resolution, and create → the existing claim-code
  result appears; a challenge is created via the unchanged flow, without leaving the home screen.
- Confirm the view is non-scrolling at 320px width.

### Scenario B — Resolution paths incl. gated oracle (US2 / SC-003, SC-006)
- On a non-Polymarket network: the **oracle** resolution option is locked/greyed (reason available).
- On a Polymarket network: selecting **oracle** opens the market-search step; pick a market → returns
  to the create view showing the market + side picker; create → oracle-settled challenge.
- Confirm there is **no** standalone "Open Oracle Challenge" modal anywhere.

### Scenario C — Accept a challenge & My Rewards (US3 / SC-004)
- From home, activate **Accept a challenge** → the unified phrase-lookup / take flow opens.
- Activate **My Rewards** → **My Wagers** opens, showing claimable payouts + "Claim Winnings".

### Scenario D — Wagers section holds everything (US4 / SC-005)
- Open the nav drawer → activate **Wagers** → lands on `/wagers`.
- Confirm every previously-home item is present and launches its flow: 1v1 friends-decide, 1v1
  oracle, make an offer, open challenge, group pool, enter phrase, my wagers, scan QR, share account.
- Toggle a card off in Preferences → it hides on `/wagers` (quick-access visibility still works).
- Confirm the home screen (`/app`) no longer shows the multi-button grid.

### Scenario E — Deep links & continuity (FR-016)
- Open `/app?oc=take&code=<four words>` → the unified lookup opens prefilled and auto-resolving.
- `/friend-market/accept`, `/pools/:address` still route as before.

### Scenario F — Accessibility (SC-007)
- Keyboard-only: reach and operate the inline create view, the Accept / My Rewards entries, and the
  Wagers nav item; focus is visible and ordered.
- Run the automated a11y checks (axe/Lighthouse in CI) → no new violations.

## Done when

- `/app` opens on the inline create view; `/wagers` holds the full grid; Accept + My Rewards work.
- Scenarios A–F pass; `npm run test:frontend` green (panel + home + wagers + finished oracle tests);
  lint + a11y gates pass with no new violations.
