# Contract: PolicyGuardSetup

Tiny, stateless helper delegatecalled from `Safe.setup(...)` so a new vault is policy-governed
from its first transaction (spec 049, US1 / research R4). Resolved via
`getContractAddressForChain('policyGuardSetup', chainId)`.

## Interface

```solidity
function enablePolicy(address guard, bytes calldata configureCalldata) external;
```

Called with `operation = delegatecall` from the Safe proxy's `setup`, i.e. executes in the new
Safe's own storage/context:

1. Validates `guard != address(0)` and that `guard` self-reports the Safe guard interface via
   ERC-165 (`supportsInterface`) — mirrors the check `setGuard` itself performs (v1.4.1).
2. `sstore`s `guard` into the Safe guard storage slot
   `0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8`
   (`keccak256("guard_manager.guard.address")`).
3. Emits Safe's `ChangedGuard(address)` event signature (log parity with a post-create `setGuard`,
   so explorers/indexers see the same trail).
4. Performs a **call** (not delegatecall) of `configureCalldata` on the guard. Because step 4 runs
   in the proxy's context, `msg.sender` seen by the guard **is the new Safe**, so
   `SafePolicyGuard.configureRules` authorization holds with no special creation path.
   Reverts bubble up and abort the entire vault creation (no half-configured vault).

## Security notes

- Stateless; no storage of its own (delegatecall target must not rely on its own state).
- No selfdestruct, no payable, no fallback.
- Only reachable meaningfully via delegatecall from a Safe's `setup`; calling it directly writes
  the caller's own storage slot — harmless to third parties (documented, mirrors how Safe module
  setup helpers behave).
- The full `initializer` (including this call) is hashed into the CREATE2 salt, so the predicted
  vault address commits to the initial policy — co-owners approving the creation approve the
  policy (spec 043 address-preview flow unchanged in shape).

## Frontend wiring

`buildSetupInitializer(owners, threshold, fallbackHandler, { setupTo, setupData })` — new optional
final argument; defaults (`ZeroAddress`, `0x`) keep the existing initializer byte-identical for
policy-less vaults (FR-010 / SC-007).
