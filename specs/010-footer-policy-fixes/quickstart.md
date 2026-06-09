# Quickstart / Validation Guide: Footer & Policy-Document Corrections

How to run and validate this feature end-to-end. Implementation details live in `tasks.md`;
the observable behaviors are defined in [contracts/ui-contracts.md](./contracts/ui-contracts.md).

## Prerequisites

- Node + repo deps installed (`npm install` at repo root, or `cd frontend && npm install`).
- Branch: `feat/010-footer-policy-fixes`.

## Run the app

```bash
npm run frontend            # Vite dev server (from repo root)
# then open the printed localhost URL
```

## Automated checks

```bash
npm run test:frontend       # full Vitest suite — all green, incl. new tests
# focused runs while iterating:
cd frontend
npx vitest run src/test/Footer.test.jsx
npx vitest run src/test/LegalDocPage.test.jsx
npx vitest run src/test/PremiumPurchaseModal*.test.jsx
npx vitest run src/test/EntryGate.test.jsx src/test/MembershipAttestation.test.jsx \
               src/test/LandingPage.oracle.test.jsx src/test/legalDocs.test.js   # regression guards
npx vitest run src/test/compliance.accessibility.test.jsx                        # axe
npm run lint                # ESLint must be clean (Principle IV/V)
```

Expected: the new tests assert C1–C5; the regression guards (C6) stay green; lint passes.

## Manual validation (maps to Success Criteria)

1. **In-app footer present + condensed (SC-004, FR-005/007)**
   - Connect/enter the app, go to `/app` and `/wallet`. A footer is visible at the bottom with
     legal links + copyright, and **without** the Oracles/Docs/Community marketing columns.

2. **Current year (SC-005, FR-008)**
   - Footer copyright reads `© 2026 …` (current year), on both the landing page and in-app.

3. **Policy links from compliance surfaces (SC-001/002/003, FR-001/002)**
   - Open the membership purchase ("Get Wager Access") flow. In the operator-powers warning,
     activate **Account Moderation policy** → a new tab opens `/terms` scrolled to the
     **Account Moderation** section; the purchase modal is still open and intact when you return.
   - Repeat from the Admin panel freeze note and the wallet Role details card — all land on the
     same in-app section, none navigate to the external/marketing site.

4. **Footer legal links (FR-006/009)**
   - From the footer, open Terms, Risk Disclosure, Privacy Policy, and Account Moderation — each
     opens the in-app document (Account Moderation → Terms at the right section). None leave the app.

5. **Readability on mobile (SC-006, FR-010/011/012)**
   - In devtools, set the viewport to **360px** wide. Open the entry-gate notice and each legal
     document: body text has clear left/right margins (not flush to the edge), comfortable line
     length, and there is **no horizontal scrollbar**.

6. **Accessibility + theme (SC-008, FR-013)**
   - Toggle dark/light theme: legal pages and footer remain readable with good contrast.
   - Run an axe/Lighthouse pass on `/terms` and an in-app page: no new violations; links are
     keyboard-focusable with visible focus.

## Done / acceptance

All automated checks pass (new + regression), and the six manual checks above behave as
described. See `spec.md` Success Criteria for the authoritative pass/fail conditions.
