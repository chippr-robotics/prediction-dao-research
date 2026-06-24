// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC1404} from "../interfaces/IERC1404.sol";
import {ISanctionsGuard} from "../../interfaces/ISanctionsGuard.sol";

/// @title RestrictedERC20 — ERC-1404 Simple Restricted Token clone template (spec 028, User Story 3)
/// @notice Open ERC-20 plus a per-token transfer-restriction policy (eligibility list + per-account freeze +
///         non-bypassable sanctions). The detector and the transfer hook evaluate the SAME policy, so a
///         pre-transfer eligibility check always agrees with the actual transfer (FR-009, SC-003).
/// @dev    Evaluation order, most-restrictive first: sanctioned -> frozen -> not-eligible (FR-008/edge cases).
///         Issued tokens are IMMUTABLE; the base implementation is initialization-locked by the constructor.
///         Spec: specs/028-token-mint/contracts/erc1404-restricted.md.
contract RestrictedERC20 is Initializable, ERC20Upgradeable, OwnableUpgradeable, IERC1404 {
    // --- Restriction codes (fixed enum; 0 == SUCCESS per IERC1404) ---
    uint8 public constant SUCCESS = 0;
    uint8 public constant SENDER_NOT_ELIGIBLE = 1;
    uint8 public constant RECIPIENT_NOT_ELIGIBLE = 2;
    uint8 public constant SENDER_FROZEN = 3;
    uint8 public constant SANCTIONED = 4;

    uint8 private _decimals;

    /// @notice Non-bypassable sanctions screen. address(0) disables (deliberate per-network config).
    ISanctionsGuard public sanctionsGuard;
    /// @notice Per-token eligibility list (FR-010).
    mapping(address => bool) public eligible;
    /// @notice Per-account freeze (FR-010).
    mapping(address => bool) public frozen;

    event EligibilityUpdated(address indexed account, bool eligible);
    event FrozenUpdated(address indexed account, bool frozen);

    error TransferRestricted(uint8 code);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time clone initializer. The owner and `initialEligible` are marked eligible; `initialSupply`
    ///         is minted to the owner.
    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address owner_,
        address sanctionsGuard_,
        address[] memory initialEligible
    ) external initializer {
        __ERC20_init(name_, symbol_);
        __Ownable_init(owner_);
        _decimals = decimals_;
        sanctionsGuard = ISanctionsGuard(sanctionsGuard_);

        eligible[owner_] = true;
        for (uint256 i = 0; i < initialEligible.length; i++) {
            eligible[initialEligible[i]] = true;
        }
        if (initialSupply > 0) _mint(owner_, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    // --- IERC1404 ---

    /// @inheritdoc IERC1404
    function detectTransferRestriction(
        address from,
        address to,
        uint256 /* value */
    ) external view override returns (uint8) {
        return _detect(from, to);
    }

    /// @inheritdoc IERC1404
    function messageForTransferRestriction(uint8 code) external pure override returns (string memory) {
        if (code == SUCCESS) return "No restriction";
        if (code == SENDER_NOT_ELIGIBLE) return "Sender is not eligible to transfer this token";
        if (code == RECIPIENT_NOT_ELIGIBLE) return "Recipient is not eligible to hold this token";
        if (code == SENDER_FROZEN) return "Sender account is frozen";
        if (code == SANCTIONED) return "Address is sanctioned";
        return "Unknown restriction";
    }

    /// @dev The single source of policy truth, used by both the detector and {_update}. Most-restrictive first.
    ///      The zero endpoint (mint `from==0` / burn `to==0`) is skipped on that side.
    function _detect(address from, address to) internal view returns (uint8) {
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0)) {
            if (from != address(0) && !guard.isAllowed(from)) return SANCTIONED;
            if (to != address(0) && !guard.isAllowed(to)) return SANCTIONED;
        }
        if (from != address(0) && frozen[from]) return SENDER_FROZEN;
        if (from != address(0) && !eligible[from]) return SENDER_NOT_ELIGIBLE;
        if (to != address(0) && !eligible[to]) return RECIPIENT_NOT_ELIGIBLE;
        return SUCCESS;
    }

    /// @dev Transfer hook enforces the identical policy and reverts with the matching reason (FR-008).
    function _update(address from, address to, uint256 value) internal override {
        uint8 code = _detect(from, to);
        if (code != SUCCESS) revert TransferRestricted(code);
        super._update(from, to, value);
    }

    // --- Owner administration (FR-010) ---

    function setEligible(address account, bool ok) external onlyOwner {
        eligible[account] = ok;
        emit EligibilityUpdated(account, ok);
    }

    function setEligibleBatch(address[] calldata accounts, bool ok) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            eligible[accounts[i]] = ok;
            emit EligibilityUpdated(accounts[i], ok);
        }
    }

    function setFrozen(address account, bool isFrozen) external onlyOwner {
        frozen[account] = isFrozen;
        emit FrozenUpdated(account, isFrozen);
    }

    /// @notice Owner mints supply. The recipient must be eligible and unsanctioned (enforced in {_update}).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
