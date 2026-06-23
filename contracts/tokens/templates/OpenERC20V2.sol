// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import {ERC20PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import {ERC20CappedUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {ISanctionsGuard} from "../../interfaces/ISanctionsGuard.sol";
import {ITokenAdminV2} from "../interfaces/ITokenAdminV2.sol";

/// @title OpenERC20V2 — role-based open ERC-20 clone template (spec 028 expansion, US6/US7/US9/US11)
/// @notice Evolves OpenERC20 from single-owner to role-based administration on
///         `AccessControlEnumerable` (DEFAULT_ADMIN owner + MINTER/PAUSER/BURNER), with an optional supply cap
///         (`ERC20Capped`; uncapped == cap set to max), pause, an enumerable freeze list, bounded batch ops, and
///         a non-bypassable `SanctionsGuard` screen. Restricted subclasses add eligibility via
///         {_extraRestrictionCode}. Immutable clone; the implementation is initialization-locked.
/// @dev    Issued tokens are NOT upgradeable. Spec: specs/028-token-mint/contracts/roles-controls-caps.md.
contract OpenERC20V2 is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    ERC20CappedUpgradeable,
    AccessControlEnumerableUpgradeable,
    ITokenAdminV2
{
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // Restriction codes (mirror ERC-1404; 0 == SUCCESS).
    uint8 internal constant SUCCESS = 0;
    uint8 internal constant SENDER_NOT_ELIGIBLE = 1;
    uint8 internal constant RECIPIENT_NOT_ELIGIBLE = 2;
    uint8 internal constant SENDER_FROZEN = 3;
    uint8 internal constant SANCTIONED = 4;
    uint8 internal constant RECIPIENT_FROZEN = 5;
    uint8 internal constant PAUSED_CODE = 6;

    uint256 public constant MAX_BATCH = 200;

    uint8 private _decimals;
    /// @notice True iff a real (non-max) supply cap was set at creation.
    bool public capped;
    /// @notice Non-bypassable sanctions screen; address(0) disables (deliberate per-network config).
    ISanctionsGuard public sanctionsGuard;

    EnumerableSet.AddressSet private _frozenSet;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time clone initializer. Grants all roles to `owner_` (owner-as-admin default). `cap_ == 0`
    ///         ⇒ uncapped (cap stored as max). Mints `initialSupply` to `owner_`.
    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        uint256 cap_,
        address owner_,
        address sanctionsGuard_
    ) external virtual initializer {
        __OpenERC20V2_init(name_, symbol_, decimals_, initialSupply, cap_, owner_, sanctionsGuard_);
    }

    /// @dev Reusable initializer body so subclasses (e.g. RestrictedERC20V2) set up the same bases + roles before
    ///      adding their own state. Call exactly once from a subclass `initializer`.
    function __OpenERC20V2_init(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        uint256 cap_,
        address owner_,
        address sanctionsGuard_
    ) internal onlyInitializing {
        __ERC20_init(name_, symbol_);
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __ERC20Capped_init(cap_ == 0 ? type(uint256).max : cap_);
        __AccessControlEnumerable_init();

        _decimals = decimals_;
        capped = cap_ != 0;
        sanctionsGuard = ISanctionsGuard(sanctionsGuard_);

        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(MINTER_ROLE, owner_);
        _grantRole(PAUSER_ROLE, owner_);
        _grantRole(BURNER_ROLE, owner_);

        if (initialSupply > 0) _mint(owner_, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    // --- Supply (MINTER/BURNER) ---

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @notice Privileged burn from any account (clawback/treasury); holder self-burn stays open via ERC20Burnable.
    function adminBurn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    // --- Pause (PAUSER) ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // --- Freeze (DEFAULT_ADMIN; restricted class overrides the gate to COMPLIANCE) ---

    function setFrozen(address account, bool isFrozen) public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFrozenInternal(account, isFrozen);
    }

    /// @dev Freeze-set mutation; the public `setFrozen` (and subclass overrides) gate the caller by role.
    function _setFrozenInternal(address account, bool isFrozen) internal {
        if (account == address(0)) revert ZeroAddress();
        if (isFrozen) {
            _frozenSet.add(account);
        } else {
            _frozenSet.remove(account);
        }
        emit Frozen(account, isFrozen);
    }

    function frozen(address account) public view returns (bool) {
        return _frozenSet.contains(account);
    }

    function frozenCount() external view returns (uint256) {
        return _frozenSet.length();
    }

    function frozenAt(uint256 index) external view returns (address) {
        return _frozenSet.at(index);
    }

    // --- Batch (MINTER for batchMint; holders/any for batchTransfer) ---

    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external onlyRole(MINTER_ROLE) {
        if (recipients.length != amounts.length) revert LengthMismatch();
        if (recipients.length > MAX_BATCH) revert BatchTooLarge(recipients.length, MAX_BATCH);
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }

    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external {
        if (recipients.length != amounts.length) revert LengthMismatch();
        if (recipients.length > MAX_BATCH) revert BatchTooLarge(recipients.length, MAX_BATCH);
        for (uint256 i = 0; i < recipients.length; i++) {
            _transfer(_msgSender(), recipients[i], amounts[i]);
        }
    }

    // --- Ownership (DEFAULT_ADMIN_ROLE) ---

    /// @notice Hand full admin authority to `newOwner` (grants DEFAULT_ADMIN_ROLE), then renounce it from caller.
    function transferOwnership(address newOwner) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newOwner == address(0)) revert ZeroAddress();
        if (newOwner == _msgSender()) revert SelfTransfer(); // guard against self-transfer admin lockout
        _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        _revokeRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /// @notice Permanently relinquish ownership (irreversible) — renounces DEFAULT_ADMIN_ROLE. Renouncing as the
    ///         sole admin intentionally leaves the token unadministerable forever (FR-038, mirrors OZ
    ///         Ownable.renounceOwnership); the frontend gates this behind an explicit confirmation.
    function renounceOwnership() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    // --- Transfer policy (shared; subclasses extend via _extraRestrictionCode) ---

    /// @dev The single source of restriction truth: sanctions → frozen → (subclass) eligibility. Zero endpoint
    ///      (mint/burn) is skipped on that side. Pause is enforced separately by ERC20Pausable.
    function _restrictionCode(address from, address to) internal view returns (uint8) {
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0)) {
            if (from != address(0) && !guard.isAllowed(from)) return SANCTIONED;
            if (to != address(0) && !guard.isAllowed(to)) return SANCTIONED;
        }
        // Pause is part of the policy so the ERC-1404 detector matches the actual transfer outcome (SC-003).
        if (paused()) return PAUSED_CODE;
        if (from != address(0) && frozen(from)) return SENDER_FROZEN;
        if (to != address(0) && frozen(to)) return RECIPIENT_FROZEN;
        return _extraRestrictionCode(from, to);
    }

    /// @dev Subclass hook for additional restrictions (e.g. ERC-1404 eligibility). Default: none.
    function _extraRestrictionCode(address, address) internal view virtual returns (uint8) {
        return SUCCESS;
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable, ERC20CappedUpgradeable) {
        uint8 code = _restrictionCode(from, to);
        if (code != SUCCESS) revert TransferRestricted(code);
        super._update(from, to, value);
    }
}
