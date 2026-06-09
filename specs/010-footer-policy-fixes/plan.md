# Implementation Plan: Footer & Policy-Document Corrections (UAT)

**Branch**: `feat/010-footer-policy-fixes` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-footer-policy-fixes/spec.md`

## Summary

A UAT pass found a cluster of trust-surface defects in the FairWins frontend: legal/policy
documents are hard to reach or unreachable from where users attest to them, one policy link
is broken (it points at an external docs URL that lands on the marketing site), the footer is
missing inside the authenticated app and shows a stale `© 2024`, and the consent text and
legal documents have no margins and are hard to read.

The fix is **frontend-only** (no contracts, no backend): wire the policy references in the
membership-purchase surfaces to the in-app documents, add an **Account Moderation** section to
the in-app Terms and deep-link to it, surface a **condensed legal footer** inside the app while
adding the legal links and a **dynamic copyright year** to the shared footer, and add the
missing **readability CSS** for the entry-gate notice and the legal-document pages. The
existing versioned-legal-doc system (`utils/legalDocs.js`, hash-by-content) and routes
(`/terms`, `/risk`, `/privacy`) are reused unchanged in mechanism.

## Technical Context

**Language/Version**: JavaScript (ES2020+), React 18 function components + hooks

**Primary Dependencies**: `react-router-dom` (routing/SPA), existing `utils/legalDocs.js`
(content-addressed legal-doc registry, `@noble/hashes`). **No new runtime dependencies.**

**Storage**: N/A. (Entry-gate acknowledgement already persists in `localStorage`; unchanged.)

**Testing**: Vitest + React Testing Library for unit/integration; existing axe-based
accessibility tests (`src/test/compliance.accessibility.test.jsx`); Lighthouse/axe in CI.

**Target Platform**: Modern evergreen browsers; **mobile-first** (UAT was on a ~360px phone)
through desktop. Light and dark themes (`theme.css` CSS variables).

**Project Type**: Web frontend — single-page app, **no backend** (per the project's fixed
no-backend footprint). All policy documents are in-app routes.

**Performance Goals**: No measurable perf budget; changes are CSS + small JSX/markdown edits.
No new bundle dependencies; no regression to bundle size of note.

**Constraints**: WCAG 2.1 AA must hold (contrast, focus, semantics); no `continue-on-error`
in CI lint/test/build; all policy links resolve to in-app routes (never the external
site); dark + light theme must both render the new CSS correctly; no new markdown library
(extend the existing dependency-free renderer).

**Scale/Scope**: ~4 components touched, 2 new files (shared `Footer` + its CSS), 2 new CSS
files (entry-gate, legal-doc page), 1 markdown doc edited (Terms), the markdown renderer
extended for heading anchors, plus tests. ~6–8 source files + tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|-----------|----------|------------|
| **I. Security-First Smart Contracts** | No | No `contracts/` changes. No on-chain code touched. Gate N/A. |
| **II. Test-First & Coverage** | **Yes** | Vitest tests added/updated alongside behavior: footer (condensed variant in app, legal links, dynamic year, full variant preserved), moderation link target on all three surfaces, Terms Account-Moderation section + heading anchor + SPA scroll-to-hash, accessibility (axe) for legal pages and footer. Existing `EntryGate.test`, `MembershipAttestation.test`, `LandingPage.oracle.test`, `legalDocs.test` must stay green. |
| **III. Honest State, No Mocks/Placeholders** | **Yes** | No mock data introduced. Copyright year is computed from the real current date (not hardcoded). The Account-Moderation policy is real prose added to the canonical Terms. Adding it **bumps the Terms content hash** — this is the system's honest versioning behavior (a new material version; `material: true` already set), not a workaround. Documented in research.md. |
| **IV. Fail Loudly in CI** | **Yes** | No `continue-on-error` added. Lint/test/build/accessibility steps keep failing the pipeline on error. |
| **V. Accessible, Consistent Frontend** | **Yes (primary gate)** | New readability CSS uses existing `theme.css` tokens so light/dark contrast is preserved; link semantics, focus order, and heading structure are retained; axe/Lighthouse must pass with no new violations; ESLint must stay clean. No hardcoded contract addresses/ABIs involved. |

**Additional constraints**: Tech stack unchanged (React + Vite + Vitest); no new core
technology; no key-management or deployment surface touched; no archived code imported.

**Result**: ✅ PASS — no violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/010-footer-policy-fixes/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature spec (/speckit-specify output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output — validation/run guide
├── contracts/
│   └── ui-contracts.md   # Phase 1 output — observable UI/behavioral contracts
└── checklists/
    └── requirements.md   # Spec quality checklist (/speckit-specify output)
```

### Source Code (repository root)

```text
frontend/src/
├── components/
│   ├── Footer.jsx                     # NEW — shared footer; variant="full" | "condensed"
│   ├── Footer.css                     # NEW — condensed (app) footer styles; full reuses landing-footer rules
│   ├── LandingPage.jsx                # EDIT — replace inline <footer> with <Footer /> (full)
│   ├── LandingPage.css                # EDIT (minor) — keep .landing-footer rules; add a Legal section if needed
│   ├── AdminPanel.jsx                 # EDIT — moderation policy link → /terms#account-moderation
│   ├── compliance/
│   │   ├── EntryGate.jsx              # EDIT — import EntryGate.css (readability)
│   │   └── EntryGate.css              # NEW — margins/padding/max-width/line-length, responsive, theme-aware
│   ├── ui/
│   │   └── PremiumPurchaseModal.jsx   # EDIT — moderation policy link → /terms#account-moderation
│   └── wallet/
│       └── RoleDetailsCard.jsx        # EDIT — moderation policy link → /terms#account-moderation
├── pages/legal/
│   ├── LegalDocPage.jsx               # EDIT — heading id anchors in renderMarkdown + scroll-to-hash on mount; import css
│   └── LegalDocPage.css               # NEW — readable max-width/margins/spacing, responsive, theme-aware
├── legal/
│   └── terms.md                       # EDIT — add "Account Moderation" section (anchor target)
├── App.jsx                            # EDIT — render <Footer variant="condensed" /> in AppLayout
└── test/
    ├── Footer.test.jsx                # NEW — variants, legal links, dynamic year, in-app presence
    ├── PremiumPurchaseModal.*.test.jsx# EDIT/NEW — moderation link target assertion
    ├── LegalDocPage.test.jsx          # NEW/EDIT — Account-Moderation heading + id anchor render
    └── compliance.accessibility.test.jsx # EDIT — extend axe coverage to legal page + footer
```

**Structure Decision**: Standard `frontend/` React + Vite layout (Option 2, frontend only —
there is no backend). The single notable structural choice is introducing a **shared `Footer`
component** rather than editing two footers: it centralizes the dynamic year (so FR-008 cannot
regress in one place) and the legal-link list (FR-006), and is rendered as `variant="full"` on
the landing page and `variant="condensed"` inside `AppLayout`. The full variant reproduces the
existing `.landing-footer` markup and class names verbatim so `LandingPage.oracle.test.jsx`
stays green.

## Complexity Tracking

> No constitution violations — section intentionally empty.
