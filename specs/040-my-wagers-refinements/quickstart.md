# Quickstart & Validation: My Wagers Refinements

Validation guide for spec 040. Implementation details live in [contracts/](./contracts/) and
`tasks.md`; this file lists how to prove each user story works end-to-end.

## Prerequisites

- `frontend/` dependencies installed (`npm install` at repo root).
- Dev server: `npm run frontend`, then open `/app` and launch the **My Wagers** modal.
- Tests: `npm run test:frontend` (Vitest).
- A connected wallet with a mix of wagers (pending, active, draw-proposed, resolved, draw) and at
  least one active and one terminal group pool on the active network.

## Automated checks

```bash
npm run test:frontend        # unit + component tests for all seven slices
npm run lint --workspace frontend   # ESLint must pass (Constitution IV/V)
```

New/updated tests to expect green:
`addressName.test.js`, `useOpponentName.test.jsx`, `OpponentName.test.jsx`,
`MyMarketsModal.test.jsx`, `MyPoolsSection.test.jsx`, `decryptAutoUnlock.test.js`,
plus draw-notification coverage in `diffEngine.test.js`/`wagerSource.test.js`.

## Scenario walkthroughs (manual)

### US1 — Opponent names + reveal
1. View a wager whose opponent is in your **address book** → card shows the saved nickname.
2. View one whose opponent has an **ENS reverse record** (no address-book entry) → card shows the ENS
   name.
3. View one with neither → card shows a **two-word generated name**; reload → same name (deterministic).
4. Tap any opponent name → full `0x…` address is revealed and copyable. Keyboard: Tab to it, Enter
   toggles.
5. Your own side still reads **"You"**.

### US2 — Draw clarity
1. Propose a draw on a wager → its card shows a **distinct draw state** and "You proposed · awaiting
   opponent".
2. As the counterparty (other wallet) → card shows "Opponent proposed · your turn" and a "Respond to
   Draw" action; a **notification** for the pending draw appears (bell), even without the modal open.
3. Both submit → card shows terminal **Draw**, "Both agreed · stakes returned".

### US3 — No repeated decrypt prompts
1. Open an encrypted **open challenge**, enter the four-word code once → details reveal.
2. Close and reopen My Wagers → the same challenge is **unlocked automatically**, no words prompt
   (at most one wallet signature per session).
3. Open one of **your pools** → no decrypt-words prompt at any point.

### US4 — Auto-update
1. Open My Wagers; from another actor, change a wager's state → the card updates within ~30s, no manual
   refresh.
2. Resolve/cancel a **pool** from elsewhere → the pool entry updates within ~30s.
3. Close the modal → polling stops (verify via network panel / test that the interval is cleared).

### US5 — Terminal pools archived
1. With an active pool and a terminal (resolved/cancelled) pool: on **Participating/Created** tabs only
   the **active** pool shows.
2. Open the **History** tab → the **terminal** pool appears there; the active pool does not.

### US6 — Status filter
1. Open the **Status** dropdown → **Expired** and **Disputed** are absent; remaining options
   (All, Pending Acceptance, Active, Pending Resolution, Resolved) filter correctly.
2. Default "All Status" view still hides expired wagers.

### US7 — Network pill
1. Open My Wagers → the standalone network **pill** next to the title is gone.
2. The **subtitle** still names the active network (appears exactly once in the header).

## Success criteria mapping

| Scenario | Spec success criteria |
|---|---|
| US1 steps 1–5 | SC-001 |
| US2 steps 1–3 | SC-002, SC-008 |
| US3 steps 1–3 | SC-003 |
| US4 steps 1–3 | SC-004 |
| US5 steps 1–2 | SC-005 |
| US6 steps 1–2 | SC-006 |
| US7 steps 1–2 | SC-007 |
