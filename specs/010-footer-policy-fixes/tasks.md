---

description: "Task list for Footer & Policy-Document Corrections (UAT)"
---

# Tasks: Footer & Policy-Document Corrections (UAT)

**Input**: Design documents from `/specs/010-footer-policy-fixes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contracts.md, quickstart.md

**Tests**: INCLUDED — the project constitution (Principle II, Test-First, NON-NEGOTIABLE) requires Vitest coverage alongside behavior.

**Organization**: Tasks are grouped by user story (US1=P1, US2=P2, US3=P3) so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish carry no story label)
- All paths are repo-relative under `frontend/`.

## Path Conventions

Web frontend only (no backend): source in `frontend/src/`, tests in `frontend/src/test/`. Commands run from repo root unless noted.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a known-green baseline before changes.

- [X] T001 Establish a green baseline: run `npm run test:frontend` and `npm run lint` from repo root and record the current pass state (no code changes).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: One shared module both US1 (link targets) and US2 (footer links) depend on, so the legal routes and the moderation anchor never drift.

**⚠️ CRITICAL**: Complete before starting US1 or US2.

- [X] T002 Create shared legal-link constants in `frontend/src/constants/legalLinks.js` — export `LEGAL_LINKS` (ordered: `{ label:'Terms & Conditions', href:'/terms' }`, `{ label:'Risk Disclosure', href:'/risk' }`, `{ label:'Privacy Policy', href:'/privacy' }`, `{ label:'Account Moderation', href:'/terms#account-moderation' }`) and `ACCOUNT_MODERATION_PATH = '/terms#account-moderation'`. No external/marketing hosts.

**Checkpoint**: Shared constants ready — US1 and US2 can begin (US3 has no dependency on this).

---

## Phase 3: User Story 1 - Reach the policies I'm agreeing to (Priority: P1) 🎯 MVP

**Goal**: Every policy reference in the membership-purchase/compliance surfaces is a working link to the correct in-app document, and the Account Moderation policy resolves to an in-app Terms section (never the external/marketing site), without losing an in-progress purchase.

**Independent Test**: From the purchase modal, activate Terms / Risk / Account Moderation references → each opens the right in-app document (Account Moderation → `/terms` scrolled to its section); none navigate to the external site; the purchase remains intact on return.

### Tests for User Story 1 ⚠️ (write first, must FAIL before implementation)

- [X] T003 [P] [US1] In `frontend/src/test/LegalDocPage.test.jsx` (new), assert: rendering `/terms` produces a heading with text "Account Moderation" whose element `id` is `account-moderation`, and that `renderMarkdown` emits a slug `id` on every heading. (Contract C4.1/C4.2)
- [X] T004 [P] [US1] In `frontend/src/test/moderationLinks.test.jsx` (new), assert the moderation link in `PremiumPurchaseModal`, `AdminPanel`, and `RoleDetailsCard` has `href="/terms#account-moderation"` (and `target="_blank"` in the modal), and that none render `/docs/system-overview/account-moderation`. (Contract C3.1/C3.2/C3.3)
- [X] T005 [P] [US1] In `frontend/src/test/MembershipAttestation.test.jsx` (edit), assert "Terms & Conditions" and "Risk Disclosure" are rendered as in-app links (`href="/terms"`, `href="/risk"`) reachable from the attestation section, without breaking the existing eligibility/risk attestation checks. (Contract maps to FR-001 scenarios 1–2)

### Implementation for User Story 1

- [X] T006 [US1] Add an unnumbered "Account Moderation" section to `frontend/src/legal/terms.md` (placed beside §21 Suspension and Termination): who may freeze an account (Account Moderator role), grounds (fraud, abuse, court order, sanctions/eligibility concerns), effects (cannot create/accept wagers, claim payouts or refunds until unfrozen), and relation to on-chain enforcement.
- [X] T007 [US1] Extend `renderMarkdown` in `frontend/src/pages/legal/LegalDocPage.jsx` to attach a slugified `id` to every heading (text → lowercase, non-alphanumerics → `-`, collapse/trim); add a small `slugify` helper. (Enables `#account-moderation`.)
- [X] T008 [US1] Add a scroll-to-hash `useEffect` in `frontend/src/pages/legal/LegalDocPage.jsx`: on mount/when `window.location.hash` is set, scroll the matching element into view after render, respecting `prefers-reduced-motion`. (Contract C4.3)
- [X] T009 [P] [US1] Repoint the moderation link in `frontend/src/components/ui/PremiumPurchaseModal.jsx` (line ~467) to `ACCOUNT_MODERATION_PATH` from `constants/legalLinks.js`; keep `target="_blank" rel="noopener noreferrer"` so the in-progress purchase is preserved (FR-004).
- [X] T010 [P] [US1] Repoint the moderation link in `frontend/src/components/AdminPanel.jsx` (line ~578) to `ACCOUNT_MODERATION_PATH`.
- [X] T011 [P] [US1] Repoint the moderation link in `frontend/src/components/wallet/RoleDetailsCard.jsx` (line ~153) to `ACCOUNT_MODERATION_PATH`.
- [X] T012 [US1] In `frontend/src/components/compliance/MembershipAttestation.jsx`, render "Terms & Conditions" → `/terms` and "Risk Disclosure" → `/risk` as in-app links (new tab) within the attestation section (e.g. a dedicated review line/intro paragraph), keeping the checkbox label/toggle semantics intact (link click must not toggle the checkbox).
- [X] T013 [US1] Run `frontend/src/test/legalDocs.test.js` to confirm the Terms content/hash change keeps canonicalization & hash invariants green (no fixture edits expected; FR-014/Contract C4.4).

