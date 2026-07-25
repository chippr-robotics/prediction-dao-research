// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title MockUniswapV3Pool
 * @notice Minimal stand-in for a Uniswap V3 pool in spec-067 LiquidityRouter tests. The router
 *         reads exactly one thing from a pool — `tickSpacing` — because it derives the full-range
 *         bounds from the pool itself rather than mapping them from the fee tier, so that is all
 *         this mock needs to answer. NOT for production (contracts/mocks scope — constitution III).
 * @dev The pair and fee tier are stored only so a fixture reads like a real pool; the router never
 *      asks the pool for them (they come from the curated listing).
 */
contract MockUniswapV3Pool {
    /// @notice 10 for the 500 fee tier, 60 for 3000, 200 for 10000.
    int24 public tickSpacing;
    address public token0;
    address public token1;
    uint24 public fee;

    constructor(address token0_, address token1_, uint24 fee_, int24 tickSpacing_) {
        token0 = token0_;
        token1 = token1_;
        fee = fee_;
        tickSpacing = tickSpacing_;
    }

    /// @notice Test control: retune the spacing to model another fee tier on the same fixture.
    function setTickSpacing(int24 tickSpacing_) external {
        tickSpacing = tickSpacing_;
    }
}
