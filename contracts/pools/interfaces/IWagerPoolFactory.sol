// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWagerPoolFactory
/// @notice Surface for the upgradeable factory that clones isolated group-wager pools (spec 034,
///         address-based redesign). Each pool is an immutable ERC-1167 clone; the factory screens the
///         creator (sanctions + `POOL_PARTICIPANT_ROLE` membership), assigns a unique 4-word BIP-39
///         index tuple, and records the pool in a network-scoped registry. No Semaphore / anonymity
///         primitive is involved.
/// @dev    Compliance (FR-021): the sanctions guard MUST be configured on value-bearing networks
///         (create reverts if screening cannot be performed, FR-021a); disabling is permitted only on
///         local/dev/test. Timing mirrors the 1v1/oracle {WagerRegistry}: two absolute deadlines
///         (`acceptDeadline`, `resolveDeadline`), bounded and ordered by the factory.
interface IWagerPoolFactory {
    /// @param token          Allowlisted USDC for the network (FR-024).
    /// @param buyIn          Per-member stake, equal for all (> 0).
    /// @param maxMembers     2..protocol cap (~1000, FR-002a).
    /// @param thresholdBips  Approval threshold as a fraction of joined members, (0, 10000] (FR-013).
    /// @param acceptDeadline Absolute unix time joining/acceptance closes (> now, <= now + MAX_ACCEPT_WINDOW).
    /// @param resolveDeadline Absolute unix time by which resolution must complete (> acceptDeadline,
    ///                        <= now + MAX_RESOLVE_WINDOW). After it, the pool is refund-only (FR-019).
    struct CreatePoolParams {
        address token;
        uint256 buyIn;
        uint32 maxMembers;
        uint16 thresholdBips;
        uint64 acceptDeadline;
        uint64 resolveDeadline;
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
        uint64 acceptDeadline,
        uint64 resolveDeadline
    );

    event TemplateUpdated(address indexed newPoolImpl);
    event SanctionsGuardUpdated(address indexed guard);
    event TokenAllowed(address indexed token, bool allowed);

    /// @notice Create an isolated pool: screen creator, assign a unique 4-word tuple, clone an immutable
    ///         pool, register, and emit {PoolCreated}.
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
    function setAllowedToken(address token, bool allowed) external;
}
