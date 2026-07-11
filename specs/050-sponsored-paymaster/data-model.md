# Phase 1 Data Model: Sponsored Paymaster

The feature is stateless-by-design off-chain (no DB); the only durable state is on-chain (the
paymaster deposit + config). Entities below are the conceptual model that the contract, the gateway
endpoint, and the frontend agree on.

## Entities

### SponsorshipRequest (transient, gateway input)
A request to sponsor one specific pending UserOperation.

| Field | Type | Notes |
|---|---|---|
| userOp | v0.6 UserOperation | sender, nonce, initCode, callData, gas limits, `maxFeePerGas`, `maxPriorityFeePerGas`, `paymasterAndData` (empty on request), `signature` (may be stub) |
| entryPoint | address | MUST equal the configured v0.6 EntryPoint for the chain |
| chainId | number | MUST be an enabled, configured chain with a deployed paymaster |
| context | object | ERC-7677 `context` (unused for sponsoring; reserved) |

Derived: `account = userOp.sender`, `estCostWei = totalGasLimit × maxFeePerGas`.

### SponsorshipDecision (transient, gateway internal)
Outcome of the policy pipeline; never persisted.

| Field | Type | Notes |
|---|---|---|
| granted | boolean | |
| reason | enum | `ok` \| `killswitch_active` \| `sanctioned` \| `quota_exceeded` \| `cost_ceiling_exceeded` \| `gas_ceiling_exceeded` \| `chain_unsupported` |
| retryAfterSec | number? | on `quota_exceeded` |

### SponsorshipApproval (transient, gateway output → on-chain input)
A single-use, time-bounded authorization the paymaster honors. Materializes as `paymasterAndData`.

| Field | Type | Notes |
|---|---|---|
| paymaster | address | the deployed `FairWinsVerifyingPaymaster` |
| validUntil | uint48 | now + short TTL (e.g. 3 min) |
| validAfter | uint48 | 0 (or now − small skew) |
| signature | bytes (65) | KMS `ecrecover`-able sig over the preimage (see contracts/paymaster-contract.md) |

Reuse/replay: bound to `userOpHash` via the signed preimage; single-use via the **account's own
nonce**; expires at `validUntil`. Not transferable to a different op.

### SponsorshipPolicy (config + in-memory counters)
The rules that decide grant/refuse. Reuses existing gateway modules.

| Field | Source |
|---|---|
| killswitch | `policy/killswitch.js` (`KILL_SWITCH` env / control) |
| sanctions | `policy/sanctions.js` (screen `account`, fail-closed) |
| perAccountQuota | `policy/quotas.js` keyed by `account` (`PM_ACCOUNT_QUOTA_PER_MIN/DAY`) |
| globalQuota | `policy/quotas.js` global (`PM_GLOBAL_QUOTA_PER_DAY`) |
| costCeilingWei | `PM_MAX_COST_WEI` |
| gasCeiling | `PM_MAX_GAS` |

### SponsorshipPool (on-chain)
The bounded, operator-funded balance sponsored gas is drawn from.

| Field | Type | Notes |
|---|---|---|
| deposit | uint (EntryPoint balance) | `entryPoint.balanceOf(paymaster)`; the **hard exposure cap** (FR-013) |
| stake | uint (optional) | 0 now; required only for public/reputation bundlers |
| owner | address | floppy-keystore admin — the only address that can `withdraw` |
| verifyingSigner | address | KMS key address — authorizes sponsorship; owner-rotatable |
| burnRateWeiPerHr | derived | for runway (like `peakBurnWeiPerHour` in gateway config) |
| runwayHrs | derived | `deposit / burnRate`; warn < `PM_RUNWAY_WARN_HRS` |

### FeeDisclosure (frontend, pre-confirmation)
The truthful cost statement shown before the user confirms.

| State | Shown when | Copy |
|---|---|---|
| `sponsored` | paymaster returned a valid approval for this op | "Sponsored by FairWins — no network fee" |
| `self-native` | sponsorship unavailable AND account holds enough native | "You pay the {native} network fee (~{est})" |
| `self-short` | sponsorship unavailable AND native shortfall | "You pay the network fee — add {shortfall} {native} to continue" |

## Lifecycle (one sponsored action)

```
draft ─▶ request sponsorship ─▶ [granted] ─▶ paymasterAndData set ─▶ submit via bundler ─▶ included
                              └▶ [refused/unreachable] ─▶ FeeDisclosure=self-* ─▶ self-submit ─▶ included
                                                                              └▶ (native short) ─▶ honest block
```

## Validation rules (traceability to FR)

- Sponsorship granted **only** if: killswitch off (FR-011) ∧ account screens clean (FR-009) ∧
  within per-account + global quota (FR-010) ∧ `estCostWei ≤ costCeiling` ∧ `totalGas ≤ gasCeiling`
  (FR-010 per-op ceiling) ∧ chain has a deployed paymaster (FR-016/FR-017).
- Approval is single-use + time-bounded (FR-012); never reusable across ops.
- Refusal spends **no** operator funds (FR-014) and always leaves self-submit (FR-007).
- On-chain, only `owner` withdraws deposit; only `verifyingSigner` sigs are honored (FR-013/FR-018).
