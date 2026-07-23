// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Lido stETH — liquid staking entry (subset used by StakingRouter).
interface ILidoStETH {
    /// @notice Stake ETH; mints stETH to msg.sender. `_referral` is attribution only.
    function submit(address _referral) external payable returns (uint256);
}

/// @title Lido wstETH — non-rebasing wrapper (subset used by StakingRouter).
interface IWstETH {
    /// @notice Wrap `_stETHAmount` of stETH held by msg.sender into wstETH; returns wstETH minted.
    function wrap(uint256 _stETHAmount) external returns (uint256);
}

/// @title sPOL controller — Polygon native liquid staking (subset used by StakingRouter).
interface ISpolController {
    /// @notice Stake `_amount` POL (pulled from msg.sender via allowance); returns sPOL minted.
    function buySPOL(uint256 _amount) external returns (uint256);
}

/// @title IStakingRouter
/// @notice Interface for the per-network staking control surface + LIQUID fee-and-forward router
///         (spec 066). It governs the spec-065 staking service — provider addresses, the curated
///         validator allowlist, and a per-network emergency pause — and charges the spec-060 platform
///         fee on LIQUID staking by reading the FeeRouter rate, skimming to the treasury, and
///         forwarding the net to the provider atomically.
/// @dev    Delegated staking (Polygon `ValidatorShare.buyVoucherPOL`) is fee-free in v1 and stays a
///         direct member call — routing it here would make the router the delegator (custodial,
///         un-exitable). Only the validator allowlist + pause govern it. Exits never touch the router.
interface IStakingRouter {
    // --- events: config (each setter emits one — the on-chain audit history) ---
    event FeeRouterUpdated(address oldRouter, address newRouter, address indexed actor);
    event LidoContractsUpdated(address steth, address wsteth, address indexed actor);
    event SpolContractsUpdated(address controller, address token, address indexed actor);
    event PolygonContractsUpdated(address polToken, address stakeManager, address indexed actor);
    event ValidatorAdded(address indexed validatorShare, address indexed actor);
    event ValidatorRemoved(address indexed validatorShare, address indexed actor);

    // --- event: member LIQUID stake ---
    event LiquidStaked(
        address indexed provider,
        address indexed member,
        uint256 gross,
        uint256 fee,
        uint256 net,
        uint256 lstOut
    );

    // --- errors ---
    error ZeroAmount();
    error ZeroAddress();
    error FeeAboveQuoted();
    error ResidualFunds();
    error ProviderCallFailed();
    error AlreadyListed();
    error NotListed();

    // --- reads: config ---
    function feeRouter() external view returns (address);
    function lidoSteth() external view returns (address);
    function lidoWsteth() external view returns (address);
    function spolController() external view returns (address);
    function spolToken() external view returns (address);
    function polToken() external view returns (address);
    function polygonStakeManager() external view returns (address);
    function stakeLidoServiceId() external view returns (bytes32);
    function stakeSpolServiceId() external view returns (bytes32);

    // --- reads: validator allowlist ---
    function validatorCount() external view returns (uint256);
    function validatorAt(uint256 index) external view returns (address);
    function isValidator(address validatorShare) external view returns (bool);

    // --- config setters (STAKING_ADMIN_ROLE) ---
    function setFeeRouter(address newFeeRouter) external;
    function setLidoContracts(address steth, address wsteth) external;
    function setSpolContracts(address controller, address token) external;
    function setPolygonContracts(address polToken_, address stakeManager) external;
    function addValidator(address validatorShare) external;
    function removeValidator(address validatorShare) external;

    // --- emergency pause (GUARDIAN_ROLE) ---
    function pause() external;
    function unpause() external;

    // --- member actions: LIQUID fee-and-forward ---
    function stakeLido(uint16 maxFeeBps) external payable returns (uint256 wstOut);
    function stakeSpol(uint256 amount, uint16 maxFeeBps) external returns (uint256 spolOut);
}
