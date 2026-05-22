// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "../../interfaces/uniswap-v3/INonfungiblePositionManager.sol";
import "../../interfaces/uniswap-v3/IUniswapV3Factory.sol";
import "../../interfaces/uniswap-v3/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockNonfungiblePositionManager
 * @notice Mock implementation of Uniswap V3 NonfungiblePositionManager for testing
 * @dev Simulates liquidity position management without full NFT functionality
 */
contract MockNonfungiblePositionManager is INonfungiblePositionManager {
    using SafeERC20 for IERC20;
    
    IUniswapV3Factory public immutable factory;
    
    uint256 private _nextId = 1;
    
    struct Position {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        address pool;
    }
    
    mapping(uint256 => Position) private _positions;
    
    constructor(address _factory) {
        factory = IUniswapV3Factory(_factory);
    }
    
    function mint(MintParams calldata params)
        external
        payable
        override
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(block.timestamp <= params.deadline, "Transaction expired");
        
        // Get or create pool
        address pool = factory.getPool(params.token0, params.token1, params.fee);
        require(pool != address(0), "Pool does not exist");
        
        // Transfer tokens from sender
        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;
        
        if (amount0 > 0) {
            IERC20(params.token0).safeTransferFrom(msg.sender, pool, amount0);
        }
        if (amount1 > 0) {
            IERC20(params.token1).safeTransferFrom(msg.sender, pool, amount1);
        }
        
        // Calculate liquidity (simplified)
        liquidity = uint128((amount0 + amount1) / 2);
        
        // Add liquidity to pool
        IUniswapV3Pool(pool).mint(
            address(this),
            params.tickLower,
            params.tickUpper,
            liquidity,
            ""
        );
        
        // Mint position NFT
        tokenId = _nextId++;
        _positions[tokenId] = Position({
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            pool: pool
        });
        
        emit IncreaseLiquidity(tokenId, liquidity, amount0, amount1);
    }
    
    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        override
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(block.timestamp <= params.deadline, "Transaction expired");
        Position storage position = _positions[params.tokenId];
        require(position.liquidity > 0, "Position does not exist");
        
        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;
        
        if (amount0 > 0) {
            IERC20(position.token0).safeTransferFrom(msg.sender, position.pool, amount0);
        }
        if (amount1 > 0) {
            IERC20(position.token1).safeTransferFrom(msg.sender, position.pool, amount1);
        }
        
        liquidity = uint128((amount0 + amount1) / 2);
        position.liquidity += liquidity;
        
        IUniswapV3Pool(position.pool).mint(
            address(this),
            position.tickLower,
            position.tickUpper,
            liquidity,
            ""
        );
        
        emit IncreaseLiquidity(params.tokenId, liquidity, amount0, amount1);
    }
    
    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        override
        returns (uint256 amount0, uint256 amount1)
    {
        require(block.timestamp <= params.deadline, "Transaction expired");
        Position storage position = _positions[params.tokenId];
        require(position.liquidity >= params.liquidity, "Insufficient liquidity");
        
        position.liquidity -= params.liquidity;
        
        IUniswapV3Pool(position.pool).burn(
            position.tickLower,
            position.tickUpper,
            params.liquidity
        );
        
        // Simplified: return proportional amounts
        amount0 = params.liquidity;
        amount1 = params.liquidity;
        
        emit DecreaseLiquidity(params.tokenId, params.liquidity, amount0, amount1);
    }
    
    function collect(CollectParams calldata params)
        external
        payable
        override
        returns (uint256 amount0, uint256 amount1)
    {
        Position storage position = _positions[params.tokenId];
        require(position.liquidity > 0, "Position does not exist");
        
        // Simplified: collect fees from pool
        (uint128 collected0, uint128 collected1) = IUniswapV3Pool(position.pool).collect(
            params.recipient,
            position.tickLower,
            position.tickUpper,
            params.amount0Max,
            params.amount1Max
        );
        
        amount0 = collected0;
        amount1 = collected1;
        
        emit Collect(params.tokenId, params.recipient, amount0, amount1);
    }
    
    function burn(uint256 tokenId) external payable override {
        Position storage position = _positions[tokenId];
        require(position.liquidity == 0, "Position not empty");
        delete _positions[tokenId];
    }
    
    function positions(uint256 tokenId)
        external
        view
        override
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Position memory position = _positions[tokenId];
        return (
            0, // nonce
            address(0), // operator
            position.token0,
            position.token1,
            position.fee,
            position.tickLower,
            position.tickUpper,
            position.liquidity,
            0, // feeGrowthInside0LastX128
            0, // feeGrowthInside1LastX128
            0, // tokensOwed0
            0  // tokensOwed1
        );
    }
}
