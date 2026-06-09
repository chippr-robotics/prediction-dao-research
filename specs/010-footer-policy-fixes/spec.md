# Feature Specification: Footer & Policy-Document Corrections (UAT)

**Feature Branch**: `feat/010-footer-policy-fixes`

**Created**: 2026-06-08

**Status**: Draft

**Input**: UAT testing feedback — "footer has 2024 date, should be 2026; the wager attestations do not link to the risk or T&C; the 'account moderation policy' sends user to the main FairWins site; need to add risks and T&C and other policy docs to footer; need footer in app; the formatting on the first entry text and the risk and policy documents need to be formatted for readability — currently there is no margin so it is hard to read."

## Overview

A round of user-acceptance testing surfaced a cluster of trust-surface defects in the
FairWins web app: legal/policy documents that users are asked to agree to are hard to
reach, one policy link is broken (it sends users off to the marketing site), the footer
is missing inside the app and shows a stale copyright year, and the consent text and
legal documents are uncomfortable to read because they have no margins. These are all
compliance- and trust-relevant: users are attesting that they have *read and agree to*
documents they currently cannot easily open or read. This feature corrects those issues.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reach the policies I'm agreeing to (Priority: P1)

A user going through the membership purchase ("Get Wager Access") flow is presented with
attestations stating they have read and agree to the Terms & Conditions and the Risk
Disclosure, and warning text that references the Account Moderation policy. The user wants
to actually open and read each of those documents before ticking the boxes and paying.

**Why this priority**: Asking users to attest that they have "read and agree to" documents
they cannot open — and pointing the one available link (Account Moderation policy) at the
wrong destination (the marketing site) — is the most serious problem found. It undermines
informed consent and the integrity of the on-chain Terms-acceptance record. Every paying
user hits this surface.

**Independent Test**: From the membership purchase modal, tap each policy reference
(Terms & Conditions, Risk Disclosure, Account Moderation policy) and confirm each opens the
correct in-app document — and that returning leaves the purchase in progress intact. This
delivers value on its own: users can read what they sign.

**Acceptance Scenarios**:

1. **Given** the membership purchase attestations are shown, **When** the user activates the "Terms & Conditions" reference, **Then** the in-app Terms & Conditions document opens.
2. **Given** the membership purchase attestations are shown, **When** the user activates the "Risk Disclosure" reference, **Then** the in-app Risk Disclosure document opens.
3. **Given** the warning text referencing the Account Moderation policy is shown, **When** the user activates "Account Moderation policy", **Then** the in-app Terms & Conditions document opens at the Account Moderation section — and the user is **not** sent to the external/marketing site.
4. **Given** the user opens a policy document from within the purchase flow, **When** they return to the app, **Then** their in-progress purchase (selected tier, ticked attestations) is not lost.

---

### User Story 2 - Find the policies and current info from the footer (Priority: P2)

A user anywhere in the app (not just on the public landing page) wants a consistent place to
find the Terms & Conditions, Risk Disclosure, Privacy Policy, and Account Moderation policy,
and to see accurate site information.

**Why this priority**: A footer with the policy documents is the conventional, expected place
to find them, and the documents must be reachable from inside the authenticated app, not only
the marketing page. The stale "2024" copyright also reads as an abandoned/untrustworthy site.

**Independent Test**: Navigate to an authenticated app view and confirm a footer is present
containing working links to all policy documents and a current copyright year.

**Acceptance Scenarios**:

1. **Given** the user is on an authenticated app view, **When** the page is displayed, **Then** a footer is visible (it is not limited to the landing page).
2. **Given** the footer is visible, **When** the user reads it, **Then** it lists Terms & Conditions, Risk Disclosure, Privacy Policy, and the Account Moderation policy, each as a working link to the corresponding in-app document.
3. **Given** the footer is visible, **When** the user reads the copyright line, **Then** it shows the current year (2026), not a stale year, and will not become stale in future years.
4. **Given** the in-app footer, **When** it is displayed, **Then** it presents a condensed set of content (policy/legal links plus copyright) rather than the full marketing columns.

