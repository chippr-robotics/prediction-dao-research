# Contract: FairWinsVerifyingPaymaster (on-chain, EntryPoint v0.6)

`contracts/account/FairWinsVerifyingPaymaster.sol`, extending vendored v0.6 `BasePaymaster`.
Minimal verifying paymaster: sponsors a UserOp iff `paymasterAndData` carries a valid
`verifyingSigner` signature over the op + validity window. **No external calls and no storage reads
in validation** (signature-only) — the safest ERC-4337 posture and portable to any bundler.

## State

| Var | Type | Access | Purpose |
|---|---|---|---|
| `entryPoint` | `IEntryPoint` (immutable, from BasePaymaster) | — | v0.6 EntryPoint `0x5FF1…2789` |
| `owner` | address (Ownable) | floppy keystore | withdraw deposit/stake, `setVerifyingSigner` |
| `verifyingSigner` | address | owner-set | the KMS key address whose sigs authorize sponsorship |

No per-sender nonce mapping (replay handled by the account's own EntryPoint nonce + validity
window — see research §4).

## External interface

```solidity
// --- validation (called by EntryPoint during simulation + execution) ---
function validatePaymasterUserOp(UserOperation calldata userOp, bytes32 userOpHash, uint256 maxCost)
    external override returns (bytes memory context, uint256 validationData);
// Reverts only on malformed paymasterAndData length. Otherwise returns:
//   context = ""                        (no postOp work; sponsoring only)
//   validationData = _packValidationData(sigInvalid, validUntil, validAfter)
//     -> sigInvalid=true  => SIG_VALIDATION_FAILED (EntryPoint rejects, no funds spent)
//     -> sigInvalid=false => time-bounded validity; EntryPoint sponsors from our deposit

// --- hash the client/gateway must sign over (view; used off-chain + in tests) ---
function getHash(UserOperation calldata userOp, uint48 validUntil, uint48 validAfter)
    external view returns (bytes32);

// --- admin (owner-only) ---
function setVerifyingSigner(address newSigner) external onlyOwner;   // rotation
// deposit/stake mgmt inherited from BasePaymaster:
function deposit() external payable;                 // fund sponsorship pool
function withdrawTo(address payable to, uint256 amount) external onlyOwner;
function addStake(uint32 unstakeDelaySec) external payable onlyOwner;    // optional (public bundlers)
function unlockStake() external onlyOwner;
function withdrawStake(address payable to) external onlyOwner;

// postOp: no-op (sponsoring; no ERC-20 settlement)
```

## `paymasterAndData` layout (v0.6)

```
paymasterAndData = abi.encodePacked(
    address(this),            // 20 bytes — paymaster address (EntryPoint routes on this)
    validUntil,               // 6 bytes  (uint48, big-endian)
    validAfter,               // 6 bytes  (uint48)
    signature                 // 65 bytes (ECDSA r,s,v over getHash)
)   // total 97 bytes
```

Stub (for `pm_getPaymasterStubData` / gas estimation): same layout with a **dummy 65-byte
signature** of correct length so estimated `verificationGasLimit` matches the real op.

## Signed preimage (`getHash`)

```
hash = keccak256(abi.encode(
    // userOp fields EXCEPT signature and paymasterAndData (those are excluded so the sig commits
    // to the op's effect + gas, not to itself):
    userOp.sender, userOp.nonce, keccak256(userOp.initCode), keccak256(userOp.callData),
    userOp.callGasLimit, userOp.verificationGasLimit, userOp.preVerificationGas,
    userOp.maxFeePerGas, userOp.maxPriorityFeePerGas,
    block.chainid, address(this), validUntil, validAfter
))
// signed via personal_sign-style eth-hash by the KMS signer; contract recovers with ECDSA.
```

## Security properties (constitution I; EthTrust L2 target)

- **No external calls / no storage in validation** → no reentrancy, no forbidden-storage
  violations, deterministic gas.
- **Fund custody**: only `owner` (floppy) can `withdrawTo`/`withdrawStake`. Max loss = deposit
  (bounded, FR-013). Compromise of the hot `verifyingSigner` lets an attacker *spend the deposit on
  gas* (griefing) but **cannot withdraw** funds; mitigated by off-chain policy ceilings + killswitch
  (which stops the gateway signing) + `setVerifyingSigner` rotation. Documented in the runbook.
- **Sig binds** sender, nonce, initCode, callData, all gas fields, chainId, paymaster, and the
  window → a signed approval cannot be replayed on another op, chain, or paymaster, nor after
  expiry.
- **CEI / access control**: `setVerifyingSigner`, withdrawals `onlyOwner`; no value paths beyond
  EntryPoint deposit accounting.

## Tests (test/account/, constitution II)

Unit: valid sig sponsors; invalid/tampered sig → `SIG_VALIDATION_FAILED`; expired window rejected;
`maxCost` above policy still validates on-chain (policy is off-chain — contract stays permissive by
design, ceiling enforced by the signer); `setVerifyingSigner` auth; `withdrawTo` auth; malformed
`paymasterAndData` length reverts. **Fork** (EntryPoint v0.6 on Polygon fork): fund deposit, sign
via a local key standing in for KMS, submit a real `executeBatch` UserOp for a counterfactual
account (first-use deploy + transfer), assert inclusion with the user's native balance unchanged.
