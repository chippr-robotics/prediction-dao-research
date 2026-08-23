# Specification Quality Checklist: Member API — Private Keys, MCP Server & Agentic Assistant

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
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- **The credential model was decided against a verified platform constraint, not a preference**, so no
  [NEEDS CLARIFICATION] marker was warranted: the relay gateway persists nothing (its intent store,
  dedup map, quota windows and caches are in-process, the container declares no volume, and it runs
  single-instance). A server-issued API key requires a durable record to *be* a key; a member-signed
  grant requires none. The spec therefore states the property — the platform issues nothing and can
  recover nothing — as a requirement (FR-001) rather than leaving the mechanism open.
- **The one honest weakness is specified rather than hidden.** Revocation before expiry is the only
  stateful behaviour, and it can only be best-effort on a stateless single-instance service. FR-005
  requires every surface reporting a revocation to state its durability and name the grant's expiry;
  the edge-case list carries it explicitly. Specifying it this way was deliberate — the alternative
  (silence, or an implied permanent revocation) would be a claim about a security control that the
  service cannot keep.
- **Two failure modes are specified as retryable rather than as denials**, because both are cases of
  *not knowing* rather than *rejecting*: a contract-account signature check that could not reach the
  chain, and a membership read that failed. The platform's existing three-verdict message
  verification (`valid` / `invalid` / `unverifiable`) and its estate-read rule (`read` /
  `not-deployed` / `unreadable`) are the precedents; without them a passkey member would be told their
  key is forged every time an RPC hiccups.
- **The assistant's default is part of the requirement, not a configuration choice.** FR-018 makes
  "off, rendering nothing, sending nothing" the shipped state, and SC-005 makes it measurable, because
  an opt-in feature whose default drifts is no longer opt-in.
- **The mini-app's inability to sign is recorded as a design property**, not a gap. The mini-app host
  object exposes no signing primitive, and adding one would grant it permanently to every third-party
  package. The spec splits key creation (US1, in the app) from exploration (US5, in the console)
  accordingly, rather than describing one screen that could not exist.
- **Legal amendment is in scope and stated as a requirement** (FR-027/FR-028). The Privacy Policy today
  enumerates a closed list of what is processed and contains no AI language at all; shipping member
  chat without amending it would make a live, versioned, consent-bound document say something false.
  The existing AI clauses in the Risk Disclosure and the Terms are extended rather than duplicated,
  and no fourth legal document is introduced.
- Success criteria avoid naming any technology: they describe what a member, an agent or an auditor
  can observe (one signature, a token shown once and then absent from every storage key, distinct
  reason codes, zero requests while off, absence from the backup bundle).
