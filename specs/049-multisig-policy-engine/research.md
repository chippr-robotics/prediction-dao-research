# Research: Multisig Policy Engine (spec 049)

All Technical Context unknowns resolved. Each decision: what was chosen, why, and what else was
evaluated.

## R1. Enforcement mechanism — Safe transaction guard

**Decision**: Enforce rules with the Safe v1.4.1 **transaction guard** mechanism. A single
`SafePolicyGuard` contract (one deployment per chain) implements the Safe `Guard` interface
(`checkTransaction` / `checkAfterExecution` + ERC-165 `supportsInterface`). A vault opts in by
setting the guard (`Safe.setGuard`, a threshold-approved self-transaction, or at creation — see
R4). The Safe calls `checkTransaction` before executing **every** transaction, so an approved
transaction that violates a rule reverts and never executes (FR-003).

**Rationale**: Guards are the only Safe-native hook that runs *after* approvals and *before*
execution — exactly the spec's "constrain funds even after the owners have approved". They cannot
initiate transactions (unlike modules), so the guard adds restriction without adding a new
spending authority. Spec 043 vaults are stock Safe v1.4.1, which ships guard support.

**Alternatives considered**:
- *Safe module* — rejected: modules grant extra execution paths (they can move funds bypassing
  signatures); the security direction is backwards for a restriction feature.
- *Per-vault guard deployments* — rejected: per-vault code costs gas, sprawls addresses,
  complicates `getContractAddressForChain` resolution, and makes rule reads N-contract instead of
  one indexed singleton.
- *Zodiac (Gnosis Guild) guard framework* — rejected: heavyweight dependency for four rules; repo
  precedent (SafeProposalHub) favors small dependency-free custody contracts.
- *Client-side-only checks* — rejected: violates FR-003 (on-chain enforcement) and Constitution
  III (honest state); a colluding threshold could ignore the client.

## R2. Configuration authority — `msg.sender == safe`, no admin, non-upgradeable

**Decision**: All rule mutations on `SafePolicyGuard` require `msg.sender` to be the Safe whose
policy is being changed. There is no owner, no admin role, and **no upgradeability** (plain
non-proxy contract).

**Rationale**: A policy config call therefore only ever happens as a Safe **self-originated
transaction**, which already requires the vault's approval threshold — FR-007 falls out of the
mechanism with zero new approval plumbing, reusing spec 043's proposal queue for proposing and
approving the change (US3). No admin means no third party can weaken any vault's rules; the trust
model of a fund-restriction contract demands immutability of the enforcement logic itself.

**Constitution/CLAUDE.md note**: the "new upgradeable contracts MUST inherit `UUPSManaged`" rule
applies to contracts that need in-place logic evolution at a stable address. The guard is
deliberately **not** upgradeable — an upgradable guard would let an upgrade key rewrite every
vault's enforcement. Future rule types ship as a new guard version; vaults migrate via a
threshold-approved `setGuard` change. `check:storage-layout` is not applicable (no proxy).

**Alternatives considered**: UUPS guard (rejected — upgrade key becomes a policy backdoor);
per-vault `Ownable` config (rejected — a single owner could weaken rules, violating FR-007).

## R3. Rule semantics

**Decision** (all state keyed by `safe` address inside the singleton):

- **Counted assets**: spending limits are **per-asset**. Asset key `address(0)` = native coin;
  any ERC-20 address may carry its own limits (UI offers native + the platform stable token).
  A Safe transaction is "counted" against an asset when it (a) carries native `value` (asset 0),
  or (b) calls a token with selector `transfer(address,uint256)`,
  `transferFrom(address,address,uint256)`, or `approve(address,uint256)` (approvals are spending
  grants — counting them closes the approve-then-pull bypass). Tokens with no configured limit
  pass through limit rules unvalued (spec assumption) but still face allowlist/delay.
- **Per-transaction limit**: counted amount ≤ `perTxLimit[safe][asset]` when set (0 = unset).
- **24-hour window limit**: window opens at first counted spend (`windowStart`), accumulates
  `spentInWindow`, and resets when `block.timestamp >= windowStart + 24h`. Not a true rolling
  window — bounded at ≤ 2× limit across any straddling 24 h span; disclosed in the policy view
  (spec FR-002 wording updated accordingly).
- **Recipient allowlist**: when enabled, the **effective recipient** must be allowlisted. The
  effective recipient is the decoded token recipient (`transfer` → `to`, `transferFrom` → `to`,
  `approve` → `spender`) for token calls, otherwise the Safe transaction's target `to` (covers
  native transfers *and* arbitrary contract calls, so unknown calldata cannot escape to
  un-allowlisted contracts). Enabling requires ≥ 1 entry (lockout edge case).
