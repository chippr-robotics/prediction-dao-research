# Specification Quality Checklist: Monorepo Semantic Versioning & Release Promotion

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-09
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — both resolved in iteration 2
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

### Iteration 1 (2026-08-09)

Findings and fixes applied before this checklist was recorded:

- **Named tools leaked into requirements.** An early draft named GitHub Actions, Conventional
  Commits, Cloud Run, and Release Drafter inside FR text. Named tools were moved to Assumptions
  (where the existing tooling is a stated constraint) and the requirements restated in terms of
  outcomes ("CI MUST enforce as a merge-blocking check", "a second application environment MUST be
  deployed automatically from the integration branch"). One deliberate exception remains: the
  Assumptions section names the existing Release Drafter label taxonomy, because reusing it rather
  than inventing a parallel vocabulary is a scope decision, not an implementation detail.
- **Success criteria were technology-shaped.** "Deploy pipeline completes in under N minutes" was
  replaced with SC-006, "a change merged into the integration branch is serving on staging within
  30 minutes without human intervention" — same target, stated as an observable outcome.
- **Two requirements were untestable as written.** An earlier "versions follow semantic versioning"
  became FR-003, which requires this repository's own written definition of "incompatible" and
  enumerates the four cases it must cover (EIP-712 struct/domain, contract storage layout and
  external interface, mini-app host object, removed member-facing capability). A vague "staging
  mirrors production" became FR-024's enumerated-differences rule.
- **The honest-state constraint was implicit.** FR-031 and SC-010 were added: a surface must report
  an unreleased build as unreleased rather than displaying the nearest release. Constitution III
  makes displaying a version a build is not a defect, not a cosmetic issue.

### Iteration 2 (2026-08-09) — clarifications resolved

Both open markers were answered by the requester; each answer widened the requirement rather than
just filling a blank:

1. **FR-007 — versioning granularity.** Resolved to *one repository version, with independently
   versioned mini-app packages*. The mini-apps are the only artifacts with a consumer outside a
   single commit (they publish at immutable content addresses and are curated on-chain), so they
   are the only ones that earn a separate number. FR-007a states the converse explicitly, and
   FR-007b was added because the answer creates a new failure mode the spec did not previously
   name: a package version and its on-chain content address can now disagree, and that
   disagreement must be reported as a defect.
2. **FR-026 — staging chain cohort.** Initially resolved to the *testnet cohort*; **superseded in
   iteration 3** (below).

### Iteration 3 (2026-08-09) — staging scope reversed

The requester revised the FR-026 answer: staging must reach **all cohorts** and be a faithful mirror
of the build that will next be promoted to `main`. Fidelity is chosen over isolation.

The reversal was not a one-line swap, because the testnet answer had been carrying the funds-safety
argument on its own. Four things changed:

- **FR-026 / FR-026a** now require a full mirror reaching every cohort, with the mainnet estate
  resolving exactly as it will post-promotion.
- **FR-026b** was added for a constraint the new answer collides with: the project's chain rules
  derive cohort from build-time configuration and a build resolves exactly one cohort. The
  requirement holds the line — solve it without weakening the boundary or loosening the production
  build — while leaving the mechanism to the plan, since the candidate approaches differ enough in
  cost that picking one here would be a guess.
- **FR-026c / FR-026d** were added as the compensating controls the testnet answer no longer
  provides: independent funding, gas wallet, sponsorship deposit and credentials so a staging defect
  cannot reach a production resource; and honest disclosure that mainnet actions taken on staging are
  real, per constitution III.
- **FR-027a** replaced the old promotion check. Under the testnet answer, promotion verified that
  mainnet config existed at all. Under a mirror, the sharper question is whether staging and
  production differ anywhere *unenumerated* — an unlisted difference means staging did not rehearse
  what production will run.

SC-011 through SC-014 were rewritten to match; the accepted trade-off is stated in Assumptions rather
than left implicit.

### Status

All checklist items pass. The specification is ready for `/speckit-plan`.

Two items are worth revisiting during planning rather than now, as they are design questions the
spec deliberately leaves open:

- FR-014's distinction between a trivial dependency bump and one that alters deployed bytecode
  leans on the existing byte-neutrality gates. Whether those gates run early enough to inform the
  classification check, or whether the classification must be revised after they run, is a
  sequencing decision for the plan.
- FR-020's fixed-candidate requirement and FR-021's no-empty-release requirement interact with
  whatever promotion mechanism is chosen; the plan should confirm the chosen mechanism satisfies
  both without a manual freeze step.
- FR-026b is the largest open design question in the spec: how one environment reaches both cohorts
  without relaxing the build-time cohort rule that constitution III depends on. The plan must pick a
  mechanism and show it does not loosen the production build.