**Checkpoint**: US1 fully functional — all policy references reachable in-app, no external leak, purchase preserved.

---

## Phase 4: User Story 2 - Find the policies and current info from the footer (Priority: P2)

**Goal**: A footer is present inside the app (condensed: legal links + copyright), the shared footer lists all policy documents as in-app links, and the copyright year is current and auto-updating.

**Independent Test**: On `/app` (and `/wallet`) a footer is visible with working Terms/Risk/Privacy/Account-Moderation links and a current-year copyright; the landing footer still shows its marketing columns; no footer link leaves the app.

### Tests for User Story 2 ⚠️ (write first, must FAIL before implementation)

- [X] T014 [P] [US2] In `frontend/src/test/Footer.test.jsx` (new), assert: condensed variant renders the four legal links with their in-app hrefs (incl. `/terms#account-moderation`) plus a copyright whose year equals `new Date().getFullYear()` and is not the literal "2024"; full variant additionally renders the Oracles/Docs/Community sections. (Contracts C1.1–C1.5)
- [X] T015 [P] [US2] In `frontend/src/test/Footer.test.jsx`, assert that rendering an `AppLayout` route shows a `<footer>` landmark (condensed) and the landing route shows the full footer. (Contracts C2.1/C2.2)

### Implementation for User Story 2

- [X] T016 [US2] Create `frontend/src/components/Footer.jsx` — `Footer({ variant = 'full' })`: dynamic year via `new Date().getFullYear()`; legal links from `LEGAL_LINKS`. Full variant reproduces the existing `.landing-footer` markup/class names (brand + `SHOW_ALL_ORACLE_MODELS` oracle conditional + Docs + Community + logo-fallback handling) **plus** a Legal links group; condensed variant renders only the Legal links group + copyright/license line.
- [X] T017 [P] [US2] Create `frontend/src/components/Footer.css` — styles for the condensed/app footer and the Legal links group, using `theme.css` tokens, responsive; the full variant continues to rely on the existing `.landing-footer` rules in `LandingPage.css`.
- [X] T018 [US2] Refactor `frontend/src/components/LandingPage.jsx` to render `<Footer />` in place of the inline `<footer>` (lines ~398–451), moving the logo-fallback state and `SHOW_ALL_ORACLE_MODELS` usage into `Footer`; keep `LandingPage.oracle.test.jsx` green (Contract C6.3).
- [X] T019 [US2] Render `<Footer variant="condensed" />` after `<Outlet />` in `AppLayout` in `frontend/src/App.jsx`.

**Checkpoint**: US1 + US2 both work independently — footer present everywhere with current year and in-app policy links.

---

## Phase 5: User Story 3 - Read the consent text and legal docs comfortably (Priority: P3)

**Goal**: The entry-gate notice and the legal documents render with comfortable margins, constrained width, and clear spacing, responsive from ~360px to desktop, preserving WCAG 2.1 AA in light and dark themes.

**Independent Test**: At a 360px viewport, the "Before you enter FairWins" notice and each legal doc have clear horizontal margins (not flush to edges), comfortable line length, and no horizontal scrolling; axe reports no new violations.

### Tests for User Story 3 ⚠️ (write first, must FAIL before implementation)

- [X] T020 [P] [US3] Extend `frontend/src/test/compliance.accessibility.test.jsx` with axe checks for the rendered `LegalDocPage` (`/terms`) and `EntryGate`, asserting no new violations, and that each component imports its stylesheet (smoke check that the CSS is wired). (Contract C5.3)

### Implementation for User Story 3

