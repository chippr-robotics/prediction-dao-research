// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ConditionalMarketFactory
 * @notice Automated deployment of pass-fail market pairs using Gnosis CTF standards
 * @dev Creates conditional prediction markets for proposals
 * 
 * TRADING INTEGRATION:
 * This contract handles market creation and settlement. Trading operations are
 * intended to be handled by ETC Swap v3 contracts (https://github.com/etcswap/v3-core).
 * The buyTokens/sellTokens functions currently provide simplified placeholder implementations
 * for testing and will be replaced with proper ETC Swap integration in production.
 * 
 * Integration approach:
 * 1. ConditionalMarketFactory creates PASS/FAIL token pairs
 * 2. ETC Swap pools are created for PASS/ETH and FAIL/ETH trading pairs
 * 3. Liquidity is provided to ETC Swap pools
 * 4. Users trade through ETC Swap's battle-tested DEX infrastructure
 * 5. ConditionalMarketFactory handles final settlement based on oracle outcomes
 */
contract ConditionalMarketFactory is Ownable, ReentrancyGuard {
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
        address creator
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

    constructor() Ownable(msg.sender) {}

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
     * @notice Deploy a market pair for a proposal
     * @param proposalId ID of the proposal
     * @param collateralToken Address of collateral token (use address(0) for ETH)
     * @param liquidityAmount Initial liquidity amount
     * @param liquidityParameter Beta parameter for LMSR (higher = more liquidity)
     * @param tradingPeriod Trading period in seconds
     * @return marketId ID of the created market
     */
    function deployMarketPair(
        uint256 proposalId,
        address collateralToken,
        uint256 liquidityAmount,
        uint256 liquidityParameter,
        uint256 tradingPeriod
    ) external onlyOwner returns (uint256 marketId) {
        require(_proposalToMarketPlusOne[proposalId] == 0, "Market already exists");
        require(tradingPeriod >= MIN_TRADING_PERIOD && tradingPeriod <= MAX_TRADING_PERIOD, "Invalid trading period");

        marketId = marketCount++;

        // Create conditional tokens (simplified - in production use Gnosis CTF)
        address passToken = address(new ConditionalToken("PASS", "P"));
        address failToken = address(new ConditionalToken("FAIL", "F"));

        markets[marketId] = Market({
            proposalId: proposalId,
            passToken: passToken,
            failToken: failToken,
            collateralToken: collateralToken,
            tradingEndTime: block.timestamp + tradingPeriod,
            liquidityParameter: liquidityParameter,
            totalLiquidity: liquidityAmount,
            resolved: false,
            passValue: 0,
            failValue: 0,
            status: MarketStatus.Active
        });

        _proposalToMarketPlusOne[proposalId] = marketId + 1;
        
        // Update indexes
        _updateMarketIndex(marketId, MarketStatus.Active);

        emit MarketCreated(
            marketId,
            proposalId,
            collateralToken,
            passToken,
            failToken,
            markets[marketId].tradingEndTime,
            liquidityParameter,
            block.timestamp,
            msg.sender
        );
    }
    
    /**
     * @notice Batch deploy multiple market pairs for efficiency
     * @param params Array of market creation parameters
     * @return marketIds Array of created market IDs
     */
    function batchDeployMarkets(
        MarketCreationParams[] calldata params
    ) external onlyOwner returns (uint256[] memory marketIds) {
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
            
            uint256 marketId = marketCount++;
            marketIds[i] = marketId;
            
            // Create conditional tokens
            address passToken = address(new ConditionalToken("PASS", "P"));
            address failToken = address(new ConditionalToken("FAIL", "F"));
            
            markets[marketId] = Market({
                proposalId: params[i].proposalId,
                passToken: passToken,
                failToken: failToken,
                collateralToken: params[i].collateralToken,
                tradingEndTime: block.timestamp + params[i].tradingPeriod,
                liquidityParameter: params[i].liquidityParameter,
                totalLiquidity: params[i].liquidityAmount,
                resolved: false,
                passValue: 0,
                failValue: 0,
                status: MarketStatus.Active
            });
            
            _proposalToMarketPlusOne[params[i].proposalId] = marketId + 1;
            
            // Update indexes
            _updateMarketIndex(marketId, MarketStatus.Active);
            
            emit MarketCreated(
                marketId,
                params[i].proposalId,
                params[i].collateralToken,
                passToken,
                failToken,
                markets[marketId].tradingEndTime,
                params[i].liquidityParameter,
                block.timestamp,
                msg.sender
            );
            
            unchecked { ++i; }
        }
        
        emit BatchMarketsCreated(marketIds, block.timestamp, params.length);
    }

    /**
     * @notice Buy outcome tokens (placeholder for ETC Swap integration)
     * @dev This is a temporary implementation for testing. In production, this will
     *      integrate with ETC Swap v3 contracts for actual DEX trading.
     *      See: https://github.com/etcswap/v3-core
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
        require(msg.value == amount, "Incorrect ETH amount");
        require(amount > 0, "Amount must be positive");

        // TODO: Integrate with ETC Swap v3 for actual DEX trading
        // This simplified implementation mints tokens directly for testing
        // Production should route through ETC Swap pools
        tokenAmount = (amount * 1e18) / 1e15; // Simplified: 1000 tokens per ETH
        
        // Mint tokens to buyer
        ConditionalToken token = ConditionalToken(buyPass ? market.passToken : market.failToken);
        token.mint(msg.sender, tokenAmount);
        
        // Update market liquidity
        market.totalLiquidity += amount;
        
        emit TokensPurchased(marketId, msg.sender, buyPass, amount, tokenAmount);
    }
    
    /**
     * @notice Sell outcome tokens (placeholder for ETC Swap integration)
     * @dev This is a temporary implementation for testing. In production, this will
     *      integrate with ETC Swap v3 contracts for actual DEX trading.
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

        // TODO: Integrate with ETC Swap v3 for actual DEX trading
        // Burn tokens from seller
        ConditionalToken token = ConditionalToken(sellPass ? market.passToken : market.failToken);
        token.burn(msg.sender, tokenAmount);
        
        // Calculate collateral to return using simplified pricing
        collateralAmount = (tokenAmount * 1e15) / 1e18; // Inverse of buy pricing
        require(collateralAmount <= market.totalLiquidity, "Insufficient liquidity");
        
        // Update market liquidity
        market.totalLiquidity -= collateralAmount;
        
        // Transfer collateral to seller
        (bool success, ) = payable(msg.sender).call{value: collateralAmount}("");
        require(success, "Transfer failed");
        
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
        _updateMarketIndex(marketId, oldStatus, MarketStatus.TradingEnded);
        
        emit MarketStatusChanged(marketId, oldStatus, MarketStatus.TradingEnded, block.timestamp);
    }

    /**
     * @notice Resolve a market with welfare metric values
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
        _updateMarketIndex(marketId, oldStatus, MarketStatus.Resolved);

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
            _updateMarketIndex(marketId, oldStatus, MarketStatus.Resolved);
            
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
        _updateMarketIndex(marketId, oldStatus, MarketStatus.Cancelled);
        
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
     * @notice Internal function to update market indexes on status change
     * @param marketId Market ID
     * @param oldStatus Old market status
     * @param newStatus New market status
     */
    function _updateMarketIndex(
        uint256 marketId,
        MarketStatus oldStatus,
        MarketStatus newStatus
    ) internal {
        // Remove from old status index (skip for efficiency - historical data)
        // In production, consider implementing if cleanup is needed
        
        // Add to new status index
        marketsByStatus[newStatus].push(marketId);
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
    }
    
    /**
     * @notice Struct for batch market resolution parameters
     */
    struct MarketResolutionParams {
        uint256 marketId;
        uint256 passValue;
        uint256 failValue;
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
