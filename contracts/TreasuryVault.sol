// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TreasuryVault
 * @notice Secure vault contract for managing DAO treasury funds with access control and spending limits
 * @dev Implements withdrawal authorization, spending limits, and emergency controls
 */
contract TreasuryVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Authorized spender address => is authorized
    mapping(address => bool) public authorizedSpenders;
    
    // Token address => spending limit per transaction (0 = unlimited for ETH use address(0))
    mapping(address => uint256) public transactionLimit;
    
    // Token address => time period for rate limiting (in seconds)
    mapping(address => uint256) public rateLimitPeriod;
    
    // Token address => amount allowed per period
    mapping(address => uint256) public periodLimit;
    
    // Token address => current period start timestamp
    mapping(address => uint256) public periodStart;
    
    // Token address => amount spent in current period
    mapping(address => uint256) public periodSpent;
    
    // Emergency pause state
    bool public paused;
    
    // Emergency guardian address
    address public guardian;
    
    // Initialization flag
    bool private initialized;

    event Deposit(address indexed token, address indexed from, uint256 amount);
    event Withdrawal(address indexed token, address indexed to, uint256 amount, address indexed authorizedBy);
    event SpenderAuthorized(address indexed spender);
    event SpenderRevoked(address indexed spender);
    event TransactionLimitUpdated(address indexed token, uint256 limit);
    event RateLimitUpdated(address indexed token, uint256 period, uint256 limit);
    event EmergencyPause(address indexed by);
    event EmergencyUnpause(address indexed by);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);

    modifier onlyAuthorized() {
        require(authorizedSpenders[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Vault is paused");
        _;
    }

    modifier onlyGuardianOrOwner() {
        require(msg.sender == guardian || msg.sender == owner(), "Not guardian or owner");
        _;
    }

    /**
     * @notice Constructor - can be used for direct deployment or as implementation for clones
     */
    constructor() Ownable(msg.sender) {
        // Constructor left empty to allow use as implementation contract
        // Initialization happens via initialize() for clones
    }

    /**
     * @notice Initialize the vault (for use with clone pattern)
     * @param initialOwner Address that will own the vault
     */
    function initialize(address initialOwner) external {
        require(!initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        
        initialized = true;
        _transferOwnership(initialOwner);
        guardian = initialOwner; // Initially set guardian to owner
    }

    /**
     * @notice Deposit ETH into the vault
     */
    function depositETH() external payable {
        require(msg.value > 0, "Amount must be greater than 0");
        emit Deposit(address(0), msg.sender, msg.value);
    }

    /**
     * @notice Deposit ERC20 tokens into the vault
     * @param token Address of the ERC20 token
     * @param amount Amount of tokens to deposit
     */
    function depositERC20(address token, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(token, msg.sender, amount);
    }

    /**
     * @notice Withdraw ETH from the vault
     * @param to Recipient address
     * @param amount Amount of ETH to withdraw
     */
    function withdrawETH(address payable to, uint256 amount) 
        external 
        nonReentrant 
        onlyAuthorized 
        whenNotPaused 
    {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(address(this).balance >= amount, "Insufficient balance");
        
        _checkSpendingLimits(address(0), amount);
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
        
        emit Withdrawal(address(0), to, amount, msg.sender);
    }

    /**
     * @notice Withdraw ERC20 tokens from the vault
     * @param token Address of the ERC20 token
     * @param to Recipient address
     * @param amount Amount of tokens to withdraw
     */
    function withdrawERC20(address token, address to, uint256 amount)
        external
        nonReentrant
        onlyAuthorized
        whenNotPaused
    {
        require(token != address(0), "Invalid token address");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        
        _checkSpendingLimits(token, amount);
        
        IERC20(token).safeTransfer(to, amount);
        
        emit Withdrawal(token, to, amount, msg.sender);
    }

    /**
     * @notice Check and update spending limits
     * @param token Token address (address(0) for ETH)
     * @param amount Amount to spend
     */
    function _checkSpendingLimits(address token, uint256 amount) internal {
        // Check transaction limit
        uint256 txLimit = transactionLimit[token];
        if (txLimit > 0) {
            require(amount <= txLimit, "Exceeds transaction limit");
        }
        
        // Check rate limit
        uint256 ratePeriod = rateLimitPeriod[token];
        if (ratePeriod > 0) {
            uint256 pLimit = periodLimit[token];
            require(pLimit > 0, "Period limit not set");
            
            // Reset period if needed
            if (block.timestamp >= periodStart[token] + ratePeriod) {
                periodStart[token] = block.timestamp;
                periodSpent[token] = 0;
            }
            
            // Check period limit
            require(periodSpent[token] + amount <= pLimit, "Exceeds period limit");
            periodSpent[token] += amount;
        }
    }

    /**
     * @notice Authorize a spender
     * @param spender Address to authorize
     */
    function authorizeSpender(address spender) external onlyOwner {
        require(spender != address(0), "Invalid spender");
        require(!authorizedSpenders[spender], "Already authorized");
        
        authorizedSpenders[spender] = true;
        emit SpenderAuthorized(spender);
    }

    /**
     * @notice Revoke a spender's authorization
     * @param spender Address to revoke
     */
    function revokeSpender(address spender) external onlyOwner {
        require(authorizedSpenders[spender], "Not authorized");
        
        authorizedSpenders[spender] = false;
        emit SpenderRevoked(spender);
    }

    /**
     * @notice Set transaction limit for a token
     * @param token Token address (address(0) for ETH)
     * @param limit Maximum amount per transaction (0 = unlimited)
     */
    function setTransactionLimit(address token, uint256 limit) external onlyOwner {
        transactionLimit[token] = limit;
        emit TransactionLimitUpdated(token, limit);
    }

    /**
     * @notice Set rate limit for a token
     * @param token Token address (address(0) for ETH)
     * @param period Time period in seconds
     * @param limit Maximum amount per period
     */
    function setRateLimit(address token, uint256 period, uint256 limit) external onlyOwner {
        require(period > 0 || limit == 0, "Invalid period");
        require(limit > 0 || period == 0, "Invalid limit");
        
        rateLimitPeriod[token] = period;
        periodLimit[token] = limit;
        
        // Initialize period if setting for first time
        if (period > 0 && periodStart[token] == 0) {
            periodStart[token] = block.timestamp;
        }
        
        emit RateLimitUpdated(token, period, limit);
    }

    /**
     * @notice Emergency pause withdrawals
     */
    function pause() external onlyGuardianOrOwner {
        require(!paused, "Already paused");
        paused = true;
        emit EmergencyPause(msg.sender);
    }

    /**
     * @notice Resume withdrawals after pause
     */
    function unpause() external onlyOwner {
        require(paused, "Not paused");
        paused = false;
        emit EmergencyUnpause(msg.sender);
    }

    /**
     * @notice Update guardian address
     * @param newGuardian New guardian address
     */
    function updateGuardian(address newGuardian) external onlyOwner {
        require(newGuardian != address(0), "Invalid guardian");
        address oldGuardian = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(oldGuardian, newGuardian);
    }

    /**
     * @notice Get ETH balance
     * @return Balance in wei
     */
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get ERC20 token balance
     * @param token Token address
     * @return Balance of tokens
     */
    function getTokenBalance(address token) external view returns (uint256) {
        require(token != address(0), "Invalid token address");
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Check if address is authorized spender
     * @param spender Address to check
     * @return True if authorized
     */
    function isAuthorizedSpender(address spender) external view returns (bool) {
        return authorizedSpenders[spender] || spender == owner();
    }

    /**
     * @notice Get remaining spending allowance for current period
     * @param token Token address (address(0) for ETH)
     * @return Remaining allowance in current period
     */
    function getRemainingPeriodAllowance(address token) external view returns (uint256) {
        uint256 ratePeriod = rateLimitPeriod[token];
        if (ratePeriod == 0) {
            return type(uint256).max; // No limit
        }
        
        uint256 pLimit = periodLimit[token];
        
        // Check if period has expired
        if (block.timestamp >= periodStart[token] + ratePeriod) {
            return pLimit; // Full allowance available in new period
        }
        
        // Return remaining in current period
        uint256 spent = periodSpent[token];
        return spent >= pLimit ? 0 : pLimit - spent;
    }

    /**
     * @notice Fallback function to receive ETH
     */
    receive() external payable {
        emit Deposit(address(0), msg.sender, msg.value);
    }
}
