# Contract: Recovery Codes in Security

Relocate the open-challenge recovery-codes feature into My Account → Security (FR-020–023, Q4).

## New component: `components/account/RecoveryCodesPanel.jsx`
Extracted verbatim (behavior-preserving) from `OpenChallengeModal.jsx:510-594` (`RecoverPanel`).

- Props: `{}` (self-contained) or `{ className? }`.
- Uses `useOpenChallengeCodeVault()` **unchanged** (`useOpenChallengeCodeVault.js:21-78`):
  - not-connected → "Connect your wallet to recover codes".
  - `hasBackup === false` → "No saved codes on this device yet".
  - "Unlock my saved codes" → one signature (cached) → `recoverCodes()` → list.
  - Each entry: `{ code, wagerId?, description?, savedAt? }` + copy button.
- MUST preserve the existing unlock/authorization step before codes are shown (FR-023).
- Accessibility: button labels, list semantics, copy feedback via live region; WCAG 2.1 AA.

## Placement: `pages/WalletPage.jsx` (Security tab)
- Add a **subsection** under the Security tab (`:399-449`), below "Encryption Key":
  ```
  {activeTab === 'security' && (
    <div className="security-section" role="tabpanel">
      … Encryption Key … 
      <div className="section"><h3>Recovery codes</h3><RecoveryCodesPanel /></div>
    </div>
  )}
  ```
- No new `WALLET_TABS` entry required (lives inside existing `security` tab). Reachable at
  My Account → Security (FR-020).

## Removal: `OpenChallengeModal.jsx`
- **Remove** the `recover` tab and its trigger entirely (Q4 — no redirect/pointer left behind).
  The modal is now create-only (also loses the `taker` tab per unified-lookup.md).

## Data integrity (MUST)
- Vault storage location and key derivation are **unchanged** (same `localStorage`, same
  signature-derived key). Codes saved before the move remain accessible with no migration
  (FR-022); no cross-device sync introduced (Out of Scope).

## Acceptance mapping
US3 AS1 (available in Security), AS2 (removed from Open Challenge surface), AS3 (prior codes intact).
