// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IZKWagerPoolFactory
/// @notice Surface for the upgradeable factory that clones isolated ZK-Wager Pools (spec 034). Each
///         pool is an immutable ERC-1167 clone with its own Semaphore group; the factory screens the
///         creator (sanctions + `POOL_PARTICIPANT_ROLE` membership), assigns a unique 4-word BIP-39
///         index tuple, and records the pool in a network-scoped registry.
/// @dev    See specs/034-zk-wager-pools/contracts/pool-contracts-interface.md. Compliance: the
///         sanctions guard MUST be configured on value-bearing networks (create reverts if screening
///         cannot be performed, FR-021a); disabling is permitted only on local/dev/test.
interface IZKWagerPoolFactory {
    /// @param token          Allowlisted USDC for the network (FR-024).
    /// @param buyIn          Per-member stake, equal for all (> 0).
    /// @param maxMembers     2..protocol cap (~1000, FR-002a).
    /// @param thresholdBips  Approval threshold as a fraction of joined members, (0, 10000] (FR-013).
    /// @param joinDeadline   Backstop close time (> now, FR-007a).
    /// @param resolutionWindow Refund/timeout horizon after joining closes (FR-019).
    struct CreatePoolParams {
        address token;
        uint256 buyIn;
        uint32 maxMembers;
        uint16 thresholdBips;
        uint64 joinDeadline;
        uint64 resolutionWindow;
    }

    /// @notice Emitted when a pool is created. `wordIndices` are the language-independent BIP-39 indices
    ///         identifying the pool (FR-003).
    event PoolCreated(
        uint256 indexed poolId,
        address indexed pool,
        address indexed creator,
        uint32[4] wordIndices,
        address token,
        uint256 buyIn,
        uint32 maxMembers,
        uint16 thresholdBips,
        uint64 joinDeadline
    );

    event TemplateUpdated(address indexed newPoolImpl);
    event SanctionsGuardUpdated(address indexed guard);

    /// @notice Create an isolated pool: screen creator, assign a unique 4-word tuple, create a Semaphore
    ///         group (factory/pool as admin), clone an immutable pool, register, and emit {PoolCreated}.
    function createPool(CreatePoolParams calldata p) external returns (uint256 poolId, address pool);

    // ---- Gateway resolution (FR-004), both directions ----
    function poolByPhrase(uint32[4] calldata wordIndices) external view returns (address pool);
    function phraseOfPool(address pool) external view returns (uint32[4] memory wordIndices);

    // ---- Registry views ----
    function poolById(uint256 poolId) external view returns (address pool);
    function poolCount() external view returns (uint256);

    // ---- Admin ----
    function setTemplate(address newPoolImpl) external;
    function setSanctionsGuard(address guard) external;
}
