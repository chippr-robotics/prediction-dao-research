# Contract: SafePolicyGuard

Singleton, **non-upgradeable**, admin-free Safe v1.4.1 transaction guard enforcing per-vault
policies (spec 049). One deployment per chain, resolved via
`getContractAddressForChain('safePolicyGuard', chainId)`. No OpenZeppelin imports.

## Trust model

- **Restriction-only**: can block a Safe transaction; can never initiate, approve, or execute one,
  and holds no funds.
- **Authority = the vault itself**: every mutating function requires `msg.sender` to be the Safe
  whose policy is touched (`NotVault()` otherwise). Threshold approval is therefore inherited from
  the Safe; the guard has no owner, admin, or upgrade key.
- **EthTrust-SL target**: L2 (comprehensive tests, documented risks). Accepted risks: 24 h window
  is fixed-reset (≤ 2× limit across a straddling span, disclosed in UI); unrecognized calldata is
  constrained by target-allowlist/cooldown but not valued by limits (disclosed).

## Guard interface (called by the Safe)

```solidity
function checkTransaction(
    address to, uint256 value, bytes calldata data, uint8 operation,
    uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken,
    address payable refundReceiver, bytes calldata signatures, address msgSender
) external;                                   // reverts on violation; writes accounting state
function checkAfterExecution(bytes32 txHash, bool success) external; // no-op
function supportsInterface(bytes4 id) external view returns (bool);  // ERC-165: Guard interface
```

`msg.sender` is treated as the Safe (`safe = msg.sender`). Evaluation order:

1. **Exempt**: `to == safe` (self-management) or `to == address(this)` (policy config, requires
   `value == 0`) → return immediately (FR-008 lockout-proofing). Also return if the safe has no
   enabled rules (guard set but policy cleared).
2. **Hard denials** (any rule enabled): `operation == 1` (delegatecall) → `DelegatecallBlocked()`;
   `gasPrice != 0` → `GasRefundBlocked()`.
3. **Classify**: `(asset, amount, recipient)` =
   - native: `value > 0` → `(address(0), value, to)` — evaluated in addition to a token action;
   - token: selector `transfer` → `(to, amount, recipient)`; `transferFrom` → `(to, amount, to_)`;
     `approve` → `(to, amount, spender)`;
   - otherwise `(none, 0, to)` (generic call).
4. **Allowlist** (if enabled): each classified recipient (and the call target for generic calls)
   must be allowlisted → `RecipientNotAllowed(recipient)`.
5. **Cooldown** (if set, and the tx is counted — value > 0 or recognized token action):
   `now - lastCountedTxAt >= cooldown` else `CooldownActive(nextAllowedAt)`; on pass, update
   `lastCountedTxAt = now`.
6. **Limits** per counted `(asset, amount)`: reset window if elapsed; then
   `amount <= perTxLimit` else `PerTxLimitExceeded(asset, amount, limit)`;
   `spentInWindow + amount <= windowLimit` else
   `WindowLimitExceeded(asset, attempted, remaining)`; on pass, accumulate `spentInWindow`.
   Zero-valued rule fields skip their check. Unconfigured assets skip limits entirely.

State written in `checkTransaction` persists even if the Safe's inner call later fails without
reverting the outer transaction — conservative overcounting, documented (research R3).

## Configuration interface (called BY the Safe as a self-originated tx, or via `PolicyGuardSetup` at creation)

```solidity
struct RuleConfig { address asset; uint128 perTxLimit; uint128 windowLimit; }

function configureRules(RuleConfig[] calldata limits, uint32 cooldown,
                        bool allowlistEnabled, address[] calldata allowlistAdd,
                        address[] calldata allowlistRemove) external;  // full policy write
```

Validation: allowlist may not end up enabled with zero entries (`EmptyAllowlist()`);
`cooldown <= 365 days` (`CooldownTooLong()`); asset list bounded (`TooManyAssets()`, ≤ 16);
allowlist batch bounded (≤ 64 per call). Setting every rule to zero/disabled clears the policy
(vault may additionally `setGuard(0)` via self-tx to fully detach).

Events (as implemented): `RulesConfigured(safe, asset, perTxLimit, windowLimit)` (one per asset
entry), `CooldownSet(safe, cooldown)` (on change), `AllowlistEnabled(safe, enabled)` (on toggle),
`AllowlistChanged(safe, entry, allowed)` (one per entry). Together they drive notifications
(FR-016) and subgraph-free reads.

## Read interface (client)

```solidity
function getPolicy(address safe) external view returns (
    bool hasRules, bool allowlistEnabled, uint32 allowlistCount,
    uint32 cooldown, uint64 lastCountedTxAt, address[] memory configuredAssets);
function getAssetRule(address safe, address asset) external view returns (
    uint128 perTxLimit, uint128 windowLimit, uint128 spentInWindow, uint64 windowStart);
function getAllowlist(address safe) external view returns (address[] memory);
function isAllowlisted(address safe, address who) external view returns (bool);
function remainingInWindow(address safe, address asset) external view returns (uint256); // ∞ → type(uint256).max
function nextAllowedAt(address safe) external view returns (uint64);
function previewTransaction(address safe, address to, uint256 value, bytes calldata data,
    uint8 operation) external view returns (bool ok, bytes memory revertData);
```

`previewTransaction` runs the same internal evaluation WITHOUT state writes and returns the
would-be custom-error data (selector + args) so the client decodes one canonical format for both
pre-flight (FR-012) and post-hoc failure explanation (FR-011).

## Custom errors

`NotVault()`, `DelegatecallBlocked()`, `GasRefundBlocked()`, `RecipientNotAllowed(address)`,
`CooldownActive(uint64 nextAllowedAt)`, `PerTxLimitExceeded(address asset, uint256 amount,
uint256 limit)`, `WindowLimitExceeded(address asset, uint256 attempted, uint256 remaining)`,
`EmptyAllowlist()`, `CooldownTooLong()`, `TooManyAssets()`, `ValueToGuardBlocked()`.

## Security checklist (Constitution I)

- CEI: all checks precede state writes; no external calls anywhere in the guard.
- Reentrancy: none possible (no external calls; Safe serializes execTransaction).
- Access control: single rule, `msg.sender == safe`, applied to every mutator.
- Overflow: solc ^0.8 checked math; `uint128` accumulation guarded by the same checked math.
- Griefing: a third party cannot mutate another Safe's policy or state; `previewTransaction` is
  view-only.
- Slither + security-agent review before merge; unit + integration suites per plan R7.
