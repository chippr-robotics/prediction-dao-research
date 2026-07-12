# Quickstart / Validation Guide: Payments-Style Wager Create Sheets

How to run and validate the redesign end-to-end. Implementation details live in
`tasks.md` (Phase 2) and the code; this is a run/verify guide.

## Prerequisites

- Repo installed at the root (`npm install` already run once).
- Node per the repo's `.nvmrc`/engines.

## Run the app

```bash
npm run frontend          # Vite dev server for the React app
```

Open the app, connect a wallet on a supported test network, and ensure your account has
the membership tier required to create (existing gating is unchanged).

## Run the tests

```bash
npm run test:frontend                                   # full frontend suite (Vitest)
npm run test:frontend -- AmountKeypad                   # the new shared control
npm run test:frontend -- OpenChallengeModal             # a converted surface
```

Lint + a11y gates run in CI as usual (no `continue-on-error` added).

## Manual validation — do this on each of the four surfaces

Open each create sheet and confirm the shared behavior:

1. **Open Challenge** — the wager-create entry point for a code-gated challenge.
2. **Oracle Open Challenge** — the Polymarket-backed challenge sheet.
3. **1v1 create-a-wager** — the friend-market create modal (multi-token).
4. **Group Wager Pool** — the pool "create" panel (buy-in).

### Scenario A — Amount is the hero, pad drives entry (US1 / SC-002)
- The stake amount renders as the largest element of the sheet.
- The on-screen number pad is visible **on desktop width too** (resize the window).
- Tap `1`,`0`,`.`,`5`,`0` → hero shows `$10.50`; the token (USDC) is shown compactly.
- Tap a second `.` → ignored. Tap a 3rd fractional digit → ignored.
- Tap backspace repeatedly → reaches `$0` (zero state), and the primary action disables.
- **Expected**: no native OS keyboard is needed to enter the amount (SC-001).

### Scenario B — Description as memo (US2)
- The description sits **below** the amount with clearly lower visual weight.
- Leave it empty → submit stays disabled with the same prompt as before (surfaces #1/#3).
- Type a memo, submit → the exact text reaches the create action (verify via the
  success/claim-code screen and, where applicable, the encrypted metadata).

### Scenario C — No capability lost (US3 / SC-003)
Exercise every pre-existing control on each surface and confirm it still collects/submits:
- #1: resolution `PillSelect` (Either / Third-party), arbitrator entry (address book + QR)
  on the third-party path, accept/resolve `DeadlineTimeline`.
- #2: market picker + YES/NO side, derived read-only timeline.
- #3: resolution tabs/dropdown, opponent + arbitrator, Polymarket picker + side, odds,
  token `<select>` (multi-token), end-date timeline. Confirm the `$`/symbol prefix follows
  the selected token and `min 0.1 / max 1000` still validates.
- #4: max members, approval threshold `PillSelect`, join/resolve timeline.

### Scenario D — Value integrity (SC-004)
- Enter an amount via the pad (including a decimal and a backspace edit), submit, and
  confirm the value used by the create action equals the hero figure exactly.

### Scenario E — Accessibility (SC-005)
- Keyboard-only: Tab to the pad, activate keys with Enter/Space, type digits on the
  hardware keyboard — the hero updates; the pad stays visible.
- Screen reader: the current amount is announced as it changes; each pad key has a name.
- Run the automated a11y check (axe/Lighthouse in CI) → no new violations.

### Scenario F — Consistency (SC-006)
- Across all four surfaces the hero + pad + memo look and behave the same; none retains the
  old form-first amount input.

## Done when

- All four surfaces present the payments-style layout and pass Scenarios A–F.
- `npm run test:frontend` is green (new `AmountKeypad` tests + per-surface wiring tests).
- CI lint + a11y gates pass with no new violations.
