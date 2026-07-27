# Contract: SafePolicyGuardV2

Ordered, approver-aware policy engine for Safe v1.4.1 vaults. Successor to spec 049's
`SafePolicyGuard` (v1) via the documented migration path (vault-consented `setGuard`). Singleton
per chain, **non-upgradeable** (see plan Complexity Tracking), zero external imports (reuses the
local `ISafeGuard` replica). File: `contracts/custody/SafePolicyGuardV2.sol`.

## Trust model (unchanged from v1)

- Authority for configuration is `msg.sender == vault` only — no owner, no admin, no roles.
  Threshold consent is inherited: the only callers are a Safe self-transaction or
  `PolicyGuardSetup.enablePolicy` during `Safe.setup` (guard-agnostic; reused unchanged).
- The guard runs after Safe signature validation, before execution. It can only veto.
- Detach (`setGuard(0)`) and policy edits are always executable (no-lockout, FR-021): calls with
  `to == vault` (self-management) and calls to the guard itself are exempt from rule matching.
  Value sent **to** the guard reverts (`ValueToGuardBlocked`, v1 parity).

## Storage

```solidity
uint256 constant MAX_RULES = 16;
uint256 constant MAX_APPROVERS = 8;
uint256 constant MAX_TARGETS = 16;
address constant ANY_ASSET = address(1);   // sentinel; address(0) = native

struct Rule {                 // one numbered policy entry
    address asset;            // ANY_ASSET | address(0) native | ERC-20 address
    uint128 perTxLimit;       // 0 = uncapped per-tx under this rule
    uint128 windowLimit;      // 0 = no 24h window cap
    uint8   approvalsRequired;// 0 => approvers.length (all); else K-of-approvers
    bool    banded;           // true => perTxLimit is also a MATCH bound (amount banding)
    address[] approvers;      // <= 8; empty = base threshold suffices
    address[] targets;        // <= 16; empty = any destination
}

struct RuleAccounting { uint128 spentInWindow; uint64 windowStart; }

struct VaultMeta { uint32 cooldown; uint64 lastCountedTxAt; uint32 rulesVersion; }

mapping(address safe => Rule[]) private _rules;
mapping(address safe => mapping(uint256 ruleIndex => RuleAccounting)) private _accounting;
mapping(address safe => VaultMeta) private _meta;
```

`rulesVersion` increments on every `setRules`; accounting reads are keyed by
`(safe, ruleIndex)` and lazily reset when `windowStart` predates the version bump timestamp —
implemented by storing `rulesVersion` alongside or clearing accounting slots in `setRules`
(bounded by MAX_RULES, so an explicit clear loop is fine and simpler: **clear on setRules**).

## Configuration

```solidity
function setRules(Rule[] calldata rules, uint32 cooldown) external; // full replacement
```

- Reverts: `TooManyRules`, `TooManyApprovers`, `TooManyTargets`, `CooldownTooLong` (> 365 d),
  `BadApprovalsRequired` (required > approvers.length, or required set with empty approvers),
  `BandedNeedsLimit` (banded with perTxLimit == 0), `DuplicateApprover`, `DuplicateTarget`.
- Approver-is-owner is validated at **execution** (owners change over time), not at config —
  but the client composer validates at composition too (FR-010 flags broken rules).
- Emits `RulesSet(safe, ruleCount, cooldown, rulesVersion)` plus one
  `RuleConfigured(safe, index, asset, perTxLimit, windowLimit, approvalsRequired, banded,
  approvers, targets)` per rule (notification feed + client decode without extra reads).
- Clears all `_accounting` rows for the vault (window restart is disclosed in the UI).
- An empty `rules` array with the guard still set means **deny all fund movements** (silence is
  denial); the composer warns loudly and requires an explicit confirmation.

## Enforcement — `checkTransaction`

Order of evaluation (each step reverts with a typed error naming the rule index where relevant):

1. **Exemptions**: `to == safe` → pass. `to == address(this)` → pass unless `value != 0` →
   `ValueToGuardBlocked`.
