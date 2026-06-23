// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import {ERC20PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ISanctionsGuard} from "../../interfaces/ISanctionsGuard.sol";

/// @title OpenERC20 — open fungible token clone template (spec 028, User Stories 1 & 2)
/// @notice Minimal-proxy clone template for issuer-owned ERC-20s with optional burnable/pausable behavior and a
///         non-bypassable {ISanctionsGuard} screen on every transfer. Deployed once; cloned per token by the
///         {TokenFactory}. The selected options are honored exactly (FR-003): calling a disabled capability
///         reverts. Sanctions screening is fail-closed and fires on sender and recipient (FR-021).
/// @dev    Issued tokens are IMMUTABLE (not platform-upgradeable). The base implementation is initialization-
///         locked by the constructor so it can never be hijacked. Spec:
///         specs/028-token-mint/contracts/open-tokens.md.
contract OpenERC20 is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    OwnableUpgradeable
{
    uint8 private _decimals;

    /// @notice Whether holders may burn (FR-003).
    bool public burnable;
    /// @notice Whether the owner may pause transfers (FR-003).
    bool public pausable;
    /// @notice Non-bypassable sanctions screen. address(0) disables (deliberate per-network config).
    ISanctionsGuard public sanctionsGuard;

    error BurnableDisabled();
    error PausableDisabled();
    error SanctionedAddress(address account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time clone initializer. Mints `initialSupply` to `owner_`.
    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address owner_,
        address sanctionsGuard_,
        bool burnable_,
        bool pausable_
    ) external initializer {
        __ERC20_init(name_, symbol_);
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __Ownable_init(owner_);
        _decimals = decimals_;
        burnable = burnable_;
        pausable = pausable_;
        sanctionsGuard = ISanctionsGuard(sanctionsGuard_);
        if (initialSupply > 0) _mint(owner_, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Owner mints additional supply (FR-016/admin). Recipient is sanctions-screened in {_update}.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function pause() external onlyOwner {
        if (!pausable) revert PausableDisabled();
        _pause();
    }

    function unpause() external onlyOwner {
        if (!pausable) revert PausableDisabled();
        _unpause();
    }

    function burn(uint256 value) public override {
        if (!burnable) revert BurnableDisabled();
        super.burn(value);
    }

    function burnFrom(address account, uint256 value) public override {
        if (!burnable) revert BurnableDisabled();
        super.burnFrom(account, value);
    }

    /// @dev Single transfer hook: fail-closed sanctions screen (Checks) then the pausable + ERC20 chain.
    ///      Skips the zero endpoint so mint/burn are screened only on the non-zero side (FR-021).
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0)) {
            if (from != address(0) && !guard.isAllowed(from)) revert SanctionedAddress(from);
            if (to != address(0) && !guard.isAllowed(to)) revert SanctionedAddress(to);
        }
        super._update(from, to, value);
    }
}
