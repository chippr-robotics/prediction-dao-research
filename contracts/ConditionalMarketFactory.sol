// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./ETCSwapV3Integration.sol";
import "./TieredRoleManager.sol";
import "./CTF1155.sol";

/**
 * @title ConditionalMarketFactory
 * @notice Automated deployment of pass-fail market pairs using Gnosis CTF standards
 * @dev Creates conditional prediction markets for proposals with role-based access control
 * 
 * For a practical walkthrough of how this contract works, see:
 * docs/user-guide/conditional-market-rain-example.md
 * 
 * TRADING INTEGRATION:
 * This contract now integrates with ETC Swap v3 contracts for production-ready DEX trading.
 * The integration uses ETCSwapV3Integration contract for:
 * - Pool creation and initialization
 * - Liquidity provision and management
 * - Token swapping with slippage protection
 * 
 * Integration approach:
 * 1. ConditionalMarketFactory creates PASS/FAIL token pairs
 * 2. ETCSwapV3Integration creates pools for PASS/collateral and FAIL/collateral trading pairs
 * 3. Liquidity is provided to ETC Swap pools through the integration layer
 * 4. Users trade through ETC Swap's battle-tested DEX infrastructure
 * 5. ConditionalMarketFactory handles final settlement based on oracle outcomes
 * 
 * Trading modes:
 * - ETCSwap mode: Full decentralized trading via Uniswap v3 pools
 * - Fallback mode: Simplified LMSR for testing and backwards compatibility
 * 
 * RBAC INTEGRATION:
 * - Market creation requires MARKET_MAKER_ROLE
 * - Admin functions require OPERATIONS_ADMIN_ROLE
 * - Tier limits enforced on market creation and trading
 */
