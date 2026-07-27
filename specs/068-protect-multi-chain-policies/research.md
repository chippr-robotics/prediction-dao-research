# Research: Protect Multi-Chain Vaults & Advanced Policy Engine

All Technical Context unknowns resolved. Sources: `contracts/custody/*` (shipped spec 049),
`frontend/src/{lib,hooks,components}/custody/*` (shipped specs 043 + 049), spec 049
`plan.md`/`research.md`/`data-model.md`, `frontend/src/config/{safeContracts,contracts,networks}.js`,
`frontend/src/components/pools/PoolParticipants.jsx`, `frontend/src/components/clearpath/CpAddressField.jsx`.

---

## R1. New guard version vs. extending v1

**Decision**: Ship the ordered rule engine as a **new singleton contract `SafePolicyGuardV2`**;
leave `SafePolicyGuard` (v1) untouched and enforcing for existing vaults. Vaults adopt V2 with the
same two-step threshold-approved flow spec 049 shipped for attach: `setRules(...)` self-tx first
(inert until the guard is active for that vault), then `setGuard(guardV2)`.

**Rationale**: v1 is non-upgradeable **by design** and its own plan documents this exact
succession path ("future rule types ship as a new guard version that vaults adopt via
threshold-approved `setGuard`" — 049 plan Complexity Tracking). v1's flat storage
(`mapping(safe => mapping(asset => AssetRule))`, no rule ids, no ordering, no approver subsets)
cannot represent ordered rules without a rewrite anyway. Two live versions satisfy FR-020
(legacy policies keep enforcing unchanged) with zero migration risk.

**Alternatives considered**: (a) Upgrade v1 in place — impossible, no proxy, and adding one would
create the custody backdoor 049 explicitly rejected. (b) Deploy V2 and auto-migrate v1 state —
violates the consent model (rules would change enforcement address without a vault-approved
`setGuard`). (c) Zodiac-style external module — rejected in 049 R1 (dependency surface, ETC
availability); nothing changed.

## R2. Enforcing approver-set (quorum) rules inside a guard

**Decision**: The guard verifies rule approvers against the Safe's **on-chain approval registry**:
recompute the SafeTx hash with `safe.getTransactionHash(to, value, data, operation, 0, 0, 0,
address(0), address(0), safe.nonce() - 1)` (Safe v1.4.1 increments `nonce` before calling the
guard) and require, for every address in the governing rule's approver set:
`safe.approvedHashes(approver, txHash) == 1 || approver == msgSender` (the executor implicitly
approves — same rule Safe applies to pre-validated signatures), **and** `safe.isOwner(approver)`
(FR-010: a rule naming a removed owner cannot execute).

**Rationale**: The custody flow is already 100% on-chain approvals — every owner calls
`approveHash` and execution uses pre-validated signature bundles (`vaultTransaction.js`:
`buildPrevalidatedSignatures`, r = owner, v = 1). So the complete approver set is already
readable on-chain at `checkTransaction` time; no signature-format change, no off-chain
aggregation, no EIP-1271 complexity. Parsing the `signatures` parameter instead was rejected:
the Safe only validates the first `threshold` signatures, so extra entries in the bundle are
unverified input — `approvedHashes` is the trustworthy source.

**Constraint carried forward**: the guard must reject `gasPrice != 0` (already a v1 hard denial),
which also keeps the recomputed hash canonical (custody always zeroes the gas-refund fields).
Non-custody clients that set them would fail hash recomputation — acceptable: policy vaults are a
custody-app feature, and a mismatch fails **closed** (typed error), never open.

## R3. Rule model, matching, and ordering semantics

**Decision**: Per vault, one ordered array of ≤ 16 rules replaced atomically by
`setRules(Rule[])`. Rule shape (full definition in `contracts/SafePolicyGuardV2.md`):
asset scope (`ANY` sentinel / native / specific token), amount bounds (`perTxLimit`,
`windowLimit`, 0 = uncapped), destination set (empty = any; else allowlisted
recipients-or-contracts for this rule), approver set (empty = base threshold suffices; else all
listed must have approved). Evaluation: hard denials first (delegatecall, gas refund — carried
from v1), exemptions second (`to == safe` self-management, calls to the guard itself — FR-021
no-lockout), then **first rule whose scope matches governs**; a governed transaction that fails
the rule's limit/destination checks reverts with a typed error naming the rule index — it never
falls through to a later rule. Exactly one narrow fall-through exists: an unmet approver
requirement continues to the next rule with *strictly identical scope* (the "same-scope
alternative rule" — what makes "a + b / c" expressible as two adjacent rules). Two further
refinements keep the spec's scenarios expressible under approver-blind matching:
`approvalsRequired` (K-of-set, so "A or B" is one rule) and `banded` (perTxLimit doubles as a
match bound, so ordered rules form amount bands for tiered limits). No matching rule ⇒
`NoRuleMatches()` revert (policy silence is denial, per spec assumption). Vault-level `cooldown`
stays a policy-wide meta setting (v1 semantics), not a per-rule field.

**Rationale**: First-match-governs is the spec's documented interpretation (FR-011) and the only
semantics under which "rule 001 before rule 002" and tiered limits ("A||B up to X" above "A+B up
to Y") compose predictably. Atomic replacement makes add/edit/remove/reorder one proposal each
(FR-017, FR-019) and keeps renumbering trivial. Bounds keep `checkTransaction` gas O(rules +
approvers) with small constants.

**Mixed native+token legs**: a transaction with both a native leg and a token leg (native value
riding a token call) matches only `ANY`-asset rules; single-asset rules match single-leg
transactions. This keeps "which rule governs" a total function without per-leg rule splits.
Documented member-facing in the composer.

**Alternatives considered**: all-matching-rules-must-pass (rejected: makes ordering meaningless
and cannot express "C alone may approve" alternatives); most-specific-wins (rejected: implicit
precedence is exactly what the numbered list avoids); per-rule cooldowns (rejected: YAGNI, not in
spec).

## R4. Window accounting per rule

**Decision**: Each rule with `windowLimit > 0` carries its own `spentInWindow`/`windowStart`
(fixed-reset 24 h window, v1 semantics: window opens at first counted spend, resets 24 h later —
bounded ≤ 2× limit across a straddling span, disclosed in UI). Accounting commits pre-execution
(v1's conservative overcount on inner-call failure). Reordering/replacing rules resets window
state for rules whose identity changes; the composer discloses this ("changing a rule restarts
its 24-hour window").

**Rationale**: Per-rule windows are what "token-specific daily limits" means when two rules can
scope the same asset with different approver sets. Keying accounting by rule index after an
atomic `setRules` is unambiguous. True rolling windows stay rejected (unbounded gas — 049 R3).

## R5. Approved-contracts rules and the service catalog

**Decision**: Approved contracts are **destination sets on rules** (not a separate mechanism):
an approved-contracts rule is a rule whose destination set lists contract addresses and whose
asset scope is typically `ANY` with limits as desired. The picker is fed by a new
`frontend/src/config/serviceCatalog.js`: per-chain entries `{ id, name, addresses[], source }`
derived from existing config — dex venue (`networks.js` `dex.swapRouter` / `positionManager`,
named by `dexProvider.name`: Uniswap on 137, ETCswap on 61/63), staking (`config/staking.js`
Lido contracts, chain 1 pattern for future), and platform contracts already resolved via
`getContractAddressForChain`. Manual address entry stays available with a "not platform-vetted"
warning (FR-023). Catalog expansion is config-only (spec assumption).

**Rationale**: Reuses the guard's one matching primitive (destination sets) — FR-013 ("contract
approval never exempts amount limits") then holds by construction, because limits live on the
same governing rule. Morpho vault addresses are runtime-discovered via the Morpho API (no static
config exists), so the catalog ships with static-address services first and the picker accepts
pasted addresses for the rest; a Morpho-API-backed picker source is a follow-up, not a blocker.

**Alternative considered**: separate on-chain "approved contracts" registry shared across rules —
rejected: second mechanism, second consent path, and FR-013 would need cross-mechanism logic.

## R6. Multi-chain vault list and providers

**Decision**: `useCustodyVaults` drops its `r.chainId === Number(chainId)` filter and enriches
every saved reference using **per-vault read providers** (`getProvider(vault.chainId)` — already
how `loadVault`/`policy.js` read cross-chain), in parallel with per-vault error isolation (one
unreachable chain yields that vault's honest "unreachable" row, never a blank list). Actions stay
gated on `Number(walletChainId) === Number(vault.chainId)` — the existing `VaultProposalsPanel`
switch-prompt pattern becomes universal (FR-004). Creation remains on the connected chain with
the chain stated explicitly in the wizard (FR-001) and a switch affordance for other custody
chains. Strict lookups only: custody code never relies on `getNetwork()`'s fallback-to-default
(a wrong-chain read must fail, not silently read Polygon).

**Rationale**: `vaultReferences` already store `chainId` per entry (key `chainId:address`) and
are already spec-032 synced — the single-network experience is purely the hook's filter. Read
providers per chain already exist. This is the smallest change satisfying FR-002/003/004.

## R7. Custody chain set and deployment plumbing

**Decision**: Add ETC (61) to `SAFE_CONTRACTS` (canonical Safe v1.4.1 addresses verified on 61
since spec 043; the app's 61 network block now exists — the 043 follow-up is unblocked). Deploy
`safePolicyGuardV2` (new key), `policyGuardSetup` (reused as-is — it is guard-agnostic: takes the
guard address as a parameter and ERC-165-checks it), and `safeProposalHub` to 63, 61, 137 via the
existing deterministic CREATE2 scripts; record in `deployments/` and sync to
`frontend/src/config/contracts.js`. **Also fix the shipped gap**: `DEPLOYMENT_BLOCKS_BY_CHAIN`
has no `safeProposalHub` entry on any chain, so `useVaultProposals.refresh()` currently errors
("not configured for this network yet") even on Polygon — add the recorded deploy blocks for
every custody chain.

**Rationale**: FR-001/FR-005 need at least two fully-wired custody chains to be real; 63 and 61
are the launch pattern used by every custody-family feature. The deployment-block fix is required
by this feature's own acceptance tests (proposals must be discoverable on every custody chain).

## R8. Owners entry component

**Decision**: New `CustodyAddressField.jsx` following the `CpAddressField` composition: shared
`AddressInput` (ENS + callsign resolution, validation, ARIA contract) + `AddressBookButton`
(`onSelect(entry) → address`) + QR button + `QRScanner` with `extractAddressFromScan`. String
`onChange` signature (not event), `chainId` prop threaded for book/screening context. Used for
owner rows (CreateVaultWizard), the new-owner input (OwnersThresholdPanel), load-by-address
(LoadVaultForm), and the transfer recipient + rule destination inputs (ProposeTransactionForm,
RuleComposer) so Protect matches the platform everywhere addresses are typed (FR-006/007).

**Rationale**: `AddressInput` deliberately does not embed QR (it's always a sibling), and every
consumer (Pay, Transfer, Controllers) hand-rolls the same triad; ClearPath already extracted the
reusable field. Copying that proven shape is the smallest correct move.

## R9. Reorder UX

**Decision**: Native HTML5 drag-and-drop plus always-present keyboard ↑/↓ move buttons with
`aria-label="Move rule N up/down"`, exactly the `PoolParticipants.jsx` pattern (`draggable`,
`dragIndex` state, `onDragOver` preventDefault, `.dragging` class; tests drive the buttons, not
drag events). Renumbering is display-derived (index + 1, zero-padded); the staged order lives in
composer state and becomes one `setRules` proposal with a before/after diff (FR-016/017/018).

**Rationale**: Zero new dependencies (none exist in `package.json`), proven accessible pattern in
this codebase, and FR-016 explicitly requires the keyboard path anyway.

## R10. Pending-change exclusivity and legacy rendering

**Decision**: FR-019 (one pending policy change per vault) is enforced **client-side**: the
proposal queue already classifies guard-targeted proposals (`classifyPolicyProposal`); PolicyPanelV2
blocks composing a new change while a queued proposal targets the guard or `setGuard`, and explains
why. FR-020 legacy rendering: `getPolicyStatus` gains a `managed-v2` status (guard slot ==
`safePolicyGuardV2`); `managed` (v1) vaults keep the existing read-only PolicyPanel with legacy
rules rendered visually distinct plus an "Upgrade to ordered rules" entry that pre-populates a V2
composer from decoded v1 state (limits → rules, allowlist → catch-all destination set, cooldown →
meta) for the two-step adopt flow.

**Rationale**: On-chain exclusivity would add state and a second consent path for marginal gain —
the Safe nonce already serializes execution, and the risk FR-019 addresses (confusing concurrent
edits) is a UX risk. The v1→V2 pre-population makes migration lossless and reviewable in one diff.

## R11. Test strategy

**Decision**: Mirror 049's proven shape. Unit: `test/custody/SafePolicyGuardV2.test.js` with the
`MockSafe` harness extended with `approvedHashes`/`isOwner`/`getTransactionHash`/`nonce` stubs —
per-kind matching, ordering (shadowing, first-match, no-match denial), approver verification
(missing approver, removed owner, executor-implicit approval), per-rule windows, bounds, lockout-
proofing under a max-strict V2 policy, `previewTransaction` parity. Integration:
`test/integration/policy-guard-v2-safe.test.js` against real Safe v1.4.1 — the spec's US2
acceptance walk (A+B / C rules, tiered limits), adopt-from-v1 flow, reorder changing the governing
rule. Frontend: Vitest suites for `policyV2.js` (encode/decode/validate/describe/match-preview),
`serviceCatalog.js`, `CustodyAddressField`, `RuleList` (reorder via buttons), `RuleComposer`,
`PolicyPanelV2`, multi-chain `useCustodyVaults`; axe on every component; chain ids per the
existing convention (1337 policy-wired, 63 custody-only, 1 unsupported).

**Rationale**: Constitution II; the 049 suites define the bar and the harness already exists.
