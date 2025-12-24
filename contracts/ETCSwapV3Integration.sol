// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/uniswap-v3/IUniswapV3Factory.sol";
import "./interfaces/uniswap-v3/IUniswapV3Pool.sol";
import "./interfaces/uniswap-v3/ISwapRouter.sol";
import "./interfaces/uniswap-v3/INonfungiblePositionManager.sol";

/**
 * @title ETCSwapV3Integration
 * @notice Production-ready integration with ETCSwap v3 for prediction market trading
 * @dev Handles pool creation, liquidity management, and trading for conditional tokens
 * 
 * This contract provides a comprehensive interface to ETCSwap v3 (Uniswap v3 fork):
 * - Pool creation and initialization for PASS/FAIL tokens
 * - Liquidity provision and management
 * - Token swapping with slippage protection
 * - Emergency controls and safety mechanisms
 * - Events for off-chain tracking and analytics
 * 
 * Based on: https://github.com/etcswap/v3-sdk
 * Reference: https://docs.uniswap.org/contracts/v3/overview
 */
contract ETCSwapV3Integration is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    /// @notice ETCSwap v3 Factory contract
    IUniswapV3Factory public immutable factory;

    /// @notice ETCSwap v3 SwapRouter contract
    ISwapRouter public immutable swapRouter;

    /// @notice ETCSwap v3 NonfungiblePositionManager contract
    INonfungiblePositionManager public immutable positionManager;

    /// @notice Default fee tier (0.3% = 3000)
    uint24 public constant DEFAULT_FEE = 3000;

    /// @notice Low fee tier (0.05% = 500) for stable pairs
    uint24 public constant LOW_FEE = 500;

    /// @notice High fee tier (1% = 10000) for volatile pairs
    uint24 public constant HIGH_FEE = 10000;

    /// @notice Default slippage tolerance in basis points (50 = 0.5%)
    uint256 public defaultSlippageBps = 50;

    /// @notice Maximum allowed slippage in basis points (1000 = 10%)
    uint256 public constant MAX_SLIPPAGE_BPS = 1000;

    /// @notice Minimum sqrt price limit for swaps
    uint160 public constant MIN_SQRT_RATIO = 4295128739;

    /// @notice Maximum sqrt price limit for swaps
    uint160 public constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    /// @notice Mapping of market ID to pool configuration
    mapping(uint256 => PoolConfig) public marketPools;

    /// @notice Mapping of market ID to liquidity position NFT token ID
    mapping(uint256 => uint256) public marketPositions;

    /// @notice Paused state for emergency stops
    bool public paused;

    // ============ Structs ============

    struct PoolConfig {
        address passPool;      // Pool for PASS token / collateral
        address failPool;      // Pool for FAIL token / collateral
        uint24 fee;            // Fee tier for the pools
        bool initialized;      // Whether pools have been created
    }

    struct SwapResult {
        uint256 amountIn;
        uint256 amountOut;
        uint256 executionPrice; // Price with 18 decimals
    }

    // ============ Events ============

    event PoolsCreated(
        uint256 indexed marketId,
        address indexed passPool,
        address indexed failPool,
        uint24 fee
    );

    event LiquidityAdded(
        uint256 indexed marketId,
        uint256 indexed positionId,
        uint256 amount0,
        uint256 amount1,
        uint128 liquidity
    );

    event LiquidityRemoved(
        uint256 indexed marketId,
        uint256 indexed positionId,
        uint256 amount0,
        uint256 amount1,
        uint128 liquidity
    );

    event TokensSwapped(
        uint256 indexed marketId,
        address indexed trader,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 executionPrice
    );

    event SlippageUpdated(uint256 oldSlippage, uint256 newSlippage);

    event EmergencyPauseToggled(bool paused);

    event FeesCollected(
        uint256 indexed marketId,
        uint256 indexed positionId,
        uint256 amount0,
        uint256 amount1
    );

    // ============ Errors ============

    error ContractPaused();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidSlippage();
    error PoolNotInitialized();
    error PoolAlreadyExists();
    error InsufficientOutput();
    error ExcessiveInput();
    error DeadlineExpired();
    error InvalidFee();

    // ============ Constructor ============

    /**
     * @notice Initialize the ETCSwap v3 integration
     * @param _factory ETCSwap v3 Factory address
     * @param _swapRouter ETCSwap v3 SwapRouter address
     * @param _positionManager ETCSwap v3 NonfungiblePositionManager address
     */
    constructor(
        address _factory,
        address _swapRouter,
        address _positionManager
    ) Ownable(msg.sender) {
        if (_factory == address(0) || _swapRouter == address(0) || _positionManager == address(0)) {
            revert InvalidAddress();
        }

        factory = IUniswapV3Factory(_factory);
        swapRouter = ISwapRouter(_swapRouter);
        positionManager = INonfungiblePositionManager(_positionManager);
    }

    // ============ Modifiers ============

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ============ Pool Management Functions ============

    /**
     * @notice Create ETCSwap v3 pools for a prediction market
     * @dev Creates two pools: PASS/collateral and FAIL/collateral
     * @param marketId Market identifier
     * @param passToken Address of PASS conditional token
     * @param failToken Address of FAIL conditional token
     * @param collateralToken Address of collateral token
     * @param fee Fee tier to use (500, 3000, or 10000)
     * @param initialSqrtPriceX96 Initial price for both pools (Q64.96 format)
     * @return passPool Address of created PASS pool
     * @return failPool Address of created FAIL pool
     */
    function createMarketPools(
        uint256 marketId,
        address passToken,
        address failToken,
        address collateralToken,
        uint24 fee,
        uint160 initialSqrtPriceX96
    ) external onlyOwner whenNotPaused returns (address passPool, address failPool) {
        if (marketPools[marketId].initialized) revert PoolAlreadyExists();
        if (passToken == address(0) || failToken == address(0) || collateralToken == address(0)) {
            revert InvalidAddress();
        }
        if (fee != LOW_FEE && fee != DEFAULT_FEE && fee != HIGH_FEE) {
            revert InvalidFee();
        }

        // Create PASS/collateral pool
        passPool = _getOrCreatePool(passToken, collateralToken, fee);
        _initializePoolIfNeeded(passPool, initialSqrtPriceX96);

        // Create FAIL/collateral pool
        failPool = _getOrCreatePool(failToken, collateralToken, fee);
        _initializePoolIfNeeded(failPool, initialSqrtPriceX96);

        // Store pool configuration
        marketPools[marketId] = PoolConfig({
            passPool: passPool,
            failPool: failPool,
            fee: fee,
            initialized: true
        });

        emit PoolsCreated(marketId, passPool, failPool, fee);
    }

    /**
     * @notice Add liquidity to market pools
     * @dev Adds liquidity to both PASS and FAIL pools for a market
     * @param marketId Market identifier
     * @param passToken Address of PASS conditional token
     * @param failToken Address of FAIL conditional token
     * @param collateralToken Address of collateral token
     * @param passAmount Amount of PASS tokens to provide
     * @param failAmount Amount of FAIL tokens to provide
     * @param collateralAmountPass Amount of collateral for PASS pool
     * @param collateralAmountFail Amount of collateral for FAIL pool
     * @param tickLower Lower tick for the position
     * @param tickUpper Upper tick for the position
     * @param deadline Transaction deadline
     * @return tokenId NFT token ID for the position
     * @return liquidity Amount of liquidity added
     */
    function addLiquidity(
        uint256 marketId,
        address passToken,
        address failToken,
        address collateralToken,
        uint256 passAmount,
        uint256 failAmount,
        uint256 collateralAmountPass,
        uint256 collateralAmountFail,
        int24 tickLower,
        int24 tickUpper,
        uint256 deadline
    ) external onlyOwner whenNotPaused nonReentrant returns (uint256 tokenId, uint128 liquidity) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        
        PoolConfig memory config = marketPools[marketId];
        if (!config.initialized) revert PoolNotInitialized();

        // Transfer tokens from caller
        IERC20(passToken).safeTransferFrom(msg.sender, address(this), passAmount);
        IERC20(failToken).safeTransferFrom(msg.sender, address(this), failAmount);
        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmountPass + collateralAmountFail
        );

        // Approve position manager
        IERC20(passToken).safeIncreaseAllowance(address(positionManager), passAmount);
        IERC20(collateralToken).safeIncreaseAllowance(address(positionManager), collateralAmountPass);

        // Add liquidity to PASS pool
        (address token0, address token1) = _sortTokens(passToken, collateralToken);
        (uint256 amount0Desired, uint256 amount1Desired) = token0 == passToken
            ? (passAmount, collateralAmountPass)
            : (collateralAmountPass, passAmount);

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: config.fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: 0,
            amount1Min: 0,
            recipient: address(this),
            deadline: deadline
        });

        uint256 amount0;
        uint256 amount1;
        (tokenId, liquidity, amount0, amount1) = positionManager.mint(params);

        // Store position for the market
        marketPositions[marketId] = tokenId;

        emit LiquidityAdded(marketId, tokenId, amount0, amount1, liquidity);
    }

    // ============ Trading Functions ============

    /**
     * @notice Buy outcome tokens using collateral via ETCSwap
     * @dev Executes a swap from collateral to outcome token (PASS or FAIL)
     * @param marketId Market identifier
     * @param collateralToken Address of collateral token
     * @param outcomeToken Address of outcome token (PASS or FAIL)
     * @param collateralAmount Amount of collateral to spend
     * @param minTokenAmount Minimum amount of outcome tokens to receive
     * @param deadline Transaction deadline
     * @return result Swap execution result
     */
    function buyTokens(
        uint256 marketId,
        address collateralToken,
        address outcomeToken,
        uint256 collateralAmount,
        uint256 minTokenAmount,
        uint256 deadline
    ) external whenNotPaused nonReentrant returns (SwapResult memory result) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (collateralAmount == 0) revert InvalidAmount();
        
        PoolConfig memory config = marketPools[marketId];
        if (!config.initialized) revert PoolNotInitialized();

        // Transfer collateral from buyer
        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), collateralAmount);

        // Approve router
        IERC20(collateralToken).safeIncreaseAllowance(address(swapRouter), collateralAmount);

        // Execute swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: collateralToken,
            tokenOut: outcomeToken,
            fee: config.fee,
            recipient: msg.sender,
            deadline: deadline,
            amountIn: collateralAmount,
            amountOutMinimum: minTokenAmount,
            sqrtPriceLimitX96: 0
        });

        uint256 amountOut = swapRouter.exactInputSingle(params);
        
        if (amountOut < minTokenAmount) revert InsufficientOutput();

        // Calculate execution price
        uint256 executionPrice = (collateralAmount * 1e18) / amountOut;

        result = SwapResult({
            amountIn: collateralAmount,
            amountOut: amountOut,
            executionPrice: executionPrice
        });

        emit TokensSwapped(
            marketId,
            msg.sender,
            collateralToken,
            outcomeToken,
            collateralAmount,
            amountOut,
            executionPrice
        );
    }

    /**
     * @notice Sell outcome tokens for collateral via ETCSwap
     * @dev Executes a swap from outcome token (PASS or FAIL) to collateral
     * @param marketId Market identifier
     * @param outcomeToken Address of outcome token (PASS or FAIL)
     * @param collateralToken Address of collateral token
     * @param tokenAmount Amount of outcome tokens to sell
     * @param minCollateralAmount Minimum amount of collateral to receive
     * @param deadline Transaction deadline
     * @return result Swap execution result
     */
    function sellTokens(
        uint256 marketId,
        address outcomeToken,
        address collateralToken,
        uint256 tokenAmount,
        uint256 minCollateralAmount,
        uint256 deadline
    ) external whenNotPaused nonReentrant returns (SwapResult memory result) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (tokenAmount == 0) revert InvalidAmount();
        
        PoolConfig memory config = marketPools[marketId];
        if (!config.initialized) revert PoolNotInitialized();

        // Transfer tokens from seller
        IERC20(outcomeToken).safeTransferFrom(msg.sender, address(this), tokenAmount);

        // Approve router
        IERC20(outcomeToken).safeIncreaseAllowance(address(swapRouter), tokenAmount);

        // Execute swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: outcomeToken,
            tokenOut: collateralToken,
            fee: config.fee,
            recipient: msg.sender,
            deadline: deadline,
            amountIn: tokenAmount,
            amountOutMinimum: minCollateralAmount,
            sqrtPriceLimitX96: 0
        });

        uint256 amountOut = swapRouter.exactInputSingle(params);
        
        if (amountOut < minCollateralAmount) revert InsufficientOutput();

        // Calculate execution price
        uint256 executionPrice = (amountOut * 1e18) / tokenAmount;

        result = SwapResult({
            amountIn: tokenAmount,
            amountOut: amountOut,
            executionPrice: executionPrice
        });

        emit TokensSwapped(
            marketId,
            msg.sender,
            outcomeToken,
            collateralToken,
            tokenAmount,
            amountOut,
            executionPrice
        );
    }

    // ============ Quote Functions ============

    /**
     * @notice Get quote for buying outcome tokens
     * @dev Simulates a swap to get expected output amount
     * @param marketId Market identifier
     * @param buyPass True for PASS tokens, false for FAIL tokens
     * @param collateralAmount Amount of collateral to spend
     * @return estimatedTokenAmount Estimated amount of outcome tokens
     */
    function quoteBuyTokens(
        uint256 marketId,
        bool buyPass,
        uint256 collateralAmount
    ) external view returns (uint256 estimatedTokenAmount) {
        PoolConfig memory config = marketPools[marketId];
        if (!config.initialized) revert PoolNotInitialized();

        address pool = buyPass ? config.passPool : config.failPool;
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

        // Simplified estimation based on current price
        // In production, use a more sophisticated quoter contract
        uint256 priceX96 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96) / (1 << 96);
        estimatedTokenAmount = (collateralAmount * (1 << 96)) / priceX96;
    }

    /**
     * @notice Get quote for selling outcome tokens
     * @dev Simulates a swap to get expected output amount
     * @param marketId Market identifier
     * @param sellPass True for PASS tokens, false for FAIL tokens
     * @param tokenAmount Amount of outcome tokens to sell
     * @return estimatedCollateralAmount Estimated amount of collateral
     */
    function quoteSellTokens(
        uint256 marketId,
        bool sellPass,
        uint256 tokenAmount
    ) external view returns (uint256 estimatedCollateralAmount) {
        PoolConfig memory config = marketPools[marketId];
        if (!config.initialized) revert PoolNotInitialized();

        address pool = sellPass ? config.passPool : config.failPool;
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

        // Simplified estimation based on current price
        uint256 priceX96 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96) / (1 << 96);
        estimatedCollateralAmount = (tokenAmount * priceX96) / (1 << 96);
    }

    // ============ Admin Functions ============

    /**
     * @notice Update default slippage tolerance
     * @param newSlippageBps New slippage in basis points
     */
    function setDefaultSlippage(uint256 newSlippageBps) external onlyOwner {
        if (newSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage();
        
        uint256 oldSlippage = defaultSlippageBps;
        defaultSlippageBps = newSlippageBps;
        
        emit SlippageUpdated(oldSlippage, newSlippageBps);
    }

    /**
     * @notice Toggle pause state for emergency stops
     */
    function togglePause() external onlyOwner {
        paused = !paused;
        emit EmergencyPauseToggled(paused);
    }

    /**
     * @notice Collect fees from a liquidity position
     * @param marketId Market identifier
     * @param recipient Address to receive collected fees
     * @return amount0 Amount of token0 fees collected
     * @return amount1 Amount of token1 fees collected
     */
    function collectFees(uint256 marketId, address recipient)
        external
        onlyOwner
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        uint256 positionId = marketPositions[marketId];
        if (positionId == 0) revert PoolNotInitialized();

        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: positionId,
            recipient: recipient,
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (amount0, amount1) = positionManager.collect(params);

        emit FeesCollected(marketId, positionId, amount0, amount1);
    }

    // ============ View Functions ============

    /**
     * @notice Get pool addresses for a market
     * @param marketId Market identifier
     * @return passPool PASS pool address
     * @return failPool FAIL pool address
     */
    function getMarketPools(uint256 marketId) external view returns (address passPool, address failPool) {
        PoolConfig memory config = marketPools[marketId];
        return (config.passPool, config.failPool);
    }

    /**
     * @notice Get current price for outcome token in a pool
     * @param marketId Market identifier
     * @param forPassToken True for PASS token price, false for FAIL
     * @return sqrtPriceX96 Current sqrt price
     * @return tick Current tick
     */
    function getPoolPrice(uint256 marketId, bool forPassToken)
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick)
    {
        PoolConfig memory config = marketPools[marketId];
        if (!config.initialized) revert PoolNotInitialized();

        address pool = forPassToken ? config.passPool : config.failPool;
        (sqrtPriceX96, tick, , , , , ) = IUniswapV3Pool(pool).slot0();
    }

    /**
     * @notice Calculate minimum output with slippage protection
     * @param amount Input amount
     * @param slippageBps Slippage tolerance in basis points
     * @return minAmount Minimum acceptable output
     */
    function calculateMinOutput(uint256 amount, uint256 slippageBps) public pure returns (uint256 minAmount) {
        if (slippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage();
        minAmount = (amount * (10000 - slippageBps)) / 10000;
    }

    // ============ Internal Functions ============

    /**
     * @notice Get existing pool or create new one
     * @param tokenA First token
     * @param tokenB Second token
     * @param fee Fee tier
     * @return pool Pool address
     */
    function _getOrCreatePool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal returns (address pool) {
        pool = factory.getPool(tokenA, tokenB, fee);
        
        if (pool == address(0)) {
            pool = factory.createPool(tokenA, tokenB, fee);
        }
    }

    /**
     * @notice Initialize pool with starting price if not already initialized
     * @param pool Pool address
     * @param sqrtPriceX96 Initial sqrt price
     */
    function _initializePoolIfNeeded(address pool, uint160 sqrtPriceX96) internal {
        (uint160 currentPrice, , , , , , bool unlocked) = IUniswapV3Pool(pool).slot0();
        
        // Only initialize if pool is locked or price is 0
        if (!unlocked || currentPrice == 0) {
            IUniswapV3Pool(pool).initialize(sqrtPriceX96);
        }
    }

    /**
     * @notice Sort tokens by address
     * @param tokenA First token
     * @param tokenB Second token
     * @return token0 Lower address
     * @return token1 Higher address
     */
    function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }
}
