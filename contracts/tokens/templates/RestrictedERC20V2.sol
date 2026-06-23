// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OpenERC20V2} from "./OpenERC20V2.sol";
import {IERC1404} from "../interfaces/IERC1404.sol";

/// @title RestrictedERC20V2 — role-based ERC-1404 clone template (spec 028 expansion, US8)
/// @notice OpenERC20V2 plus a per-token eligibility allowlist and the Simple Restricted Token interface, gated by
///         a dedicated `COMPLIANCE_ROLE`. The detector and the transfer hook evaluate the SAME policy
///         (sanctions → frozen → eligibility), so a pre-transfer check always agrees with the transfer (SC-003).
/// @dev    Spec: specs/028-token-mint/contracts/roles-controls-caps.md. Immutable clone.
contract RestrictedERC20V2 is OpenERC20V2, IERC1404 {
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    mapping(address => bool) public eligible;
    string public defaultRestrictionMessage;

    event EligibilityUpdated(address indexed account, bool eligible);

    /// @notice One-time clone initializer. Sets up the OpenERC20V2 bases + roles, grants COMPLIANCE_ROLE to the
    ///         owner, marks the owner + `initialEligible` eligible, and sets a default restriction message.
    function initializeRestricted(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        uint256 cap_,
        address owner_,
        address sanctionsGuard_,
        address[] memory initialEligible
    ) external initializer {
        if (initialEligible.length > MAX_BATCH) revert BatchTooLarge(initialEligible.length, MAX_BATCH);
        __OpenERC20V2_init(name_, symbol_, decimals_, 0, cap_, owner_, sanctionsGuard_);
        _grantRole(COMPLIANCE_ROLE, owner_);

        eligible[owner_] = true;
        for (uint256 i = 0; i < initialEligible.length; i++) {
            eligible[initialEligible[i]] = true;
        }
        defaultRestrictionMessage = "Transfer not permitted by token policy";

        // Mint after eligibility is seeded so the owner (eligible) passes the policy in _update.
        if (initialSupply > 0) _mint(owner_, initialSupply);
    }

    /// @dev Disable the inherited OpenERC20V2.initialize so a RestrictedERC20V2 clone can only be set up via
    ///      {initializeRestricted} (which seeds eligibility + the COMPLIANCE role). Prevents a mis-initialized,
    ///      compliance-less restricted token.
    function initialize(
        string memory,
        string memory,
        uint8,
        uint256,
        uint256,
        address,
        address
    ) external pure override {
        revert WrongInitializer();
    }

    // --- Compliance admin (COMPLIANCE_ROLE) ---

    function setEligible(address account, bool ok) external onlyRole(COMPLIANCE_ROLE) {
        eligible[account] = ok;
        emit EligibilityUpdated(account, ok);
    }

    function setEligibleBatch(address[] calldata accounts, bool ok) external onlyRole(COMPLIANCE_ROLE) {
        if (accounts.length > MAX_BATCH) revert BatchTooLarge(accounts.length, MAX_BATCH);
        for (uint256 i = 0; i < accounts.length; i++) {
            eligible[accounts[i]] = ok;
            emit EligibilityUpdated(accounts[i], ok);
        }
    }

    function setDefaultRestrictionMessage(string calldata message) external onlyRole(COMPLIANCE_ROLE) {
        defaultRestrictionMessage = message;
        emit DefaultRestrictionMessageUpdated(message);
    }

    /// @dev Freeze is a compliance action here (override the base's DEFAULT_ADMIN gate to COMPLIANCE_ROLE).
    function setFrozen(address account, bool isFrozen) public override onlyRole(COMPLIANCE_ROLE) {
        _setFrozenInternal(account, isFrozen);
    }

    // --- ERC-1404 ---

    /// @inheritdoc IERC1404
    function detectTransferRestriction(
        address from,
        address to,
        uint256 /* value */
    ) external view override returns (uint8) {
        return _restrictionCode(from, to);
    }

    /// @inheritdoc IERC1404
    function messageForTransferRestriction(uint8 code) external view override returns (string memory) {
        if (code == SUCCESS) return "No restriction";
        if (code == SENDER_NOT_ELIGIBLE) return "Sender is not eligible to transfer this token";
        if (code == RECIPIENT_NOT_ELIGIBLE) return "Recipient is not eligible to hold this token";
        if (code == SENDER_FROZEN) return "Sender account is frozen";
        if (code == RECIPIENT_FROZEN) return "Recipient account is frozen";
        if (code == SANCTIONED) return "Address is sanctioned";
        if (code == PAUSED_CODE) return "Token transfers are paused";
        return defaultRestrictionMessage;
    }

    /// @dev Eligibility extension to the shared policy (sender/recipient must be eligible).
    function _extraRestrictionCode(address from, address to) internal view override returns (uint8) {
        if (from != address(0) && !eligible[from]) return SENDER_NOT_ELIGIBLE;
        if (to != address(0) && !eligible[to]) return RECIPIENT_NOT_ELIGIBLE;
        return SUCCESS;
    }
}
