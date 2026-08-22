# Specification Quality Checklist: x402 — Pay-Per-Request Access to the Member API

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Funds-touching review (constitution, Development Workflow §2)

- [x] The spec exists **because** the feature touches funds, not despite it. Money moves in this
      exchange — a payer signs a transfer and the platform submits it — and the constitution forbids
      skipping the spec for anything touching funds. The absence of a Solidity diff is not a reason
      to have skipped it.
- [x] The custody question is answered explicitly and in the negative: nothing is escrowed, no
      balance is held, no platform key signs, and no refundable float exists (FR-013, SC-004).
- [x] Both failure shapes of a payment rail are specified, not just the convenient one: *charged and
      not served* is made unreachable by ordering (FR-008), and *served and not charged* is a stated
      refusal rather than a silent free serve (FR-015).
- [x] The value-path components are named and are all **pre-existing and already reviewed** — the
      deployed payment token's own authorisation mechanism, and the deployed relay submission lane.

## Notes

- **The three product properties are requirements, not implementation notes**, because each is a
  thing the feature could plausibly ship without and be worse in a way nobody would notice until it
  mattered: a member being charged for something their membership covers; a platform quietly
  acquiring custody through a "convenient" prepaid balance; and a payment buying standing access
  rather than one answer. FR-006, FR-013 and FR-017 make all three testable.
- **The honest weakness is specified rather than hidden.** Replay protection inside the service is
  best-effort and does not survive a restart, because the service is stateless by design. FR-011
  requires that limit to be stated *and* requires the durable guarantee — the payment token's own
  record of spent authorisations — to be named alongside it. Claiming durable replay protection would
  be exactly the fabricated-certainty failure constitution III exists to prevent.
- **One limitation is stated in words rather than half-supported.** A contract-account payer cannot
  produce a signature the payment token's own mechanism accepts, so FR-012 requires a refusal whose
  **reason says so**. This looks like a departure from the platform's three-verdict rule and is not:
  the party verifying a payment is the token, and an "unverifiable — retry" answer would invite a
  retry that can never succeed (a gateway-side ERC-1271 check would pass and the token would then
  revert). What FR-012 forbids is the *bare* invalid-signature answer, which would tell a payer they
  signed wrong when they signed correctly for a scheme this rail does not take.
- **FR-012a exists because the tempting bug is to offer a price for everything that failed.** The
  paid rail stands in for "you have no membership" and for a bad key. It must never stand in for a
  read the service could not perform, a screening refusal, an under-scoped key or a rate limit —
  three of which would be charging for our own outage or our own policy, and one of which would be
  selling exactly what screening exists to refuse.
- **"A price is not an outage" is treated as a first-class honesty requirement.** An agent that reads
  a 402 as a failed read will tell a member the data is unavailable when it is available for a tenth
  of a cent. That is the same class of failure as reporting an unreadable balance as zero.
- **Pricing is deliberately per operation class**, so a future endpoint inherits an agreed price
  rather than shipping silently free or arbitrarily priced. A price of zero is specified as *not for
  sale*, never as *free*, so no surface can advertise a free paid rail.
- **The resemblance to platform fees is refused explicitly** (Assumptions). Spec 060's FeeRouter is
  the single source of truth for fees charged to members on their own transactions; a per-request
  charge to a non-member for API access is a different thing, and registering it as a platform fee
  would make the member-facing fee surfaces say something untrue.
- Success criteria avoid naming any technology: they describe what an agent, a member, an operator or
  an auditor can observe — two HTTP requests with no account, an unchanged member suite, a distinct
  reason and an unchanged balance for every refusal, and no key anywhere in the exchange.
