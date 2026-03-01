// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ConditionalMarketFactory.sol";
import "./FriendGroupMarketLib.sol";
import "./FriendGroupMarketTypes.sol";
import "./FriendGroupResolutionLib.sol";
import "./FriendGroupClaimsLib.sol";
import "./FriendGroupCreationLib.sol";
import "../security/RagequitModule.sol";
import "../security/NullifierRegistry.sol";
import "../access/TieredRoleManager.sol";
import "../access/MembershipPaymentManager.sol";
import "../oracles/PolymarketOracleAdapter.sol";
import "../oracles/OracleRegistry.sol";
import "../oracles/IOracleAdapter.sol";

// Custom errors are declared in IFriendGroupErrors (FriendGroupMarketTypes.sol).
// The contract inherits the interface so all error selectors appear in its ABI.

/**
 * @title FriendGroupMarketFactory
 * @notice Factory for creating small-scale prediction markets between friends
 * @dev Supports P2P betting with tiered membership, member limits, and ERC20 payments
 * 
 * KEY FEATURES:
 * - Tiered membership system (gas-only markets for members)
 * - ERC20 token support (USDC, USDT, stablecoins)
 * - Member limit enforcement to prevent bypassing public markets
 * - Support for 1v1 bets, group prop bets, and event tracking scenarios
 * - Optional third-party arbitration
 * - Integration with RagequitModule for fair exits
 * - USD-based pricing display
 * 
 * USE CASES:
 * 1. Competitive event tracking (poker, board games, etc.)
 * 2. 1v1 prop bets between friends
 * 3. Small group predictions with arbitrator
 * 4. Friend group contests and competitions
 */
