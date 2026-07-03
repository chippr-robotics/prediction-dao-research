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

## Validation status (implementation pass, 2026-07-03)

Ran everything executable headlessly; flagged what still needs a human with a
real browser. Section numbers match "Manual validation scenarios" above.

- **1 (timeline control)**: steps 2, 4, 5 fully covered by
  `DeadlineTimeline.test.jsx`/`SetTimeModal.test.jsx` (no native picker,
  modal range validation, keyboard stepping). Step 3's drag-updates-live and
  clamp behavior is covered by simulated Pointer Events; "the page does not
  scroll while dragging" (the `touch-action: none` CSS) can only be proven on
  a real touchscreen — needs manual check.
- **2 (control language)**: fully covered by `PillSelect.test.jsx` +
  the three modals' test suites (pill rows, disabled-option explanations,
  stake+token one line and always tappable, no encryption toggle, honest
  no-key error). "The form is visibly shorter" is qualitative — SC-003's
  measurable proxy (at least one full control block removed) holds by
  inspection of the diff; a pixel/visual confirmation is not automated.
- **3 (brand colors)**: `timelineColors.axe.test.jsx` proves no amber
  literal reaches the DOM and the `--timeline-*` tokens are referenced.
  Actual rendered pixel color and contrast in light/dark theme is out of
  reach in jsdom (see T027) — needs a real-browser/visual check.
- **4 (notification bell)**: `NotificationBell.test.jsx` proves the shipped
  CSS resets padding/box-sizing/min-size (source-text check, since jsdom
  doesn't apply real stylesheets) and the badge caps at "99+". Literal
  pixel visibility across 320/390/768/1280px needs a real browser.
- **5 (quick access preferences)**: fully covered by
  `quickAccessPreference.test.js` + `PreferencesPanel.test.jsx` +
  `Dashboard.test.jsx`, including the empty-state and cross-component sync.
  "Reload the app" is exercised as localStorage round-tripping across
  independent test renders, not a literal browser reload.
- **Regression guardrails**: no other component renders the timeline CSS
  classes outside the three creation flows (`grep` confirms
  `DeadlineTimeline.jsx` is the sole producer) — no separate "wager detail"
  timeline was missed. End-to-end testnet wager creation and the Cypress fast
  suite were **not** completed — `npm run test:e2e:fast` is blocked in this
  sandbox by an infrastructure limitation (Electron cannot open network
  sockets here: `CreatePlatformSocket() failed: Address family not supported
  by protocol`), reproduced across three independent attempts and unrelated
  to this change. Re-run Cypress in a normal CI runner before merge.
- `npm run test:frontend`: 1928/1932 pass; the 4 failures are pre-existing
  and unrelated (`AddressBookPanel.test.jsx`, reproduces identically with
  this feature's changes stashed out). `npm run lint`: 0 errors.