---

### User Story 3 - Read the consent text and legal docs comfortably (Priority: P3)

A user (often on a phone) reading the pre-entry notice ("Before you enter FairWins") and the
legal/policy documents wants the text to be comfortable to read rather than crammed edge-to-edge.

**Why this priority**: Readable presentation of consent and legal text supports informed
agreement and basic quality, but the content is already present and legible — this is the
polish layer on top of US1/US2.

**Independent Test**: Open the pre-entry notice and each legal document on a narrow mobile
viewport and a desktop viewport and confirm the text has comfortable margins and line length
and is not flush against the screen edges.

**Acceptance Scenarios**:

1. **Given** the pre-entry "Before you enter FairWins" notice on a mobile viewport, **When** it is displayed, **Then** the body text has clear horizontal margins/padding and is not flush against the screen edges.
2. **Given** a legal document (Terms, Risk, or Privacy) on any viewport, **When** it is displayed, **Then** the text has comfortable margins, a constrained reading width, and clear spacing between paragraphs and sections.
3. **Given** the readability changes, **When** measured against accessibility standards, **Then** contrast, focus order, and semantic structure continue to meet WCAG 2.1 AA.

---

### Edge Cases

- **Opening a policy mid-purchase**: activating a policy link inside the purchase modal must not discard the user's selected tier or ticked attestations (e.g., open the document in a new tab/window or otherwise preserve state).
- **Deep link to a section**: the Account Moderation reference targets a specific section within the Terms document; if the user lands on the document, that section should be brought into view.
- **Long documents on small screens**: legal documents are long; they must remain scrollable and navigable on narrow viewports without horizontal overflow.
- **Year rollover**: the copyright year must remain correct across calendar-year boundaries without a code change.
- **Footer not crowding content**: adding a footer inside the app must not overlap or hide the existing pre-entry gate or primary app content.

## Requirements *(mandatory)*

### Functional Requirements

**Policy links from compliance surfaces (US1)**

- **FR-001**: Every reference to "Terms & Conditions", "Risk Disclosure", and "Account Moderation policy" within the membership purchase/upgrade attestation and confirmation text MUST be a working link that opens the corresponding in-app policy document.
- **FR-002**: The "Account Moderation policy" reference MUST resolve to the in-app Terms & Conditions document at its Account Moderation section, and MUST NOT navigate the user to the external/marketing site or the documentation site.
- **FR-003**: The in-app Terms & Conditions document MUST include an "Account Moderation" section that describes account freezing/moderation (who can freeze an account, on what grounds, and the consequences), exposed via a stable anchor that the Account Moderation reference targets.
- **FR-004**: Activating any policy link from within an in-progress purchase flow MUST preserve the user's in-progress state (selected tier and ticked attestations are not lost on return).

**Footer (US2)**

- **FR-005**: A footer MUST be present on authenticated app views, not only on the public landing page.
- **FR-006**: The footer MUST include working links to all in-app policy/legal documents: Terms & Conditions, Risk Disclosure, Privacy Policy, and the Account Moderation policy.
- **FR-007**: The in-app footer MUST present a condensed set of content — policy/legal links plus the copyright/license line — and omit the marketing columns (Oracles, Docs, Community) shown on the landing-page footer.
- **FR-008**: The footer copyright line MUST display the current calendar year (2026 at time of writing) and MUST update automatically over time so it never displays a stale year.
- **FR-009**: All footer policy links MUST resolve to in-app routes and MUST NOT send users to the external/marketing site.

**Readability (US3)**

- **FR-010**: The pre-entry "Before you enter FairWins" notice MUST render its body text with adequate horizontal margins/padding and a comfortable reading width on both mobile and desktop viewports, so text is not flush against the screen edges.
- **FR-011**: The in-app legal/policy documents (Terms & Conditions, Risk Disclosure, Privacy Policy) MUST render with readable formatting: adequate margins/padding, a constrained line length, and clear spacing between paragraphs and section headings.
- **FR-012**: Readability formatting MUST be responsive and work across narrow mobile widths (≈360px) through desktop widths without horizontal overflow.

