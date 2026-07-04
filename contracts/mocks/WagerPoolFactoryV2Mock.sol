// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WagerPoolFactory} from "../pools/WagerPoolFactory.sol";

/// @title WagerPoolFactoryV2Mock
/// @notice TEST-ONLY upgrade target proving the factory proxy upgrades in place and preserves state
///         (no storage added — trivially layout-compatible). NEVER deploy in production (constitution III).
contract WagerPoolFactoryV2Mock is WagerPoolFactory {
    function version() external pure returns (uint256) {
        return 2;
    }
}