2. **No rules configured** for this safe → pass (zero regression; V2 governs only opted-in vaults).
3. **Hard denials**: `operation != 0` → `DelegatecallBlocked`; `gasPrice != 0` →
   `GasRefundBlocked` (also keeps hash recomputation canonical — custody zeroes refund fields).
4. **Classify** calldata exactly as v1 (`transfer`/`transferFrom`/`approve` with canonical arg
   lengths; unrecognized calldata = not a token action). Compute legs: native (`value`), token
   (decoded amount + beneficiary). `counted = value > 0 || isTokenAction`.
5. **Match**: scan `_rules[safe]` from index 0. Rule matches iff:
   - asset scope: `ANY_ASSET` always; `address(0)` iff native-leg-only tx; token address iff
     token-leg-only tx for that token. Mixed-leg txs match only `ANY_ASSET` rules.
   - amount band: if `banded`, governed amount ≤ `perTxLimit` (per matched leg; for `ANY_ASSET`
     each leg is checked against the band independently) — otherwise band does not constrain
     matching.
   - targets: empty, or effective destination ∈ targets (effective destination = decoded token
     beneficiary for token actions — `transfer.to`, `transferFrom.to`, `approve.spender` — else
     the call target `to`; a token action with riding native value ALSO gates the call target,
     v1 parity).
   No matching rule → `NoRuleMatches()`.
6. **Govern** (first matching rule; the ONLY fall-through is the same-scope alternative rule —
   on `RuleApproversMissing`, evaluation continues to the next rule with strictly identical
   scope (asset + band + targets), if any; limit/destination failures never fall through):
   - **Cooldown** (vault-wide, counted txs only): `now < lastCountedTxAt + cooldown` →
     `CooldownActive(nextAllowedAt)`.
   - **Approvers**: recompute `txHash = ISafeMinimal(safe).getTransactionHash(to, value, data,
     operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce() - 1)`. Count
     approvals over `rule.approvers`: approved iff `safe.approvedHashes(a, txHash) == 1 || a ==
     msgSender`, AND `safe.isOwner(a)` (removed owner never counts — FR-010). Require count ≥
     effective `approvalsRequired`. Failure → `RuleApproversMissing(index, have, need)`.
   - **Limits**: per matched leg, amount ≤ `perTxLimit` (when non-zero) →
     `RulePerTxExceeded(index, asset, amount, limit)`; window: elapsed-aware check against
     `windowLimit` → `RuleWindowExceeded(index, asset, attempted, remaining)`.
7. **Commit accounting** (only after all checks pass, before execution — conservative overcount
   on inner failure, v1 semantics): bump `lastCountedTxAt` (if cooldown > 0), add each governed
   leg to the governing rule's `spentInWindow` (fixed-reset window).

`checkAfterExecution` is a no-op (v1 parity). `supportsInterface` exposes the guard interface id
(GS300) + ERC-165.

## Read interface

```solidity
function getRules(address safe) external view returns (Rule[] memory, uint32 cooldown);
function getRuleAccounting(address safe, uint256 index)
    external view returns (uint128 spentInWindow, uint64 windowStart, uint256 remaining);
function matchTransaction(address safe, address to, uint256 value, bytes calldata data)
    external view returns (bool matched, uint256 ruleIndex); // scope match only, no approver eval
function previewTransaction(address safe, address to, uint256 value, bytes calldata data,
    uint8 operation, address executor, bytes32 approvedTxHash)
    external view returns (bool ok, bytes memory revertData);
```

`previewTransaction` shares `_checkPolicy` verbatim (read-only twin, v1 pattern). Because the
real txHash depends on the future nonce, preview takes an explicit `approvedTxHash` (client
computes it) — approver evaluation in preview uses that hash; passing `bytes32(0)` skips approver
evaluation and previews scope/limits only (used by the debounced compose-time preview).

## Errors (complete)

