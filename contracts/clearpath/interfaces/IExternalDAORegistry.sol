// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IExternalDAORegistry
/// @notice A lightweight, network-scoped on-chain registry of DAOs deployed by OTHER platforms (ClearPath
///         spec 030, pillar B). A member registers an existing governance contract by address; ClearPath then
///         tracks it (read-only) and lets the member take user-signed governance actions via a per-framework
///         connector. The registry confers ClearPath NO authority over the registered DAO — it is metadata for
///         shared discovery + subgraph indexing. Registration is gated by a MembershipManager tier.
interface IExternalDAORegistry {
    /// @notice External governance frameworks ClearPath can connect to. Extensible (Aragon/Moloch/Safe later).
    enum Framework {
        OZGovernor // 0 — OpenZeppelin Governor (Olympia + any IGovernor DAO)
    }

    event ExternalDAORegistered(
        uint256 indexed id,
        address indexed dao,
        Framework framework,
        address indexed registrant,
        string label
    );

    /// @notice Register an existing external governance contract. Validates `dao` is a recognized governance
    ///         contract (ERC-165 IGovernor probe + defensive IGovernor view calls) before adding. Tier-gated.
    ///         Confers NO authority over `dao`.
    function registerExternalDAO(address dao, Framework framework, string calldata label) external returns (uint256 id);

    function getExternalDAO(uint256 id)
        external
        view
        returns (address dao, Framework framework, string memory label, address registrant, uint64 registeredAt);

    function externalCount() external view returns (uint256);
    function isRegistered(address dao) external view returns (bool);
    function getExternalDAOsByRegistrant(address who) external view returns (uint256[] memory);

    // --- errors ---
    error ZeroAddress();
    error AlreadyRegistered();
    error NotAGovernor(address dao);
    error MembershipDenied();
    error InsufficientMembershipTier();
}
