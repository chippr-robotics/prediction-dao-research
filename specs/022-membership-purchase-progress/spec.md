# Feature Specification: Membership Purchase Progress Indicator

**Feature Branch**: `022-membership-purchase-progress`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "when purchasing a membership the user is prompted to send 4 transactions and signing a message. the user needs needs 1) know what step of the process they are on, what transaction they are sending, and the progress in the flow. add a visual indicator of the steps and progress to the modal in order to keep the user engaged and informed"

## Context

When a member buys, upgrades, or extends Wager Participant access, confirming the
purchase triggers a sequence of separate wallet interactions: approving the
stablecoin spend, paying for the membership tier, signing a message to derive an
encryption key, and registering that key. Today the modal collapses all of these
into a single "Processing…" spinner. The member sees multiple wallet pop-ups
appear with no on-screen explanation of which one they are approving, why, how
many remain, or whether something failed partway through. This causes confusion,
abandoned purchases, and wallet prompts that get dismissed because they look
unexpected.

This feature adds a visual, step-by-step progress indicator to the purchase modal
so the member always knows what they are being asked to approve, where they are in
the sequence, and how much is left.

## Clarifications

### Session 2026-06-19

- Q: Should this feature only add the progress indicator, or also reduce the number
  of wallet prompts (e.g. EIP-2612 permit)? → A: Progress indicator only — the
  purchase mechanics (approve → pay → sign → register) are unchanged; this feature
  is presentation only.
- Q: How is the per-wallet-interaction progress laid out relative to the existing
  3-step nav (Choose Tier → Review → Complete)? → A: A dedicated "Processing" view
  shown after the member confirms — a distinct phase between Review and Complete
  that lists the ordered wallet steps with per-step state. The top-level nav stays
  at three phases.
- Q: When the member already has sufficient USDC allowance (no approval prompt),
  how should the approval step appear? → A: Omit it entirely — the indicator shows
  only the steps that will actually prompt the wallet this time, so the step count
  varies per purchase.
- Q: If a non-blocking encryption-key step (signature or registration) fails, what
  should the processing view do? → A: Mark it failed and offer BOTH an inline
  "Retry" (resumes the key step, no re-payment) and a "Continue anyway" that
  advances to Complete with a "register key later in Security settings" notice.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See which wallet action I am approving (Priority: P1)

