# UI / Behavioral Contracts: Footer & Policy-Document Corrections

This is a frontend feature with no network API. The "contracts" below are the observable
behaviors and component interfaces that tests and reviewers verify. Each maps to spec
requirements (FR-/SC-) and is independently checkable.

## C1 — `Footer` component interface

```
Footer({ variant?: 'full' | 'condensed' })   // default 'full'
```

Guarantees:
- **C1.1** Renders a single `<footer>` landmark.
- **C1.2** `variant="full"` renders the existing landing sections (brand, Oracles, Docs,
  Community) with unchanged class names, **plus** a Legal links group. (FR-006; keeps
  `LandingPage.oracle.test` green.)
- **C1.3** `variant="condensed"` renders only the Legal links group + the copyright/license
  line (no marketing columns). (FR-007)
- **C1.4** Both variants render the Legal links, each pointing to an in-app route:
  Terms→`/terms`, Risk→`/risk`, Privacy→`/privacy`, Account Moderation→`/terms#account-moderation`.
  No Legal link targets an external/marketing host. (FR-006, FR-009, SC-002)
- **C1.5** The copyright line shows the current calendar year via `new Date().getFullYear()`
  and contains no hardcoded past year. (FR-008, SC-005)

## C2 — In-app footer presence

Guarantees:
- **C2.1** `AppLayout` renders `<Footer variant="condensed" />`, so a footer landmark is
  present on `/app`, `/main`, `/fairwins`, `/wallet`, `/friend-market/accept`, `/admin`. (FR-005, SC-004)
- **C2.2** The landing route `/` renders `<Footer />` (full). (SC-004)

## C3 — Account Moderation link target (all surfaces)

Guarantees:
- **C3.1** Every "Account Moderation policy" / freeze-policy link resolves to
  `/terms#account-moderation` — in `PremiumPurchaseModal`, `AdminPanel`, and `RoleDetailsCard`.
  (FR-002, SC-002, SC-003)
- **C3.2** No remaining anchor in `frontend/src` (non-test) points to
  `/docs/system-overview/account-moderation` or the external docs/marketing host for the
  moderation policy. (SC-002)
- **C3.3** From the purchase modal the link opens without destroying the in-progress purchase
  (e.g. `target="_blank"`). (FR-004, SC-007)

## C4 — Terms Account-Moderation section + anchor

Guarantees:
- **C4.1** Rendering `/terms` produces a heading whose text is "Account Moderation" and whose
  element `id` is `account-moderation`. (FR-003)
- **C4.2** `renderMarkdown` attaches a slug `id` to every heading it emits. (FR-003 enabler)
- **C4.3** When `/terms#account-moderation` is opened, the matching element is scrolled into
  view after render (respecting `prefers-reduced-motion`). (FR-002, SC-003)
- **C4.4** `getCurrentDocument('terms').hash === hashDocVersion(content)` still holds after the
  edit (format `/^[0-9a-f]{64}$/`). (FR-014)

## C5 — Readability

Guarantees (verified via styling + accessibility checks; exact pixel values are tasks-level):
- **C5.1** The entry-gate notice body text has non-zero horizontal padding/margin and a
  constrained width; no text is flush to the viewport edge at 360px. (FR-010, SC-006)
- **C5.2** Legal-document body (`legal-doc-body`) has a constrained reading measure
  (≈70ch/720px max-width, centered), horizontal padding, and clear paragraph/heading spacing;
  no horizontal overflow from 360px to desktop. (FR-011, FR-012, SC-006)
- **C5.3** Readability CSS uses theme tokens; light and dark themes both meet WCAG 2.1 AA
  contrast; link focus styles and heading semantics are preserved; axe reports no new
  violations on the legal pages and footer. (FR-013, SC-008)

## C6 — Regression guards (must remain green)

- **C6.1** `EntryGate.test`: T&C link `href="/terms"`, Risk link `href="/risk"` unchanged.
- **C6.2** `MembershipAttestation.test`: the required eligibility/risk attestations still present.
- **C6.3** `LandingPage.oracle.test`: footer oracle links still rendered by the full variant.
- **C6.4** `legalDocs.test`: canonicalization/hash invariants still pass.