`ValueToGuardBlocked`, `DelegatecallBlocked`, `GasRefundBlocked`, `NoRuleMatches`,
`CooldownActive(uint64)`, `RuleApproversMissing(uint256,uint256,uint256)`,
`RulePerTxExceeded(uint256,address,uint256,uint256)`,
`RuleWindowExceeded(uint256,address,uint256,uint256)`, `TooManyRules`, `TooManyApprovers`,
`TooManyTargets`, `CooldownTooLong`, `BadApprovalsRequired`, `BandedNeedsLimit`,
`DuplicateApprover`, `DuplicateTarget`.

Client decode via `decodePolicyErrorV2` (policyV2.js) mapping every error to member language
naming the display rule number (FR-012, SC-003).

## Expressing the spec's scenarios (normative mapping)

| Member intent | Rules |
|---|---|
| "A and B together up to L; C alone up to L" | 001 `{approvers:[A,B], approvalsRequired:2, perTxLimit:L}` + 002 `{approvers:[C], approvalsRequired:1, perTxLimit:L}`. Works because of the **same-scope alternative rule** (normative, see below): when the governing rule's approver requirement is unmet, evaluation falls through to the next rule with **strictly identical scope** (same asset, band, and targets); any scope difference stops evaluation with `RuleApproversMissing`. Adjacent same-scope rules therefore read exactly as the spec's "otherwise, allow if…" alternatives (a + b / c). Bounded (≤ MAX_RULES), deterministic, and FR-011 is preserved for every scope-differing rule: limits/destination checks never fall through. |
| "A or B up to X; A+B up to Y" | 001 `{approvers:[A,B], approvalsRequired:1, perTxLimit:X, banded:true}` — governs txs ≤ X; 002 `{approvers:[A,B], approvalsRequired:2, perTxLimit:Y, banded:true}` — governs txs in (X, Y]. |
| "500 USDC per tx, 2000/day" | `{asset: USDC, perTxLimit: 500e6, windowLimit: 2000e6}` |
| "Only Uniswap + Morpho market M" | `{asset: ANY_ASSET, targets:[router, posMgr, M], …limits…}` |
| Catch-all fallback | last rule `{asset: ANY_ASSET, approvers: [], …}` (base threshold, uncapped unless limited) |

The same-scope fall-through rule above is part of the contract's normative behavior and MUST be
mirrored in `policyV2.js` match preview and stated in the composer's plain-language summary
("Rules 001 and 002 cover the same transactions: 002 applies when 001's approvers haven't all
signed").

## Security checklist (EthTrust-SL L2 target)

- No reentrancy surface: `checkTransaction` performs static reads + storage writes to its own
  slots only; no external calls except `view`s into the calling Safe.
- All arrays bounded; all arithmetic on uint128 legs checked (>uint128 amounts revert, v1 parity).
- Accepted risks (documented, carried from v1): fixed-reset window ≤ 2× limit across a straddling
  span; exotic/non-standard tokens pass limit valuation unvalued but remain subject to targets +
  cooldown; approve() counted as spend (closes approve-then-pull).
- New risk reviewed: hash recomputation assumes refund fields are zero — enforced by the
  `GasRefundBlocked` hard denial *before* approver evaluation, so a non-zero-refund tx fails
  closed with the denial error, never an approver mismatch.
- Slither + Medusa (stateful: rule matching + accounting invariants) gates; security-agent review
  (`.github/agents/smart-contract-security.agent.md`) before merge.

## Deployment

Key `safePolicyGuardV2` via `scripts/deploy/custody/deploy-policy-guard-v2.js` (CREATE2,
`SALT_PREFIXES.V2 + 'SafePolicyGuardV2'`), targets hardhat(1337)/Mordor(63)/ETC(61)/Polygon(137);
`policyGuardSetup` + `safeProposalHub` redeployed where missing (63, 61). `deployments/` records
addresses + blocks; `sync:frontend-contracts` per network. `coverage-threshold-policy.json` gains
`contracts/custody/SafePolicyGuardV2.sol`.
