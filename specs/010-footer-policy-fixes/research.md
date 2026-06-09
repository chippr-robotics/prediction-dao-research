# Phase 0 Research: Footer & Policy-Document Corrections

This feature has no open `NEEDS CLARIFICATION` markers (the two scope forks were resolved with
the user during `/speckit-specify`). Research here records the technical decisions behind the
plan, grounded in the actual code on `origin/main`.

## Decision 1 — Account Moderation policy: section within in-app Terms (deep-linked)

- **Decision**: Add an **Account Moderation** section to `frontend/src/legal/terms.md` and point
  every "Account Moderation policy" reference at `/terms#account-moderation`. Do **not** create a
  new standalone document or route.
- **Rationale**: Matches the product decision captured during specification, and the in-app
  no-backend pattern: Terms/Risk/Privacy are already the canonical in-app docs served from
  `utils/legalDocs.js`. Terms already carries a *Suspension and Termination* section (§21) that
  the moderation content fits beside. One canonical, content-addressed source avoids a second
  versioned document to maintain.
- **Alternatives considered**:
  - *New standalone `/account-moderation` doc + route* — rejected: more surface, a second hash to
    record/maintain, and the user chose the Terms-section option.
  - *Keep it external, fix the URL* — rejected: depends on the external docs site and conflicts
    with FR-002/FR-009 (keep users in-app), and the broader feedback to pull policy docs in-app.

## Decision 2 — There are THREE broken moderation links, not one

- **Finding**: The external `/docs/system-overview/account-moderation` link appears in:
  - `components/ui/PremiumPurchaseModal.jsx:467` ("Account Moderation policy")
  - `components/AdminPanel.jsx:578` ("policy")
  - `components/wallet/RoleDetailsCard.jsx:153` ("Account Moderation policy")
  - (also a non-link description string in `contexts/RoleContext.js:46` — left as prose.)
- **Decision**: Repoint **all three** anchors to `/terms#account-moderation`. SC-002 ("zero
  references send the user to the external/marketing site") is only met if all are fixed.
- **Rationale**: The spec scopes the fix to "anywhere in the app", not just the purchase modal.

## Decision 3 — Deep-link anchors require renderer + scroll changes

- **Finding**: `LegalDocPage.jsx`'s `renderMarkdown` emits headings as `<h2..h6>` **without `id`
  attributes**, so `/terms#account-moderation` has nothing to scroll to, and as an SPA the doc is
  rendered client-side after navigation (native fragment scroll can fire before paint).
- **Decision**:
  1. Extend `renderMarkdown` to attach a slugified `id` to every heading (e.g. text → lowercase,
     non-alphanumerics → `-`, collapse repeats, trim). Add the Terms heading as an **unnumbered**
     `### Account Moderation` so its slug is exactly `account-moderation`.
  2. Add a `useEffect` in `LegalDocPage` that, when `window.location.hash` is present, scrolls the
     matching element into view after render (and respects `prefers-reduced-motion`).
- **Rationale**: Generating heading ids is a small, dependency-free change that also improves
  accessibility/navigability for all legal docs, not just this anchor.
- **Alternatives considered**: pinning a hand-written `<a name>` in markdown (renderer doesn't
  support raw HTML; rejected); adding a markdown library (violates "no new bundle dep"; rejected).

## Decision 4 — Opening a policy from the purchase modal preserves state via new tab

- **Decision**: Keep `target="_blank" rel="noopener noreferrer"` on the moderation link in the
  purchase modal (it already uses a new tab). The same applies to any policy link reachable from
  an in-progress purchase.
- **Rationale**: Satisfies FR-004 (don't lose the in-progress purchase) with zero state-management
  complexity — the modal stays mounted in the original tab. The entry-gate T&C/Risk links stay
  same-tab (no in-progress state to lose there) so `EntryGate.test` href assertions are unaffected.

## Decision 5 — Shared `Footer` component with full/condensed variants

- **Decision**: Introduce `components/Footer.jsx` (+ `Footer.css`). `variant="full"` reproduces the
  current landing footer markup/classNames verbatim **plus** a Legal links group; `variant="condensed"`
  renders just the legal/policy links + copyright. Landing renders `<Footer />`; `AppLayout` renders
  `<Footer variant="condensed" />`.
- **Rationale**: Centralizes the dynamic year (FR-008) and the legal-link list (FR-006/FR-009) so
  they can't drift between the two footers; satisfies "footer in app" (FR-005) and "condensed legal
  footer" (the chosen option) without duplicating the copyright line in two files.
- **Implementation notes**: The full variant must keep the `SHOW_ALL_ORACLE_MODELS` conditional and
  the logo-fallback behavior currently in `LandingPage.jsx` so `LandingPage.oracle.test.jsx` (which
  asserts footer oracle links) stays green. Class names for the full variant are unchanged so the
  existing `.landing-footer` CSS continues to apply.
- **Alternatives considered**: Editing the landing footer in place and adding a separate `AppFooter`
  — rejected for duplicating the year + legal links (DRY / FR-008 regression risk).

## Decision 6 — Dynamic copyright year

- **Decision**: Render the year with `new Date().getFullYear()` (shows `2026` now, auto-updates).
- **Rationale**: Satisfies "should be 2026" without a future stale-year recurrence (FR-008/SC-005).
- **Testing note**: To keep the test deterministic across calendar years, assert the rendered year
  equals `new Date().getFullYear()` (or use fake timers), not a literal `2026`.

## Decision 7 — Readability CSS via existing theme tokens

- **Finding**: `entry-gate*` and `legal-doc-*` class names have **no CSS anywhere** — that is why
  the text is flush to the edges ("no margin").
- **Decision**: Add `compliance/EntryGate.css` and `pages/legal/LegalDocPage.css`, imported by their
  components. Use `theme.css` variables (`--text-primary`, `--bg-secondary`, `--border-color`, …)
  for color so light/dark both pass contrast. Constrain legal-doc body to a comfortable measure
  (~`70ch` / ~720px max-width, centered), add horizontal padding (≥16px on mobile), generous
  paragraph/heading spacing, and list indentation; make it responsive down to ~360px with no
  horizontal overflow. Style the entry-gate dialog as a padded, max-width, scrollable card.
- **Rationale**: Smallest change that fixes readability (FR-010/011/012) while preserving WCAG AA
  (Principle V). No structural/JSX change needed beyond the CSS import.

## Decision 8 — Terms hash bump is expected and safe

- **Finding**: `legalDocs.test.js` derives the expected hash dynamically
  (`expect(doc.hash).toBe(hashDocVersion(doc.content))`) and only format-checks (`/^[0-9a-f]{64}$/`).
  No test pins a literal Terms hash. The accepted-Terms hash recorded on-chain at purchase comes
  from `getCurrentDocument('terms').hash`.
- **Decision**: Treat the hash change from adding the Account-Moderation section as a normal new
  **material** Terms version. No code change to the hashing/canonicalization (frozen by design).
- **Rationale**: Honest versioning (Principle III). Returning users re-consent on their next
  consequential on-chain act per existing `requiresReconsent` logic — correct, not a regression.
  No fixture updates required; re-run `legalDocs.test.js` to confirm.
