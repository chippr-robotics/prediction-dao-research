// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../interfaces/IChainalysisSanctionsOracle.sol";

/**
 * @title MockSanctionsOracle
 * @notice TEST/TESTNET ONLY stand-in for the Chainalysis Sanctions Oracle. The real oracle
 *         is not deployed on Polygon Amoy (80002) or local chains, so this mock is injected
 *         there for integration tests and testnet deploys. NEVER imported by, or injected
 *         into, the Polygon mainnet (137) production path (constitution Principle III).
 * @dev Lives only under contracts/mocks/. Production uses the real oracle via per-chain
 *      address injection (FR-022/FR-055).
 */
contract MockSanctionsOracle is IChainalysisSanctionsOracle {
    mapping(address => bool) private _sanctioned;

    event SanctionedSet(address indexed account, bool sanctioned);

    /// @notice Mark/unmark an address as sanctioned (test control).
    function setSanctioned(address account, bool sanctioned) external {
        _sanctioned[account] = sanctioned;
        emit SanctionedSet(account, sanctioned);
    }

    /// @inheritdoc IChainalysisSanctionsOracle
    function isSanctioned(address addr) external view returns (bool) {
        return _sanctioned[addr];
    }
}