contract FriendGroupMarketFactory is IFriendGroupErrors, Ownable, ReentrancyGuard {

    // Friend market ID => FriendMarket
    mapping(uint256 => FriendMarket) public friendMarkets;
    
    // User => array of friend market IDs they're in (internal to prevent public enumeration)
    mapping(address => uint256[]) internal userMarkets;
    
    // Member count tracking per market
    mapping(uint256 => uint256) public memberCount;
    
    // Track which public markets have pegged friend markets
    mapping(uint256 => uint256[]) public publicMarketToPeggedFriendMarkets;

    // Acceptance tracking for multi-party flow (friendMarketId => participant => AcceptanceRecord)
    mapping(uint256 => mapping(address => AcceptanceRecord)) public marketAcceptances;

    // Count of accepted participants per market
    mapping(uint256 => uint256) public acceptedParticipantCount;

    // Total staked amount per market (held until activation or refund)
    mapping(uint256 => uint256) public marketTotalStaked;

    uint256 public friendMarketCount;
    
    // Reference to main market factory
    ConditionalMarketFactory public marketFactory;
    
    // Reference to ragequit module
    RagequitModule public ragequitModule;
    
    // Reference to tiered role manager for membership checks
    TieredRoleManager public tieredRoleManager;

    // Reference to nullifier registry for anti-money-laundering protection
    NullifierRegistry public nullifierRegistry;

    // Whether to enforce nullification checks (can be disabled if nullifier not deployed)
    bool public enforceNullification;
    
    // Default collateral token for markets (ERC20, required for CTF)
    address public defaultCollateralToken;
    
    // Pricing tiers (updateable by managers)
    uint256 public publicMarketFee = 1 ether;      // Standard market fee
    uint256 public friendMarketFee = 0.1 ether;    // Reduced fee for friend markets
    uint256 public oneVsOneFee = 0.05 ether;       // Even lower for 1v1
    
    // Member limits (updateable by managers)
    uint256 public maxSmallGroupMembers = 10;
    uint256 public maxOneVsOneMembers = 2;
    uint256 public minEventTrackingMembers = 3;
    uint256 public maxEventTrackingMembers = 10;
    
    // Manager role for updating configuration
    address public manager;
    
    // Reference to membership payment manager for ERC20 handling
    MembershipPaymentManager public paymentManager;

    // Reference to Polymarket oracle adapter for cross-platform resolution
    PolymarketOracleAdapter public polymarketAdapter;

    // Track Polymarket condition to friend market mappings
    mapping(bytes32 => uint256[]) public polymarketConditionToFriendMarkets;

    // ========== Claim Tracking ==========

    // Track whether winnings have been claimed for a market
    mapping(uint256 => bool) public winningsClaimed;

    // Track the outcome of resolved markets (true = creator wins, false = opponent wins)
    mapping(uint256 => bool) public wagerOutcome;

    // Track the winner address for resolved markets
    mapping(uint256 => address) public wagerWinner;

    // Track when market was resolved (for future timeout features)
    mapping(uint256 => uint256) public resolvedAt;

    // ========== Challenge System ==========

    // Track pending resolutions (friendMarketId => PendingResolutionData)
    mapping(uint256 => PendingResolutionData) public pendingResolutions;

    // Challenge configuration
    uint256 public challengePeriod = 24 hours;  // How long before resolution finalizes
    uint256 public challengeBond = 0.1 ether;   // Bond required to challenge

    // ========== Claim Timeout ==========

    // Time window for winners to claim (default 90 days)
    uint256 public claimTimeout = 90 days;

    // Treasury address for unclaimed funds
    address public treasury;

    // ========== Oracle Timeout ==========

    // Time after expected resolution before timeout can be triggered (default 30 days)
    uint256 public oracleTimeout = 30 days;

    // Expected resolution time for oracle-pegged markets (marketId => timestamp)
    mapping(uint256 => uint256) public expectedResolutionTime;

    // Track refund acceptance for oracle timeout (marketId => address => accepted)
    mapping(uint256 => mapping(address => bool)) public refundAccepted;

    // ========== Multi-Oracle Registry ==========

    // Reference to OracleRegistry for multi-oracle resolution
    OracleRegistry public oracleRegistry;

    // Track oracle condition for markets (marketId => oracleId => conditionId)
    mapping(uint256 => bytes32) public marketOracleId;
    mapping(uint256 => bytes32) public marketOracleCondition;

    // Track number of refund acceptances per market
    mapping(uint256 => uint256) public refundAcceptanceCount;

    // Accepted payment tokens for market creation and liquidity (address => isAccepted)
    mapping(address => bool) public acceptedPaymentTokens;
    
    // Track accepted token list
    address[] public acceptedTokenList;
    
    // Events
    event FriendMarketCreated(
        uint256 indexed friendMarketId,
        uint256 indexed underlyingMarketId,
        MarketType marketType,
        address indexed creator,
        uint256 memberLimit,
        uint256 creationFee,
        address paymentToken
    );
    event MemberAdded(uint256 indexed friendMarketId, address indexed member);
    event MemberRemoved(uint256 indexed friendMarketId, address indexed member);
    event MarketPegged(uint256 indexed friendMarketId, uint256 indexed publicMarketId);
    event BatchResolution(uint256 indexed publicMarketId, uint256[] friendMarketIds, uint256 outcome);
    event FeesUpdated(uint256 publicFee, uint256 friendFee, uint256 oneVsOneFee);
    event MemberLimitsUpdated(uint256 maxSmallGroup, uint256 maxOneVsOne, uint256 minEventTracking, uint256 maxEventTracking);
    event ManagerUpdated(address indexed oldManager, address indexed newManager);
    event PaymentTokenAdded(address indexed token);
    event PaymentTokenRemoved(address indexed token);
    event NullifierRegistryUpdated(address indexed nullifierRegistry);
    event NullificationEnforcementUpdated(bool enforce);
    
    event ArbitratorSet(
        uint256 indexed friendMarketId,
        address indexed arbitrator
    );
    
    event MarketResolved(
        uint256 indexed friendMarketId,
        address indexed resolver,
        bool outcome
    );
    
    event MarketPeggedToPublic(
        uint256 indexed friendMarketId,
        uint256 indexed publicMarketId
    );
    
    event PeggedMarketAutoResolved(
        uint256 indexed friendMarketId,
        uint256 indexed publicMarketId,
        uint256 passValue,
        uint256 failValue
    );

    // Multi-party acceptance flow events
    event MarketCreatedPending(
        uint256 indexed friendMarketId,
        address indexed creator,
        uint256 acceptanceDeadline,
        uint256 stakePerParticipant,
        uint16 opponentOddsMultiplier,
        address stakeToken,
        address[] invitedParticipants,
        address arbitrator
    );

    event ParticipantAccepted(
        uint256 indexed friendMarketId,
        address indexed participant,
        uint256 stakedAmount,
        uint256 acceptedAt
    );

    event ArbitratorAccepted(
        uint256 indexed friendMarketId,
        address indexed arbitrator,
        uint256 acceptedAt
    );

    event MarketActivated(
        uint256 indexed friendMarketId,
        uint256 underlyingMarketId,
        uint256 activatedAt,
        uint256 totalStaked,
        uint256 participantCount
    );

    event MarketCancelledByCreator(
        uint256 indexed friendMarketId,
        address indexed creator,
        uint256 cancelledAt
    );

    event AcceptanceDeadlinePassed(
        uint256 indexed friendMarketId,
        uint256 deadline,
        uint256 acceptedCount,
        uint256 requiredCount
    );

    event StakeRefunded(
        uint256 indexed friendMarketId,
        address indexed participant,
        uint256 amount
    );

    event PolymarketAdapterUpdated(address indexed adapter);
    event OracleRegistryUpdated(address indexed registry);
    event MarketPeggedToOracle(
        uint256 indexed friendMarketId,
        bytes32 indexed oracleId,
        bytes32 indexed conditionId
    );
    event OracleMarketResolved(
        uint256 indexed friendMarketId,
        bytes32 indexed oracleId,
        bytes32 conditionId,
        bool outcome
    );

    event MarketPeggedToPolymarket(
        uint256 indexed friendMarketId,
        bytes32 indexed conditionId
    );

    event PolymarketMarketResolved(
        uint256 indexed friendMarketId,
        bytes32 indexed conditionId,
        uint256 passNumerator,
        uint256 failNumerator,
        bool outcome
    );

    event WinningsClaimed(
        uint256 indexed friendMarketId,
        address indexed winner,
        uint256 amount,
        address token
    );

    // Challenge system events
    event ResolutionProposed(
        uint256 indexed friendMarketId,
        address indexed proposer,
        bool proposedOutcome,
        uint256 challengeDeadline
    );

    event ResolutionChallenged(
        uint256 indexed friendMarketId,
        address indexed challenger,
        uint256 bondAmount
    );

    event ResolutionFinalized(
        uint256 indexed friendMarketId,
        bool outcome
    );

    event DisputeResolved(
        uint256 indexed friendMarketId,
        address indexed resolver,
        bool outcome,
        address bondRecipient,
        uint256 bondAmount
    );

    event ChallengePeriodUpdated(uint256 oldPeriod, uint256 newPeriod);
    event ChallengeBondUpdated(uint256 oldBond, uint256 newBond);

    // Claim timeout events
    event UnclaimedFundsSwept(
        uint256 indexed friendMarketId,
        uint256 amount,
        address token,
        address treasury
    );
    event ClaimTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    // Oracle timeout events
    event OracleTimeoutTriggered(
        uint256 indexed friendMarketId,
        uint256 expectedTime,
        uint256 actualTime
    );
    event MutualRefundInitiated(
        uint256 indexed friendMarketId,
        address indexed initiator
    );
    event RefundAccepted(
        uint256 indexed friendMarketId,
        address indexed participant
    );
    event MutualRefundCompleted(
        uint256 indexed friendMarketId,
        uint256 totalRefunded
    );
    event OracleTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event ExpectedResolutionTimeSet(uint256 indexed friendMarketId, uint256 expectedTime);

    constructor(
        address _marketFactory,
        address payable _ragequitModule,
        address _tieredRoleManager,
        address _paymentManager,
        address _owner
    ) Ownable(_owner) {
        if (_marketFactory == address(0)) revert InvalidAddress();
        if (_ragequitModule == address(0)) revert InvalidAddress();
        if (_tieredRoleManager == address(0)) revert InvalidAddress();
        if (_paymentManager == address(0)) revert InvalidAddress();
        if (_owner == address(0)) revert InvalidAddress();

        marketFactory = ConditionalMarketFactory(_marketFactory);
        ragequitModule = RagequitModule(_ragequitModule);
        tieredRoleManager = TieredRoleManager(_tieredRoleManager);
        paymentManager = MembershipPaymentManager(_paymentManager);
        manager = _owner; // Initially owner, transferable

        // Accept native ETC by default
        acceptedPaymentTokens[address(0)] = true;
    }
    
    // ========== Manager Functions ==========
    
    /**
     * @notice Update manager address (only owner)
     * @param newManager New manager address
     */
    function updateManager(address newManager) external onlyOwner {
        if (newManager == address(0)) revert InvalidAddress();
        address oldManager = manager;
        manager = newManager;
        emit ManagerUpdated(oldManager, newManager);
    }
    
    /**
     * @notice Set default collateral token for markets (ERC20, required for CTF)
     * @param _collateralToken Address of ERC20 token to use as collateral
     */
    function setDefaultCollateralToken(address _collateralToken) external onlyOwner {
        if (_collateralToken == address(0)) revert InvalidAddress();
        defaultCollateralToken = _collateralToken;
    }

    function addAcceptedPaymentToken(address token, bool active) external {
        if (msg.sender != manager && msg.sender != owner()) revert NotAuthorized();

        bool wasAccepted = acceptedPaymentTokens[token];
        acceptedPaymentTokens[token] = active;

        if (active && !wasAccepted && token != address(0)) {
            acceptedTokenList.push(token);
            emit PaymentTokenAdded(token);
        } else if (!active && wasAccepted) {
            emit PaymentTokenRemoved(token);
        }
    }

    function removeAcceptedPaymentToken(address token) external {
        if (msg.sender != manager && msg.sender != owner()) revert NotAuthorized();
        if (token == address(0)) revert InvalidAddress();

        acceptedPaymentTokens[token] = false;
        emit PaymentTokenRemoved(token);
    }

    function updateFees(uint256 _publicFee, uint256 _friendFee, uint256 _oneVsOneFee) external {
        if (msg.sender != manager && msg.sender != owner()) revert NotAuthorized();
        publicMarketFee = _publicFee;
        friendMarketFee = _friendFee;
        oneVsOneFee = _oneVsOneFee;
        emit FeesUpdated(_publicFee, _friendFee, _oneVsOneFee);
    }
    
    /**
     * @notice Update member limits (only manager)
     * @param _maxSmallGroup Max members for small group markets
     * @param _maxOneVsOne Max members for 1v1 markets (should be 2)
     * @param _minEventTracking Min members for event tracking
     * @param _maxEventTracking Max members for event tracking
     */
    function updateMemberLimits(
        uint256 _maxSmallGroup,
        uint256 _maxOneVsOne,
        uint256 _minEventTracking,
        uint256 _maxEventTracking
    ) external {
        if (msg.sender != manager && msg.sender != owner()) revert NotAuthorized();
        if (_maxOneVsOne != 2) revert InvalidLimit();
        if (_minEventTracking > _maxEventTracking) revert InvalidLimit();
        maxSmallGroupMembers = _maxSmallGroup;
        maxOneVsOneMembers = _maxOneVsOne;
        minEventTrackingMembers = _minEventTracking;
        maxEventTrackingMembers = _maxEventTracking;
        emit MemberLimitsUpdated(_maxSmallGroup, _maxOneVsOne, _minEventTracking, _maxEventTracking);
    }

    /**
     * @notice Update TieredRoleManager address (only owner)
     * @param _tieredRoleManager New TieredRoleManager address
     */
    function setTieredRoleManager(address _tieredRoleManager) external onlyOwner {
        if (_tieredRoleManager == address(0)) revert InvalidAddress();
        tieredRoleManager = TieredRoleManager(_tieredRoleManager);
    }

    /**
     * @notice Set the NullifierRegistry contract (only owner)
     * @param _nullifierRegistry Address of NullifierRegistry contract
     */
    function setNullifierRegistry(address _nullifierRegistry) external onlyOwner {
        if (_nullifierRegistry == address(0)) revert InvalidAddress();
        nullifierRegistry = NullifierRegistry(_nullifierRegistry);
        emit NullifierRegistryUpdated(_nullifierRegistry);
    }

    /**
     * @notice Enable or disable nullification enforcement (only owner)
     * @param _enforce Whether to enforce nullification checks
     */
    function setNullificationEnforcement(bool _enforce) external onlyOwner {
        // Can only enable if registry is set
        if (_enforce && address(nullifierRegistry) == address(0)) revert InvalidAddress();
        enforceNullification = _enforce;
        emit NullificationEnforcementUpdated(_enforce);
    }

    /**
     * @notice Update the challenge period duration
     * @param _challengePeriod New challenge period in seconds (min 1 hour, max 7 days)
     */
    function setChallengePeriod(uint256 _challengePeriod) external onlyOwner {
        if (_challengePeriod < 1 hours || _challengePeriod > 7 days) revert InvalidChallengePeriod();
        uint256 oldPeriod = challengePeriod;
        challengePeriod = _challengePeriod;
        emit ChallengePeriodUpdated(oldPeriod, _challengePeriod);
    }

    /**
     * @notice Update the challenge bond amount
     * @param _challengeBond New challenge bond amount (can be 0 for no bond)
     */
    function setChallengeBond(uint256 _challengeBond) external onlyOwner {
        uint256 oldBond = challengeBond;
        challengeBond = _challengeBond;
        emit ChallengeBondUpdated(oldBond, _challengeBond);
    }

    /**
     * @notice Set the treasury address for unclaimed funds
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /**
     * @notice Update the claim timeout duration
     * @param _claimTimeout New claim timeout in seconds (min 7 days, max 365 days)
     */
    function setClaimTimeout(uint256 _claimTimeout) external onlyOwner {
        if (_claimTimeout < 7 days || _claimTimeout > 365 days) revert InvalidClaimTimeout();
        uint256 oldTimeout = claimTimeout;
        claimTimeout = _claimTimeout;
        emit ClaimTimeoutUpdated(oldTimeout, _claimTimeout);
    }

    /**
     * @notice Update the oracle timeout duration
     * @param _oracleTimeout New oracle timeout in seconds (min 7 days, max 180 days)
     */
    function setOracleTimeout(uint256 _oracleTimeout) external onlyOwner {
        if (_oracleTimeout < 7 days || _oracleTimeout > 180 days) revert InvalidOracleTimeout();
        uint256 oldTimeout = oracleTimeout;
        oracleTimeout = _oracleTimeout;
        emit OracleTimeoutUpdated(oldTimeout, _oracleTimeout);
    }

    /**
     * @notice Set the Polymarket oracle adapter contract (only owner)
     * @dev Required for resolving markets based on Polymarket outcomes
     * @param _polymarketAdapter Address of the PolymarketOracleAdapter contract
     */
    function setPolymarketAdapter(address _polymarketAdapter) external onlyOwner {
        if (_polymarketAdapter == address(0)) revert InvalidAddress();
        polymarketAdapter = PolymarketOracleAdapter(_polymarketAdapter);
        emit PolymarketAdapterUpdated(_polymarketAdapter);
    }

    /**
     * @notice Set the OracleRegistry contract (only owner)
     * @dev Enables multi-oracle resolution via Chainlink, UMA, etc.
     * @param _oracleRegistry Address of the OracleRegistry contract
     */
    function setOracleRegistry(address _oracleRegistry) external onlyOwner {
        if (_oracleRegistry == address(0)) revert InvalidAddress();
        oracleRegistry = OracleRegistry(_oracleRegistry);
        emit OracleRegistryUpdated(_oracleRegistry);
    }

    // ========== Multi-Party Acceptance Flow Functions ==========

    /**
     * @notice Create a 1v1 market with pending acceptance (equal stakes)
     * @param opponent Address of the counterparty
     * @param description Market description
     * @param tradingPeriod Duration after activation (7-21 days)
     * @param arbitrator Optional third-party arbitrator (required if resolutionType is ThirdParty)
     * @param acceptanceDeadline Unix timestamp for acceptance deadline
     * @param stakeAmount Equal stake amount for both parties
     * @param stakeToken ERC20 token address for stakes (address(0) for native)
     * @param resolutionType Who can resolve the market
     * @return friendMarketId ID of the pending friend market
     */
    function createOneVsOneMarketPending(
        address opponent,
        string memory description,
        uint256 tradingPeriod,
        address arbitrator,
        uint256 acceptanceDeadline,
        uint256 stakeAmount,
        address stakeToken,
        ResolutionType resolutionType
    ) external payable nonReentrant returns (uint256 friendMarketId) {
        if (opponent == address(0) || opponent == msg.sender) revert InvalidOpponent();
        if (bytes(description).length == 0) revert InvalidDescription();
        if (acceptanceDeadline <= block.timestamp + 1 hours || acceptanceDeadline >= block.timestamp + 30 days) revert InvalidDeadline();
        if (stakeAmount == 0) revert InvalidStake();
        if (resolutionType == ResolutionType.ThirdParty && arbitrator == address(0)) revert InvalidAddress();

        bytes32 role = tieredRoleManager.FRIEND_MARKET_ROLE();
        if (!tieredRoleManager.hasRole(role, msg.sender)) revert MembershipRequired();
        if (!tieredRoleManager.isMembershipActive(msg.sender, role)) revert MembershipExpired();
        if (!tieredRoleManager.checkMarketCreationLimitFor(msg.sender, role)) revert MarketLimitReached();

        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, msg.sender);
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, opponent);
        FriendGroupMarketLib.collectStake(msg.sender, stakeToken, stakeAmount);

        friendMarketId = friendMarketCount++;
        address[] memory participants = new address[](2);
        participants[0] = msg.sender;
        participants[1] = opponent;

        FriendGroupCreationLib.initializeMarket(
            friendMarkets[friendMarketId],
            marketAcceptances[friendMarketId][msg.sender],
            friendMarketId, MarketType.OneVsOne, msg.sender, participants,
            arbitrator, maxOneVsOneMembers, description, acceptanceDeadline,
            2, stakeAmount, stakeToken, tradingPeriod, 200, resolutionType, stakeAmount
        );

        acceptedParticipantCount[friendMarketId] = 1;
        marketTotalStaked[friendMarketId] = stakeAmount;
        memberCount[friendMarketId] = 2;
        userMarkets[msg.sender].push(friendMarketId);
        userMarkets[opponent].push(friendMarketId);
    }

    /**
     * @notice Create a Bookmaker market - leveraged 1v1 requiring both MARKET_MAKER and FRIEND_MARKET roles
     * @dev More dispute-prone due to asymmetric stakes, hence separated from regular 1v1
     * @param opponent Address of the counterparty (must have FRIEND_MARKET_ROLE)
     * @param description Market description
     * @param tradingPeriod Duration after activation (7-21 days)
     * @param acceptanceDeadline Unix timestamp for acceptance deadline
     * @param opponentStakeAmount Amount opponent must stake (creator stake derived from odds)
     * @param opponentOddsMultiplier Opponent's payout multiplier: 200=2x (equal), 10000=100x
     * @param stakeToken ERC20 token address for stakes (address(0) for native)
     * @param resolutionType Who can resolve the market
     * @param arbitrator Optional third-party arbitrator (required if resolutionType is ThirdParty)
     * @return friendMarketId ID of the pending friend market
     */
    function createBookmakerMarket(
        address opponent,
        string memory description,
        uint256 tradingPeriod,
        uint256 acceptanceDeadline,
        uint256 opponentStakeAmount,
        uint16 opponentOddsMultiplier,
        address stakeToken,
        ResolutionType resolutionType,
        address arbitrator
    ) external payable nonReentrant returns (uint256 friendMarketId) {
        if (opponent == address(0) || opponent == msg.sender) revert InvalidOpponent();
        if (bytes(description).length == 0) revert InvalidDescription();
        if (acceptanceDeadline <= block.timestamp + 1 hours || acceptanceDeadline >= block.timestamp + 30 days) revert InvalidDeadline();
        if (opponentStakeAmount == 0) revert InvalidStake();
        if (opponentOddsMultiplier < 200) revert InvalidOdds();
        if (resolutionType == ResolutionType.ThirdParty && arbitrator == address(0)) revert InvalidAddress();

        bytes32 friendRole = tieredRoleManager.FRIEND_MARKET_ROLE();
        bytes32 makerRole = tieredRoleManager.MARKET_MAKER_ROLE();
        if (!tieredRoleManager.hasRole(friendRole, msg.sender)) revert MembershipRequired();
        if (!tieredRoleManager.hasRole(makerRole, msg.sender)) revert MissingMarketMakerRole();
        if (!tieredRoleManager.isMembershipActive(msg.sender, friendRole)) revert MembershipExpired();
        if (!tieredRoleManager.isMembershipActive(msg.sender, makerRole)) revert MembershipExpired();
        if (!tieredRoleManager.checkMarketCreationLimitFor(msg.sender, friendRole)) revert MarketLimitReached();
        if (!tieredRoleManager.hasRole(friendRole, opponent)) revert MembershipRequired();

        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, msg.sender);
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, opponent);

        uint256 creatorStake = (opponentStakeAmount * (uint256(opponentOddsMultiplier) - 100)) / 100;
        FriendGroupMarketLib.collectStake(msg.sender, stakeToken, creatorStake);

        friendMarketId = friendMarketCount++;
        address[] memory participants = new address[](2);
        participants[0] = msg.sender;
        participants[1] = opponent;

        FriendGroupCreationLib.initializeMarket(
            friendMarkets[friendMarketId],
            marketAcceptances[friendMarketId][msg.sender],
            friendMarketId, MarketType.Bookmaker, msg.sender, participants,
            arbitrator, maxOneVsOneMembers, description, acceptanceDeadline,
            2, opponentStakeAmount, stakeToken, tradingPeriod,
            opponentOddsMultiplier, resolutionType, creatorStake
        );

        acceptedParticipantCount[friendMarketId] = 1;
        marketTotalStaked[friendMarketId] = creatorStake;
        memberCount[friendMarketId] = 2;
        userMarkets[msg.sender].push(friendMarketId);
        userMarkets[opponent].push(friendMarketId);
    }

    /**
     * @notice Create a small group market with pending acceptance
     * @param description Market description
     * @param invitedMembers Initial participant addresses (excluding creator)
     * @param memberLimit Maximum concurrent members
     * @param tradingPeriod Duration after activation
     * @param arbitrator Optional third-party arbitrator
     * @param acceptanceDeadline Unix timestamp for acceptance deadline
     * @param minAcceptanceThreshold Minimum participants to activate (including creator)
     * @param stakeAmount Amount each party must stake
     * @param stakeToken ERC20 token address for stakes
     * @return friendMarketId ID of the pending friend market
     */
    function createSmallGroupMarketPending(
        string memory description,
        address[] memory invitedMembers,
        uint256 memberLimit,
        uint256 tradingPeriod,
        address arbitrator,
        uint256 acceptanceDeadline,
        uint256 minAcceptanceThreshold,
        uint256 stakeAmount,
        address stakeToken
    ) external payable nonReentrant returns (uint256 friendMarketId) {
        if (bytes(description).length == 0) revert InvalidDescription();
        if (memberLimit <= 2 || memberLimit > maxSmallGroupMembers) revert InvalidLimit();
        if (invitedMembers.length == 0 || invitedMembers.length >= memberLimit) revert InvalidLimit();
        if (acceptanceDeadline <= block.timestamp + 1 hours || acceptanceDeadline >= block.timestamp + 30 days) revert InvalidDeadline();
        if (stakeAmount == 0) revert InvalidStake();
        if (minAcceptanceThreshold < 2) revert InvalidThreshold();
        if (minAcceptanceThreshold > invitedMembers.length + 1) revert InvalidThreshold();

        FriendGroupMarketLib.validateMembersExcluding(invitedMembers, msg.sender);

        bytes32 role = tieredRoleManager.FRIEND_MARKET_ROLE();
        if (!tieredRoleManager.hasRole(role, msg.sender)) revert MembershipRequired();
        if (!tieredRoleManager.isMembershipActive(msg.sender, role)) revert MembershipExpired();
        if (!tieredRoleManager.checkMarketCreationLimitFor(msg.sender, role)) revert MarketLimitReached();

        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, msg.sender);
        FriendGroupMarketLib.checkNullificationBatch(nullifierRegistry, enforceNullification, invitedMembers);
        FriendGroupMarketLib.collectStake(msg.sender, stakeToken, stakeAmount);

        address[] memory allParticipants = new address[](invitedMembers.length + 1);
        allParticipants[0] = msg.sender;
        for (uint256 i = 0; i < invitedMembers.length; i++) {
            allParticipants[i + 1] = invitedMembers[i];
        }

        friendMarketId = friendMarketCount++;

        FriendGroupCreationLib.initializeMarket(
            friendMarkets[friendMarketId],
            marketAcceptances[friendMarketId][msg.sender],
            friendMarketId, MarketType.SmallGroup, msg.sender, allParticipants,
            arbitrator, memberLimit, description, acceptanceDeadline,
            minAcceptanceThreshold, stakeAmount, stakeToken, tradingPeriod,
            200, ResolutionType.Either, stakeAmount
        );

        acceptedParticipantCount[friendMarketId] = 1;
        marketTotalStaked[friendMarketId] = stakeAmount;
        memberCount[friendMarketId] = allParticipants.length;
        for (uint256 i = 0; i < allParticipants.length; i++) {
            userMarkets[allParticipants[i]].push(friendMarketId);
        }
    }

    /**
     * @notice Add a member to an existing small group market
     * @param friendMarketId ID of the friend market
     * @param newMember Address of new member
     */
    function addMember(uint256 friendMarketId, address newMember) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, newMember);
        FriendGroupCreationLib.validateAddMember(
            friendMarkets[friendMarketId], memberCount[friendMarketId], msg.sender, newMember
        );
        friendMarkets[friendMarketId].members.push(newMember);
        memberCount[friendMarketId]++;
        userMarkets[newMember].push(friendMarketId);
        emit MemberAdded(friendMarketId, newMember);
    }

    function removeSelf(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendGroupCreationLib.executeRemoveSelf(friendMarkets[friendMarketId], friendMarketId, msg.sender);
        memberCount[friendMarketId]--;
    }

    function acceptMarket(uint256 friendMarketId) external payable nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, msg.sender);

        (, bool isArbitrator) = FriendGroupCreationLib.validateAcceptance(
            friendMarkets[friendMarketId],
            marketAcceptances[friendMarketId][msg.sender].hasAccepted,
            msg.sender
        );

        FriendMarket storage market = friendMarkets[friendMarketId];
        if (isArbitrator) {
            marketAcceptances[friendMarketId][msg.sender] = AcceptanceRecord({
                participant: msg.sender, stakedAmount: 0,
                acceptedAt: block.timestamp, hasAccepted: true, isArbitrator: true
            });
            emit ArbitratorAccepted(friendMarketId, msg.sender, block.timestamp);
        } else {
            FriendGroupMarketLib.collectStake(msg.sender, market.stakeToken, market.stakePerParticipant);
            marketAcceptances[friendMarketId][msg.sender] = AcceptanceRecord({
                participant: msg.sender, stakedAmount: market.stakePerParticipant,
                acceptedAt: block.timestamp, hasAccepted: true, isArbitrator: false
            });
            acceptedParticipantCount[friendMarketId]++;
            marketTotalStaked[friendMarketId] += market.stakePerParticipant;
            emit ParticipantAccepted(friendMarketId, msg.sender, market.stakePerParticipant, block.timestamp);
        }

        _checkAndActivateMarket(friendMarketId);
    }

    /**
     * @notice Cancel a pending market (creator only, before activation)
     * @param friendMarketId ID of the pending market
     */
    function cancelPendingMarket(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];

        if (market.status != FriendMarketStatus.PendingAcceptance) revert NotPending();
        if (msg.sender != market.creator) revert NotAuthorized();

        market.status = FriendMarketStatus.Cancelled;
        _refundAllStakesInternal(friendMarketId);

        emit MarketCancelledByCreator(friendMarketId, msg.sender, block.timestamp);
    }

    function processExpiredDeadline(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];
        uint256 accepted = acceptedParticipantCount[friendMarketId];
        bool arbAccepted = market.arbitrator == address(0) ||
            marketAcceptances[friendMarketId][market.arbitrator].hasAccepted;

        bool shouldActivate = FriendGroupCreationLib.processExpiredDeadline(
            market, friendMarketId, accepted, arbAccepted
        );

        if (shouldActivate) {
            _activateMarket(friendMarketId);
        } else {
            FriendGroupCreationLib.refundAllStakes(market, marketAcceptances, friendMarketId);
            marketTotalStaked[friendMarketId] = 0;
        }
    }

    // ========== Internal Helper Functions for Acceptance Flow ==========

    function _refundAllStakesInternal(uint256 friendMarketId) internal {
        FriendGroupCreationLib.refundAllStakes(
            friendMarkets[friendMarketId], marketAcceptances, friendMarketId
        );
        marketTotalStaked[friendMarketId] = 0;
    }

    function _checkAndActivateMarket(uint256 friendMarketId) internal {
        FriendMarket storage market = friendMarkets[friendMarketId];
        uint256 accepted = acceptedParticipantCount[friendMarketId];
        bool arbitratorOk = market.arbitrator == address(0) ||
            marketAcceptances[friendMarketId][market.arbitrator].hasAccepted;

        if (accepted >= market.minAcceptanceThreshold && arbitratorOk) {
            _activateMarket(friendMarketId);
        }
    }

    function _activateMarket(uint256 friendMarketId) internal {
        FriendGroupCreationLib.activateMarket(
            friendMarkets[friendMarketId],
            friendMarketId,
            marketTotalStaked[friendMarketId],
            defaultCollateralToken,
            marketFactory,
            acceptedParticipantCount[friendMarketId]
        );
    }

    // ========== Acceptance Flow View Functions ==========

    /**
     * @notice Get acceptance status for a market
     */
    // getAcceptanceStatus removed - use acceptedParticipantCount, friendMarkets, marketAcceptances directly

    /**
     * @notice Get participant's acceptance record
     */
    function getParticipantAcceptance(uint256 friendMarketId, address participant)
        external view returns (AcceptanceRecord memory)
    {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        return marketAcceptances[friendMarketId][participant];
    }

    function hasAccepted(uint256 friendMarketId, address participant) external view returns (bool) {
        return marketAcceptances[friendMarketId][participant].hasAccepted;
    }

    /**
     * @notice Get stake requirements for a 1v1 market with custom odds
     * @param friendMarketId ID of the friend market
     * @return opponentStake Amount opponent must stake
     * @return creatorStake Amount creator staked
     * @return totalPot Total pot if both stakes collected
     * @return oddsMultiplier The odds multiplier (200 = 2x, 10000 = 100x)
     */
    function getStakeRequirements(uint256 friendMarketId) external view returns (
        uint256 opponentStake,
        uint256 creatorStake,
        uint256 totalPot,
        uint16 oddsMultiplier
    ) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];

        opponentStake = market.stakePerParticipant;
        // Treat 0 as 200 (2x) for backwards compatibility with legacy markets
        oddsMultiplier = market.opponentOddsMultiplier == 0 ? 200 : market.opponentOddsMultiplier;
        creatorStake = (opponentStake * (uint256(oddsMultiplier) - 100)) / 100;
        totalPot = (opponentStake * uint256(oddsMultiplier)) / 100;
    }

    /**
     * @notice Get friend market details with acceptance info
     */
    function getFriendMarketWithStatus(uint256 friendMarketId) external view returns (
        uint256 marketId,
        MarketType marketType,
        address creator,
        address[] memory members,
        address arbitrator,
        FriendMarketStatus status,
        uint256 acceptanceDeadline,
        uint256 stakePerParticipant,
        address stakeToken,
        uint256 acceptedCount,
        uint256 minThreshold,
        uint16 opponentOddsMultiplier,
        string memory description,
        ResolutionType resolutionType
    ) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];

        return (
            market.marketId,
            market.marketType,
            market.creator,
            market.members,
            market.arbitrator,
            market.status,
            market.acceptanceDeadline,
            market.stakePerParticipant,
            market.stakeToken,
            acceptedParticipantCount[friendMarketId],
            market.minAcceptanceThreshold,
            market.opponentOddsMultiplier == 0 ? 200 : market.opponentOddsMultiplier,
            market.description,
            market.resolutionType
        );
    }

    /**
     * @notice Get friend market details
     * @param friendMarketId ID of the friend market
     */
    function getFriendMarket(uint256 friendMarketId) external view returns (
        uint256 marketId,
        MarketType marketType,
        address creator,
        address[] memory members,
        address arbitrator,
        uint256 memberLimit,
        uint256 creationFee,
        uint256 createdAt,
        bool active,
        string memory description,
        uint256 peggedPublicMarketId,
        bool autoPegged,
        address paymentToken,
        uint256 liquidityAmount
    ) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];
        
        return (
            market.marketId,
            market.marketType,
            market.creator,
            market.members,
            market.arbitrator,
            market.memberLimit,
            market.creationFee,
            market.createdAt,
            market.active,
            market.description,
            market.peggedPublicMarketId,
            market.autoPegged,
            market.paymentToken,
            market.liquidityAmount
        );
    }
    
    /**
     * @notice Get your own markets (privacy-preserving: only callable by the user themselves)
     * @dev External callers cannot enumerate another user's bets. Use MemberAdded events for discovery.
     */
    function getMyMarkets() external view returns (uint256[] memory) {
        return userMarkets[msg.sender];
    }

    function isMember(uint256 friendMarketId, address user) public view returns (bool) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];
        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == user) return true;
        }
        return false;
    }
    
    /**
     * @notice Get member count for a market
     * @param friendMarketId ID of the friend market
     */
    function getMemberCount(uint256 friendMarketId) external view returns (uint256) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        return memberCount[friendMarketId];
    }
    
    // ========== Public Market Pegging (via FriendGroupResolutionLib) ==========

    function pegToPublicMarket(uint256 friendMarketId, uint256 publicMarketId) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        if (publicMarketId >= marketFactory.marketCount()) revert InvalidMarketId();

        FriendGroupResolutionLib.validatePegToPublicMarket(friendMarkets[friendMarketId], msg.sender);

        friendMarkets[friendMarketId].peggedPublicMarketId = publicMarketId;
        friendMarkets[friendMarketId].autoPegged = true;
        publicMarketToPeggedFriendMarkets[publicMarketId].push(friendMarketId);

        emit MarketPeggedToPublic(friendMarketId, publicMarketId);
    }

    function autoResolvePeggedMarket(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];
        if (market.peggedPublicMarketId == 0) revert NotPegged();

        ConditionalMarketFactory.Market memory publicMarket = marketFactory.getMarket(market.peggedPublicMarketId);
        if (!publicMarket.resolved) revert NotResolved();

        (bool outcome, address winner) = FriendGroupResolutionLib.computeAutoResolution(
            market, friendMarketId, publicMarket.passValue, publicMarket.failValue, market.peggedPublicMarketId, msg.sender
        );
        wagerOutcome[friendMarketId] = outcome;
        resolvedAt[friendMarketId] = block.timestamp;
        wagerWinner[friendMarketId] = winner;
    }

    function batchAutoResolvePeggedMarkets(uint256 publicMarketId) external nonReentrant {
        if (publicMarketId >= marketFactory.marketCount()) revert InvalidMarketId();

        ConditionalMarketFactory.Market memory publicMarket = marketFactory.getMarket(publicMarketId);
        if (!publicMarket.resolved) revert NotResolved();

        uint256[] storage peggedMarkets = publicMarketToPeggedFriendMarkets[publicMarketId];

        for (uint256 i = 0; i < peggedMarkets.length; i++) {
            uint256 fmId = peggedMarkets[i];
            FriendMarket storage market = friendMarkets[fmId];

            if (market.active && market.autoPegged) {
                (bool outcome, address winner) = FriendGroupResolutionLib.computeAutoResolution(
                    market, fmId, publicMarket.passValue, publicMarket.failValue, publicMarketId, msg.sender
                );
                wagerOutcome[fmId] = outcome;
                resolvedAt[fmId] = block.timestamp;
                wagerWinner[fmId] = winner;
            }
        }
    }

    // ========== Polymarket Oracle Integration Functions ==========

    function pegToPolymarketCondition(uint256 friendMarketId, bytes32 conditionId) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();

        FriendGroupResolutionLib.validatePegToPolymarket(friendMarkets[friendMarketId], conditionId, msg.sender, address(polymarketAdapter));

        polymarketAdapter.linkMarketToPolymarket(friendMarketId, conditionId);

        friendMarkets[friendMarketId].polymarketConditionId = conditionId;
        friendMarkets[friendMarketId].resolutionType = ResolutionType.PolymarketOracle;
        polymarketConditionToFriendMarkets[conditionId].push(friendMarketId);

        emit MarketPeggedToPolymarket(friendMarketId, conditionId);
    }

    function resolveFromPolymarket(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();

        (uint256 passNumerator, uint256 failNumerator, , bool resolved) =
            polymarketAdapter.getResolutionForMarket(friendMarketId);

        (bool outcome, address winner) = FriendGroupResolutionLib.computePolymarketResolution(
            friendMarkets[friendMarketId], friendMarketId, passNumerator, failNumerator, resolved, msg.sender
        );
        wagerOutcome[friendMarketId] = outcome;
        resolvedAt[friendMarketId] = block.timestamp;
        wagerWinner[friendMarketId] = winner;
    }

    function batchResolveFromPolymarket(bytes32 conditionId) external nonReentrant {
        if (address(polymarketAdapter) == address(0)) revert PolymarketAdapterNotSet();
        if (conditionId == bytes32(0)) revert InvalidConditionId();
        if (!polymarketAdapter.isConditionResolved(conditionId)) revert PolymarketNotResolved();

        (uint256 passNumerator, uint256 failNumerator, ) = polymarketAdapter.fetchResolution(conditionId);

        uint256[] storage peggedMarkets = polymarketConditionToFriendMarkets[conditionId];

        for (uint256 i = 0; i < peggedMarkets.length; i++) {
            uint256 fmId = peggedMarkets[i];
            FriendMarket storage market = friendMarkets[fmId];

            if (market.active && market.resolutionType == ResolutionType.PolymarketOracle) {
                (bool outcome, address winner) = FriendGroupResolutionLib.computePolymarketResolution(
                    market, fmId, passNumerator, failNumerator, true, msg.sender
                );
                wagerOutcome[fmId] = outcome;
                resolvedAt[fmId] = block.timestamp;
                wagerWinner[fmId] = winner;
            }
        }
    }

    /**
     * @notice Get all friend markets linked to a Polymarket condition
     * @param conditionId The Polymarket condition ID
     * @return Array of friend market IDs
     */
    function getFriendMarketsForPolymarketCondition(bytes32 conditionId) external view returns (uint256[] memory) {
        return polymarketConditionToFriendMarkets[conditionId];
    }

    // isPeggedToPolymarket removed - check polymarketConditionId from getFriendMarket off-chain

    /**
     * @notice Get Polymarket condition ID for a friend market
     * @param friendMarketId ID of the friend market
     */
    function getPolymarketConditionId(uint256 friendMarketId) external view returns (bytes32) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        return friendMarkets[friendMarketId].polymarketConditionId;
    }
    
    function resolveFriendMarket(uint256 friendMarketId, bool outcome) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendGroupResolutionLib.computeManualResolution(
            friendMarkets[friendMarketId], pendingResolutions[friendMarketId],
            friendMarketId, outcome, msg.sender, challengePeriod
        );
    }

    function challengeResolution(uint256 friendMarketId) external payable {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendGroupResolutionLib.computeChallenge(
            friendMarkets[friendMarketId], pendingResolutions[friendMarketId],
            friendMarketId, msg.sender, msg.value, challengeBond
        );
    }

    function finalizeResolution(uint256 friendMarketId) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        (bool outcome, address winner) = FriendGroupResolutionLib.computeFinalization(
            friendMarkets[friendMarketId], pendingResolutions[friendMarketId], friendMarketId
        );
        wagerOutcome[friendMarketId] = outcome;
        resolvedAt[friendMarketId] = block.timestamp;
        wagerWinner[friendMarketId] = winner;
    }

    function resolveDispute(uint256 friendMarketId, bool outcome) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        (bool finalOutcome, address winner, address bondRecipient, uint256 bondAmount) =
            FriendGroupResolutionLib.computeDisputeResolution(
                friendMarkets[friendMarketId], pendingResolutions[friendMarketId],
                friendMarketId, outcome, msg.sender, owner()
            );
        wagerOutcome[friendMarketId] = finalOutcome;
        resolvedAt[friendMarketId] = block.timestamp;
        wagerWinner[friendMarketId] = winner;
        if (bondAmount > 0) {
            (bool success, ) = payable(bondRecipient).call{value: bondAmount}("");
            if (!success) revert TransferFailed();
        }
    }

    // ========== Claim Functions ==========

    function claimWinnings(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        (uint256 amount, address token) = FriendGroupClaimsLib.computeClaim(
            friendMarkets[friendMarketId], friendMarketId,
            wagerWinner[friendMarketId], winningsClaimed[friendMarketId],
            marketTotalStaked[friendMarketId], msg.sender
        );
        winningsClaimed[friendMarketId] = true;
        _transferStake(token, msg.sender, amount);
    }

    function sweepUnclaimedFunds(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        (uint256 amount, address token) = FriendGroupClaimsLib.computeSweep(
            friendMarkets[friendMarketId], friendMarketId,
            winningsClaimed[friendMarketId], resolvedAt[friendMarketId],
            marketTotalStaked[friendMarketId], claimTimeout, treasury
        );
        winningsClaimed[friendMarketId] = true;
        _transferStake(token, treasury, amount);
    }

    // canSweepUnclaimedFunds removed - compute off-chain from resolvedAt + claimTimeout

    // ========== Oracle Timeout Functions ==========

    /**
     * @notice Set the expected resolution time for an oracle-pegged market
     * @dev Only callable by market creator for AutoPegged or PolymarketOracle markets
     * @param friendMarketId ID of the friend market
     * @param timestamp Expected timestamp when oracle should resolve
     */
    function setExpectedResolutionTime(uint256 friendMarketId, uint256 timestamp) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendGroupClaimsLib.validateSetExpectedResolutionTime(friendMarkets[friendMarketId], timestamp, msg.sender);
        expectedResolutionTime[friendMarketId] = timestamp;
        emit ExpectedResolutionTimeSet(friendMarketId, timestamp);
    }

    /**
     * @notice Trigger oracle timeout for a market that hasn't resolved
     * @dev Can only be called after expected resolution + oracleTimeout period
     * @param friendMarketId ID of the friend market
     */
    function triggerOracleTimeout(uint256 friendMarketId) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendGroupClaimsLib.computeOracleTimeout(
            friendMarkets[friendMarketId], friendMarketId,
            expectedResolutionTime[friendMarketId], oracleTimeout
        );
    }

    /**
     * @notice Accept mutual refund for a timed-out oracle market
     * @dev Both parties must accept for refund to complete
     * @param friendMarketId ID of the friend market
     */
    function acceptMutualRefund(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        bool allAccepted = FriendGroupClaimsLib.computeRefundAcceptance(
            friendMarkets[friendMarketId], friendMarketId,
            msg.sender, refundAccepted[friendMarketId][msg.sender], refundAcceptanceCount[friendMarketId]
        );
        refundAccepted[friendMarketId][msg.sender] = true;
        refundAcceptanceCount[friendMarketId]++;
        if (allAccepted) {
            _executeRefund(friendMarketId);
        }
    }

    /**
     * @notice Force manual resolution for a timed-out oracle market
     * @dev Only arbitrator (or owner as fallback) can force resolution
     * @param friendMarketId ID of the friend market
     * @param outcome The resolution outcome (true = creator wins)
     */
    function forceOracleResolution(uint256 friendMarketId, bool outcome) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        address winner = FriendGroupClaimsLib.computeForceResolution(
            friendMarkets[friendMarketId], friendMarketId, outcome, msg.sender, owner()
        );
        wagerOutcome[friendMarketId] = outcome;
        resolvedAt[friendMarketId] = block.timestamp;
        wagerWinner[friendMarketId] = winner;
    }

    /**
     * @dev Internal function to execute refund for all parties
     */
    function _executeRefund(uint256 friendMarketId) internal {
        FriendMarket storage market = friendMarkets[friendMarketId];
        market.status = FriendMarketStatus.Refunded;
        winningsClaimed[friendMarketId] = true;

        FriendGroupClaimsLib.computeRefund(market, friendMarketId);

        address token = market.stakeToken;
        uint256 stakePerPerson = market.stakePerParticipant;
        if (stakePerPerson > 0) {
            _transferStake(token, market.creator, stakePerPerson);
        }
        if (market.members.length > 1) {
            _transferStake(token, market.members[1], stakePerPerson);
        }
    }

    function _transferStake(address token, address recipient, uint256 amount) internal {
        FriendGroupCreationLib.transferStake(token, recipient, amount);
    }

    // canTriggerOracleTimeout removed - compute off-chain from expectedResolutionTime + oracleTimeout
    // getOracleTimeoutStatus removed - read individual fields via public mappings

    // getWagerResolution removed - use individual mappings: wagerWinner, wagerOutcome, winningsClaimed, resolvedAt, marketTotalStaked
    // getPendingResolution removed - use public pendingResolutions mapping directly

    // canFinalizeResolution removed - compute off-chain from pendingResolutions.challengeDeadline

    // ========== Multi-Oracle Registry Functions ==========

    /**
     * @notice Peg a friend market to any oracle condition via OracleRegistry
     * @param friendMarketId ID of the friend market
     * @param oracleId The oracle identifier in the registry (e.g., keccak256("CHAINLINK"))
     * @param conditionId The condition ID from the oracle adapter
     */
    function pegToOracleCondition(
        uint256 friendMarketId,
        bytes32 oracleId,
        bytes32 conditionId
    ) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        if (conditionId == bytes32(0)) revert InvalidConditionId();

        FriendGroupResolutionLib.validatePegToOracle(
            friendMarkets[friendMarketId],
            marketOracleCondition[friendMarketId],
            msg.sender,
            address(oracleRegistry)
        );

        // Verify oracle and condition exist
        address adapter = oracleRegistry.getAdapter(oracleId);
        if (adapter == address(0)) revert InvalidAddress();
        if (!IOracleAdapter(adapter).isConditionSupported(conditionId)) revert InvalidConditionId();

        marketOracleId[friendMarketId] = oracleId;
        marketOracleCondition[friendMarketId] = conditionId;
        friendMarkets[friendMarketId].resolutionType = ResolutionType.PolymarketOracle;

        emit MarketPeggedToOracle(friendMarketId, oracleId, conditionId);
    }

    /**
     * @notice Resolve a friend market from its linked oracle condition
     * @param friendMarketId ID of the friend market
     */
    function resolveFromOracle(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        if (address(oracleRegistry) == address(0)) revert OracleRegistryNotSet();

        bytes32 oracleId = marketOracleId[friendMarketId];
        bytes32 conditionId = marketOracleCondition[friendMarketId];
        (bool outcome, uint256 confidence) = oracleRegistry.resolveCondition(oracleId, conditionId);

        address winner = FriendGroupResolutionLib.computeOracleResolution(
            friendMarkets[friendMarketId],
            friendMarketId,
            oracleId,
            conditionId,
            outcome,
            confidence,
            msg.sender
        );

        wagerOutcome[friendMarketId] = outcome;
        wagerWinner[friendMarketId] = winner;
        resolvedAt[friendMarketId] = block.timestamp;
    }

    // isPeggedToOracle removed - check marketOracleCondition mapping off-chain
    // getOracleInfo removed - read marketOracleId/marketOracleCondition mappings off-chain
    // checkOracleResolution removed - query oracle adapter directly off-chain

    /**
     * @notice Withdraw accumulated fees (owner only)
     */
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert InsufficientPayment();

        (bool success, ) = payable(owner()).call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    function updateMarketFactory(address _marketFactory) external onlyOwner {
        if (_marketFactory == address(0)) revert InvalidAddress();
        marketFactory = ConditionalMarketFactory(_marketFactory);
    }

    function updateRagequitModule(address payable _ragequitModule) external onlyOwner {
        if (_ragequitModule == address(0)) revert InvalidAddress();
        ragequitModule = RagequitModule(_ragequitModule);
    }

    function getPeggedFriendMarkets(uint256 publicMarketId) external view returns (uint256[] memory) {
        if (publicMarketId >= marketFactory.marketCount()) revert InvalidMarketId();
        return publicMarketToPeggedFriendMarkets[publicMarketId];
    }

    /**
     * @notice Get list of accepted payment tokens (returns full list, check acceptedPaymentTokens for status)
     */
    function getAcceptedTokens() external view returns (address[] memory) {
        return acceptedTokenList;
    }
    
    receive() external payable {}
}
