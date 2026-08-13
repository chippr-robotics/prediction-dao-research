# Feature Specification: Message Signing and Verification (Protect ▸ Verify)

**Feature Branch**: `claude/message-signing-verification-ax4xbc`

**Created**: 2026-08-13

**Status**: Implemented (see Implementation Status)

**Input**: User description: "users need the capability to sign arbitrary messages to prove they control a public key. We'll add this to the 'protect' section under a new area named 'verify'. the users need the ability to both sign and to verify a message." Follow-up: "make use of bottom sheets for interactive entry so the pages are more manageable in length."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check a proof somebody handed me (Priority: P1)

A member is told "this address is mine — here is a signed message proving it". They need to find
out whether that is true before acting on it: before sending funds to that address, before
accepting it as a counterparty, before adding it to their address book as somebody they trust.

**Why this priority**: This is the task a member arrives with; the proof already exists and
somebody is asking them to rely on it. It is also the half that can never cost the member
anything — no signature, no transaction, no funds at risk — so it is the safest thing to ship
first and the most useful thing to ship alone.

**Independent Test**: Fully testable by pasting a message, a signature and an address and reading
the outcome. Delivers value with no signing capability present at all.

**Acceptance Scenarios**:

1. **Given** a message, a signature over it, and the address that made it, **When** the member
   checks the claim, **Then** the outcome states that the address signed the message.
2. **Given** a message and a signature made by a *different* address, **When** the member checks
   the claim against the stated address, **Then** the outcome states the claim does not hold and
   names the address that actually signed.
3. **Given** a message that has been altered by even one character since it was signed, **When**
   the member checks it, **Then** the outcome states the claim does not hold.
4. **Given** a claim that can only be settled by consulting a network, and that network cannot be
   reached, **When** the member checks it, **Then** the outcome states that the claim could not be
   determined and why — and does **not** state that the claim is false.
5. **Given** only a message and a signature with no stated address, **When** the member checks,
   **Then** the outcome names the address that produced the signature, or states honestly that no
   address can be named for this kind of signature.

---

### User Story 2 - Prove I control this account (Priority: P2)

A member is asked to prove they control an account — by an exchange, a counterparty, a grant
programme, a support process. They are given a challenge to sign and must return something the
asker can check.

**Why this priority**: Depends on a connected account, so it cannot be exercised as broadly as
US1, and it is the half that asks the member to perform a signing ceremony. Still core: without
it the member can only check other people's proofs and never produce their own.

**Independent Test**: Fully testable by entering a challenge, signing, and confirming the result
can be checked back to the member's own address via US1.

**Acceptance Scenarios**:

1. **Given** a connected account and a challenge, **When** the member signs it, **Then** they
   receive a record that a counterparty can check, and checking it confirms their address.
2. **Given** a challenge containing leading/trailing spaces, line breaks or non-Latin characters,
   **When** the member signs it, **Then** the signature covers the challenge exactly as given and
   still verifies.
3. **Given** the member changes the message after signing, **When** the surface re-renders,
   **Then** the previous record is no longer shown against the new text.
4. **Given** the member dismisses the signing prompt, **When** the ceremony ends, **Then** the
   surface states that signing was cancelled and nothing was signed — not that it failed.
5. **Given** an account that cannot sign a message at all, **When** the member opens the signing
   surface, **Then** the reason is stated in place of the control, and no control is offered that
   would fail when used.

---

### User Story 3 - Hand the proof over without losing anything (Priority: P3)

Having produced a proof, the member must get it to the person who asked. That person must be able
to check it without being told which parts to copy or what kind of account made it.

**Why this priority**: An enhancement to US2 rather than a separate capability — a member could
in principle send the pieces by hand. But hand-copying is where the chain identity or a trailing
character gets lost, which turns a good proof into an unverifiable one.

**Independent Test**: Testable by copying the record from the signing surface, pasting it into the
checking surface, and confirming every field populates and the outcome is correct.

**Acceptance Scenarios**:

1. **Given** a record produced by the signing surface, **When** it is pasted into the checking
   surface, **Then** every field it contains is populated without further typing, and the surface
   states what was read and when it was signed.
2. **Given** a record that cannot be read, **When** it is pasted, **Then** the problem is stated
   and the check cannot be run until it is resolved.
3. **Given** a record whose stated kind of signature disagrees with what it actually contains,
   **When** it is checked, **Then** the outcome is decided by the signature itself and not by
   what the record claims about itself.

---

### Edge Cases

