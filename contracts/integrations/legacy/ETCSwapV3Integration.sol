// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../DexV3Integration.sol";

/**
 * @title ETCSwapV3Integration (legacy alias)
 * @notice Build-time alias for DexV3Integration. Preserves the original contract
 *         name so existing imports, deployment scripts, and test fixtures that
 *         reference "ETCSwapV3Integration" continue to compile and deploy.
 * @dev New code should target DexV3Integration directly. This shim is purely a
 *      naming alias — it adds no behavior. The Mordor on-chain deployment of
 *      ETCSwapV3Integration is unaffected; this contract is only relevant to
 *      consumers that build/deploy against the new tree.
 */
contract ETCSwapV3Integration is DexV3Integration {
    constructor(
        address _factory,
        address _swapRouter,
        address _positionManager
    ) DexV3Integration(_factory, _swapRouter, _positionManager) {}
}