- [X] T021 [P] [US3] Create `frontend/src/components/compliance/EntryGate.css` (style `entry-gate-overlay`/`entry-gate`/`entry-gate-warning`/`entry-gate-actions`: padding, max-width card, line-height, scrollable on small screens, responsive to 360px, `theme.css` tokens) and import it in `frontend/src/components/compliance/EntryGate.jsx`. (FR-010, Contract C5.1)
- [X] T022 [P] [US3] Create `frontend/src/pages/legal/LegalDocPage.css` (style `legal-doc-page`/`legal-doc-version`/`legal-doc-nav`/`legal-doc-body`: ~70ch/720px max-width centered, horizontal padding ≥16px mobile, paragraph/heading spacing, list indentation, responsive, `theme.css` tokens) and import it in `frontend/src/pages/legal/LegalDocPage.jsx`. (FR-011/FR-012, Contract C5.2)

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T023 [P] Guard (SC-002): grep `frontend/src` excluding `test/` for `/docs/system-overview/account-moderation` and any external moderation-policy host — expect zero matches.
- [X] T024 Run `npm run test:frontend` and `npm run lint` from repo root — entire suite green (new tests + regression guards C6.1–C6.4), lint clean.
- [X] T025 Execute `specs/010-footer-policy-fixes/quickstart.md` manual validation: in-app condensed footer, current year, the three link flows (modal/admin/role), footer legal links, 360px readability of gate + legal docs, dark/light contrast, and an axe/Lighthouse pass on `/terms` and an app page.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2 / T002)**: after Setup; blocks US1 and US2 (both import `legalLinks.js`). US3 does not depend on it.
- **User Stories (Phase 3–5)**: after Foundational, the three stories are independent and may run in parallel.
- **Polish (Phase 6)**: after the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: needs T002. Internally: T006/T007 before T003 can pass; T008 depends on T007; T009–T011 depend on T002 (parallel to each other); T012 independent; T013 after T006.
- **US2 (P2)**: needs T002. Internally: T016 before T018/T019; T017 parallel to T016. Independently testable (footer links are strings; does not require US1's anchor to exist).
- **US3 (P3)**: no dependency on T002 or other stories; CSS files are independent of each other ([P]).

### Within Each User Story

- Tests are written first and must FAIL before implementation.
- For US1, the Terms section + heading-anchor (T006/T007) is the "model" layer before the scroll behavior and link wiring.

### Parallel Opportunities

- After T002: **US1, US2, and US3 can be worked in parallel** by different developers.
- US1 link fixes T009 / T010 / T011 are parallel (separate files).
- US3 CSS files T021 / T022 are parallel; the US3 test T020 can be written in parallel.
- All `[P]` test tasks within a story can be authored together.

---

## Parallel Example: User Story 1

```bash
# Author US1 tests together (they should fail initially):
Task: "LegalDocPage.test.jsx — Account Moderation heading + id anchor"
Task: "moderationLinks.test.jsx — all three links → /terms#account-moderation"
Task: "MembershipAttestation.test.jsx — T&C/Risk rendered as in-app links"

# Then the three independent link fixes in parallel:
Task: "Repoint moderation link in PremiumPurchaseModal.jsx"
Task: "Repoint moderation link in AdminPanel.jsx"
Task: "Repoint moderation link in RoleDetailsCard.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (T002).
2. Phase 3 US1 (tests → Terms section/anchor → scroll → link fixes → attestation links → hash check).
3. **STOP and VALIDATE**: policy references reachable in-app, zero external leak, purchase preserved.
4. Ship — the compliance-critical defects are resolved.

### Incremental Delivery

1. Foundation ready (T002).
2. US1 → validate → ship (MVP).
3. US2 (footer in-app + legal links + current year) → validate → ship.
4. US3 (readability CSS) → validate → ship.
5. Phase 6 polish + quickstart sign-off.

### Parallel Team Strategy

After T002: Dev A → US1, Dev B → US2, Dev C → US3. They touch largely disjoint files (US1: terms.md/LegalDocPage.jsx/modal/admin/role/attestation; US2: Footer.*/LandingPage.jsx/App.jsx; US3: EntryGate.css/LegalDocPage.css). Coordinate only on `LegalDocPage.jsx` (US1 edits JS logic, US3 adds a CSS import — small, non-conflicting).

---

## Notes

- `[P]` = different files, no incomplete-task dependency. `[Story]` maps each task to a user story for traceability.
- Verify each story's tests fail before implementing it (TDD per Constitution Principle II).
- Adding the Account Moderation section bumps the Terms version hash — expected, honest versioning (Principle III); returning users re-consent on their next on-chain act via existing logic.
- Keep all policy links pointing at in-app routes — no external/marketing hosts (SC-002, FR-009).
- Commit after each task or logical group; keep CI green (no `continue-on-error` — Principle IV).
