// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ISanctionsGuard
 * @notice Non-bypassable on-chain sanctions enforcement consulted by value-bearing
 *         entrypoints (WagerRegistry.createWager/acceptWager, MembershipManager
 *         .purchaseTier/upgradeTier). Combines the Chainalysis oracle with an
 *         operator-maintained discretionary deny-list. Fail-closed: an unreachable/
 *         erroring oracle ⇒ not allowed.
 * @dev Spec: specs/007-compliance-gating/contracts/ISanctionsGuard.md (FR-016/020/054).
 */
interface ISanctionsGuard {
    // --- Views ---

    /// @notice True iff `account` is neither deny-listed nor reported sanctioned by the oracle.
    /// @dev Fail-closed: any oracle revert or empty return data ⇒ returns false.
    function isAllowed(address account) external view returns (bool);

    /// @notice Reverts {SanctionedAddress} when `account` is not allowed; no-op otherwise.
    function checkBlocked(address account) external view;

    /// @notice True iff `account` is on the discretionary deny-list (oracle not consulted).
    function isDenied(address account) external view returns (bool);

    /// @notice The currently configured Chainalysis oracle address (address(0) if unset).
    function sanctionsOracle() external view returns (address);

    // --- Admin ---

    /// @notice Add/remove an address on the discretionary deny-list. Role: SANCTIONS_ADMIN_ROLE.
    function setDenied(address account, bool denied, string calldata reason) external;

    /// @notice Set/replace the Chainalysis oracle address. Role: DEFAULT_ADMIN_ROLE.
    function setSanctionsOracle(address oracle) external;

    // --- Events ---

    event DenyListUpdated(address indexed account, bool denied, address indexed actor, string reason);
    event SanctionsOracleUpdated(address indexed oracle);

    // --- Errors ---

    error SanctionedAddress(address account);
}