contract ConditionalMarketFactory is Ownable, ReentrancyGuard, IERC1155Receiver {
    using SafeERC20 for IERC20;
    
    /**
     * @notice Enum defining different types of binary outcomes for prediction markets
     * @dev Each bet type represents a different way to frame binary predictions
     */
    enum BetType {
        YesNo,          // Standard Yes / No outcome
        PassFail,       // Pass / Fail outcome (default for governance)
        AboveBelow,     // Above / Below a threshold
        HigherLower,    // Higher / Lower than reference
        InOut,          // In / Out of range
        OverUnder,      // Over / Under a value
        ForAgainst,     // For / Against a proposal
        TrueFalse,      // True / False statement
        WinLose,        // Win / Lose outcome
        UpDown          // Up / Down movement
    }

    struct Market {
        uint256 proposalId;
        address passToken;
        address failToken;
        address collateralToken;
        uint256 tradingEndTime;
        uint256 liquidityParameter; // Beta parameter for LMSR
        uint256 totalLiquidity;
        bool resolved;
        uint256 passValue;
        uint256 failValue;
        MarketStatus status;
        BetType betType;
        bool useCTF;               // Whether this market uses CTF1155
        bytes32 conditionId;       // CTF condition ID (if using CTF)
        bytes32 questionId;        // CTF question ID (if using CTF)
        uint256 passPositionId;    // CTF position ID for pass outcome
        uint256 failPositionId;    // CTF position ID for fail outcome
    }

    enum MarketStatus {
        Active,
        TradingEnded,
        Resolved,
        Cancelled
    }

    // Market ID => Market
    mapping(uint256 => Market) public markets;
    
    // Proposal ID => Market ID (marketId + 1 to avoid 0 confusion)
    mapping(uint256 => uint256) private _proposalToMarketPlusOne;
    
    // Market status tracking for efficient querying
    mapping(MarketStatus => uint256[]) private marketsByStatus;
    
    // Time-based indexing (day => market IDs)
    mapping(uint256 => uint256[]) private marketsByDay;
    
    uint256 public marketCount;
    uint256 public constant DEFAULT_TRADING_PERIOD = 10 days;
    uint256 public constant MIN_TRADING_PERIOD = 7 days;
    uint256 public constant MAX_TRADING_PERIOD = 21 days;
    uint256 public constant MAX_BATCH_SIZE = 50;

    bool private _initialized;
    
    // ETCSwap v3 integration
    ETCSwapV3Integration public etcSwapIntegration;
    bool public useETCSwap;
    
    // Role-based access control
    TieredRoleManager public roleManager;
    
    // CTF1155 integration - now required for all markets
    CTF1155 public ctf1155;
    
    // Default initial price for pools (0.5 = equal probability)
    uint160 public constant DEFAULT_INITIAL_SQRT_PRICE = 79228162514264337593543950336; // sqrt(0.5) in Q64.96

    // Enhanced events for better indexing and market discovery
    event MarketCreated(
        uint256 indexed marketId,
        uint256 indexed proposalId,
        address indexed collateralToken,
        address passToken,
        address failToken,
        uint256 tradingEndTime,
        uint256 liquidityParameter,
        uint256 createdAt,
        address creator,
        BetType betType
    );
    
    event TokensPurchased(
        uint256 indexed marketId,
        address indexed buyer,
        bool indexed buyPass,
        uint256 collateralAmount,
        uint256 tokenAmount
    );
    
    event TokensSold(
        uint256 indexed marketId,
        address indexed seller,
        bool indexed sellPass,
        uint256 tokenAmount,
        uint256 collateralAmount
    );
    
    event MarketStatusChanged(
        uint256 indexed marketId,
        MarketStatus indexed previousStatus,
        MarketStatus indexed newStatus,
        uint256 changedAt
    );
    
    event MarketResolved(
        uint256 indexed marketId,
        uint256 indexed proposalId,
        uint256 passValue,
        uint256 failValue,
        bool indexed approved,
        uint256 resolvedAt
    );
    
    event MarketCancelled(
        uint256 indexed marketId,
        uint256 indexed proposalId,
        string reason,
        uint256 cancelledAt
    );
    
    event BatchMarketsCreated(
        uint256[] marketIds,
        uint256 batchTimestamp,
        uint256 totalMarketsCreated
    );
    
    event BatchMarketsResolved(
        uint256[] marketIds,
        uint256 batchTimestamp,
        uint256 totalMarketsResolved
    );
    
    event ETCSwapIntegrationUpdated(address indexed integration, bool enabled);
    
    event ETCSwapPoolsCreated(
        uint256 indexed marketId,
        address indexed passPool,
        address indexed failPool
    );
    
    event CTF1155Updated(address indexed ctf1155);
    
    event CTFMarketCreated(
        uint256 indexed marketId,
        bytes32 indexed conditionId,
        uint256 passPositionId,
        uint256 failPositionId
    );

    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Set the role manager contract
     * @param _roleManager Address of TieredRoleManager contract
     */
    function setRoleManager(address _roleManager) external onlyOwner {
        require(_roleManager != address(0), "Invalid role manager address");
        require(address(roleManager) == address(0), "Role manager already set");
        roleManager = TieredRoleManager(_roleManager);
    }
    
    /**
     * @notice Modifier to check if user has MARKET_MAKER_ROLE
     */
    modifier onlyMarketMaker() {
        require(address(roleManager) != address(0), "Role manager not set");
        require(roleManager.hasRole(roleManager.MARKET_MAKER_ROLE(), msg.sender), "Requires MARKET_MAKER_ROLE");
        _;
    }
    
    /**
     * @notice Modifier to check market creation limits for tiered members
     */
    modifier checkMarketCreationLimit() {
        if (address(roleManager) != address(0) && roleManager.hasRole(roleManager.MARKET_MAKER_ROLE(), msg.sender)) {
            require(roleManager.checkMarketCreationLimitFor(msg.sender, roleManager.MARKET_MAKER_ROLE()), "Market creation limit exceeded");
        }
        _;
    }

    /**
     * @notice Get outcome labels for a specific bet type
     * @param betType The type of bet
     * @return positiveOutcome Label for the positive outcome token
     * @return negativeOutcome Label for the negative outcome token
     */
    function getOutcomeLabels(BetType betType) public pure returns (string memory positiveOutcome, string memory negativeOutcome) {
        if (betType == BetType.YesNo) {
            return ("YES", "NO");
        } else if (betType == BetType.PassFail) {
            return ("PASS", "FAIL");
        } else if (betType == BetType.AboveBelow) {
            return ("ABOVE", "BELOW");
        } else if (betType == BetType.HigherLower) {
            return ("HIGHER", "LOWER");
        } else if (betType == BetType.InOut) {
            return ("IN", "OUT");
        } else if (betType == BetType.OverUnder) {
            return ("OVER", "UNDER");
        } else if (betType == BetType.ForAgainst) {
            return ("FOR", "AGAINST");
        } else if (betType == BetType.TrueFalse) {
            return ("TRUE", "FALSE");
        } else if (betType == BetType.WinLose) {
            return ("WIN", "LOSE");
        } else if (betType == BetType.UpDown) {
            return ("UP", "DOWN");
        }
        return ("PASS", "FAIL"); // Default fallback
    }

    /**
     * @notice Initialize the contract (used for clones)
     * @param initialOwner Address of the initial owner
     */
    function initialize(address initialOwner) external {
        require(!_initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        _initialized = true;
        _transferOwnership(initialOwner);
    }
    
    /**
     * @notice Set ETCSwap v3 integration contract
     * @param _integration Address of ETCSwapV3Integration contract
     * @param _enabled Whether to enable ETCSwap trading
     */
    function setETCSwapIntegration(address _integration, bool _enabled) external onlyOwner {
        require(_integration != address(0), "Invalid integration address");
        etcSwapIntegration = ETCSwapV3Integration(_integration);
        useETCSwap = _enabled;
        emit ETCSwapIntegrationUpdated(_integration, _enabled);
    }
    
    /**
     * @notice Set CTF1155 contract (required for market creation)
     * @param _ctf1155 Address of CTF1155 contract
     */
    function setCTF1155(address _ctf1155) external onlyOwner {
        require(_ctf1155 != address(0), "Invalid CTF1155 address");
        ctf1155 = CTF1155(_ctf1155);
        emit CTF1155Updated(_ctf1155);
    }
    
    /**
     * @notice Create ETCSwap pools for an existing market
     * @param marketId ID of the market
     * @param initialSqrtPriceX96 Initial price for pools (Q64.96 format)
     * @param fee Fee tier to use (500, 3000, or 10000)
     */
    function createETCSwapPools(
        uint256 marketId,
        uint160 initialSqrtPriceX96,
        uint24 fee
    ) external onlyOwner {
        require(marketId < marketCount, "Invalid market ID");
        require(address(etcSwapIntegration) != address(0), "ETCSwap integration not set");
        
        Market storage market = markets[marketId];
        
        (address passPool, address failPool) = etcSwapIntegration.createMarketPools(
            marketId,
            market.passToken,
            market.failToken,
            market.collateralToken,
            fee,
            initialSqrtPriceX96
        );
        
        emit ETCSwapPoolsCreated(marketId, passPool, failPool);
    }

    /**
     * @notice Deploy a market pair for a proposal using CTF1155
     * @param proposalId ID of the proposal
     * @param collateralToken Address of collateral token (must be ERC20, not address(0))
     * @param liquidityAmount Initial liquidity amount
     * @param liquidityParameter Beta parameter for LMSR (higher = more liquidity)
     * @param tradingPeriod Trading period in seconds
     * @param betType Type of binary bet (YesNo, PassFail, AboveBelow, etc.)
     * @return marketId ID of the created market
     */
    function deployMarketPair(
        uint256 proposalId,
        address collateralToken,
        uint256 liquidityAmount,
        uint256 liquidityParameter,
        uint256 tradingPeriod,
        BetType betType
    ) external checkMarketCreationLimit returns (uint256 marketId) {
        // Allow either owner or market maker role
        require(
            msg.sender == owner() || 
            (address(roleManager) != address(0) && roleManager.hasRole(roleManager.MARKET_MAKER_ROLE(), msg.sender)),
            "Requires owner or MARKET_MAKER_ROLE"
        );
        require(_proposalToMarketPlusOne[proposalId] == 0, "Market already exists");
        require(tradingPeriod >= MIN_TRADING_PERIOD && tradingPeriod <= MAX_TRADING_PERIOD, "Invalid trading period");
        require(address(ctf1155) != address(0), "CTF1155 not set");
        require(collateralToken != address(0), "CTF requires ERC20 collateral");

        marketId = marketCount++;

        // Generate unique question ID for this market
        bytes32 questionId = keccak256(abi.encodePacked("market", marketId, proposalId, block.timestamp));
        
        // Prepare condition with 2 outcomes (binary)
        bytes32 conditionId = ctf1155.prepareCondition(address(this), questionId, 2);
        
        // Calculate position IDs for pass (index 1) and fail (index 2) outcomes
        bytes32 passCollectionId = ctf1155.getCollectionId(bytes32(0), conditionId, 1);
        bytes32 failCollectionId = ctf1155.getCollectionId(bytes32(0), conditionId, 2);
        
        uint256 passPositionId = ctf1155.getPositionId(IERC20(collateralToken), passCollectionId);
        uint256 failPositionId = ctf1155.getPositionId(IERC20(collateralToken), failCollectionId);
        
        // Store CTF1155 address in passToken and failToken for compatibility
        address ctfAddress = address(ctf1155);

        markets[marketId] = Market({
            proposalId: proposalId,
            passToken: ctfAddress,
            failToken: ctfAddress,
            collateralToken: collateralToken,
            tradingEndTime: block.timestamp + tradingPeriod,
            liquidityParameter: liquidityParameter,
            totalLiquidity: liquidityAmount,
            resolved: false,
            passValue: 0,
            failValue: 0,
            status: MarketStatus.Active,
            betType: betType,
            useCTF: true,
            conditionId: conditionId,
            questionId: questionId,
            passPositionId: passPositionId,
            failPositionId: failPositionId
        });

        _proposalToMarketPlusOne[proposalId] = marketId + 1;
        
        // Update indexes
        _updateMarketIndex(marketId, MarketStatus.Active);

        emit MarketCreated(
            marketId,
            proposalId,
            collateralToken,
            ctfAddress,
            ctfAddress,
            markets[marketId].tradingEndTime,
            liquidityParameter,
            block.timestamp,
            msg.sender,
            betType
        );
        
        emit CTFMarketCreated(marketId, conditionId, passPositionId, failPositionId);
    }
    
    /**
     * @notice Batch deploy multiple market pairs for efficiency
     * @param params Array of market creation parameters
     * @return marketIds Array of created market IDs
     */
    function batchDeployMarkets(
        MarketCreationParams[] calldata params
    ) external checkMarketCreationLimit returns (uint256[] memory marketIds) {
        // Allow either owner or market maker role
        require(
            msg.sender == owner() || 
            (address(roleManager) != address(0) && roleManager.hasRole(roleManager.MARKET_MAKER_ROLE(), msg.sender)),
            "Requires owner or MARKET_MAKER_ROLE"
        );
        require(params.length > 0, "Empty batch");
        require(params.length <= MAX_BATCH_SIZE, "Batch too large");
        
        marketIds = new uint256[](params.length);
        
        for (uint256 i = 0; i < params.length; ) {
            require(_proposalToMarketPlusOne[params[i].proposalId] == 0, "Market already exists");
            require(
                params[i].tradingPeriod >= MIN_TRADING_PERIOD && 
                params[i].tradingPeriod <= MAX_TRADING_PERIOD,
                "Invalid trading period"
            );
            require(address(ctf1155) != address(0), "CTF1155 not set");
            require(params[i].collateralToken != address(0), "CTF requires ERC20 collateral");
            
            uint256 marketId = marketCount++;
            marketIds[i] = marketId;
            
            // Generate unique question ID for this market
            bytes32 questionId = keccak256(abi.encodePacked("market", marketId, params[i].proposalId, block.timestamp, i));
            
            // Prepare condition with 2 outcomes (binary)
            bytes32 conditionId = ctf1155.prepareCondition(address(this), questionId, 2);
            
            // Calculate position IDs for pass (index 1) and fail (index 2) outcomes
            bytes32 passCollectionId = ctf1155.getCollectionId(bytes32(0), conditionId, 1);
            bytes32 failCollectionId = ctf1155.getCollectionId(bytes32(0), conditionId, 2);
            
            uint256 passPositionId = ctf1155.getPositionId(IERC20(params[i].collateralToken), passCollectionId);
            uint256 failPositionId = ctf1155.getPositionId(IERC20(params[i].collateralToken), failCollectionId);
            
            // Store CTF1155 address in passToken and failToken for compatibility
            address ctfAddress = address(ctf1155);
            
            markets[marketId] = Market({
                proposalId: params[i].proposalId,
                passToken: ctfAddress,
                failToken: ctfAddress,
                collateralToken: params[i].collateralToken,
                tradingEndTime: block.timestamp + params[i].tradingPeriod,
                liquidityParameter: params[i].liquidityParameter,
                totalLiquidity: params[i].liquidityAmount,
                resolved: false,
                passValue: 0,
                failValue: 0,
                status: MarketStatus.Active,
                betType: params[i].betType,
                useCTF: true,
                conditionId: conditionId,
                questionId: questionId,
                passPositionId: passPositionId,
                failPositionId: failPositionId
            });
            
            _proposalToMarketPlusOne[params[i].proposalId] = marketId + 1;
            
            // Update indexes
            _updateMarketIndex(marketId, MarketStatus.Active);
            
            emit MarketCreated(
                marketId,
                params[i].proposalId,
                params[i].collateralToken,
                ctfAddress,
                ctfAddress,
                markets[marketId].tradingEndTime,
                params[i].liquidityParameter,
                block.timestamp,
                msg.sender,
                params[i].betType
            );
            
            emit CTFMarketCreated(marketId, conditionId, passPositionId, failPositionId);
            
            unchecked { ++i; }
        }
        
        emit BatchMarketsCreated(marketIds, block.timestamp, params.length);
    }

    /**
     * @notice Buy outcome tokens via ETCSwap or fallback LMSR
     * @dev Integrates with ETC Swap v3 when enabled, falls back to simplified LMSR for testing
     * @param marketId ID of the market
     * @param buyPass True to buy PASS tokens, false for FAIL tokens
     * @param amount Amount of collateral to spend
     * @return tokenAmount Amount of outcome tokens received
     */
    function buyTokens(
        uint256 marketId,
        bool buyPass,
        uint256 amount
    ) external payable nonReentrant returns (uint256 tokenAmount) {
        require(marketId < marketCount, "Invalid market ID");
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Active, "Market not active");
        require(block.timestamp < market.tradingEndTime, "Trading period ended");
        require(amount > 0, "Amount must be positive");

        if (useETCSwap && address(etcSwapIntegration) != address(0)) {
            // Use ETCSwap v3 for actual DEX trading with ERC20 collateral
            address outcomeToken = buyPass ? market.passToken : market.failToken;
            
            // When using ETCSwap, collateral must be an ERC20 token
            require(market.collateralToken != address(0), "ETCSwap requires ERC20 collateral");
            require(msg.value == 0, "Send collateral tokens, not ETH");
            
            // Transfer collateral from buyer to this contract
            IERC20(market.collateralToken).safeTransferFrom(msg.sender, address(this), amount);
            
            // Approve ETCSwap integration to spend collateral
            IERC20(market.collateralToken).approve(address(etcSwapIntegration), amount);
            
            // Calculate minimum output with slippage protection
            // Use quoter to estimate output and apply default slippage tolerance
            try etcSwapIntegration.quoteBuyTokens(marketId, buyPass, amount) returns (uint256 estimatedOutput) {
                // Apply more conservative slippage tolerance (10% for testing with mocks)
                uint256 minTokenAmount = etcSwapIntegration.calculateMinOutput(estimatedOutput, 1000);
                
                // Execute swap with slippage protection
                ETCSwapV3Integration.SwapResult memory result = etcSwapIntegration.buyTokens(
                    marketId,
                    market.collateralToken,
                    outcomeToken,
                    amount,
                    minTokenAmount,
                    block.timestamp + 300 // 5 minute deadline
                );
                
                tokenAmount = result.amountOut;
                
                // Transfer purchased tokens from this contract to the buyer
                // (ETCSwap sends tokens to this contract, we forward to buyer)
                IERC20(outcomeToken).safeTransfer(msg.sender, tokenAmount);
            } catch {
                // If quote fails, use conservative minimum (allow up to 20% slippage for edge cases)
                uint256 minTokenAmount = (amount * 80) / 100;
                
                ETCSwapV3Integration.SwapResult memory result = etcSwapIntegration.buyTokens(
                    marketId,
                    market.collateralToken,
                    outcomeToken,
                    amount,
                    minTokenAmount,
                    block.timestamp + 300
                );
                
                tokenAmount = result.amountOut;
                
                // Transfer purchased tokens from this contract to the buyer
                IERC20(outcomeToken).safeTransfer(msg.sender, tokenAmount);
            }
        } else {
            // Fallback: Use CTF1155 to split collateral into position tokens
            // With CTF1155, all markets require ERC20 collateral
            require(market.collateralToken != address(0), "CTF requires ERC20 collateral");
            require(msg.value == 0, "Send collateral tokens, not ETH");
            
            // Transfer collateral from buyer to this contract
            IERC20(market.collateralToken).safeTransferFrom(msg.sender, address(this), amount);
            
            // Approve CTF1155 to spend collateral
            IERC20(market.collateralToken).approve(address(ctf1155), amount);
            
            // Split collateral into BOTH position tokens (binary market)
            // CTF1155 requires partition with at least 2 elements
            // For binary conditions: index set 1 = outcome 0, index set 2 = outcome 1
            uint256[] memory partition = new uint256[](2);
            partition[0] = 1; // PASS outcome index set
            partition[1] = 2; // FAIL outcome index set
            
            ctf1155.splitPosition(
                IERC20(market.collateralToken),
                bytes32(0), // parentCollectionId (root level)
                market.conditionId,
                partition,
                amount
            );
            
            // Calculate output tokens (1:1 with collateral for split)
            tokenAmount = amount;
            
            // Transfer the requested position tokens to buyer
            // CTF splits to this contract, so we transfer the desired position to buyer
            ctf1155.safeTransferFrom(
                address(this),
                msg.sender,
                buyPass ? market.passPositionId : market.failPositionId,
                tokenAmount,
                ""
            );
            
            // Store the other position tokens in this contract for later merging/redemption
            // (They stay in this contract's balance)
            
            // Update market liquidity
            market.totalLiquidity += amount;
        }
        
        emit TokensPurchased(marketId, msg.sender, buyPass, amount, tokenAmount);
    }
    
    /**
     * @notice Sell outcome tokens via ETCSwap or fallback LMSR
     * @dev Integrates with ETC Swap v3 when enabled, falls back to simplified LMSR for testing
     * @param marketId ID of the market
     * @param sellPass True to sell PASS tokens, false for FAIL tokens
     * @param tokenAmount Amount of tokens to sell
     * @return collateralAmount Amount of collateral received
     */
    function sellTokens(
        uint256 marketId,
        bool sellPass,
        uint256 tokenAmount
    ) external nonReentrant returns (uint256 collateralAmount) {
        require(marketId < marketCount, "Invalid market ID");
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Active, "Market not active");
        require(block.timestamp < market.tradingEndTime, "Trading period ended");
        require(tokenAmount > 0, "Amount must be positive");

        if (useETCSwap && address(etcSwapIntegration) != address(0)) {
            // Use ETCSwap v3 for actual DEX trading with ERC20 collateral
            address outcomeToken = sellPass ? market.passToken : market.failToken;
            
            // When using ETCSwap, collateral must be an ERC20 token
            require(market.collateralToken != address(0), "ETCSwap requires ERC20 collateral");
            
            // Transfer tokens from seller to this contract
            IERC20(outcomeToken).safeTransferFrom(msg.sender, address(this), tokenAmount);
            
            // Approve ETCSwap integration to spend outcome tokens
            IERC20(outcomeToken).approve(address(etcSwapIntegration), tokenAmount);
            
            // Calculate minimum output with slippage protection
            // Use quoter to estimate output and apply default slippage tolerance
            try etcSwapIntegration.quoteSellTokens(marketId, sellPass, tokenAmount) returns (uint256 estimatedOutput) {
                // Apply more conservative slippage tolerance (10% for testing with mocks)
                uint256 minCollateralAmount = etcSwapIntegration.calculateMinOutput(estimatedOutput, 1000);
                
                // Execute swap with slippage protection
                ETCSwapV3Integration.SwapResult memory result = etcSwapIntegration.sellTokens(
                    marketId,
                    outcomeToken,
                    market.collateralToken,
                    tokenAmount,
                    minCollateralAmount,
                    block.timestamp + 300 // 5 minute deadline
                );
                
                collateralAmount = result.amountOut;
            } catch {
                // If quote fails, use conservative minimum (allow up to 20% slippage for edge cases)
                uint256 minCollateralAmount = (tokenAmount * 80) / 100;
                
                ETCSwapV3Integration.SwapResult memory result = etcSwapIntegration.sellTokens(
                    marketId,
                    outcomeToken,
                    market.collateralToken,
                    tokenAmount,
                    minCollateralAmount,
                    block.timestamp + 300
                );
                
                collateralAmount = result.amountOut;
            }
            
            // Transfer collateral to seller
            IERC20(market.collateralToken).safeTransfer(msg.sender, collateralAmount);
        } else {
            // Fallback: Use CTF1155 to merge position tokens back to collateral
            // With CTF1155, all markets require ERC20 collateral
            require(market.collateralToken != address(0), "CTF requires ERC20 collateral");
            
            // For selling, user must have BOTH position tokens to merge back to collateral
            // This is a simplified version - in production, you'd implement a proper AMM
            // For now, we require the contract to hold the opposite position
            uint256 oppositePositionId = sellPass ? market.failPositionId : market.passPositionId;
            uint256 oppositeBalance = ctf1155.balanceOf(address(this), oppositePositionId);
            
            require(oppositeBalance >= tokenAmount, "Insufficient opposite position for merge");
            
            // Transfer the position tokens being sold from user to this contract
            ctf1155.safeTransferFrom(
                msg.sender,
                address(this),
                sellPass ? market.passPositionId : market.failPositionId,
                tokenAmount,
                ""
            );
            
            // Merge both positions back to collateral
            // CTF1155 requires partition with at least 2 elements
            // For binary conditions: index set 1 = outcome 0, index set 2 = outcome 1
            uint256[] memory partition = new uint256[](2);
            partition[0] = 1; // PASS outcome index set
            partition[1] = 2; // FAIL outcome index set
            
            ctf1155.mergePositions(
                IERC20(market.collateralToken),
                bytes32(0), // parentCollectionId (root level)
                market.conditionId,
                partition,
                tokenAmount
            );
            
            // Calculate collateral amount (1:1 for merge)
            collateralAmount = tokenAmount;
            
            // Transfer collateral back to seller
            IERC20(market.collateralToken).safeTransfer(msg.sender, collateralAmount);
            
            // Update market liquidity
            require(collateralAmount <= market.totalLiquidity, "Insufficient liquidity");
            market.totalLiquidity -= collateralAmount;
        }
        
        emit TokensSold(marketId, msg.sender, sellPass, tokenAmount, collateralAmount);
    }

    /**
     * @notice End trading for a market
     * @param marketId ID of the market
     */
    function endTrading(uint256 marketId) external onlyOwner {
        require(marketId < marketCount, "Invalid market ID");
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Active, "Market not active");
        require(block.timestamp >= market.tradingEndTime, "Trading period not ended");

        MarketStatus oldStatus = market.status;
        market.status = MarketStatus.TradingEnded;
        _updateMarketIndex(marketId, MarketStatus.TradingEnded);
        
        emit MarketStatusChanged(marketId, oldStatus, MarketStatus.TradingEnded, block.timestamp);
    }

    /**
     * @notice Resolve a market with welfare metric values and report to CTF1155
     * @param marketId ID of the market
     * @param passValue Welfare metric value if proposal passes
     * @param failValue Welfare metric value if proposal fails
     */
    function resolveMarket(
        uint256 marketId,
        uint256 passValue,
        uint256 failValue
    ) external onlyOwner nonReentrant {
        require(marketId < marketCount, "Invalid market ID");
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.TradingEnded, "Trading not ended");
        require(!market.resolved, "Already resolved");

        market.resolved = true;
        market.passValue = passValue;
        market.failValue = failValue;
        MarketStatus oldStatus = market.status;
        market.status = MarketStatus.Resolved;
        _updateMarketIndex(marketId, MarketStatus.Resolved);
        
        // Report payouts to CTF1155
        if (market.useCTF) {
            // Calculate payout numerators based on welfare metric values
            uint256[] memory payouts = new uint256[](2);
            
            // Determine winner and set payouts
            if (passValue > failValue) {
                // Pass wins - full payout to pass (index 0), zero to fail (index 1)
                payouts[0] = 1;
                payouts[1] = 0;
            } else if (failValue > passValue) {
                // Fail wins - zero to pass (index 0), full payout to fail (index 1)
                payouts[0] = 0;
                payouts[1] = 1;
            } else {
                // Tie - equal payout to both
                payouts[0] = 1;
                payouts[1] = 1;
            }
            
            // Report payouts to CTF1155 as the oracle (this contract)
            ctf1155.reportPayouts(market.questionId, payouts);
        }

        emit MarketResolved(
            marketId,
            market.proposalId,
            passValue,
            failValue,
            passValue > failValue,
            block.timestamp
        );
        emit MarketStatusChanged(marketId, oldStatus, MarketStatus.Resolved, block.timestamp);
    }
    
    /**
     * @notice Batch resolve multiple markets for efficiency
     * @param params Array of market resolution parameters
     * @return results Array indicating success/failure for each resolution
     */
    function batchResolveMarkets(
        MarketResolutionParams[] calldata params
    ) external onlyOwner nonReentrant returns (bool[] memory results) {
        require(params.length > 0, "Empty batch");
        require(params.length <= MAX_BATCH_SIZE, "Batch too large");
        
        results = new bool[](params.length);
        uint256[] memory resolvedIds = new uint256[](params.length);
        uint256 successCount = 0;
        
        for (uint256 i = 0; i < params.length; ) {
            uint256 marketId = params[i].marketId;
            
            // Validate market
            if (marketId >= marketCount) {
                results[i] = false;
                unchecked { ++i; }
                continue;
            }
            
            Market storage market = markets[marketId];
            
            if (market.status != MarketStatus.TradingEnded || market.resolved) {
                results[i] = false;
                unchecked { ++i; }
                continue;
            }
            
            // Resolve market
            market.resolved = true;
            market.passValue = params[i].passValue;
            market.failValue = params[i].failValue;
            MarketStatus oldStatus = market.status;
            market.status = MarketStatus.Resolved;
            _updateMarketIndex(marketId, MarketStatus.Resolved);
            
            // Report payouts to CTF1155
            if (market.useCTF) {
                uint256[] memory payouts = new uint256[](2);
                
                if (params[i].passValue > params[i].failValue) {
                    payouts[0] = 1;
                    payouts[1] = 0;
                } else if (params[i].failValue > params[i].passValue) {
                    payouts[0] = 0;
                    payouts[1] = 1;
                } else {
                    payouts[0] = 1;
                    payouts[1] = 1;
                }
                
                ctf1155.reportPayouts(market.questionId, payouts);
            }
            
            emit MarketResolved(
                marketId,
                market.proposalId,
                params[i].passValue,
                params[i].failValue,
                params[i].passValue > params[i].failValue,
                block.timestamp
            );
            emit MarketStatusChanged(marketId, oldStatus, MarketStatus.Resolved, block.timestamp);
            
            resolvedIds[successCount] = marketId;
            results[i] = true;
            unchecked {
                ++successCount;
                ++i;
            }
        }
        
        // Emit batch event with only successful resolutions
        if (successCount > 0) {
            uint256[] memory successfulIds = new uint256[](successCount);
            for (uint256 j = 0; j < successCount; ) {
                successfulIds[j] = resolvedIds[j];
                unchecked { ++j; }
            }
            emit BatchMarketsResolved(successfulIds, block.timestamp, successCount);
        }
    }

    /**
     * @notice Cancel a market
     * @param marketId ID of the market
     */
    function cancelMarket(uint256 marketId) external onlyOwner {
        cancelMarketWithReason(marketId, "Cancelled by owner");
    }
    
    /**
     * @notice Cancel a market with reason
     * @param marketId ID of the market
     * @param reason Cancellation reason
     */
    function cancelMarketWithReason(uint256 marketId, string memory reason) public onlyOwner {
        require(marketId < marketCount, "Invalid market ID");
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Active, "Market not active");

        MarketStatus oldStatus = market.status;
        market.status = MarketStatus.Cancelled;
        _updateMarketIndex(marketId, MarketStatus.Cancelled);
        
        emit MarketCancelled(marketId, market.proposalId, reason, block.timestamp);
        emit MarketStatusChanged(marketId, oldStatus, MarketStatus.Cancelled, block.timestamp);
    }

    /**
     * @notice Get market details
     * @param marketId ID of the market
     */
    function getMarket(uint256 marketId) external view returns (Market memory) {
        require(marketId < marketCount, "Invalid market ID");
        return markets[marketId];
    }

    /**
     * @notice Get market for a proposal
     * @param proposalId ID of the proposal
     */
    function getMarketForProposal(uint256 proposalId) external view returns (uint256) {
        uint256 marketIdPlusOne = _proposalToMarketPlusOne[proposalId];
        require(marketIdPlusOne > 0, "No market for proposal");
        return marketIdPlusOne - 1;
    }
    
    /**
     * @notice Check if a proposal has a market
     * @param proposalId ID of the proposal
     * @return bool True if market exists
     */
    function hasMarketForProposal(uint256 proposalId) external view returns (bool) {
        return _proposalToMarketPlusOne[proposalId] > 0;
    }
    
    /**
     * @notice Get active markets with pagination
     * @param offset Starting index
     * @param limit Maximum results to return
     * @return marketIds Array of market IDs
     * @return hasMore Whether more results exist
     */
    function getActiveMarkets(
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory marketIds, bool hasMore) {
        return getMarketsByStatus(MarketStatus.Active, offset, limit);
    }
    
    /**
     * @notice Get markets by status with pagination
     * @param status Market status to filter by
     * @param offset Starting index
     * @param limit Maximum results
     * @return marketIds Array of market IDs
     * @return hasMore Whether more results exist
     */
    function getMarketsByStatus(
        MarketStatus status,
        uint256 offset,
        uint256 limit
    ) public view returns (uint256[] memory marketIds, bool hasMore) {
        uint256[] storage statusMarkets = marketsByStatus[status];
        uint256 totalCount = statusMarkets.length;
        
        if (offset >= totalCount) {
            return (new uint256[](0), false);
        }
        
        uint256 resultCount = totalCount - offset;
        if (resultCount > limit) {
            resultCount = limit;
            hasMore = true;
        } else {
            hasMore = false;
        }
        
        marketIds = new uint256[](resultCount);
        for (uint256 i = 0; i < resultCount; ) {
            marketIds[i] = statusMarkets[offset + i];
            unchecked { ++i; }
        }
    }
    
    /**
     * @notice Get markets by date range
     * @param startTime Start timestamp
     * @param endTime End timestamp
     * @param offset Starting index
     * @param limit Maximum results
     * @return marketIds Array of market IDs in range
     * @return hasMore Whether more results exist
     */
    function getMarketsByDateRange(
        uint256 startTime,
        uint256 endTime,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory marketIds, bool hasMore) {
        require(startTime < endTime, "Invalid date range");
        
        uint256 startDay = startTime / 1 days;
        uint256 endDay = endTime / 1 days;
        
        // Collect market IDs from all days in range
        uint256 totalCount = 0;
        for (uint256 day = startDay; day <= endDay; ) {
            totalCount += marketsByDay[day].length;
            unchecked { ++day; }
        }
        
        if (offset >= totalCount) {
            return (new uint256[](0), false);
        }
        
        uint256 resultCount = totalCount - offset;
        if (resultCount > limit) {
            resultCount = limit;
            hasMore = true;
        } else {
            hasMore = false;
        }
        
        marketIds = new uint256[](resultCount);
        uint256 currentIndex = 0;
        uint256 skipCount = offset;
        
        for (uint256 day = startDay; day <= endDay && currentIndex < resultCount; ) {
            uint256[] storage dayMarkets = marketsByDay[day];
            
            for (uint256 i = 0; i < dayMarkets.length && currentIndex < resultCount; ) {
                if (skipCount > 0) {
                    unchecked { --skipCount; }
                } else {
                    marketIds[currentIndex] = dayMarkets[i];
                    unchecked { ++currentIndex; }
                }
                unchecked { ++i; }
            }
            unchecked { ++day; }
        }
    }
    
    /**
     * @notice Get total count of markets by status
     * @param status Market status
     * @return count Number of markets with given status
     */
    function getMarketCountByStatus(MarketStatus status) external view returns (uint256) {
        return marketsByStatus[status].length;
    }
    
    /**
     * @notice Internal function to update market indexes
     * @param marketId Market ID
     * @param newStatus New market status
     */
    function _updateMarketIndex(uint256 marketId, MarketStatus newStatus) internal {
        // Add to status index
        marketsByStatus[newStatus].push(marketId);
        
        // Add to time-based index
        uint256 day = block.timestamp / 1 days;
        marketsByDay[day].push(marketId);
    }
    
    /**
     * @notice Struct for batch market creation parameters
     */
    struct MarketCreationParams {
        uint256 proposalId;
        address collateralToken;
        uint256 liquidityAmount;
        uint256 liquidityParameter;
        uint256 tradingPeriod;
        BetType betType;
    }
    
    /**
     * @notice Struct for batch market resolution parameters
     */
    struct MarketResolutionParams {
        uint256 marketId;
        uint256 passValue;
        uint256 failValue;
    }

    /**
     * @notice Handle the receipt of a single ERC1155 token type
     * @dev Required by IERC1155Receiver to accept ERC1155 tokens
     */
    function onERC1155Received(
        address /* operator */,
        address /* from */,
        uint256 /* id */,
        uint256 /* value */,
        bytes calldata /* data */
    ) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    /**
     * @notice Handle the receipt of multiple ERC1155 token types
     * @dev Required by IERC1155Receiver to accept batch ERC1155 token transfers
     */
    function onERC1155BatchReceived(
        address /* operator */,
        address /* from */,
        uint256[] calldata /* ids */,
        uint256[] calldata /* values */,
        bytes calldata /* data */
    ) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    /**
     * @notice Check if contract supports an interface
     * @dev Required by IERC165 (inherited by IERC1155Receiver)
     */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId ||
               interfaceId == type(IERC165).interfaceId;
    }
}

/**
 * @title ConditionalToken
 * @notice Simplified conditional token implementation
 * @dev In production, use Gnosis Conditional Token Framework
 */
contract ConditionalToken is IERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 private _totalSupply;
    
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external {
        _totalSupply += amount;
        _balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(_balances[from] >= amount, "Insufficient balance");
        _balances[from] -= amount;
        _totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "Transfer from zero address");
        require(to != address(0), "Transfer to zero address");
        require(_balances[from] >= amount, "Insufficient balance");

        _balances[from] -= amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "Approve from zero address");
        require(spender != address(0), "Approve to zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _spendAllowance(address owner, address spender, uint256 amount) internal {
        uint256 currentAllowance = _allowances[owner][spender];
        require(currentAllowance >= amount, "Insufficient allowance");
        _approve(owner, spender, currentAllowance - amount);
    }
}