- **Cooldown**: `block.timestamp - lastCountedTxAt >= cooldown` for counted transactions;
  non-fund calls (no value, unrecognized selector) are not rate-limited.
- **Hard denials while a policy is active** (any rule enabled):
  - `operation == DELEGATECALL` is rejected. Delegatecall executes foreign code in the Safe's
    own context and can bypass any guard accounting (and rewrite the guard slot). Consequence:
    **MultiSend batching is unavailable on policy-enabled vaults in v1** (spec 043 flows are
    single-call, so nothing regresses).
  - Gas-refund escrows are rejected (`gasPrice != 0` in `execTransaction`) — refunds pay
    `refundReceiver` from the vault, an uncounted outflow. Spec 043 builds transactions with
    refunds zeroed, so nothing regresses.
- **Exemptions (lockout-proofing, FR-008)**: transactions whose target is the **Safe itself**
  (owner/threshold/guard management) or the **guard** (policy configuration) bypass all fund
  rules. Both remain threshold-gated by the Safe itself. Guard-targeted calls must carry zero
  native value (guard is non-payable anyway). This makes SC-003 structural: a loosening change is
  always executable.
- **Accounting timing**: window/cooldown state is written in `checkTransaction` (guards may write
  state; the Safe reverts the whole `execTransaction` if the guard reverts). If the *inner* call
  fails without reverting the outer transaction, the spend still counts — conservative
  overcounting only ever restricts, never permits; documented in the contract and UI.
  `checkAfterExecution` is a no-op. This avoids fragile commit/rollback machinery.

**Alternatives considered**: true rolling window (per-tx timestamp queue — unbounded gas,
rejected); valuing arbitrary calldata via oracles (out of scope, dishonest precision); decoding
MultiSend batches in-guard (scope creep, v2 candidate); blanket denial of unrecognized calldata
(would break wagering/DEX integrations that operate-as-vault relies on — allowlist rule gives
groups that lockdown opt-in instead).

## R4. Policy at creation — `PolicyGuardSetup` delegatecall helper

**Decision**: A tiny `PolicyGuardSetup` contract is the `to`/`data` delegatecall target of
`Safe.setup(...)`. Executing in the new proxy's context it (1) stores the guard address in the
Safe's guard storage slot (`keccak256("guard_manager.guard.address")`), (2) emits Safe's
`ChangedGuard` event signature for indexer parity, and (3) `call`s
`SafePolicyGuard.configureRules(...)` — during that call `msg.sender` **is the new Safe**, so the
same authority rule as R2 covers creation with zero special cases. Rules are live before the
vault's first transaction (US1). `buildSetupInitializer` in `frontend/src/lib/custody/safeVault.js`
gains optional `setupTo`/`setupData` parameters (defaults preserve the current initializer
byte-for-byte, so existing vault address prediction and tests are untouched).

**Rationale**: `setGuard` after creation would leave a rule-free gap and require a second
threshold approval round; Safe's own `setup` delegatecall hook exists precisely for this pattern
(Zodiac and Safe module setups use it). The CREATE2 address prediction already hashes the full
initializer, so policy-at-creation composes with the existing deterministic-address preview.

**Alternatives considered**: post-create `setGuard` proposal auto-queued by the wizard (rejected
as primary path — violates US1 acceptance scenario 2 "active immediately"; retained as the US3
flow for *existing* vaults); custom factory wrapping SafeProxyFactory (rejected — changes the
vault deployment path spec 043 shipped and its address derivation).

## R5. Violation reporting & pre-flight

**Decision**: `checkTransaction` reverts with typed custom errors carrying the rule and values
(e.g. `PerTxLimitExceeded(asset, amount, limit)`, `RecipientNotAllowed(recipient)`,
`CooldownActive(nextAllowedAt)`, `WindowLimitExceeded(asset, attempted, remaining)`) so the UI
can decode *which rule blocked and by how much* (FR-011). For pre-flight (US4/FR-012) the guard
exposes a **read-only twin** `previewTransaction(safe, to, value, data, operation) view returns
(bool ok, bytes4 ruleErrorSelector, ...detail)` sharing the internal rule evaluation, so the
client never re-implements rule logic and cannot drift from enforcement. Live rule state for the
policy view (FR-006) comes from views: `getPolicy(safe)`, `getAssetRule(safe, asset)`,
`getAllowlist(safe)`, `remainingInWindow(safe, asset)`, `nextAllowedAt(safe)`.

