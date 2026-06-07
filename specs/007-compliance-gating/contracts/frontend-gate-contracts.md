# Contract: Frontend gate, screening, docs & admin UI

Client-side behavior contracts (React/Vite, Vitest, WCAG 2.1 AA — FR-053). No backend.

## EntryGate (`components/compliance/EntryGate.jsx`)
- Renders before any app content on first visit when no acknowledged current version in
  localStorage (FR-031). Focus-trapped, labeled, keyboard-operable modal (FR-053).
- Affirmations shown: 21+, not US/restricted, not sanctioned, lawful where located, read+agree
  to Terms & Risk Disclosure; links the **current versioned** docs by hash (FR-031/AS-4).
- VPN/circumvention warning (FR-033). "Enter" → store `{terms,risk}` hashes acknowledged in
  localStorage + grant access (AS-2). "Leave" → no access (AS-3).
- Geo-blocked visitors never reach it (Cloudflare 451 first — AS-6).
- **Not** a binding consent record — binding consent is on-chain downstream (FR-034).

## MembershipAttestation (`components/compliance/MembershipAttestation.jsx`)
- Discrete checkboxes, all **un-ticked by default** (FR-035/SC-008); cannot submit until each
  required box is ticked (FR-036).
- Copy mirrors FR-037 + FR-038 (fee-for-access-only; no profit expectation/ownership/pool
  claim; not pooled/staked/returned as winnings).
- On confirm: pass the in-force `acceptedTermsHash` into `purchaseTier/upgradeTier`
  (recorded on-chain — `membership-version-recording.md`); capture ticks in client state.

## sanctionsScreen (`utils/sanctionsScreen.js`)
- Advisory client-side read of the oracle via RPC (`isAllowed`/`isSanctioned`) for fast UX
  before key-gen/membership/wager (FR-016); address/ABI from sync artifacts (FR-055).
- Advisory only — the on-chain guard is the real enforcement; if the read fails, surface a
  fail-closed UX (don't claim "clear").

## legalDocs (`utils/legalDocs.js`) + legal pages
- Canonicalize (NFC/LF/UTF-8/trim) + `sha256` → version hash (FR-018/FR-026); expose current
  version, manifest of prior versions (retrievable by hash, FR-025), and the operator-set
  `material` flag (FR-030).
- `pages/legal/{TermsPage,RiskPage,PrivacyPage}.jsx`: render content + "Last updated ·
  Version: <hash>"; reachable in ≤2 interactions (SC-010); WCAG 2.1 AA (SC-015). All three
  docs incorporate each other by reference (FR-028).
- Re-consent: when the in-force version is flagged `material`, prompt re-acceptance at the
  next consequential act (new wager / membership), not as a browse gate (FR-030/FR-034).

## DenyListAdmin (`components/admin/DenyListAdmin.jsx`)
- Admin-only UI to add/remove deny-list addresses with a reason → calls
  `SanctionsGuard.setDenied` (SANCTIONS_ADMIN_ROLE; floppy-keystore admin) (FR-020).
- Renders the add/remove audit trail from `DenyListUpdated` events (actor/timestamp/reason)
  (SC-018). WCAG 2.1 AA; ESLint clean.

## Tests (Vitest) — see also `frontend-test-gotchas` memory
- EntryGate gating + acknowledge-state; checkbox required-state + no-pre-tick; legalDocs hash
  reproducibility + version retrieval; sanctionsScreen fail-closed UX; admin event rendering.
- Reuse generated `getContractAddress` (mock per the known gotchas), never hardcode addresses.
