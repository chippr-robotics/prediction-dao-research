# Data Model: Protect Multi-Chain Vaults & Advanced Policy Engine

Entities from [spec.md](./spec.md) mapped to concrete on-chain and client structures. Contract
field layouts live in [contracts/SafePolicyGuardV2.md](./contracts/SafePolicyGuardV2.md).

## Vault (extended, client-side)

Source of truth: the Safe itself (owners/threshold/nonce, read live) + the saved reference.

| Field | Where | Notes |
|---|---|---|
| `address` | `vaultReferences` entry (checksummed) | unchanged (spec 043) |
| `chainId` | `vaultReferences` entry (Number) | **already stored**; now displayed everywhere (FR-002) and never filtered out of the list (FR-003) |
| `label`, `addedAt`, `role` | `vaultReferences` entry | unchanged |
| `chainName`, `chainBadge` | derived: strict `NETWORKS[chainId]` lookup | never via `getNetwork()` fallback; unknown chain renders the numeric id honestly |
| `onVaultChain` | derived: `Number(walletChainId) === Number(chainId)` | gates every state-changing action (FR-004) |
| `reachable` | derived per refresh | per-vault enrichment failure ⇒ honest "unreachable" row, list never blanks |
| `policyStatus` | derived | now `'unsupported' \| 'none' \| 'managed' (v1) \| 'managed-v2' \| 'foreign'` |

Validation: identity stays `(chainId, address)` (`vaultKey`); persistence and spec-032 sync
(`vaultReferences` synced object) unchanged.

## Policy (V2, on-chain per vault)

One per vault on `SafePolicyGuardV2`, existing only for vaults whose guard slot points at V2.

| Field | Type | Constraints |
|---|---|---|
| `rules` | ordered `Rule[]` | ≤ 16 (`MAX_RULES`); replaced atomically by `setRules`; index = priority (display number = index + 1, zero-padded) |
| `cooldown` | `uint32` seconds | ≤ 365 days; vault-wide (v1 semantics) |
| `lastCountedTxAt` | `uint64` | accounting |

State transitions: `none → managed-v2` (setRules self-tx, then `setGuard(guardV2)`);
`managed (v1) → managed-v2` (setRules on V2, then `setGuard(guardV2)` — v1 state remains inert on
the v1 singleton); `managed-v2 → none` (`setGuard(0)`). Every transition is a threshold-approved
Safe self-transaction (FR-017).

## Rule (on-chain)

One numbered entry in a policy. A single struct expresses all four spec kinds (FR-009): the
"kind" shown in the UI is derived from which fields are set.

| Field | Type | Semantics |
|---|---|---|
| `asset` | `address` | `ANY_ASSET` sentinel = matches any valued leg(s); `address(0)` = native only; else specific ERC-20 only |
| `perTxLimit` | `uint128` | 0 = no per-transaction cap under this rule |
| `windowLimit` | `uint128` | 0 = no 24 h cap; else per-rule fixed-reset window |
| `spentInWindow`, `windowStart` | `uint128`, `uint64` | per-rule accounting (reset when the rule set is replaced) |
| `approvers` | `address[]` | ≤ 8; **all** listed must have approved (on-chain `approvedHashes` or be the executor) and each must still be an owner (FR-010); empty = the vault's base threshold alone suffices |
| `targets` | `address[]` | ≤ 16; empty = any destination; else the effective destination (decoded token beneficiary, or call target) must be in the set — this is both "recipient allowlist" and "approved contracts" (FR-013 holds because limits live on the same rule) |

Matching (FR-011): first rule (lowest index) whose `asset` scope covers the transaction's valued
leg(s) **and** whose `targets` admit the effective destination, governs. Governing rule then
checks approvers + limits; violation ⇒ typed revert naming the rule index; no fall-through. No
match ⇒ `NoRuleMatches()`. Mixed native+token transactions match only `ANY_ASSET` rules.

