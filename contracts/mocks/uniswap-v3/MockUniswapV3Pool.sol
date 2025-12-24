// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "../../interfaces/uniswap-v3/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockUniswapV3Pool
 * @notice Mock implementation of Uniswap V3 Pool for testing
 * @dev Simulates basic swap functionality with simplified constant product formula
 */
contract MockUniswapV3Pool is IUniswapV3Pool {
    using SafeERC20 for IERC20;
    
    address public override token0;
    address public override token1;
    uint24 public override fee;
    int24 public override tickSpacing;
    uint128 public override maxLiquidityPerTick;
    
    uint160 public sqrtPriceX96;
    int24 public tick;
    uint16 public observationIndex;
    uint16 public observationCardinality;
    uint16 public observationCardinalityNext;
    uint8 public feeProtocol;
    bool public unlocked = true;
    
    uint128 public liquidity;
    
    constructor(address _token0, address _token1, uint24 _fee, int24 _tickSpacing) {
        token0 = _token0;
        token1 = _token1;
        fee = _fee;
        tickSpacing = _tickSpacing;
        maxLiquidityPerTick = type(uint128).max / 10000;
    }
    
    function slot0()
        external
        view
        override
        returns (
            uint160 _sqrtPriceX96,
            int24 _tick,
            uint16 _observationIndex,
            uint16 _observationCardinality,
            uint16 _observationCardinalityNext,
            uint8 _feeProtocol,
            bool _unlocked
        )
    {
        return (
            sqrtPriceX96,
            tick,
            observationIndex,
            observationCardinality,
            observationCardinalityNext,
            feeProtocol,
            unlocked
        );
    }
    
    function observe(uint32[] calldata)
        external
        pure
        override
        returns (int56[] memory, uint160[] memory)
    {
        revert("Not implemented");
    }
    
    function positions(bytes32)
        external
        pure
        override
        returns (uint128, uint256, uint256, uint128, uint128)
    {
        revert("Not implemented");
    }
    
    function observations(uint256)
        external
        pure
        override
        returns (uint32, int56, uint160, bool)
    {
        revert("Not implemented");
    }
    
    function initialize(uint160 _sqrtPriceX96) external override {
        require(sqrtPriceX96 == 0, "Already initialized");
        sqrtPriceX96 = _sqrtPriceX96;
        tick = _getTickAtSqrtRatio(_sqrtPriceX96);
    }
    
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160,
        bytes calldata
    ) external override returns (int256 amount0, int256 amount1) {
        require(amountSpecified != 0, "Invalid amount");
        require(sqrtPriceX96 > 0, "Pool not initialized");
        
        bool exactInput = amountSpecified > 0;
        uint256 absAmountSpecified = uint256(exactInput ? amountSpecified : -amountSpecified);
        
        if (exactInput) {
            // Exact input swap
            if (zeroForOne) {
                // Swapping token0 for token1
                // Get pool token balances BEFORE receiving input tokens
                uint256 balance1Before = IERC20(token1).balanceOf(address(this));
                
                IERC20(token0).safeTransferFrom(msg.sender, address(this), absAmountSpecified);
                
                // Simplified mock: Use actual token balances for realistic swaps
                // Apply fee and use simple constant product formula
                uint256 feeAmount = (absAmountSpecified * fee) / 1e6;
                uint256 amountInAfterFee = absAmountSpecified - feeAmount;
                
                // Simplified constant product: output = balance * amountIn / (balance + amountIn)
                // This gives reasonable output based on actual pool reserves
                uint256 amountOut;
                if (balance1Before > 0) {
                    amountOut = (balance1Before * amountInAfterFee) / (balance1Before + amountInAfterFee);
                    // Cap output at available balance minus 1 for safety
                    if (amountOut > balance1Before - 1) {
                        amountOut = balance1Before - 1;
                    }
                } else if (liquidity > 0) {
                    // Fallback to liquidity-based calculation
                    amountOut = (amountInAfterFee * liquidity) / (liquidity + amountInAfterFee);
                } else {
                    // Emergency fallback for testing: near 1:1 with slight slippage
                    amountOut = (amountInAfterFee * 99) / 100;
                }
                
                // Ensure we have a reasonable output
                require(amountOut > 0, "Insufficient pool liquidity");
                
                IERC20(token1).safeTransfer(recipient, amountOut);
                
                amount0 = int256(absAmountSpecified);
                amount1 = -int256(amountOut);
            } else {
                // Swapping token1 for token0
                // Get pool token balances BEFORE receiving input tokens
                uint256 balance0Before = IERC20(token0).balanceOf(address(this));
                
                IERC20(token1).safeTransferFrom(msg.sender, address(this), absAmountSpecified);
                
                uint256 feeAmount = (absAmountSpecified * fee) / 1e6;
                uint256 amountInAfterFee = absAmountSpecified - feeAmount;
                
                uint256 amountOut;
                if (balance0Before > 0) {
                    amountOut = (balance0Before * amountInAfterFee) / (balance0Before + amountInAfterFee);
                    // Cap output at available balance minus 1 for safety
                    if (amountOut > balance0Before - 1) {
                        amountOut = balance0Before - 1;
                    }
                } else if (liquidity > 0) {
                    amountOut = (amountInAfterFee * liquidity) / (liquidity + amountInAfterFee);
                } else {
                    amountOut = (amountInAfterFee * 99) / 100;
                }
                
                require(amountOut > 0, "Insufficient pool liquidity");
                
                IERC20(token0).safeTransfer(recipient, amountOut);
                
                amount0 = -int256(amountOut);
                amount1 = int256(absAmountSpecified);
            }
        } else {
            revert("Exact output not implemented");
        }
    }
    
    function flash(address, uint256, uint256, bytes calldata) external pure override {
        revert("Not implemented");
    }
    
    function increaseObservationCardinalityNext(uint16) external pure override {
        revert("Not implemented");
    }
    
    function mint(address, int24, int24, uint128 amount, bytes calldata)
        external
        override
        returns (uint256, uint256)
    {
        liquidity += amount;
        return (0, 0);
    }
    
    function collect(address, int24, int24, uint128, uint128)
        external
        pure
        override
        returns (uint128, uint128)
    {
        return (0, 0);
    }
    
    function burn(int24, int24, uint128 amount) external override returns (uint256, uint256) {
        require(liquidity >= amount, "Insufficient liquidity");
        liquidity -= amount;
        return (0, 0);
    }
    
    function _getTickAtSqrtRatio(uint160) internal pure returns (int24) {
        return 0; // Simplified
    }
    
    // Helper functions for testing
    function setLiquidity(uint128 _liquidity) external {
        liquidity = _liquidity;
    }
    
    function fundPool(uint256 amount0, uint256 amount1) external {
        if (amount0 > 0) {
            IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        }
        if (amount1 > 0) {
            IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
        }
    }
}
