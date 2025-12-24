// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "../../interfaces/uniswap-v3/IUniswapV3Factory.sol";
import "./MockUniswapV3Pool.sol";

/**
 * @title MockUniswapV3Factory
 * @notice Mock implementation of Uniswap V3 Factory for testing
 * @dev Simulates pool creation without full V3 complexity
 */
contract MockUniswapV3Factory is IUniswapV3Factory {
    address public override owner;
    
    // tokenA => tokenB => fee => pool
    mapping(address => mapping(address => mapping(uint24 => address))) private _pools;
    
    // fee => tickSpacing
    mapping(uint24 => int24) public override feeAmountTickSpacing;
    
    constructor() {
        owner = msg.sender;
        
        // Initialize standard fee tiers
        feeAmountTickSpacing[500] = 10;
        feeAmountTickSpacing[3000] = 60;
        feeAmountTickSpacing[10000] = 200;
    }
    
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view override returns (address pool) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return _pools[token0][token1][fee];
    }
    
    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external override returns (address pool) {
        require(tokenA != tokenB, "Identical tokens");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "Zero address");
        require(_pools[token0][token1][fee] == address(0), "Pool exists");
        require(feeAmountTickSpacing[fee] != 0, "Fee not enabled");
        
        // Deploy new mock pool
        MockUniswapV3Pool mockPool = new MockUniswapV3Pool(token0, token1, fee, feeAmountTickSpacing[fee]);
        pool = address(mockPool);
        
        _pools[token0][token1][fee] = pool;
        
        emit PoolCreated(token0, token1, fee, feeAmountTickSpacing[fee], pool);
    }
    
    function setOwner(address _owner) external override {
        require(msg.sender == owner, "Not owner");
        address oldOwner = owner;
        owner = _owner;
        emit OwnerChanged(oldOwner, _owner);
    }
    
    function enableFeeAmount(uint24 fee, int24 tickSpacing) external override {
        require(msg.sender == owner, "Not owner");
        require(feeAmountTickSpacing[fee] == 0, "Fee enabled");
        feeAmountTickSpacing[fee] = tickSpacing;
        emit FeeAmountEnabled(fee, tickSpacing);
    }
}