Three refinements make the spec's scenarios expressible (normative details in
[contracts/SafePolicyGuardV2.md](./contracts/SafePolicyGuardV2.md); members never see the flags —
the composer presents plain-language kinds):

- **`approvalsRequired`** (`uint8`, default = approvers.length): K-of-set approvals.
  `{approvers:[A,B], approvalsRequired:1}` = "A or B"; default = "all listed".
- **`banded`** (`bool`): the rule's `perTxLimit` also acts as a *match* bound, so ordered rules
  form amount bands. Tiered example: rule 001 `{approvers:[A,B], approvalsRequired:1,
  perTxLimit:X, banded:true}` governs txs ≤ X ("A or B up to X"); rule 002 `{approvers:[A,B],
  approvalsRequired:2, perTxLimit:Y, banded:true}` governs txs in (X, Y] ("A and B up to Y").
- **Same-scope alternative rule**: when the governing rule's approver requirement is unmet,
  evaluation falls through to the next rule with *strictly identical scope* (asset + band +
  targets) — and only then. This is what makes "a + b / c" two adjacent rules: 001
  `{approvers:[A,B], approvalsRequired:2, perTxLimit:L}`, 002 `{approvers:[C],
  approvalsRequired:1, perTxLimit:L}`. Limit/destination failures never fall through (FR-011).

Composition examples (spec scenarios):
- **a + b / c up to L**: rules 001 + 002 as above.
- **Tiered (a ‖ b up to X, a + b up to Y)**: banded rules 001 + 002 as above.
- **Token-specific limit**: `{asset: USDC, perTxLimit: 500e6, windowLimit: 2000e6}`.
- **Approved contracts**: `{asset: ANY, targets:[router, positionManager], perTxLimit:…}`.
- **Catch-all fallback**: last rule `{asset: ANY, approvers: []}` (base threshold suffices).

## Approver Set

Not a standalone entity on-chain — embedded per rule (`approvers` + `approvalsRequired`).
Client-side display resolves names via address book > callsign > ENS (platform priority).
Validation at composition: every approver must be a current owner; `approvalsRequired ∈ [1,
approvers.length]`; composer warns on rules shadowed by earlier rules (FR-015).

## Service Catalog Entry (client config)

`frontend/src/config/serviceCatalog.js`, per chain:

| Field | Type | Notes |
|---|---|---|
| `id` | string | stable, e.g. `'dex.swapRouter'` |
| `name` | string | member-facing, e.g. "Uniswap", "ETCswap" |
| `addresses` | address[] | the contract(s) a pick adds to a rule's `targets` |
| `source` | string | provenance: `'networks.dex'`, `'staking'`, `'platform'` |

Derived from existing config (no new address book): `networks.js` `dex` + `dexProvider`,
`config/staking.js`, `getContractAddressForChain` platform keys. Only entries for the vault's own
chain are offered (FR-022). Manual addresses bypass the catalog with a warning (FR-023).

## Policy Change Proposal

Unchanged mechanics from spec 049: a standard spec-043 Safe transaction whose `to` is the V2
guard (`setRules` calldata) or the vault (`setGuard`), discovered via `SafeProposalHub`,
approved via `approveHash`. New client rules: at most one pending guard-targeted proposal per
vault (FR-019, enforced in PolicyPanelV2 by inspecting the queue); staged changes render a
before/after rule-list diff including order (FR-018). Adopt/upgrade flows are two sequential
proposals with consecutive nonces (`setRules` then `setGuard`), exactly like 049 attach.

## Legacy Policy (v1) rendering

`managed` (v1) vaults: read via existing `policy.js`, rendered read-only in the same policy list
UI as unnumbered legacy rules, visually distinct (FR-020), with an upgrade path that pre-populates
a V2 composer from decoded v1 state: each v1 asset rule → one V2 rule; v1 allowlist → `targets`
on a catch-all rule; v1 cooldown → V2 `cooldown`.
