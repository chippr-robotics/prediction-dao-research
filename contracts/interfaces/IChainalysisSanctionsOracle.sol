// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IChainalysisSanctionsOracle
 * @notice Minimal read-only view over the deployed Chainalysis on-chain Sanctions Oracle
 *         ("SanctionsList"). FairWins reads this to screen wallet addresses against the
 *         OFAC SDN set.
 * @dev The oracle address is injected per-chain (NEVER hardcoded — see FR-055):
 *      - Polygon mainnet (137): 0x40C57923924B5c5c5455c48D93317139ADDaC8fb
 *      - Polygon Amoy (80002): NOT deployed → inject a MockSanctionsOracle on testnet/local
 *      Only the read-only `isSanctioned(address)` view is required for integration.
 *      Spec: specs/007-compliance-gating/contracts/IChainalysisSanctionsOracle.md
 */
interface IChainalysisSanctionsOracle {
    /// @notice Returns true if `addr` is on the Chainalysis sanctions list.
    function isSanctioned(address addr) external view returns (bool);
}