- **The network cannot be reached.** Outcomes that depend on consulting a network must report
  "could not be determined", never "does not hold". This is the single most important edge case in
  the feature: the two are indistinguishable to a careless implementation and opposite in meaning
  to a member.
- **The signature recovers to a different address than the one claimed, and the claim cannot be
  settled on a network.** Not a contradiction: an account that signs through a contract legitimately
  produces exactly this appearance. Must report "could not be determined" and offer the recovered
  address as evidence, not as a verdict.
- **The record does not say which network the account is on**, and the signature can only be
  settled there. Must be reported as undeterminable with that reason named.
- **A malformed signature** (wrong shape, truncated, not a signature at all). Must produce a
  stated outcome — never a surface that appears to do nothing.
- **Anything unexpected fails internally.** Every check attempt must end in a stated outcome.
  Silence is not an acceptable result of pressing a button.
- **A record is pasted over an already-completed form.** The check must not run against text that
  could not be read, and must not be re-enabled by editing an unrelated field.
- **The member is acting as an account that has no signing key of its own** (a shared/multi-party
  account). Must refuse and say why, rather than signing as the member's personal account under
  the other account's name.
- **The member is acting as a recovered account that is currently locked.** Must state the remedy.
- **A record from a newer version of the format** carrying fields this version does not know.
  Should remain readable if the parts this version needs are present.

## Requirements *(mandatory)*

### Functional Requirements

**Signing**

- **FR-001**: Members MUST be able to sign an arbitrary message with the account they are acting as,
  from a dedicated area within Protect named "Verify".
- **FR-002**: The message MUST be signed exactly as the member entered it. The system MUST NOT trim,
  reformat, wrap, or append anything to it.
- **FR-003**: The system MUST produce a single self-contained record carrying everything a
  counterparty needs to check the proof: the message, the signature, the address claimed, and the
  network the account can be checked on.
- **FR-004**: The member MUST be able to copy the whole record, and separately the signature alone.
- **FR-005**: A record MUST NOT remain displayed against a message it does not cover.
- **FR-006**: Where the account being acted as cannot sign a message, the system MUST state the
  reason in place of the control and MUST NOT present a control that would fail when used.
- **FR-007**: A signing ceremony the member dismisses MUST be reported as cancelled, distinctly from
  a failure.

**Verification**

- **FR-008**: Members MUST be able to check whether a stated address signed a stated message.
- **FR-009**: Verification MUST resolve to exactly one of three outcomes: **confirmed**,
  **contradicted**, or **not determinable**.
- **FR-010**: A **contradicted** outcome MUST only be reported when the contradiction is actually
  established. A failure to complete the check — for any reason, including an unreachable network —
  MUST resolve to **not determinable**.
- **FR-011**: A **not determinable** outcome MUST name the reason, and MUST be presented so that it
  cannot be mistaken for a contradiction.
- **FR-012**: Where the signature recovers to an address, that address MUST be reported as evidence
  alongside any outcome, including a contradicted one.
- **FR-013**: Members MUST be able to ask "who signed this?" without stating an address, and the
  system MUST state honestly when no address can be named.
- **FR-014**: Every check the member starts MUST end in a stated outcome. An internal failure MUST
  NOT result in no visible change.
- **FR-015**: Verification MUST be available regardless of which network the member is connected to,
  and MUST NOT depend on anything being deployed for the feature.

**Exchanging records**

- **FR-016**: Pasting a record into the checking surface MUST populate every field it carries,
  and MUST state what was read and when it was signed.
- **FR-017**: A record that cannot be read MUST be reported, and the check MUST NOT be runnable
  while that is the case. The report MUST be tied to the specific entry it came from, so editing an
  unrelated entry does not clear it.
- **FR-018**: The record's own claim about what kind of signature it carries MUST NOT determine the
  outcome; the system MUST reach its own conclusion from the signature.
- **FR-019**: Text pasted that is not a record MUST be treated as ordinary input.
- **FR-020**: Checking a signature against a stated address MUST be performed **entirely on the
  member's device, with no network access**, whenever the signature is one a public key can be
  recovered from. This is the default and the common case; it MUST hold with the device offline.
- **FR-020a**: The system MUST NOT assume a network the member has not stated, and MUST NOT consult
  one on its own initiative. Consulting a network is an action the member takes explicitly, offered
  only where it could settle something the offline result could not.
- **FR-021**: Where a record names a network this build does not serve, the system MUST say so and
  name it, rather than reporting that the record was silent about its network. It MUST NOT adopt
  that network.
