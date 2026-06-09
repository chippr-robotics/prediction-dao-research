# Phase 1 Data Model: Footer & Policy-Document Corrections

This feature is presentation-layer; it introduces **no new persisted data** and no schema
changes. The "entities" below are the conceptual objects the UI composes from existing sources.

## Policy Document (existing — reused)

The canonical, content-addressed legal document served in-app.

| Field | Description | Source |
|-------|-------------|--------|
| `docType` | `'terms' \| 'risk' \| 'privacy'` | `utils/legalDocs.js` `DOC_TYPES` |
| `label` | Human title (e.g. "Terms & Conditions") | `REGISTRY[docType].label` |
| `route` | In-app route (`/terms`, `/risk`, `/privacy`) | `REGISTRY[docType].route` |
| `content` | Raw markdown (`*.md?raw`) | `frontend/src/legal/*.md` |
| `hash` | SHA-256 of canonicalized content (the version id) | `hashDocVersion(content)` |
| `material` | Re-consent flag | `REGISTRY[docType].material` |

- **Validation/invariants**: `hash` MUST equal `hashDocVersion(content)` (already enforced by
  `legalDocs.test.js`). Canonicalization is **frozen** — not modified by this feature.
- **Change in this feature**: `terms.md` gains an **Account Moderation** section ⇒ the Terms
  `content` and therefore `hash` change to a new material version. No registry/schema change.

## Account Moderation Section (new content within Terms)

Not a standalone entity — a **referenced section** inside the Terms document.

| Aspect | Value |
|--------|-------|
| Location | New section/subheading in `frontend/src/legal/terms.md` (near §21 Suspension & Termination) |
| Heading text | `Account Moderation` (unnumbered, so the slug is clean) |
| Anchor id | `account-moderation` (slugified heading id emitted by `renderMarkdown`) |
| Deep link | `/terms#account-moderation` |
| Content | Who may freeze an account (Account Moderator role), grounds (fraud, abuse, court order, sanctions/eligibility concerns), effects (cannot create/accept wagers, claim payouts or refunds until unfrozen), relation to on-chain enforcement and to §21 |

## Footer (new component, two variants)

A site-wide region rendered from a shared `Footer` component.

| Field | `full` (landing) | `condensed` (in-app) |
|-------|------------------|----------------------|
| Brand blurb | shown | hidden |
| Oracles / Docs / Community columns | shown | hidden |
| Legal/policy links | shown (Legal group) | shown (primary content) |
| Copyright + license line | shown | shown |
| Copyright year | `new Date().getFullYear()` (dynamic) | same |

- **Legal link set** (shared constant, both variants):
  - Terms & Conditions → `/terms`
  - Risk Disclosure → `/risk`
  - Privacy Policy → `/privacy`
  - Account Moderation → `/terms#account-moderation`
- **Invariants**: every legal link resolves to an **in-app route** (FR-009); the displayed year
  is never a hardcoded past year (FR-008).

## Compliance Attestation surfaces (existing — links corrected)

The consent/warning surfaces that reference policy documents.

| Surface | File | Policy references | Change |
|---------|------|-------------------|--------|
| Entry gate | `compliance/EntryGate.jsx` | T&C `/terms`, Risk `/risk` (already links) | readability CSS only |
| Membership attestation | `compliance/MembershipAttestation.jsx` | "Terms & Conditions and the Risk Disclosure" (plain text) | see note* |
| Purchase warning card | `ui/PremiumPurchaseModal.jsx` | "Account Moderation policy" (broken external) | → `/terms#account-moderation` (new tab) |
| Admin freeze note | `AdminPanel.jsx` | "policy" (broken external) | → `/terms#account-moderation` |
| Role details | `wallet/RoleDetailsCard.jsx` | "Account Moderation policy" (broken external) | → `/terms#account-moderation` |

\* *Note on the membership attestation*: the spec's "wager attestations do not link to risk or
T&C" maps here — the checkbox label text references the documents as plain text. The links the
user needs (Terms/Risk) are reachable from the **purchase warning card / surrounding modal
copy**; making those policy references in the modal into links satisfies US1. Whether to also
linkify words *inside* an individual checkbox label is an implementation detail for `/speckit-tasks`
(linkifying within a `<label>` is acceptable but must not interfere with the checkbox hit target).

## State transitions

None introduced. The only state-ish behavior is unchanged: the entry-gate acknowledgement in
`localStorage` and on-chain accepted-Terms-hash recording at purchase (which will record the new
Terms version hash going forward — expected).
