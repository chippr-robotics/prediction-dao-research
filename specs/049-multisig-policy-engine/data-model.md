# Data Model: Multisig Policy Engine (spec 049)

All persistent state lives on-chain inside the `SafePolicyGuard` singleton, keyed by Safe (vault)
address. No backend, no subgraph changes; the client reads views directly.

## Entities

### Policy (per vault)

One record per Safe that has ever configured rules. A vault has zero or one policy; "no policy" is
the absence of any enabled rule AND the guard not being set on the Safe.

| Field | Type | Meaning / validation |
|-------|------|----------------------|
| `allowlistEnabled` | `bool` | Recipient allowlist rule active. May only be enabled with ≥ 1 entry (FR-015). |
| `allowlistCount` | `uint32` | Number of allowlisted addresses (enumeration support). |
| `cooldown` | `uint32` seconds | Minimum delay between counted transactions. `0` = rule off. Max bound `365 days` (extreme-value guard, FR-015). |
| `lastCountedTxAt` | `uint64` | Timestamp of last counted transaction (cooldown state). |
| `configuredAssets` | `address[]` | Assets with limit rules, for enumeration in the policy view. |

Derived: `hasPolicy(safe)` = any rule enabled. `isPolicyManaged(vault)` (client-side) = Safe's
guard storage slot == `safePolicyGuard` address for the chain.

### AssetRule (per vault × asset)

Spending limits are per asset; asset `address(0)` = native coin, otherwise ERC-20 address.

| Field | Type | Meaning / validation |
|-------|------|----------------------|
| `perTxLimit` | `uint128` | Max counted amount per transaction. `0` = off. Must be > 0 when set (FR-015). |
| `windowLimit` | `uint128` | Max cumulative counted amount per 24 h window. `0` = off. |
| `spentInWindow` | `uint128` | Amount consumed in the current window (live state, FR-006). |
| `windowStart` | `uint64` | Timestamp the current window opened. Window resets when `now ≥ windowStart + 24h`. |

Invariant: `spentInWindow ≤ windowLimit` whenever `windowLimit > 0` (enforced at check time).

### AllowlistEntry (per vault × address)

`mapping(safe => mapping(address => bool))` plus `address[]` per safe for enumeration.
Effective-recipient resolution (research R3): token `transfer`→recipient, `transferFrom`→recipient,
`approve`→spender; all other calls → the transaction target `to`.

### Policy-change proposal *(no new on-chain entity)*

A rule change is a standard spec 043 Safe transaction whose `to` is the guard and whose calldata
is the configuration call. Approval binding to exact content (FR-009) is inherited from Safe's
`safeTxHash` mechanics; discovery reuses `SafeProposalHub`. The client renders "current vs
proposed" by decoding the proposal calldata against current views.

### Vault *(existing, spec 043 — unchanged)*

Gains only a client-side derived attribute: `policyStatus` ∈
`none | managed (our guard) | foreign-guard | unsupported-network`.

## State transitions

```
(no guard)                 --setup w/ PolicyGuardSetup-->        managed, rules live
(no guard, existing vault) --self-tx: setGuard + configure-->    managed, rules live
managed                    --self-tx: configureRules-->          managed, rules changed
managed                    --self-tx: setGuard(0)-->             no guard (policy removed)
window: closed             --first counted spend-->              open(windowStart=now)
window: open, now≥start+24h --any counted spend-->               reset(windowStart=now, spent=amount)
```

All transitions on the left arrow require the vault's threshold (Safe self-transactions);
guard-targeted and self-targeted transactions are exempt from fund rules (FR-008), so every
transition above is reachable regardless of how strict the policy is (SC-003).

## Events (notification feed, FR-016 — `custody` domain)

| Event | Emitted when |
|-------|--------------|
| `RulesConfigured(safe, asset, perTxLimit, windowLimit)` | Asset limits set or changed (one per asset, incl. at creation). |
| `CooldownSet(safe, cooldown)` | Cooldown rule set or changed. |
| `AllowlistChanged(safe, entry, allowed)` | Allowlist entry added/removed (one per entry). |
| `AllowlistEnabled(safe, enabled)` | Allowlist rule toggled. |
| `ChangedGuard(guard)` *(Safe's own event, emitted by `PolicyGuardSetup` in proxy context)* | Guard attached at creation. |

Blocked executions revert (no event); the client reports them from decoded custom errors
(FR-011) and pre-flight (`previewTransaction`, FR-012).

## Validation rules (config-time, FR-015)

- Allowlist cannot be enabled with zero entries; removing the last entry auto-disables (explicit).
- `cooldown ≤ 365 days`; limits are `uint128`-bounded and must be non-zero to enable.
- Config functions are scoped to `msg.sender` — an address can only ever write its own
  policy, so no cross-vault writes exist (no separate error needed).
- UI warns when a configuration is unusually strict (per-tx limit of 0-after-decimals, cooldown
  > 30 days) before letting the member proceed.
