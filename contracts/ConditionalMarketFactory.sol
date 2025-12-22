// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ConditionalMarketFactory
 * @notice Automated deployment of pass-fail market pairs using Gnosis CTF standards
 * @dev Creates conditional prediction markets for proposals
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
    
    // Proposal ID => Market ID
    mapping(uint256 => uint256) public proposalToMarket;
    
    uint256 public marketCount;
    uint256 public constant DEFAULT_TRADING_PERIOD = 10 days;
    uint256 public constant MIN_TRADING_PERIOD = 7 days;
    uint256 public constant MAX_TRADING_PERIOD = 21 days;

    bool private _initialized;

    event MarketCreated(
        uint256 indexed marketId,
        uint256 indexed proposalId,
        address passToken,
        address failToken,
        uint256 tradingEndTime
    );
    event MarketResolved(uint256 indexed marketId, uint256 passValue, uint256 failValue);
    event MarketCancelled(uint256 indexed marketId);

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
        require(proposalToMarket[proposalId] == 0, "Market already exists");
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

        proposalToMarket[proposalId] = marketId;

        emit MarketCreated(marketId, proposalId, passToken, failToken, markets[marketId].tradingEndTime);
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

        market.status = MarketStatus.TradingEnded;
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
        market.status = MarketStatus.Resolved;

        emit MarketResolved(marketId, passValue, failValue);
    }

    /**
     * @notice Cancel a market
     * @param marketId ID of the market
     */
    function cancelMarket(uint256 marketId) external onlyOwner {
        require(marketId < marketCount, "Invalid market ID");
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Active, "Market not active");

        market.status = MarketStatus.Cancelled;
        emit MarketCancelled(marketId);
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
        return proposalToMarket[proposalId];
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
