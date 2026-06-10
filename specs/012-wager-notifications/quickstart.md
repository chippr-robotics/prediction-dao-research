# Quickstart: Validating Wager Activity Notifications

**Feature**: 012-wager-notifications

How to prove the feature works end-to-end. References:
[watcher-api.md](./contracts/watcher-api.md),
[notification-types.md](./contracts/notification-types.md),
[data-model.md](./data-model.md).

## Prerequisites

- Node 20+, repo installed (`npm install` at root; frontend deps via root scripts)
- Two funded test accounts (A = creator, B = opponent) in a browser wallet on
  **Polygon Amoy (80002)** — `wagerRegistry` is deployed there
  (`frontend/src/config/contracts.js:52`); or use the local hardhat chain via
  the Spec 006 local dev environment.

## Automated validation

```bash
# Pure-logic + component tests (the bulk of coverage)
npm run test:frontend

# Targeted runs while developing
cd frontend && npx vitest run src/test/diffEngine.test.js \
  src/test/derivedState.test.js src/test/deadlineWarnings.test.js \
  src/test/activityStore.test.js src/test/WagerActivityContext.test.jsx \
  src/test/NotificationBell.test.jsx
```

Expected: all green; diff-engine suite covers the full transition matrix in
notification-types.md, including idempotence (same input twice ⇒ no entries)
and the first-sight rule (fresh storage ⇒ snapshots only, no entries).

## Manual validation — core journey (US1 + US3)

```bash
npm run frontend      # Vite dev server
```

1. **Catch-up (US1)**: As A, create a wager challenging B (small USDC stake,
   short acceptance window). Close A's tab. As B (other browser/profile),
   accept the wager. Reopen A's tab → within ~10 s of load the bell shows
   **1 unread**; feed says "{B} accepted '…' — it's live". Opening the feed
   alone does NOT decrease the count; clicking the entry opens the wager AND
   clears it from the unread count (acknowledge-or-view semantics, FR-004).
   Reload A → no duplicate entry (FR-010).
2. **Live toast (US3)**: Keep A's tab open on the Dashboard. As B (or A in
   another tab), `declareWinner` per the wager's resolution type. Within 60 s
   A sees a toast and a new feed entry — "You won! Claim …" only if A actually
   won and hasn't claimed (honest finality).
3. **Claimable + badges (US2)**: With the resolved-unclaimed wager, verify the
   My Wagers entry point on the Dashboard is badged and the wager card shows a
   "Claim" badge. Claim → both badges clear; a "Winnings paid" receipt entry
   appears on the next poll. Also verify the My Wagers tabs show NO legacy
   unread counts (removed per FR-016), and that opening a wager's detail view
   clears that wager's unread feed entries.
4. **Deadline warning (US4)**: Create a wager with an acceptance deadline
   < 24 h away. Open the app as B → warning entry "expires {time} — accept
   before it's gone". Reload twice → still exactly one warning entry today.

## Manual validation — scoping & resilience (edge cases)

5. **Account switch**: switch the wallet from A to B → feed/unread/badges swap
   to B's state instantly; switch back → A's state intact. No mixed entries.
6. **Network switch**: switch Amoy ↔ Polygon mainnet → feed shows only the
   active network's activity (FR-009).
7. **Storage reset (FR-012)**: with a claimable wager, DevTools → clear the
   `fw_user_…_wager_activity_v1_…` key, reload → feed is empty BUT the claim
   badges still show (derived live); no replayed history toasts.
8. **RPC failure (FR-015)**: DevTools → Network → block the RPC host, wait one
   poll cycle → no new (fabricated) entries, at most one "can't refresh"
   notice; unblock → next poll picks up changes that happened meanwhile.
9. **Accessibility**: keyboard-only — Tab to the bell (label announces unread
   count), Enter opens the feed, arrows/Tab traverse entries, Escape closes.
   Run the axe browser check on Dashboard with the feed open: no violations.

## Validation status (2026-06-10, implementation pass)

Automated coverage is complete and green: **1,188 tests / 88 files** pass,
including 247 tests written for this feature (derivedState 75, diffEngine 48,
activityStore 30, deadlineWarnings 28, provider 19, drawProposalScan 15,
bell/feed 13 incl. two axe audits with zero violations, badges 12,
feedNavigation 4, status-name regression 4 — minus shared fixtures). ESLint: 0
errors (2 pre-existing warnings in untouched files). Production build: clean.

Steps 1–8 are encoded in the automated suites at the unit/integration level
(catch-up, acknowledge-or-view read semantics, scoping, storage reset,
RPC-failure resilience, toast policy, badges, deadline anti-spam). The
**manual two-account walkthrough on Amoy (real wallet + on-chain txs) has not
been run** — it needs a human with funded test accounts; run it before
merging or as the PR review checklist.

## Acceptance gates (from spec Success Criteria)

| Gate | Check |
|---|---|
| SC-001 | Step 1 change visible ≤ 10 s after load |
| SC-002 | Step 2 toast ≤ 60 s after confirmation |
| SC-003 | Step 3 badges: all action-needed wagers badged, none others |
| SC-004 | Step 4 warning visible in the feed in every session until the deadline passes; new warning alerts ≤ 1 per wager per window per day |
| SC-005 | Steps 5–6 zero cross-account / cross-network leakage |
| SC-007 | Step 1 reload + step 7: zero duplicate entries |