- **FR-021a**: Where the offline result cannot settle the claim, the system MUST state plainly what
  IS established — which address produced the bytes, or that no address can be recovered from them —
  before and alongside offering to consult a network. The unsettled part MUST NOT be presented as a
  contradiction.

**Surface**

- **FR-022**: Adding this area MUST NOT materially lengthen the Protect page. Entry to each task
  MUST be a short summary the member can scan, with the form itself on a focused surface.
- **FR-023**: Each entry MUST show its current state — the last outcome, or the reason the task is
  unavailable — without the member opening it.
- **FR-024**: Work in progress and completed results MUST survive the focused surface being closed
  and reopened.
- **FR-025**: The result of an action MUST be brought into view when it arrives.
- **FR-026**: This feature MUST NOT move funds, and MUST NOT write anything to a chain.
- **FR-027**: The surface MUST meet WCAG 2.1 AA.

### Key Entities

- **Signed message record**: The portable proof a member hands to somebody else. Carries the exact
  message, the signature, the address claimed, the network that address can be checked on, when it
  was made, and a self-description of the format. Its self-description is informational; nothing
  relies on it being truthful.
- **Verification outcome**: One of confirmed / contradicted / not determinable (named `valid` /
  `invalid` / `unverifiable` in the design artifacts and the code — this spec uses the plain-language
  terms throughout, and they map one-to-one), plus the reason
  (where the outcome is not simply confirmed), the address recovered from the signature where one
  could be, and how the conclusion was reached.
- **Signing identity**: The account the member is currently acting as. Determines whether signing is
  possible at all, how the ceremony is performed, and what a counterparty needs in order to check
  the result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member handed a proof can reach a stated outcome in under 30 seconds, entering
  nothing by hand beyond a single paste.
- **SC-002**: 100% of check attempts end in a stated outcome. There is no input, and no failure,
  that results in the member pressing the control and seeing no change.
- **SC-003**: 0% of undeterminable results are presented as contradictions. A member shown an
  undeterminable result can correctly say, unprompted, that nothing was established about the
  signature.
- **SC-004**: A proof produced by the signing surface verifies successfully when checked by the
  checking surface, for every account type that can sign, including messages containing leading and
  trailing whitespace, line breaks, and non-Latin characters.
- **SC-005**: A member acting as an account that cannot sign learns this before entering any text.
- **SC-006**: Adding this area lengthens the Protect page by no more than the height of two summary
  rows, independent of how much has been typed or produced.
- **SC-007**: The surface reports zero WCAG 2.1 AA violations under automated audit. Presentation
  in both themes and at phone and desktop widths is reviewed visually rather than by that audit —
  the automated tool evaluates structure and labelling, not rendered colour or layout — so the
  contrast and layout half of this criterion is evidenced by the visual review record, not by a
  passing test.
- **SC-008**: Verification is usable on every network the build supports, including networks where
  the product has deployed nothing.
- **SC-009**: Checking a wallet signature succeeds with the device fully offline, and issues zero
  network requests. Consulting a network happens only after the member asks for it, and never
  otherwise.

## Assumptions

- The member is either connected to an account or is only checking somebody else's proof; the
  checking half needs no account of its own beyond reaching the surface.
- Address entry reuses the platform's existing address entry, including its address book and
  scanning affordances, rather than introducing a new one.
- The record is exchanged by the member through whatever channel they already use (a message, an
  email, a support ticket). The product does not transmit it anywhere.
- Signatures do not expire on their own. A record proves control at the moment it was made; any
  freshness requirement is the asker's to impose via the challenge they supply, which is why the
  message is signed verbatim.
- Existing accounts that prove control through a contract are checkable only on the network that
  contract is on. This is a property of those accounts, not a choice this feature makes: **such an
  account has no public key**. There is no key whose signature recovers to it, and what it produces
  is an envelope only its own code can interpret, so nothing about those bytes is self-validating.
  Asking it is the only way, and its answer can change over time as its owners change. Every other
  case — anything a public key can be recovered from — is settled offline.
- The feature is client-side only: no new stored data, no new service, no new deployment.

## Implementation Status

This specification was written after the implementation, which is a process failure recorded here
rather than hidden: the repository's standard is spec-first (`/speckit-specify` → `/speckit-plan` →
`/speckit-tasks` → `/speckit-implement`), and this feature was built directly from the request and
specified afterwards. The artifacts are therefore written to describe the intended behaviour on its
own terms, and then checked against what shipped — see `tasks.md`, where every task carries the
evidence that it is (or is not) satisfied by the merged code.

Shipped in PR #1163 (merged to `staging`): commits `34cb364`, `d6a2432`, `b7a707a`.