As a member completing a purchase, when each wallet pop-up appears I can see, on
the modal, a label that tells me exactly what that pop-up is for (e.g. "Approve
USDC spending", "Pay for membership", "Sign to set up private wagers", "Register
your encryption key") and whether it is a payment/transaction or a message
signature.

**Why this priority**: This is the core need. Members are most likely to abandon
or reject a wallet prompt when they cannot tell what they are approving. Naming
the active action directly addresses the request and the abandonment risk.

**Independent Test**: Start a purchase and advance through each wallet
interaction; confirm the modal shows a distinct, human-readable label for the
currently-requested action and indicates whether it is a transaction or a
signature, matching the pop-up the wallet is showing.

**Acceptance Scenarios**:

1. **Given** a member has confirmed their purchase and the wallet is requesting
   the stablecoin approval, **When** the approval pop-up appears, **Then** the
   modal highlights an "Approve spending" step and indicates it is a transaction
   to confirm in the wallet.
2. **Given** the approval has completed and the wallet is requesting the payment,
   **When** the payment pop-up appears, **Then** the modal highlights the "Pay for
   membership" step as active.
3. **Given** the payment has completed and the wallet is requesting a message
   signature for encryption-key setup, **When** the signature pop-up appears,
   **Then** the modal highlights the signing step and clearly indicates it is a
   message to sign (no funds move) rather than a transaction.
4. **Given** the signature is complete and the key-registration transaction is
   requested, **When** that pop-up appears, **Then** the modal highlights the
   "Register encryption key" step as active.

---

### User Story 2 - Track overall progress through the flow (Priority: P1)

As a member, I can see how many steps the purchase involves, which steps are
already done, which step is active, and which are still to come, so I know how far
along I am and that progress is being made.

**Why this priority**: Knowing "step 2 of 4" and seeing completed steps keeps the
member engaged and reassured during the unavoidable wallet round-trips, directly
satisfying the "progress in the flow" requirement.

**Independent Test**: Run a full purchase and confirm that at each stage the
indicator shows completed steps as done, the current step as active, and remaining
steps as pending, with an overall position (e.g. a count or filled progress bar)
that advances as steps complete.

**Acceptance Scenarios**:

1. **Given** the purchase sequence has started, **When** the modal renders the
   progress indicator, **Then** it shows the full ordered list of steps the member
   will be asked to complete, with a clear overall position indicator.
2. **Given** a step completes successfully, **When** the next step becomes active,
   **Then** the completed step is visibly marked as done and the overall progress
   advances.
3. **Given** a wallet interaction is awaiting the member's confirmation, **When**
   the member looks at the modal, **Then** the active step shows a waiting/in-progress
   state distinct from completed and pending steps.
4. **Given** every step has completed, **When** the flow finishes, **Then** all
   steps are marked done and the member sees the existing completion confirmation.

---

### User Story 3 - Understand and recover when a step fails or is rejected (Priority: P2)

As a member, if I reject a wallet prompt or a step fails, I can see which step
failed and why, and the steps I already completed are not lost, so I can retry
from where I stopped instead of starting over or paying twice.

**Why this priority**: Multi-step on-chain flows are frequently interrupted
(rejected prompt, insufficient gas, network hiccup). Clear failure attribution and
safe recovery prevent duplicate payments and support tickets, but the happy-path
visibility (US1, US2) delivers the primary value first.

**Independent Test**: Reject the wallet prompt at a non-first step (e.g. the key
signature) and confirm the modal marks that step as failed with a reason, keeps
the earlier completed steps marked done, and offers a way to retry the failed step
without repeating already-completed payments.

**Acceptance Scenarios**:

1. **Given** the member rejects a wallet prompt for the active step, **When** the
   rejection is detected, **Then** that step is marked as failed with a plain-language
   reason and a way to retry it.
2. **Given** the membership payment already succeeded but a later step (signature
   or key registration) failed, **When** the member retries, **Then** the flow
   resumes at the failed step and does not re-request payment.
3. **Given** the encryption-key signing or registration step fails, **When** the
   processing view marks it failed, **Then** the member is offered both an inline
   "Retry" of that step (no re-payment) and a "Continue anyway" action; choosing
   "Continue anyway" advances to Complete with the membership recognized as active
   (the key step is non-blocking) and a notice that key registration can be
   completed later from Security settings.

---

### Edge Cases

- **Approval already granted**: If the member has already approved sufficient
  stablecoin allowance, the approval step is not requested by the wallet. The
  indicator MUST omit the approval step entirely in that case, showing only the
  steps that will actually prompt the wallet this time, and never leave a
  permanently "pending" step that never activates.
- **Extend flow**: The extend action does not change tier price and may not
  require a fresh approval; the indicator must show only the steps actually
  required for that action and keep the count accurate.
- **Member closes or navigates away mid-flow**: While any wallet interaction is in
  progress, the modal must remain in a state that prevents accidental dismissal of
  the in-progress purchase (consistent with current behavior that disables close
  during processing).
- **Wallet disconnects or network switches mid-flow**: The active step must surface
  the resulting error rather than appearing to hang on a waiting state forever.
- **Step takes a long time to confirm on-chain**: While waiting for a transaction
  to be mined, the active step must indicate that confirmation is pending so the
  member does not think the app has frozen.
- **Single combined transaction path**: On networks where payment grants the role
  in one transaction, the indicator must still represent the real number of wallet
  interactions for that path rather than showing steps that never occur.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The purchase modal MUST display a visual indicator of the ordered
  sequence of wallet interactions required to complete the purchase (approve
  spending, pay for membership, sign for encryption-key setup, register encryption
  key), shown in a dedicated "Processing" view presented after the member confirms
  the purchase. This view is a distinct phase between Review and Complete; the
  top-level modal nav remains three phases (Choose Tier → Review → Complete).
- **FR-001a**: This feature is presentation only. It MUST NOT change the purchase
  mechanics, pricing, the contracts called, or the order/number of underlying
  wallet interactions; it only changes how that existing sequence is surfaced to
  the member.
- **FR-002**: For the currently-active interaction, the indicator MUST show a
  human-readable label describing what the member is approving.
- **FR-003**: The indicator MUST distinguish a transaction (moves funds or changes
  on-chain state, costs gas) from a message signature (no funds move, no gas), so
  the member knows what kind of wallet prompt to expect.
- **FR-004**: The indicator MUST visually differentiate, at a minimum, three step
  states: completed, active/in-progress, and pending/upcoming.
- **FR-005**: The indicator MUST show overall progress position (for example, "step
  N of M" and/or a proportional progress bar) and advance it as each step
  completes.
- **FR-006**: When the wallet is awaiting the member's confirmation or an on-chain
  transaction is awaiting mining, the active step MUST show a waiting/in-progress
  state so the member understands the app is not frozen.
- **FR-007**: When a step fails or the member rejects a wallet prompt, the
  indicator MUST mark that specific step as failed and present a plain-language
  reason.
- **FR-008**: After a failure, the member MUST be able to retry without redoing
  already-completed paid steps (no duplicate payment).
- **FR-009**: The displayed steps MUST match the wallet interactions actually
  required for the chosen action (purchase, upgrade, or extend) and the current
  approval state. When stablecoin approval is already granted, the approval step
  MUST be omitted entirely so the indicator shows only steps that will prompt the
  wallet this time.
- **FR-010**: The encryption-key signing and registration steps MUST be presented
  as part of the sequence but treated as non-blocking. If one fails, the indicator
  MUST mark it failed and offer both an inline "Retry" of that step (without
  re-requesting payment) and a "Continue anyway" action that advances to the
  completion confirmation with the membership recognized as active and a notice
  that key setup can be completed later from Security settings.
- **FR-011**: On successful completion of all required steps, the indicator MUST
  show all steps as done and lead into the existing purchase-complete confirmation.
- **FR-012**: The modal MUST continue to prevent accidental dismissal while any
  wallet interaction is in progress.
- **FR-013**: The progress indicator MUST be perceivable to assistive technologies,
  announcing the active step, its state, and progress changes.

### Key Entities *(include if feature involves data)*

- **Purchase Step**: One required wallet interaction in the purchase sequence.
  Attributes: order/position, display label, kind (transaction vs signature),
  state (pending, active, completed, failed), optional failure reason, and whether
  it is blocking or non-blocking for membership activation.
- **Purchase Progress**: The overall state of the in-flight purchase. Attributes:
  the ordered list of steps for the chosen action, the index of the active step,
  total count, and whether the overall flow is in progress, complete, or failed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At every point during the purchase, a member can correctly identify
  which wallet action they are being asked to approve by reading only the modal.
- **SC-002**: A member can state how many steps remain and which steps are already
  done at any point in the flow, without external help.
- **SC-003**: When a wallet prompt is rejected or a step fails, a member can
  identify which step failed and successfully retry without making a duplicate
  payment.
- **SC-004**: The rate of purchases abandoned during the wallet-interaction phase
  decreases relative to the pre-feature baseline.
- **SC-005**: Support requests asking "which transaction am I signing?" or "did my
  purchase go through?" during membership purchase decrease relative to the
  pre-feature baseline.
- **SC-006**: In usability testing, at least 90% of members complete a multi-step
  purchase on the first attempt without expressing confusion about which prompt
  they are approving.

## Assumptions

- The set and order of wallet interactions follow the current purchase flow:
  optional stablecoin approval, membership payment, encryption-key signature, and
  encryption-key registration. The indicator adapts to skip interactions that are
  not required for a given action or approval state.
- The encryption-key signature and registration steps remain non-blocking for
  membership activation, consistent with current behavior where key registration
  failure is logged as non-fatal and surfaced as a recoverable warning.
- The feature changes only how progress is presented in the purchase modal; it does
  not change pricing, the contracts called, the order of operations, or the
  underlying purchase logic.
- "4 transactions and signing a message" in the request describes the member's
  perceived sequence of wallet pop-ups; the actual number can vary (for example,
  approval is skipped when allowance is already sufficient, or payment and role
  grant occur in a single transaction on some networks). The indicator reflects the
  real interactions for the member's situation rather than a fixed count.
- The existing three-phase modal framing (Choose Tier → Review → Complete) is
  retained; this feature adds a dedicated "Processing" view between Review and
  Complete — the phase where the wallet interactions occur — that surfaces
  per-interaction progress. The top-level three-phase nav is unchanged.
