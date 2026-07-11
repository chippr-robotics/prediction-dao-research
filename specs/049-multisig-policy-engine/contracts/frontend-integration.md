# Frontend Integration Contract (spec 049)

How the Protect (custody) UI consumes the policy engine. All addresses via
`getContractAddressForChain('safePolicyGuard' | 'policyGuardSetup', chainId)`; `undefined` for
either ⇒ policy features render their "unsupported on this network" states (FR-013) and custody
behaves exactly as spec 043.

## `frontend/src/lib/custody/policy.js` (new module)

| Export | Contract |
|--------|----------|
| `GUARD_STORAGE_SLOT` | Safe guard slot constant. |
| `readVaultGuard(address, chainId, provider?)` | `getStorageAt` → guard address or `ZeroAddress`. |
| `getPolicyStatus(vault, chainId)` | `'none' \| 'managed' \| 'foreign' \| 'unsupported'` — `foreign` when a guard is set but ≠ our `safePolicyGuard` (renders "unrecognized rule — manage with the interface that created it"). |
| `readPolicy(safeAddress, chainId, provider?)` | Aggregates `getPolicy` + per-asset `getAssetRule` + `getAllowlist` + `nextAllowedAt` into one plain object for rendering (SC-004: one round-trip batch). |
| `encodeConfigureRules(config)` | Calldata for `configureRules` (used for both the setup helper and change proposals). Validates client-side per FR-015 before encoding. |
| `buildEnablePolicySetup(chainId, config)` | `{ setupTo, setupData }` for `buildSetupInitializer` (US1). |
| `buildPolicyChangeTx(safeAddress, chainId, config)` | Safe self-transaction `{ to: guard, value: 0, data }` fed to the existing spec 043 propose/approve queue (US3; FR-007/FR-009 inherited). |
| `previewPolicy(safeAddress, chainId, { to, value, data, operation })` | Calls `previewTransaction`; returns `{ ok, violation? }`. |
| `decodePolicyError(revertData)` | Custom-error → `{ rule, message, values }` plain-language mapping (FR-011), shared by preview and failed-execution surfaces. |
| `describeRules(policy)` | Plain-language strings ("Max 500 USDC per transaction", window semantics disclosure) used by badge/panel. |

## Component contracts

- **`PolicyStep.jsx`** (in `CreateVaultWizard`): optional step; skip ⇒ initializer unchanged
  (FR-010). Configures native + stable-token limits, allowlist entries, cooldown; shows
  plain-language summary before deploy (US1-AS1). Gated by network support. Extreme-value warnings
  per FR-015.
- **`PolicyBadge.jsx`** (in `VaultList` rows): shield badge + one-line summary for `managed`
  vaults; "unrecognized guard" marker for `foreign` (US2-AS1).
- **`PolicyPanel.jsx`** (in `VaultDetail`): full rule list with live state (window consumption,
  next-allowed time — US2-AS2/AS3); owner-only "propose change" flow rendering **current vs
  proposed** side-by-side (US3-AS1) and submitting via `buildPolicyChangeTx` + existing proposal
  queue; attach-first-policy path for `none` vaults on supported networks (US3-AS4:
  batchless two-step — `setGuard` self-tx then `configureRules` self-tx, queued sequentially,
  because policy vaults cannot delegatecall MultiSend; order enforced so rules exist before the
  guard activates? **No** — reverse order: `configureRules` first (inert without guard), then
  `setGuard` (activates) — no unguarded gap with rules half-set).
- **`ProposeTransactionForm.jsx`**: before submit, `previewPolicy`; violations render the specific
  rule + values and do not hard-block submission (US4-AS1; chain remains the enforcer).
- **Notifications**: guard `RulesConfigured`/`AllowlistChanged`/`AllowlistEnabled` events join the
  existing `custody` delivery domain watcher (FR-016); blocked executions surface via
  `decodePolicyError` on the failed proposal-execution path.

## Accessibility & style

Custody CSS patterns (`Custody.css`), WCAG 2.1 AA, vitest-axe coverage for the three new
components; no emoji icons (NavIcon line-glyph convention).

## Test contract (Vitest)

- `policy.test.js`: encode/decode round-trips, status derivation (all four states), error
  decoding for every custom error, FR-015 validation.
- Component suites: PolicyStep (skip path byte-identical initializer; configured path wires
  setup), PolicyPanel (live state render, foreign guard, change flow ordering), PolicyBadge,
  ProposeTransactionForm preview integration.
- Regression: existing custody suites unchanged and green (SC-007).