**Alternatives considered**: client-side simulation via `eth_call` of `checkTransaction`
(rejected: it writes state and its revert data would need brittle decoding); duplicating rule
logic in JS (rejected: drift risk — JS keeps only thin formatting).

## R6. Frontend integration

**Decision**: Extend spec 043 surfaces in place:
- `frontend/src/lib/custody/policy.js` — encode `configureRules`/allowlist calls, read policy
  views, decode guard errors, `previewTransaction` wrapper, guard-slot read
  (`getStorageAt(GUARD_SLOT)`) to detect foreign guards.
- `CreateVaultWizard` gains an optional **Policy step** (network-gated); it switches the
  initializer to the `PolicyGuardSetup` path when rules are configured.
- `VaultDetail` gains a **PolicyPanel**: plain-language rules, live window/cooldown state,
  "unrecognized guard" notice for foreign guards (edge case), and — for owners — a rule-change
  flow that builds a Safe **self-transaction** targeting the guard and hands it to the existing
  spec 043 proposal queue (current vs proposed side-by-side; approvals bind to exact calldata via
  the existing safeTxHash mechanics, satisfying FR-009).
- `VaultList` rows show a policy badge with a one-line rule summary (FR-006).
- `ProposeTransactionForm` runs `previewTransaction` pre-flight and renders violations (US4).
- Network gating via `getContractAddressForChain('safePolicyGuard', chainId)` /
  `('policyGuardSetup', chainId)` — `undefined` renders the "policy unsupported on this network"
  states (FR-013).
- Notifications: policy events (`RulesConfigured`, `AllowlistChanged`) join the existing
  **`custody`** notification domain (`frontend/src/lib/notifications/deliveryPreferences.js`
  already defines it) via the same event-watching path spec 043 uses; blocked-execution feedback
  surfaces from decoded revert errors (FR-016).

**Alternatives considered**: a separate top-level "Policies" page (rejected: issue asks the
existing Protect view to become the portal; vault-centric placement matches how members think).

## R7. Contract testing strategy

**Decision**: Two layers under `test/custody/`:
1. **Unit** — `SafePolicyGuard.test.js` + `PolicyGuardSetup.test.js` against a minimal
   `contracts/mocks/MockSafe.sol` that mimics the Safe's guard flow (`checkTransaction` →
   inner call → `checkAfterExecution`), its guard storage slot, and a `setupDelegate` entry to
   exercise the setup helper under real delegatecall. Exhaustive rule/edge coverage (every FR-002
   combination, exemptions, delegatecall/gas-refund denial, window reset boundaries, error data).
2. **Integration** — `test/integration/policy-guard-safe.test.js` deploying the **real Safe
   v1.4.1** (add `@safe-global/safe-contracts@1.4.1` as a devDependency; pragma `>=0.7.0 <0.9.0`
   compiles under the repo's solc 0.8.24 entry): create a vault through `SafeProxyFactory` with
   the `PolicyGuardSetup` initializer, run `execTransaction` happy/blocked paths, change policy
   via self-transaction, verify ERC-165 `setGuard` acceptance for attach-to-existing-vault.

Slither runs on the new contracts (Constitution I); fuzz-worthy state (window accounting) gets
property-style unit tests. Fallback documented: if the devDependency fights the compiler matrix,
vendor the handful of Safe 1.4.1 sources under `contracts/mocks/vendor/` (test-only).

**Rationale**: MockSafe keeps the fast suite dependency-free (SafeProposalHub precedent); the
real-Safe integration layer is required because the guard's whole contract surface is the Safe's
calling convention — Constitution II calls for integration tests where external protocols are
involved.

## R8. Deployment & address plumbing

**Decision**: `scripts/deploy/custody/deploy-policy-guard.js` (mirrors
`deploy-safe-proposal-hub.js`) deploys `SafePolicyGuard` + `PolicyGuardSetup`, records
`safePolicyGuard` / `policyGuardSetup` in `deployments/<network>-chain<id>-v2.json`, and
`npm run sync:frontend-contracts` propagates them to `frontend/src/config/contracts.js`
(`NETWORK_CONTRACTS`). Rollout follows the platform sequence: hardhat/localhost in this feature;
Mordor then Polygon as ops steps (runbook note). Solidity `^0.8.24` under the default compiler
entry (ETC Spiral supports shanghai opcodes; SafeProposalHub precedent). No OpenZeppelin imports
(guard needs none; keeps the custody family dependency-free).

**Alternatives considered**: hand-adding addresses to `contracts.js` (forbidden — Constitution V:
sync artifacts only).
