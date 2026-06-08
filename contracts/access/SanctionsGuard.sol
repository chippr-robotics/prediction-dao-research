// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/ISanctionsGuard.sol";
import "../interfaces/IChainalysisSanctionsOracle.sol";

/**
 * @title SanctionsGuard
 * @notice Non-bypassable on-chain sanctions enforcement (Spec 007, FR-016/FR-020/FR-054).
 *         Combines the Chainalysis on-chain Sanctions Oracle with an operator-maintained
 *         discretionary deny-list. Consulted read-only by value-bearing entrypoints in
 *         WagerRegistry and MembershipManager during their Checks phase (CEI preserved).
 * @dev Fail-closed: a CONFIGURED but unreachable/erroring oracle — including an address
 *      with no code — makes every account not-allowed. An UNSET oracle (address(0)) means
 *      deny-list-only enforcement: a deliberate configuration for networks where the
 *      Chainalysis oracle is absent (e.g. Amoy uses a MockSanctionsOracle; production
 *      injects the real mainnet address at deploy — FR-022/FR-055).
 *      Roles: SANCTIONS_ADMIN_ROLE mutates the deny-list; DEFAULT_ADMIN_ROLE sets the
 *      oracle. Both are granted to the air-gapped floppy-keystore admin at deploy.
 */
contract SanctionsGuard is ISanctionsGuard, AccessControl {
    /// @notice Role permitted to add/remove discretionary deny-list entries.
    bytes32 public constant SANCTIONS_ADMIN_ROLE = keccak256("SANCTIONS_ADMIN_ROLE");

    IChainalysisSanctionsOracle private _oracle;
    mapping(address => bool) private _denied;

    error ZeroAddress();

    constructor(address admin, address oracle) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SANCTIONS_ADMIN_ROLE, admin);
        _oracle = IChainalysisSanctionsOracle(oracle); // may be address(0): deny-list-only
        if (oracle != address(0)) emit SanctionsOracleUpdated(oracle);
    }

    // ---------- Views ----------

    /// @inheritdoc ISanctionsGuard
    function isAllowed(address account) public view override returns (bool) {
        if (_denied[account]) return false;
        (bool sanctioned, bool ok) = _queryOracle(account);
        if (!ok) return false; // fail-closed: configured oracle unreachable/erroring
        return !sanctioned;
    }

    /// @inheritdoc ISanctionsGuard
    function checkBlocked(address account) external view override {
        if (!isAllowed(account)) revert SanctionedAddress(account);
    }

    /// @inheritdoc ISanctionsGuard
    function isDenied(address account) external view override returns (bool) {
        return _denied[account];
    }

    /// @inheritdoc ISanctionsGuard
    function sanctionsOracle() external view override returns (address) {
        return address(_oracle);
    }

    // ---------- Admin ----------

    /// @inheritdoc ISanctionsGuard
    function setDenied(address account, bool denied, string calldata reason)
        external
        override
        onlyRole(SANCTIONS_ADMIN_ROLE)
    {
        if (account == address(0)) revert ZeroAddress();
        _denied[account] = denied;
        emit DenyListUpdated(account, denied, msg.sender, reason);
    }

    /// @inheritdoc ISanctionsGuard
    function setSanctionsOracle(address oracle) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _oracle = IChainalysisSanctionsOracle(oracle); // address(0) disables oracle screening
        emit SanctionsOracleUpdated(oracle);
    }

    // ---------- Internal ----------

    /**
     * @dev Low-level staticcall (not try/catch) so that an oracle address with no code, or
     *      one returning malformed data, is treated as fail-closed rather than reverting or
     *      mis-decoding.
     * @return sanctioned Oracle's verdict (meaningful only when `ok`).
     * @return ok         False ⇒ a configured oracle gave no usable answer ⇒ caller fails
     *                    closed. When no oracle is configured, returns (false, true).
     */
    function _queryOracle(address account) internal view returns (bool sanctioned, bool ok) {
        address oracle = address(_oracle);
        if (oracle == address(0)) return (false, true); // deny-list-only
        (bool success, bytes memory data) = oracle.staticcall(
            abi.encodeWithSelector(IChainalysisSanctionsOracle.isSanctioned.selector, account)
        );
        if (!success || data.length < 32) return (false, false); // fail-closed
        return (abi.decode(data, (bool)), true);
    }
}
