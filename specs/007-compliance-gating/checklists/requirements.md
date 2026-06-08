# Specification Quality Checklist: Compliance & Legal Gating Layer

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-06
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

- Two scope-forking decisions were resolved with the user up front: (1) sanctions
  compliance includes **automated on-chain wallet screening** via the Chainalysis
  on-chain Sanctions Oracle (not self-attestation only), and (2) the attestation
  audit log is **fail-closed everywhere** (no consent action completes until its
  immutable record is durably written). Both are reflected throughout the spec.
- The spec was hardened against a 3-lens adversarial review (spec-quality,
  legal-completeness, constitution-compliance). Resolved findings include: mandatory
  cryptographic origin authentication (was spoofable as an IP-allowlist-only design);
  an operator-set materiality flag separated from the content hash to make the
  re-consent trigger consistent (a hash always changes on any edit); pinning the
  audit record to the canonical document **bytes** under the same retention; audit
  chain-of-custody integrity and idempotency; a discretionary block-list, anonymizer
  detection, and wager-entry re-screen to match the Terms' broader representations
  (s.5/s.7/s.11); Privacy Policy brought under the versioned regime; and constitution
  anchors (fork test for the oracle read, WCAG 2.1 AA, sync-artifact config
  provenance, no-mock/network-scoping, test-first, CI fail-loud).
- **Content Quality — note on pinned standards**: HTTP 451 and SHA-256 appear in
  requirements because the user explicitly pinned them in the feature description;
  ISO 3166-1 is a neutral interchange standard. These are intentional, not stack
  leakage. Vendor names (Cloudflare, Google Cloud, Chainalysis) are confined to
  Assumptions/Dependencies. Success criteria were reworded to outcome-level (e.g.,
  "human-readable legal-reason explanation", "content hash") to keep SCs
  technology-agnostic.
- **Open Legal-Reconciliation Items** are documented in the spec for counsel; they do
  not block planning and are not unresolved clarifications (each has a concrete
  technical position).
- Items marked incomplete (none) would require spec updates before `/speckit-clarify`
  or `/speckit-plan`.
