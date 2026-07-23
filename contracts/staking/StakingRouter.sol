// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {IFeeRouter} from "../fees/IFeeRouter.sol";
import {IStakingRouter, ILidoStETH, IWstETH, ISpolController} from "./IStakingRouter.sol";

/// @title StakingRouter
/// @notice Per-network on-chain control surface for the spec-065 staking service and the path member
///         LIQUID stakes route through so a spec-060 platform fee reaches the treasury (spec 066).
///         It holds the managed staking config — provider addresses + a curated `ValidatorShare`
///         allowlist — and a per-network emergency pause, and it charges the LIQUID staking fee by
///         reading the FeeRouter (the single fee source of truth): it skims the fee to the treasury
///         and forwards the net to the provider (Lido submit→wrap→wstETH, sPOL buySPOL) atomically,
///         returning the LST to the member.
/// @dev    Value-bearing but TRANSIENT-custody only: every fund-moving entrypoint is `nonReentrant`,
///         follows checks-effects-interactions, resets approvals to 0, and asserts no residual member
///         funds remain after the call (FR-016). Config is gated by STAKING_ADMIN_ROLE; the emergency
///         pause by GUARDIAN_ROLE (both held by a multisig in production, no timelock). Storage is
///         append-only with a trailing `__gap` for in-place UUPS upgrades.
///
///         Delegated staking (Polygon `ValidatorShare.buyVoucherPOL`) is intentionally NOT an
///         entrypoint here: it binds the delegation to `msg.sender`, so a router call would make the
///         router the delegator (custodial + un-exitable). The member calls it directly and it is
///         fee-free in v1; the router only governs its allowlist + pause. Exits never touch the router.
contract StakingRouter is
    IStakingRouter,
    UUPSManaged,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Holders may change provider addresses + curate the validator allowlist (config).
    bytes32 public constant STAKING_ADMIN_ROLE = keccak256("STAKING_ADMIN_ROLE");
    /// @notice Holders may pause/unpause new staking on this network (emergency lever).
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice Per-provider FeeRouter service ids (deterministic; read at stake time for the live rate).
    bytes32 public constant stakeLidoServiceId = keccak256("stake.lido");
    bytes32 public constant stakeSpolServiceId = keccak256("stake.polygon");

    // ---------------------------------------------------------------- storage (append-only)

    /// @notice Reference to the spec-060 FeeRouter (rate + treasury source of truth).
    address public feeRouter;
    /// @notice Lido stETH (submit) + wstETH (wrap) contracts on this network.
    address public lidoSteth;
    address public lidoWsteth;
    /// @notice sPOL controller (buySPOL) + sPOL token.
    address public spolController;
    address public spolToken;
    /// @notice POL token + Polygon StakeManager (delegated config only; member stakes delegated directly).
    address public polToken;
    address public polygonStakeManager;
    /// @notice Curated ValidatorShare allowlist for delegated staking.
    EnumerableSet.AddressSet private _validators;

    uint256[41] private __gap;

    // ---------------------------------------------------------------- init

    /// @param admin Granted DEFAULT_ADMIN_ROLE + UPGRADER_ROLE (UUPSManaged) and STAKING_ADMIN_ROLE +
    ///        GUARDIAN_ROLE. In production a multisig (Safe); there is no on-chain timelock.
    /// @param feeRouter_ The spec-060 FeeRouter address (must be non-zero).
    /// @dev Provider addresses may be zero at init and configured later via the setters; the liquid
    ///      stake entrypoints will revert until their provider is set.
    function initialize(
        address admin,
        address feeRouter_,
        address steth,
        address wsteth,
        address spolController_,
        address spolToken_,
        address polToken_,
        address polygonStakeManager_
    ) external initializer {
        if (admin == address(0) || feeRouter_ == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);
        __ReentrancyGuard_init();
        __Pausable_init();
        _grantRole(STAKING_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);

        feeRouter = feeRouter_;
        lidoSteth = steth;
        lidoWsteth = wsteth;
        spolController = spolController_;
        spolToken = spolToken_;
        polToken = polToken_;
        polygonStakeManager = polygonStakeManager_;
    }

    // ---------------------------------------------------------------- config setters (STAKING_ADMIN_ROLE)

    function setFeeRouter(address newFeeRouter) external onlyRole(STAKING_ADMIN_ROLE) {
        if (newFeeRouter == address(0)) revert ZeroAddress();
        emit FeeRouterUpdated(feeRouter, newFeeRouter, msg.sender);
        feeRouter = newFeeRouter;
    }

    function setLidoContracts(address steth, address wsteth) external onlyRole(STAKING_ADMIN_ROLE) {
        if (steth == address(0) || wsteth == address(0)) revert ZeroAddress();
        lidoSteth = steth;
        lidoWsteth = wsteth;
        emit LidoContractsUpdated(steth, wsteth, msg.sender);
    }

    function setSpolContracts(address controller, address token) external onlyRole(STAKING_ADMIN_ROLE) {
        if (controller == address(0) || token == address(0)) revert ZeroAddress();
        spolController = controller;
        spolToken = token;
        emit SpolContractsUpdated(controller, token, msg.sender);
    }

    function setPolygonContracts(address polToken_, address stakeManager) external onlyRole(STAKING_ADMIN_ROLE) {
        if (polToken_ == address(0) || stakeManager == address(0)) revert ZeroAddress();
        polToken = polToken_;
        polygonStakeManager = stakeManager;
        emit PolygonContractsUpdated(polToken_, stakeManager, msg.sender);
    }

    function addValidator(address validatorShare) external onlyRole(STAKING_ADMIN_ROLE) {
        if (validatorShare == address(0)) revert ZeroAddress();
        if (!_validators.add(validatorShare)) revert AlreadyListed();
        emit ValidatorAdded(validatorShare, msg.sender);
    }

    function removeValidator(address validatorShare) external onlyRole(STAKING_ADMIN_ROLE) {
        if (!_validators.remove(validatorShare)) revert NotListed();
        emit ValidatorRemoved(validatorShare, msg.sender);
    }

    // ---------------------------------------------------------------- validator reads

    function validatorCount() external view returns (uint256) {
        return _validators.length();
    }

    function validatorAt(uint256 index) external view returns (address) {
        return _validators.at(index);
    }

    function isValidator(address validatorShare) external view returns (bool) {
        return _validators.contains(validatorShare);
    }

    // ---------------------------------------------------------------- emergency pause (GUARDIAN_ROLE)

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------- LIQUID fee-and-forward entrypoints

    /// @notice Stake ETH into Lido and receive wstETH, net of the platform fee. The fee (live rate for
    ///         `stake.lido`, capped by `maxFeeBps`) goes to the treasury; the remainder is submitted to
    ///         Lido and wrapped, and the wstETH is returned to the caller. Atomic + `nonReentrant`.
    /// @param maxFeeBps The rate the member was shown; a live rate above it reverts FeeAboveQuoted.
    /// @return wstOut wstETH returned to the member.
    function stakeLido(uint16 maxFeeBps)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 wstOut)
    {
        uint256 gross = msg.value;
        if (gross == 0) revert ZeroAmount();
        // Pre-existing balance (robust against forced ETH): we assert we consume exactly `gross`.
        uint256 startBalance = address(this).balance - gross;

        IFeeRouter router = IFeeRouter(feeRouter);
        // Consent ceiling BEFORE any movement — the quoted rate is a hard cap (FR-003).
        if (router.feeBps(stakeLidoServiceId) > maxFeeBps) revert FeeAboveQuoted();
        (uint256 fee, uint256 net) = router.quoteFee(stakeLidoServiceId, gross);

        if (fee > 0) {
            (bool ok, ) = router.treasury().call{value: fee}("");
            if (!ok) revert ProviderCallFailed();
        }

        // Forward the net to Lido: submit → wrap → return wstETH to the member.
        uint256 stethBefore = IERC20(lidoSteth).balanceOf(address(this));
        ILidoStETH(lidoSteth).submit{value: net}(address(0));
        uint256 steth = IERC20(lidoSteth).balanceOf(address(this)) - stethBefore;
        IERC20(lidoSteth).forceApprove(lidoWsteth, steth);
        wstOut = IWstETH(lidoWsteth).wrap(steth);
        if (wstOut == 0) revert ProviderCallFailed();
        IERC20(lidoWsteth).safeTransfer(msg.sender, wstOut);
        IERC20(lidoSteth).forceApprove(lidoWsteth, 0);

        // No member funds may remain in the router after the action (FR-016).
        if (address(this).balance != startBalance) revert ResidualFunds();
        emit LiquidStaked(lidoWsteth, msg.sender, gross, fee, net, wstOut);
    }

    /// @notice Stake POL into sPOL and receive sPOL, net of the platform fee. The fee (live rate for
    ///         `stake.polygon`, capped by `maxFeeBps`) goes to the treasury; the remainder is staked
    ///         via `buySPOL` and the sPOL is returned to the caller. Atomic + `nonReentrant`.
    /// @param amount POL to stake (pulled from the caller via allowance).
    /// @param maxFeeBps The rate the member was shown; a live rate above it reverts FeeAboveQuoted.
    /// @return spolOut sPOL returned to the member.
    function stakeSpol(uint256 amount, uint16 maxFeeBps)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 spolOut)
    {
        if (amount == 0) revert ZeroAmount();
        IERC20 pol = IERC20(polToken);
        uint256 polBefore = pol.balanceOf(address(this));

        IFeeRouter router = IFeeRouter(feeRouter);
        if (router.feeBps(stakeSpolServiceId) > maxFeeBps) revert FeeAboveQuoted();

        pol.safeTransferFrom(msg.sender, address(this), amount);
        (uint256 fee, uint256 net) = router.quoteFee(stakeSpolServiceId, amount);

        if (fee > 0) pol.safeTransfer(router.treasury(), fee);

        pol.forceApprove(spolController, net);
        spolOut = ISpolController(spolController).buySPOL(net);
        if (spolOut == 0) revert ProviderCallFailed();
        IERC20(spolToken).safeTransfer(msg.sender, spolOut);
        pol.forceApprove(spolController, 0);

        // The router must not retain any of the member's principal (FR-016).
        if (pol.balanceOf(address(this)) != polBefore) revert ResidualFunds();
        emit LiquidStaked(spolToken, msg.sender, amount, fee, net, spolOut);
    }
}
