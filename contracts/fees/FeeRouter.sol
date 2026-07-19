// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {IFeeRouter} from "./IFeeRouter.sol";

/// @title FeeRouter
/// @notice Single on-chain source of truth for FairWins' configurable platform fees
///         (spec 060), and the atomic fee wrapper for external services with no native
///         revenue share. Wrapped services (first: Earn lending, `earn.lend`) are
///         charged here: the router pulls the member's principal, skims the configured
///         fee (bps, floor) to the treasury, and forwards the remainder into the
///         external protocol in the same transaction. ConfigOnly services (the
///         Polymarket builder taker/maker rates) store rates that off-chain enforcers
///         read; the router never charges them.
/// @dev    The router holds no balances outside a transaction. Fee changes are gated by
///         FEE_ADMIN_ROLE and capped per service at registration (wrapped caps are
///         themselves capped at MAX_WRAPPED_FEE_BPS); every change emits FeeBpsChanged,
///         which is the audit history the admin UI renders. `maxFeeBps` on the charge
///         path pins members to the rate they were shown, so a concurrent admin raise
///         can never overcharge an in-flight deposit.
///         Fee-on-transfer / rebasing assets are NOT supported: the router assumes the
///         pulled amount equals the requested amount (true for the curated vault assets,
///         e.g. USDC).
contract FeeRouter is IFeeRouter, UUPSManaged, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Holders may change service rates within their caps.
    bytes32 public constant FEE_ADMIN_ROLE = keccak256("FEE_ADMIN_ROLE");

    /// @notice Absolute ceiling for any Wrapped service's cap (2.5%).
    uint16 public constant MAX_WRAPPED_FEE_BPS = 250;

    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice Per-network fee destination. address(0) => fees are skipped, never lost.
    address public treasury;

    mapping(bytes32 => Service) private _services;
    bytes32[] private _serviceIds;

    uint256[47] private __gap;

    /// @param admin Granted DEFAULT_ADMIN_ROLE, UPGRADER_ROLE and FEE_ADMIN_ROLE.
    /// @param treasury_ Fee destination; address(0) allowed for not-yet-configured
    ///        networks (the charge path then skips fees rather than reverting).
    function initialize(address admin, address treasury_) external initializer {
        if (admin == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);
        __ReentrancyGuard_init();
        _grantRole(FEE_ADMIN_ROLE, admin);
        treasury = treasury_;
    }

    // ---------------------------------------------------------------- reads

    function getService(bytes32 serviceId) external view returns (Service memory) {
        return _services[serviceId];
    }

    function feeBps(bytes32 serviceId) external view returns (uint16) {
        return _services[serviceId].feeBps;
    }

    function serviceCount() external view returns (uint256) {
        return _serviceIds.length;
    }

    function serviceAt(uint256 index) external view returns (bytes32) {
        return _serviceIds[index];
    }

    /// @notice Fee/net split for `grossAmount` at the service's live rate (floor — the
    ///         member's favor; a fee that rounds to zero is charged as zero). Mirrors the
    ///         charge path exactly, including the treasury-unset skip: when `treasury` is
    ///         address(0) no fee is actually taken, so the quote reports zero too (an
    ///         integrator UI never displays a fee the router would not charge).
    function quoteFee(bytes32 serviceId, uint256 grossAmount)
        public
        view
        returns (uint256 feeAmount, uint256 netAmount)
    {
        Service storage svc = _services[serviceId];
        if (svc.kind == ServiceKind.Unregistered) revert ServiceUnknown();
        feeAmount = treasury == address(0) ? 0 : (grossAmount * svc.feeBps) / BPS_DENOMINATOR;
        netAmount = grossAmount - feeAmount;
    }

    // ---------------------------------------------------------------- admin

    /// @notice Register a fee service. One-shot per id; the cap is fixed for the life
    ///         of the entry (emergency lever is `setFeeBps(id, 0)`, not cap changes).
    function registerService(bytes32 serviceId, uint16 capBps, ServiceKind kind)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (kind == ServiceKind.Unregistered) revert ServiceUnknown();
        if (capBps == 0) revert CapZero();
        if (kind == ServiceKind.Wrapped && capBps > MAX_WRAPPED_FEE_BPS) revert CapAboveMax();
        if (_services[serviceId].kind != ServiceKind.Unregistered) revert AlreadyRegistered();

        _services[serviceId] = Service({capBps: capBps, feeBps: 0, kind: kind});
        _serviceIds.push(serviceId);
        emit ServiceRegistered(serviceId, capBps, kind);
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, newTreasury, msg.sender);
        treasury = newTreasury;
    }

    function setFeeBps(bytes32 serviceId, uint16 newBps) external onlyRole(FEE_ADMIN_ROLE) {
        Service storage svc = _services[serviceId];
        if (svc.kind == ServiceKind.Unregistered) revert ServiceUnknown();
        if (newBps > svc.capBps) revert CapExceeded();
        emit FeeBpsChanged(serviceId, svc.feeBps, newBps, msg.sender);
        svc.feeBps = newBps;
    }

    // ---------------------------------------------------------------- member action

    /// @inheritdoc IFeeRouter
    /// @dev Pull `assets` of the vault's underlying from the caller, transfer the fee to
    ///      the treasury, deposit the remainder into the ERC-4626 vault for `receiver`.
    ///      Atomic: any failing leg reverts the whole action, so the treasury never
    ///      keeps a fee for a deposit that did not happen. Reverts FeeAboveQuoted when
    ///      the live rate exceeds `maxFeeBps` (the rate the member consented to).
    function depositToVaultWithFee(
        bytes32 serviceId,
        address vault,
        uint256 assets,
        address receiver,
        uint16 maxFeeBps
    ) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (vault == address(0) || receiver == address(0)) revert ZeroAddress();

        Service storage svc = _services[serviceId];
        if (svc.kind == ServiceKind.Unregistered) revert ServiceUnknown();
        if (svc.kind != ServiceKind.Wrapped) revert ServiceNotWrapped();
        uint16 liveBps = svc.feeBps;
        if (liveBps > svc.capBps) revert CapExceeded(); // defense in depth
        if (liveBps > maxFeeBps) revert FeeAboveQuoted();

        address to = treasury;
        uint256 feeAmount = to == address(0) ? 0 : (assets * liveBps) / BPS_DENOMINATOR;

        IERC20 asset = IERC20(IERC4626(vault).asset());
        asset.safeTransferFrom(msg.sender, address(this), assets);

        if (feeAmount > 0) {
            asset.safeTransfer(to, feeAmount);
            emit FeeCharged(serviceId, msg.sender, address(asset), assets, feeAmount, vault, receiver);
        } else if (liveBps > 0 && to == address(0)) {
            emit FeeSkippedNoTreasury(serviceId, msg.sender, assets);
        } else if (liveBps > 0) {
            // Fee floored to zero on a small principal (treasury configured). Still record the
            // wrapper action so off-chain reconciliation counts exactly one router event per
            // successful deposit, never under-counting dust.
            emit FeeCharged(serviceId, msg.sender, address(asset), assets, 0, vault, receiver);
        }

        uint256 netAmount = assets - feeAmount;
        asset.forceApprove(vault, netAmount);
        shares = IERC4626(vault).deposit(netAmount, receiver);
        // The router pulled the member's principal and (may have) taken a fee; refuse to let a
        // vault swallow it for zero shares — that would break the atomic fee-for-value guarantee.
        if (shares == 0) revert ZeroShares();
        asset.forceApprove(vault, 0);
    }
}
