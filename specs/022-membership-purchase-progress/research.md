# Phase 0 Research: Membership Purchase Progress Indicator

All open questions from the spec were resolved during `/speckit-clarify`
(presentation-only scope; dedicated Processing view; omit approval when not needed;
non-blocking key failure offers Retry + Continue anyway). This document records the
design decisions that turn those clarifications into an implementable approach. No
external/library research was required — no new dependencies are introduced.

## R1. Surfacing the approve/pay sub-steps without changing mechanics

**Decision**: Add an optional `onProgress(event)` callback parameter to
`purchaseRoleWithStablecoin(...)`. It fires at the existing decision points the
function already reaches: `approve:start` / `approve:sent` / `approve:confirmed`
(only when an approval is actually needed), and `pay:start` / `pay:sent` /
`pay:confirmed`. The on-chain calls, their arguments, and their order are
unchanged; the callback only reports what the function is already doing.

**Rationale**: The approve and pay interactions are currently invisible because
they happen inside the service function while the modal shows one spinner. A
callback is the smallest, non-breaking change (the parameter is optional; existing
callers are unaffected) and keeps the orchestration in the modal layer where the UI
state lives. It satisfies FR-001a (no mechanics change) and constitution III
(honest state — events reflect the real tx lifecycle).

**Alternatives considered**:
- *Move approve/pay orchestration into the modal* — rejected: duplicates contract
  resolution/allowance logic already centralized in the service, higher regression
  risk, violates simplicity (YAGNI).
- *Poll provider/tx state from the modal* — rejected: racy, no clean mapping to
  "which prompt is open", more code than a callback.
- *Emit via a shared event bus* — rejected: over-engineered for one call site.

## R2. Building the exact step list up front (omit approval when not needed)

**Decision**: Before starting the flow, perform a **read-only pre-flight**: read
the member's stablecoin `allowance` (and reuse the existing balance read) for the
resolved spender. If `allowance >= price`, the approval step is excluded from the
step list entirely; otherwise it is included as the first step. The pay, sign, and
register steps are always present for a fresh purchase. The same `onProgress`
events confirm/repair the list at runtime if state changed between pre-flight and
execution (defensive — if the wallet unexpectedly prompts for approval, the step is
re-inserted; if not needed, no step lingers pending).

**Rationale**: FR-009 + the clarification require omission (not a "skipped/greyed"
step) when approval is unneeded. Knowing the list before any prompt lets the
overall progress count ("step N of M") be correct from the first render. The
pre-flight is a cheap read with no wallet prompt, consistent with the existing
in-service allowance check.

**Alternatives considered**:
- *Always show approval, mark it skipped* — rejected: contradicts the clarified
  decision to omit.
- *Discover steps lazily as prompts occur* — rejected: makes "M" (total) unknown
  until late, undermining the progress goal (US2).

## R3. Mapping the encryption-key flow to two distinct steps

**Decision**: Split the modal's current single `keyRegStatus === 'registering'`
phase into two ordered steps:
1. **Sign** — `ensureInitialized()` triggers `signer.signMessage(...)` to derive
   the encryption key (a *signature*, not a transaction; no gas).
2. **Register** — `ensureKeyRegistered(...)` sends the `registerKey` /
   `registerKeyWithEligibility` *transaction* on-chain.

Each step reports its own active/confirmed/failed state. Both are flagged
`blocking: false`.

**Rationale**: US1 requires distinguishing a signature from a transaction; these
two interactions are genuinely different wallet prompts and currently hidden under
one label. Splitting them gives accurate per-prompt labeling and lets failure
attribution (US3) name the right step.

**Alternatives considered**:
- *Keep them as one "encryption setup" step* — rejected: fails US1 (a signature and
  a transaction look different in the wallet; collapsing them re-creates the
  confusion this feature exists to remove).

## R4. Resumable retry without re-payment

**Decision**: The `usePurchaseFlow` hook is a small state machine that records the
**result of each completed step** (notably the purchase receipt once `pay` is
confirmed). Retry re-runs only from the failed step forward:
- Approve/pay failure → re-invoke `purchaseRoleWithStablecoin`. Because the service
  re-checks allowance internally, a previously-succeeded approval is naturally
  skipped, so retry never re-approves or double-pays.
- Sign/register failure (payment already confirmed) → retry calls **only**
  `ensureInitialized` / `ensureKeyRegistered`; it does **not** call the purchase
  function again. This guarantees FR-008 (no duplicate payment).

For non-blocking key steps, the view also exposes **Continue anyway**, which
finalizes the flow as success (membership active) and advances to Complete with the
existing "register key later in Security settings" notice.

**Rationale**: Multi-step on-chain flows are frequently interrupted; safe,
position-aware resume is the core of US3 and prevents the worst failure mode
(paying twice). Keying retry on recorded step results makes the guarantee explicit
rather than relying on idempotency by luck.

**Alternatives considered**:
- *Restart the whole flow on any failure* — rejected: risks double-payment and
  re-prompting for already-completed steps; violates FR-008.
- *Persist progress across modal close/reopen* — rejected as out of scope: the
  clarified behavior treats key steps as non-blocking with "do it later" recovery
  from Security settings; in-session resume is sufficient.

## R5. Processing view placement and the top-level nav

**Decision**: Introduce an internal modal phase `processing` shown after the member
confirms on Review and before Complete. While processing, the modal content area
renders `<PurchaseProgressView>`; the existing top three-phase stepper (Choose Tier
→ Review → Complete) is retained and unchanged in count, with Review shown complete
and Complete pending until the flow finishes. The modal continues to disable
close/dismiss while any wallet interaction is in progress (FR-012, existing
`isPurchasing` guard).

**Rationale**: Matches the clarified "dedicated Processing view between Review and
Complete; top nav stays three phases." Reuses the existing `ppm-step*` visual
tokens and the `isPurchasing` dismissal guard, minimizing new surface area.

**Alternatives considered**: Expanding the top nav to inline every wallet step, or
nesting steps inside the Review panel — both rejected during clarification.

## R6. Accessibility of a live step indicator

**Decision**: Render the step list as a semantic list with each step exposing an
accessible name (label + kind + state, e.g. "Pay for membership, transaction, in
progress"). Use an `aria-live="polite"` region to announce the active step and
state transitions, and `role="status"` for the waiting/confirming state. Respect
the existing reduced-motion handling already present in `PremiumPurchaseModal.css`.
Validate with `vitest-axe` (zero violations) and assert announced text in tests.

**Rationale**: Constitution V (WCAG 2.1 AA) and FR-013 require the indicator be
perceivable to assistive tech, including announcing progress changes. `vitest-axe`
is already a project dependency, so this is testable in CI.

**Alternatives considered**: Visual-only indicator — rejected: violates FR-013 and
constitution V.
