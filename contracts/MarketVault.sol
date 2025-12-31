// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MarketVault
 * @notice Secure vault contract for managing market collateral and funds
 * @dev Implements market-specific access controls and collateral management
 */
contract MarketVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Market ID => token address => collateral balance
    mapping(uint256 => mapping(address => uint256)) public marketCollateral;
    
    // Market ID => is active
    mapping(uint256 => bool) public activeMarkets;
    
    // Market ID => authorized manager
    mapping(uint256 => address) public marketManagers;
    
    // Emergency pause state
    bool public paused;
    
    // Factory address that can create markets
    address public factory;

    event MarketCreated(uint256 indexed marketId, address indexed manager);
    event MarketClosed(uint256 indexed marketId);
    event CollateralDeposited(uint256 indexed marketId, address indexed token, address indexed from, uint256 amount);
    event CollateralWithdrawn(uint256 indexed marketId, address indexed token, address indexed to, uint256 amount);
    event ManagerUpdated(uint256 indexed marketId, address indexed oldManager, address indexed newManager);
    event EmergencyPause(address indexed by);
    event EmergencyUnpause(address indexed by);
    event FactoryUpdated(address indexed oldFactory, address indexed newFactory);

    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory");
        _;
    }

    modifier onlyMarketManager(uint256 marketId) {
        require(marketManagers[marketId] == msg.sender, "Not market manager");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Vault is paused");
        _;
    }

    modifier onlyActiveMarket(uint256 marketId) {
        require(activeMarkets[marketId], "Market not active");
        _;
    }

    /**
     * @notice Initialize the market vault
     * @param initialOwner Address that will own the vault
     * @param _factory Address of the market factory
     */
    constructor(address initialOwner, address _factory) Ownable(initialOwner) {
        require(initialOwner != address(0), "Invalid owner");
        require(_factory != address(0), "Invalid factory");
        factory = _factory;
    }

    /**
     * @notice Create a new market
     * @param marketId Unique identifier for the market
     * @param manager Address that will manage this market
     */
    function createMarket(uint256 marketId, address manager) external onlyFactory {
        require(!activeMarkets[marketId], "Market already exists");
        require(manager != address(0), "Invalid manager");
        
        activeMarkets[marketId] = true;
        marketManagers[marketId] = manager;
        
        emit MarketCreated(marketId, manager);
    }

    /**
     * @notice Close a market
     * @param marketId ID of the market to close
     */
    function closeMarket(uint256 marketId) external onlyMarketManager(marketId) {
        require(activeMarkets[marketId], "Market not active");
        
        activeMarkets[marketId] = false;
        
        emit MarketClosed(marketId);
    }

    /**
     * @notice Deposit ETH collateral for a market
     * @param marketId ID of the market
     */
    function depositETHCollateral(uint256 marketId) 
        external 
        payable 
        onlyActiveMarket(marketId)
        whenNotPaused
    {
        require(msg.value > 0, "Amount must be greater than 0");
        
        marketCollateral[marketId][address(0)] += msg.value;
        
        emit CollateralDeposited(marketId, address(0), msg.sender, msg.value);
    }

    /**
     * @notice Deposit ERC20 collateral for a market
     * @param marketId ID of the market
     * @param token Address of the ERC20 token
     * @param amount Amount of tokens to deposit
     */
    function depositERC20Collateral(uint256 marketId, address token, uint256 amount)
        external
        onlyActiveMarket(marketId)
        whenNotPaused
    {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        marketCollateral[marketId][token] += amount;
        
        emit CollateralDeposited(marketId, token, msg.sender, amount);
    }

    /**
     * @notice Withdraw ETH collateral from a market
     * @param marketId ID of the market
     * @param to Recipient address
     * @param amount Amount of ETH to withdraw
     */
    function withdrawETHCollateral(uint256 marketId, address payable to, uint256 amount)
        external
        nonReentrant
        onlyMarketManager(marketId)
        whenNotPaused
    {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(marketCollateral[marketId][address(0)] >= amount, "Insufficient collateral");
        
        marketCollateral[marketId][address(0)] -= amount;
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
        
        emit CollateralWithdrawn(marketId, address(0), to, amount);
    }

    /**
     * @notice Withdraw ERC20 collateral from a market
     * @param marketId ID of the market
     * @param token Address of the ERC20 token
     * @param to Recipient address
     * @param amount Amount of tokens to withdraw
     */
    function withdrawERC20Collateral(uint256 marketId, address token, address to, uint256 amount)
        external
        nonReentrant
        onlyMarketManager(marketId)
        whenNotPaused
    {
        require(token != address(0), "Invalid token address");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(marketCollateral[marketId][token] >= amount, "Insufficient collateral");
        
        marketCollateral[marketId][token] -= amount;
        
        IERC20(token).safeTransfer(to, amount);
        
        emit CollateralWithdrawn(marketId, token, to, amount);
    }

    /**
     * @notice Update market manager
     * @param marketId ID of the market
     * @param newManager New manager address
     */
    function updateMarketManager(uint256 marketId, address newManager) 
        external 
        onlyOwner
    {
        require(activeMarkets[marketId], "Market not active");
        require(newManager != address(0), "Invalid manager");
        
        address oldManager = marketManagers[marketId];
        marketManagers[marketId] = newManager;
        
        emit ManagerUpdated(marketId, oldManager, newManager);
    }

    /**
     * @notice Update factory address
     * @param newFactory New factory address
     */
    function updateFactory(address newFactory) external onlyOwner {
        require(newFactory != address(0), "Invalid factory");
        
        address oldFactory = factory;
        factory = newFactory;
        
        emit FactoryUpdated(oldFactory, newFactory);
    }

    /**
     * @notice Emergency pause operations
     */
    function pause() external onlyOwner {
        require(!paused, "Already paused");
        paused = true;
        emit EmergencyPause(msg.sender);
    }

    /**
     * @notice Resume operations after pause
     */
    function unpause() external onlyOwner {
        require(paused, "Not paused");
        paused = false;
        emit EmergencyUnpause(msg.sender);
    }

    /**
     * @notice Get market collateral balance
     * @param marketId ID of the market
     * @param token Token address (address(0) for ETH)
     * @return Collateral balance
     */
    function getMarketCollateral(uint256 marketId, address token) external view returns (uint256) {
        return marketCollateral[marketId][token];
    }

    /**
     * @notice Check if market is active
     * @param marketId ID of the market
     * @return True if active
     */
    function isMarketActive(uint256 marketId) external view returns (bool) {
        return activeMarkets[marketId];
    }

    /**
     * @notice Get total ETH balance
     * @return Balance in wei
     */
    function getTotalETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get total ERC20 token balance
     * @param token Token address
     * @return Balance of tokens
     */
    function getTotalTokenBalance(address token) external view returns (uint256) {
        require(token != address(0), "Invalid token address");
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Fallback function to receive ETH
     */
    receive() external payable {
        // Accept ETH deposits without market assignment
        // Must be assigned via depositETHCollateral
    }
}
