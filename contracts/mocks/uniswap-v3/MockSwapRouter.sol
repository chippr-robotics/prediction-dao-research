// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "../../interfaces/uniswap-v3/ISwapRouter.sol";
import "../../interfaces/uniswap-v3/IUniswapV3Pool.sol";
import "../../interfaces/uniswap-v3/IUniswapV3Factory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockSwapRouter
 * @notice Mock implementation of Uniswap V3 SwapRouter for testing
 * @dev Simulates token swaps through mock pools
 */
contract MockSwapRouter is ISwapRouter {
    using SafeERC20 for IERC20;
    
    IUniswapV3Factory public immutable factory;
    
    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed recipient
    );
    
    constructor(address _factory) {
        factory = IUniswapV3Factory(_factory);
    }
    
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        require(params.tokenIn != address(0), "Invalid tokenIn");
        require(params.tokenOut != address(0), "Invalid tokenOut");
        require(params.amountIn > 0, "Invalid amountIn");
        require(block.timestamp <= params.deadline, "Transaction expired");
        
        // Get pool
        address pool = factory.getPool(params.tokenIn, params.tokenOut, params.fee);
        require(pool != address(0), "Pool does not exist");
        
        // Transfer tokens from sender to this contract
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        
        // Approve pool to spend tokens
        IERC20(params.tokenIn).forceApprove(pool, params.amountIn);
        
        // Execute swap through pool
        bool zeroForOne = params.tokenIn < params.tokenOut;
        (int256 amount0, int256 amount1) = IUniswapV3Pool(pool).swap(
            params.recipient,
            zeroForOne,
            int256(params.amountIn),
            params.sqrtPriceLimitX96 == 0 
                ? (zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341)
                : params.sqrtPriceLimitX96,
            ""
        );
        
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
        require(amountOut >= params.amountOutMinimum, "Insufficient output");
        
        emit SwapExecuted(params.tokenIn, params.tokenOut, params.amountIn, amountOut, params.recipient);
    }
    
    function exactInput(ExactInputParams calldata) external payable override returns (uint256) {
        revert("Not implemented");
    }
    
    function exactOutputSingle(ExactOutputSingleParams calldata) external payable override returns (uint256) {
        revert("Not implemented");
    }
    
    function exactOutput(ExactOutputParams calldata) external payable override returns (uint256) {
        revert("Not implemented");
    }
    
    // Allow contract to receive ETH
    receive() external payable {}
}
