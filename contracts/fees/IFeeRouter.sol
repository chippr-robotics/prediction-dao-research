// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFeeRouter
/// @notice Unified platform-fee registry and atomic fee wrapper (spec 060).
///         The router is the single on-chain source of truth for every configurable
///         platform fee: wrapper services it charges itself (Wrapped) and rates that
///         off-chain consumers read (ConfigOnly, e.g. the Polymarket builder fee served
///         by the relay-gateway).
interface IFeeRouter {
    /// @notice How a registered service uses its fee entry.
    enum ServiceKind {
        Unregistered,
        Wrapped, // chargeable through the router (e.g. earn.lend)
        ConfigOnly // read-only rate for off-chain enforcement (e.g. polymarket.taker)
    }

    struct Service {
        uint16 capBps; // hard ceiling for feeBps; 0 => unregistered
        uint16 feeBps; // live rate, 0..capBps
        ServiceKind kind;
    }

    event ServiceRegistered(bytes32 indexed serviceId, uint16 capBps, ServiceKind kind);
    event FeeBpsChanged(bytes32 indexed serviceId, uint16 oldBps, uint16 newBps, address indexed actor);
    event TreasuryChanged(address oldTreasury, address newTreasury, address indexed actor);
    event FeeCharged(
        bytes32 indexed serviceId,
        address indexed payer,
        address indexed asset,
        uint256 grossAmount,
        uint256 feeAmount,
        address vault,
        address receiver
    );
    event FeeSkippedNoTreasury(bytes32 indexed serviceId, address indexed payer, uint256 grossAmount);

    error ServiceUnknown();
    error ServiceNotWrapped();
    error CapExceeded();
    error CapAboveMax();
    error CapZero();
    error AlreadyRegistered();
    error FeeAboveQuoted();
    error ZeroAmount();
    error ZeroAddress();

    // --- reads ---
    function treasury() external view returns (address);
    function getService(bytes32 serviceId) external view returns (Service memory);
    function feeBps(bytes32 serviceId) external view returns (uint16);
    function serviceCount() external view returns (uint256);
    function serviceAt(uint256 index) external view returns (bytes32);
    function quoteFee(bytes32 serviceId, uint256 grossAmount)
        external
        view
        returns (uint256 feeAmount, uint256 netAmount);

    // --- admin ---
    function registerService(bytes32 serviceId, uint16 capBps, ServiceKind kind) external;
    function setTreasury(address newTreasury) external;
    function setFeeBps(bytes32 serviceId, uint16 newBps) external;

    // --- member action ---
    function depositToVaultWithFee(
        bytes32 serviceId,
        address vault,
        uint256 assets,
        address receiver,
        uint16 maxFeeBps
    ) external returns (uint256 shares);
}
