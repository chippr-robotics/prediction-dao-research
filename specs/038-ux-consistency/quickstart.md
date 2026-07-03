# Quickstart: Validating UX Consistency Harmonization (038)

Runnable checks that prove the feature works end-to-end. See
[contracts/ui-contracts.md](./contracts/ui-contracts.md) for component
contracts and [data-model.md](./data-model.md) for storage semantics.

## Prerequisites

```bash
npm ci                       # repo root
npm run test:frontend        # baseline: suite green before changes
npm run frontend             # dev server → http://localhost:5173
```

No contracts/deployments changes are involved; a connected wallet is only
needed for the notification bell (it renders when connected) and full
creation-flow submission.

## Automated validation

```bash
# Full frontend suite (unit + integration + axe accessibility)
npm run test:frontend

# Feature-focused runs
cd frontend
npx vitest run src/test/DeadlineTimeline.test.jsx src/test/SetTimeModal.test.jsx \
  src/test/PillSelect.test.jsx src/test/PreferencesPanel.test.jsx \
  src/test/quickAccessPreference.test.js src/test/Dashboard.test.jsx \
  src/test/NotificationBell.test.jsx src/test/FriendMarketsModal.test.jsx \
  src/test/GroupPoolModal.test.jsx

npm run lint                 # ESLint gate (errors block build)
npm run test:e2e:fast        # Cypress smoke on the creation flows
```

Expected: all pass; axe checks report no new violations.

## Manual validation scenarios (mobile viewport ≈ 390×844 first, then desktop)

### 1. Unified time control (spec US1, SC-001/SC-006)
1. Open each creation flow: 1v1 wager, Open Challenge, Group Pool.
2. Confirm **no** native "End Date & Time" picker field and no
   "Tap to type a date" links anywhere.
3. Drag a milestone dot on the timeline — the value updates live, clamps at
   min/max, and the page does not scroll while dragging.
4. Tap a milestone time/tile — the Set date & time modal opens; entering an
   out-of-range value disables **Set** and shows the allowed range; a valid
   value updates the timeline. Exact time set in ≤ 3 interactions.
5. Keyboard: Tab to a dot, adjust with arrow keys (15 min; Shift = 1 h).

### 2. One control language (US2, SC-002/SC-003)
1. In every flow, "who settles" / "how is it resolved" / "who must approve"
   renders as a pill row — zero dropdowns; locked options (e.g. Oracle) look
   disabled and explain why.
2. Stake amount and token share one line in all flows; the token control is
   tappable everywhere — in Open Challenge/Group Pool it opens and shows the
   single supported stablecoin with an explanatory note.
3. No encryption toggle exists; a compact "End-to-end encrypted" indicator
   with a "How encryption works" disclosure replaces it, and the form is
   visibly shorter. Creating a wager against an address with no published key
   shows a truthful inline error instead of silently creating a public wager.

### 3. Brand timeline colors (US3, SC-004)
1. In light and dark themes, no orange/amber remains in timelines: accept/join
   phase is Odds Blue, active phase Winning Green, resolve phase purple —
   matching `--timeline-*` tokens in `theme.css`.
2. Milestone cards keep readable labels (non-color cues) and pass axe
   contrast checks.

### 4. Notification bell (US4, SC-005)
1. Connect a wallet; check the header at 320px, 390px, 768px, 1280px widths.
2. The bell is fully visible and circular (36×36), never clipped or padded
   into a sliver; with unread notifications the badge shows (large counts cap
   at "99+") without breaking the header.

### 5. Quick access preferences (US5, SC-007)
1. Open My Account → Preferences: all 9 quick access cards listed with
   visibility switches (all ON by default).
2. Toggle two cards off → Dashboard hides them and reflows cleanly.
3. Reload the app → choices persist (localStorage `fairwins_quickaccess_v1`).
4. Hide all cards → Dashboard shows a friendly empty state linking back to
   Preferences; restoring a card brings it back.

## Regression guardrails

- Create one wager through each flow end-to-end (testnet) and verify submitted
  values (resolution type, stake, deadlines) are unchanged by the UI rework.
- Existing wager detail views (e.g. acceptance modal) still render their
  timeline with the new colorway.
- `npm run test:frontend` and Cypress fast suite green in CI; no
  `continue-on-error` added anywhere.
