// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SafeProposalHub
/// @notice Events-only broadcaster of Safe multisig transaction preimages, for serverless co-owner discovery
///         (spec 043, Safe multisig custody). A proposer emits the full parameters of a Safe transaction so
///         other owners can find it, recompute its hash, and approve it on-chain — with no hosted Safe
///         Transaction Service and no app backend.
/// @dev Value-free and authority-free: holds no funds, has no state, and can neither approve nor execute any
///      Safe transaction. Integrity does NOT depend on this contract — co-owner clients MUST recompute
///      `Safe.getTransactionHash(...)` from the emitted parameters and reject anything that does not equal the
///      `safeTxHash` before calling `Safe.approveHash`. A malicious or malformed `propose` can therefore only
///      waste the proposer's own gas; it cannot cause an incorrect approval. No external calls, no arithmetic,
///      no roles — CEI is trivial and reentrancy is impossible. Uses no OpenZeppelin, so it compiles on
///      pre-Cancun targets (e.g. ETC/Mordor) as well. Cloned in shape from `BackupPointerRegistry`.
contract SafeProposalHub {
    /// @dev Generous bound on the broadcast calldata blob, capping per-proposal event size.
    uint256 private constant MAX_DATA_LENGTH = 8192;

    /// @notice Broadcast a proposed Safe transaction's full preimage.
    /// @param safe       The Safe the proposal targets.
    /// @param proposer   `msg.sender` (informational; SHOULD be an owner, not enforced here).
    /// @param safeTxHash Proposer-supplied hash; clients MUST recompute and verify it.
    /// @param to         Target of the Safe transaction.
    /// @param value      Native value.
    /// @param data       Calldata (non-indexed so it is decodable from logs).
    /// @param operation  0 = CALL, 1 = DELEGATECALL.
    /// @param nonce      The Safe nonce the proposal is built against.
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

    /// @notice Advisory signal that a proposer no longer intends to pursue a proposal. The Safe nonce remains
    ///         the real arbiter of supersession; this is a UX hint only.
    event Cancelled(address indexed safe, address indexed proposer, bytes32 indexed safeTxHash);

    error InvalidOperation();
    error DataTooLong();

    /// @notice Emit a proposal preimage for discovery. Emits `Proposed`; writes no state, calls nothing.
    function propose(
        address safe,
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 nonce,
        bytes32 safeTxHash
    ) external {
        if (operation > 1) revert InvalidOperation();
        if (data.length > MAX_DATA_LENGTH) revert DataTooLong();
        emit Proposed(safe, msg.sender, safeTxHash, to, value, data, operation, nonce);
    }

    /// @notice Signal cancellation of a previously broadcast proposal. Advisory; emits `Cancelled` only.
    function cancel(address safe, bytes32 safeTxHash) external {
        emit Cancelled(safe, msg.sender, safeTxHash);
    }
}