**Cross-cutting**

- **FR-013**: All changes (links, footer, formatting) MUST preserve WCAG 2.1 AA conformance — link semantics, focus order, contrast, and document structure — consistent with the project's accessibility standard.
- **FR-014**: The displayed in-force document version identifier (the version/hash already shown for the legal documents and the accepted-Terms attestation) MUST remain correct and consistent after these changes.

### Key Entities *(include if feature involves data)*

- **Policy Document**: A user-facing legal/policy document (Terms & Conditions, Risk Disclosure, Privacy Policy) reachable at an in-app location and carrying a version identifier. The Account Moderation policy is represented as a referenced **section** within the Terms & Conditions document rather than a standalone document.
- **Footer**: A site-wide region listing the policy documents and a copyright/license line, presented in a full variant on the landing page and a condensed (legal-links + copyright) variant inside the app.
- **Compliance Attestation**: The consent statements shown at the entry gate and at membership purchase that reference the policy documents; the references are the links US1 must make functional.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of policy references in the membership purchase/upgrade attestation and confirmation text are activatable links that open the correct in-app document.
- **SC-002**: 0 policy/legal references anywhere in the app (entry gate, purchase flow, footer) send the user to the external/marketing or documentation site; all resolve to in-app documents.
- **SC-003**: A user can open the Account Moderation policy and land on the relevant Account Moderation content in a single tap/click from the purchase warning text.
- **SC-004**: A footer containing working Terms, Risk, Privacy, and Account Moderation links is present on 100% of authenticated app views as well as the landing page.
- **SC-005**: The footer copyright year matches the current calendar year on every view, with no hard-coded past year.
- **SC-006**: On a 360px-wide mobile viewport, the pre-entry notice and every legal document display body text with a non-zero horizontal margin (no text touching the screen edge) and no horizontal scrolling.
- **SC-007**: Opening any policy document from an in-progress purchase and returning leaves the purchase resumable without re-entering selections.
- **SC-008**: Accessibility checks (automated axe/Lighthouse audits used by the project) pass with no new violations introduced by these changes.

## Assumptions

- The footer copyright year is derived from the current date (so it shows 2026 now and updates automatically), which satisfies the "should be 2026" feedback without a future stale-year recurrence.
- The policy documents in scope are the three existing in-app documents (Terms & Conditions, Risk Disclosure, Privacy Policy) plus the Account Moderation policy, which — per the product decision captured during specification — is added as a section within the Terms & Conditions document and deep-linked, rather than as a new standalone document/route.
- The in-app footer is the condensed (legal-links + copyright) variant, per the product decision captured during specification; the landing-page footer keeps its existing fuller layout.
- Policy links opened from within the membership purchase modal open without destroying the in-progress purchase (e.g., in a new tab), to honor FR-004.
- The existing in-app document routes and version/hash mechanism are reused; no new backend or server-side rendering is introduced (consistent with the project's no-backend footprint).
- The "Terms & Conditions" and "Risk Disclosure" references on the pre-entry "Before you enter FairWins" gate are already in-app links and require only the readability treatment (US3); the broken/plain-text references are in the membership purchase attestations and confirmation text.
- The red annotation near the "Opponent Address" field in one UAT screenshot is not part of the written feedback and is therefore out of scope for this feature.

### Out of Scope

- Rewriting legal content beyond adding the Account Moderation section to the Terms.
- Any change to the opponent-address / QR-share area (handled by feature 009).
- Changes to membership pricing, tiers, or purchase logic.
- Adding new standalone policy documents or routes beyond the Account Moderation section within Terms.

### Dependencies

- The existing in-app legal-document pages and their version/hash registry.
- The existing footer used on the landing page (source of the condensed in-app variant).
- The existing membership purchase/attestation flow and pre-entry gate.
