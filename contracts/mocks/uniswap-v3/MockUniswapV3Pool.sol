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
                IERC20(token0).safeTransferFrom(msg.sender, address(this), absAmountSpecified);
                
                // Simplified: constant product with fee
                uint256 feeAmount = (absAmountSpecified * fee) / 1e6;
                uint256 amountInAfterFee = absAmountSpecified - feeAmount;
                uint256 amountOut = (amountInAfterFee * liquidity) / (liquidity + amountInAfterFee);
                
                if (amountOut == 0) {
                    amountOut = amountInAfterFee; // Simplified: 1:1 swap if no liquidity
                }
                
                IERC20(token1).safeTransfer(recipient, amountOut);
                
                amount0 = int256(absAmountSpecified);
                amount1 = -int256(amountOut);
            } else {
                // Swapping token1 for token0
                IERC20(token1).safeTransferFrom(msg.sender, address(this), absAmountSpecified);
                
                uint256 feeAmount = (absAmountSpecified * fee) / 1e6;
                uint256 amountInAfterFee = absAmountSpecified - feeAmount;
                uint256 amountOut = (amountInAfterFee * liquidity) / (liquidity + amountInAfterFee);
                
                if (amountOut == 0) {
                    amountOut = amountInAfterFee;
                }
                
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
