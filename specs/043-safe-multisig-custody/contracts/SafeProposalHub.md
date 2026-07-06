# Contract: `SafeProposalHub`

**Location**: `contracts/custody/SafeProposalHub.sol` · **Type**: immutable, stateless, **events-only** helper.
Holds no funds, custodies nothing, has **no authority over any Safe**. Its only purpose is to broadcast a
proposed Safe transaction's **preimage** on-chain so co-owners can discover and verify it without a backend.

Integrity does not depend on the hub: co-owner clients recompute `Safe.getTransactionHash(...)` from the
emitted params and reject anything that does not match `safeTxHash` before calling `Safe.approveHash`. A
malicious or malformed `propose` therefore cannot cause an incorrect approval — it can only waste the
proposer's own gas.

## Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Events-only broadcaster of Safe transaction preimages for serverless co-owner discovery.
/// @dev No state, no funds, no authority. Integrity is enforced by owners recomputing the hash off-chain.
interface ISafeProposalHub {
    /// @param safe        The Safe the proposal targets.
    /// @param proposer    msg.sender (informational; SHOULD be an owner, not enforced).
    /// @param safeTxHash  Proposer-supplied hash; clients MUST recompute and verify it.
    /// @param to          Target of the Safe transaction.
    /// @param value       Native value.
    /// @param data        Calldata (non-indexed so it is decodable from logs).
    /// @param operation   0 = CALL, 1 = DELEGATECALL.
    /// @param nonce       Safe nonce the proposal is built against.
    event Proposed(
        address indexed safe,
        address indexed proposer,
        bytes32 indexed safeTxHash,
        address to,
        uint256 value,
        bytes data,
        uint8 operation,
        uint256 nonce
    );

    /// @notice Signal that a proposer no longer intends to pursue a proposal (advisory; the Safe nonce is the
    ///         real arbiter of supersession).
    event Cancelled(address indexed safe, address indexed proposer, bytes32 indexed safeTxHash);

    function propose(
        address safe,
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 nonce,
        bytes32 safeTxHash
    ) external;

    function cancel(address safe, bytes32 safeTxHash) external;
}
```

## Behavior

- `propose(...)` emits `Proposed(safe, msg.sender, safeTxHash, to, value, data, operation, nonce)` and returns.
  No storage writes, no external calls (checks-effects-interactions is trivially satisfied). Reentrancy is
  not possible.
- `cancel(...)` emits `Cancelled(safe, msg.sender, safeTxHash)`.
- The contract MAY optionally require `operation <= 1` (reject invalid enum) — the only input validation.

## Security review notes (Constitution I)

- Attack surface is limited to emitting attacker-controlled log data; there is no value or authority to steal.
- The hub cannot approve, execute, or alter any Safe transaction.
- Must still pass **Slither** and the smart-contract security agent review, and carry unit tests; target
  EthTrust-SL **L2**. Non-upgradeable and stateless → **no storage-layout gating** applies.

## Deployment

- One immutable instance per supported chain (Mordor 63, Polygon 137 at launch; ETC 61 when the app adds an
  ETC network block). Deployed by `scripts/deploy/custody/deploy-safe-proposal-hub.js`, recorded in
  `deployments/<network>-chain<id>-v2.json` under key `safeProposalHub`, then synced into
  `frontend/src/config/contracts.js` via `npm run sync:frontend-contracts`.
- The hub is **optional infrastructure**: where it is absent, the client falls back to the signed EIP-712
  payload link/QR discovery path (never-stranded). Approvals and execution never depend on the hub.
