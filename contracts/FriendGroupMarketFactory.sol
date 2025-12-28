// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ConditionalMarketFactory.sol";
import "./RagequitModule.sol";

/**
 * @title FriendGroupMarketFactory
 * @notice Factory for creating small-scale prediction markets between friends
 * @dev Supports P2P betting with reduced costs and member limits
 * 
 * KEY FEATURES:
 * - Reduced creation costs for friend group markets
 * - Member limit enforcement to prevent bypassing public markets
 * - Support for 1v1 bets, group prop bets, and poker night scenarios
 * - Optional third-party arbitration
 * - Integration with RagequitModule for fair exits
 * 
 * USE CASES:
 * 1. Home poker night tracking
 * 2. 1v1 prop bets between friends
 * 3. Small group predictions with arbitrator
 * 4. Friend group contests and competitions
 */
contract FriendGroupMarketFactory is Ownable, ReentrancyGuard {
    
    // Market type to distinguish friend markets from public markets
    enum MarketType {
        OneVsOne,           // 1v1 direct bet between two parties
        SmallGroup,         // 3-10 participants
        PokerNight,         // Tracking for poker games
        PropBet             // General proposition bet
    }
    
    struct FriendMarket {
        uint256 marketId;              // ID in ConditionalMarketFactory
        MarketType marketType;
        address creator;
        address[] members;             // Limited participant list
        address arbitrator;            // Optional third-party for resolution
        uint256 memberLimit;           // Max concurrent members
        uint256 creationFee;           // Reduced fee for friend markets
        uint256 createdAt;
        bool active;
        string description;
        uint256 peggedPublicMarketId;  // Public market ID to peg resolution to (0 = none)
        bool autoPegged;               // Whether resolution is pegged to public market
    }
    
    // Friend market ID => FriendMarket
    mapping(uint256 => FriendMarket) public friendMarkets;
    
    // User => array of friend market IDs they're in
    mapping(address => uint256[]) public userMarkets;
    
    // Member count tracking per market
    mapping(uint256 => uint256) public memberCount;
    
    // Track which public markets have pegged friend markets
    mapping(uint256 => uint256[]) public publicMarketToPeggedFriendMarkets;
    
    uint256 public friendMarketCount;
    
    // Reference to main market factory
    ConditionalMarketFactory public marketFactory;
    
    // Reference to ragequit module
    RagequitModule public ragequitModule;
    
    // Pricing tiers
    uint256 public constant PUBLIC_MARKET_FEE = 1 ether;      // Standard market fee
    uint256 public constant FRIEND_MARKET_FEE = 0.1 ether;    // Reduced fee for friend markets
    uint256 public constant ONE_V_ONE_FEE = 0.05 ether;       // Even lower for 1v1
    
    // Member limits
    uint256 public constant MAX_SMALL_GROUP_MEMBERS = 10;
    uint256 public constant MAX_ONE_V_ONE_MEMBERS = 2;
    uint256 public constant MIN_POKER_NIGHT_MEMBERS = 3;
    uint256 public constant MAX_POKER_NIGHT_MEMBERS = 10;
    
    // Events
    event FriendMarketCreated(
        uint256 indexed friendMarketId,
        uint256 indexed underlyingMarketId,
        MarketType marketType,
        address indexed creator,
        uint256 memberLimit,
        uint256 creationFee
    );
    
    event MemberAdded(
        uint256 indexed friendMarketId,
        address indexed member,
        uint256 timestamp
    );
    
    event MemberRemoved(
        uint256 indexed friendMarketId,
        address indexed member,
        uint256 timestamp
    );
    
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
    
    constructor(address _marketFactory, address payable _ragequitModule) Ownable(msg.sender) {
        require(_marketFactory != address(0), "Invalid market factory");
        require(_ragequitModule != address(0), "Invalid ragequit module");
        marketFactory = ConditionalMarketFactory(_marketFactory);
        ragequitModule = RagequitModule(_ragequitModule);
    }
    
    /**
     * @notice Create a 1v1 friend market for direct betting
     * @param opponent Address of the other party
     * @param description Description of the bet
     * @param tradingPeriod Duration of trading
     * @param arbitrator Optional third-party arbitrator
     * @param peggedPublicMarketId Optional public market ID to peg resolution to (0 = none)
     * @return friendMarketId ID of created friend market
     */
    function createOneVsOneMarket(
        address opponent,
        string memory description,
        uint256 tradingPeriod,
        address arbitrator,
        uint256 peggedPublicMarketId
    ) external payable nonReentrant returns (uint256 friendMarketId) {
        require(msg.value >= ONE_V_ONE_FEE, "Insufficient creation fee");
        require(opponent != address(0), "Invalid opponent");
        require(opponent != msg.sender, "Cannot bet against yourself");
        require(bytes(description).length > 0, "Description required");
        
        // Validate pegged market if provided
        if (peggedPublicMarketId > 0) {
            require(peggedPublicMarketId < marketFactory.marketCount(), "Invalid public market ID");
        }
        
        // Create underlying market in ConditionalMarketFactory
        uint256 proposalId = friendMarketCount + 1000000; // Offset to avoid collision
        uint256 underlyingMarketId = marketFactory.deployMarketPair(
            proposalId,
            address(0), // ETH collateral
            msg.value - ONE_V_ONE_FEE, // Remaining value as liquidity
            0.01 ether, // Small liquidity parameter
            tradingPeriod,
            ConditionalMarketFactory.BetType.YesNo
        );
        
        // Create friend market
        friendMarketId = friendMarketCount++;
        
        address[] memory members = new address[](2);
        members[0] = msg.sender;
        members[1] = opponent;
        
        friendMarkets[friendMarketId] = FriendMarket({
            marketId: underlyingMarketId,
            marketType: MarketType.OneVsOne,
            creator: msg.sender,
            members: members,
            arbitrator: arbitrator,
            memberLimit: MAX_ONE_V_ONE_MEMBERS,
            creationFee: ONE_V_ONE_FEE,
            createdAt: block.timestamp,
            active: true,
            description: description,
            peggedPublicMarketId: peggedPublicMarketId,
            autoPegged: peggedPublicMarketId > 0
        });
        
        memberCount[friendMarketId] = 2;
        userMarkets[msg.sender].push(friendMarketId);
        userMarkets[opponent].push(friendMarketId);
        
        // Track pegging relationship
        if (peggedPublicMarketId > 0) {
            publicMarketToPeggedFriendMarkets[peggedPublicMarketId].push(friendMarketId);
            emit MarketPeggedToPublic(friendMarketId, peggedPublicMarketId);
        }
        
        emit FriendMarketCreated(
            friendMarketId,
            underlyingMarketId,
            MarketType.OneVsOne,
            msg.sender,
            MAX_ONE_V_ONE_MEMBERS,
            ONE_V_ONE_FEE
        );
        
        emit MemberAdded(friendMarketId, msg.sender, block.timestamp);
        emit MemberAdded(friendMarketId, opponent, block.timestamp);
        
        if (arbitrator != address(0)) {
            emit ArbitratorSet(friendMarketId, arbitrator);
        }
    }
    
    /**
     * @notice Create a small group market for friend predictions
     * @param description Description of the market
     * @param initialMembers Initial member addresses
     * @param memberLimit Maximum number of concurrent members
     * @param tradingPeriod Duration of trading
     * @param arbitrator Optional third-party arbitrator
     * @param peggedPublicMarketId Optional public market ID to peg resolution to (0 = none)
     * @return friendMarketId ID of created friend market
     */
    function createSmallGroupMarket(
        string memory description,
        address[] memory initialMembers,
        uint256 memberLimit,
        uint256 tradingPeriod,
        address arbitrator,
        uint256 peggedPublicMarketId
    ) external payable nonReentrant returns (uint256 friendMarketId) {
        require(msg.value >= FRIEND_MARKET_FEE, "Insufficient creation fee");
        require(bytes(description).length > 0, "Description required");
        require(memberLimit > 2 && memberLimit <= MAX_SMALL_GROUP_MEMBERS, "Invalid member limit");
        require(initialMembers.length > 0 && initialMembers.length <= memberLimit, "Invalid initial members");
        
        // Validate no duplicate members
        for (uint256 i = 0; i < initialMembers.length; i++) {
            require(initialMembers[i] != address(0), "Invalid member address");
            for (uint256 j = i + 1; j < initialMembers.length; j++) {
                require(initialMembers[i] != initialMembers[j], "Duplicate member");
            }
        }
        
        // Validate pegged market if provided
        if (peggedPublicMarketId > 0) {
            require(peggedPublicMarketId < marketFactory.marketCount(), "Invalid public market ID");
        }
        
        // Create underlying market
        uint256 proposalId = friendMarketCount + 1000000;
        uint256 underlyingMarketId = marketFactory.deployMarketPair(
            proposalId,
            address(0), // ETH collateral
            msg.value - FRIEND_MARKET_FEE,
            0.1 ether, // Medium liquidity parameter
            tradingPeriod,
            ConditionalMarketFactory.BetType.YesNo
        );
        
        // Create friend market
        friendMarketId = friendMarketCount++;
        
        friendMarkets[friendMarketId] = FriendMarket({
            marketId: underlyingMarketId,
            marketType: MarketType.SmallGroup,
            creator: msg.sender,
            members: initialMembers,
            arbitrator: arbitrator,
            memberLimit: memberLimit,
            creationFee: FRIEND_MARKET_FEE,
            createdAt: block.timestamp,
            active: true,
            description: description,
            peggedPublicMarketId: peggedPublicMarketId,
            autoPegged: peggedPublicMarketId > 0
        });
        
        memberCount[friendMarketId] = initialMembers.length;
        
        // Add members to user markets mapping
        for (uint256 i = 0; i < initialMembers.length; i++) {
            userMarkets[initialMembers[i]].push(friendMarketId);
            emit MemberAdded(friendMarketId, initialMembers[i], block.timestamp);
        }
        
        // Track pegging relationship
        if (peggedPublicMarketId > 0) {
            publicMarketToPeggedFriendMarkets[peggedPublicMarketId].push(friendMarketId);
            emit MarketPeggedToPublic(friendMarketId, peggedPublicMarketId);
        }
        
        emit FriendMarketCreated(
            friendMarketId,
            underlyingMarketId,
            MarketType.SmallGroup,
            msg.sender,
            memberLimit,
            FRIEND_MARKET_FEE
        );
        
        if (arbitrator != address(0)) {
            emit ArbitratorSet(friendMarketId, arbitrator);
        }
    }
    
    /**
     * @notice Create a poker night market for tracking games
     * @param description Description of the poker night
     * @param players Array of player addresses
     * @param tradingPeriod Duration of the poker night
     * @param peggedPublicMarketId Optional public market ID to peg resolution to (0 = none)
     * @return friendMarketId ID of created friend market
     */
    function createPokerNightMarket(
        string memory description,
        address[] memory players,
        uint256 tradingPeriod,
        uint256 peggedPublicMarketId
    ) external payable nonReentrant returns (uint256 friendMarketId) {
        require(msg.value >= FRIEND_MARKET_FEE, "Insufficient creation fee");
        require(bytes(description).length > 0, "Description required");
        require(
            players.length >= MIN_POKER_NIGHT_MEMBERS && 
            players.length <= MAX_POKER_NIGHT_MEMBERS,
            "Invalid number of players"
        );
        
        // Validate no duplicate players
        for (uint256 i = 0; i < players.length; i++) {
            require(players[i] != address(0), "Invalid player address");
            for (uint256 j = i + 1; j < players.length; j++) {
                require(players[i] != players[j], "Duplicate player");
            }
        }
        
        // Validate pegged market if provided
        if (peggedPublicMarketId > 0) {
            require(peggedPublicMarketId < marketFactory.marketCount(), "Invalid public market ID");
        }
        
        // Create underlying market
        uint256 proposalId = friendMarketCount + 1000000;
        uint256 underlyingMarketId = marketFactory.deployMarketPair(
            proposalId,
            address(0), // ETH collateral
            msg.value - FRIEND_MARKET_FEE,
            0.1 ether,
            tradingPeriod,
            ConditionalMarketFactory.BetType.WinLose
        );
        
        // Create friend market
        friendMarketId = friendMarketCount++;
        
        friendMarkets[friendMarketId] = FriendMarket({
            marketId: underlyingMarketId,
            marketType: MarketType.PokerNight,
            creator: msg.sender,
            members: players,
            arbitrator: address(0), // No arbitrator for poker
            memberLimit: MAX_POKER_NIGHT_MEMBERS,
            creationFee: FRIEND_MARKET_FEE,
            createdAt: block.timestamp,
            active: true,
            description: description,
            peggedPublicMarketId: peggedPublicMarketId,
            autoPegged: peggedPublicMarketId > 0
        });
        
        memberCount[friendMarketId] = players.length;
        
        for (uint256 i = 0; i < players.length; i++) {
            userMarkets[players[i]].push(friendMarketId);
            emit MemberAdded(friendMarketId, players[i], block.timestamp);
        }
        
        // Track pegging relationship
        if (peggedPublicMarketId > 0) {
            publicMarketToPeggedFriendMarkets[peggedPublicMarketId].push(friendMarketId);
            emit MarketPeggedToPublic(friendMarketId, peggedPublicMarketId);
        }
        
        emit FriendMarketCreated(
            friendMarketId,
            underlyingMarketId,
            MarketType.PokerNight,
            msg.sender,
            MAX_POKER_NIGHT_MEMBERS,
            FRIEND_MARKET_FEE
        );
    }
    
    /**
     * @notice Add a member to an existing small group market
     * @param friendMarketId ID of the friend market
     * @param newMember Address of new member
     */
    function addMember(uint256 friendMarketId, address newMember) external {
        require(friendMarketId < friendMarketCount, "Invalid market ID");
        FriendMarket storage market = friendMarkets[friendMarketId];
        require(market.active, "Market not active");
        require(msg.sender == market.creator, "Only creator can add members");
        require(newMember != address(0), "Invalid member address");
        require(memberCount[friendMarketId] < market.memberLimit, "Member limit reached");
        
        // Check if already a member
        for (uint256 i = 0; i < market.members.length; i++) {
            require(market.members[i] != newMember, "Already a member");
        }
        
        market.members.push(newMember);
        memberCount[friendMarketId]++;
        userMarkets[newMember].push(friendMarketId);
        
        emit MemberAdded(friendMarketId, newMember, block.timestamp);
    }
    
    /**
     * @notice Remove a member from a market (ragequit-like functionality)
     * @param friendMarketId ID of the friend market
     */
    function removeSelf(uint256 friendMarketId) external nonReentrant {
        require(friendMarketId < friendMarketCount, "Invalid market ID");
        FriendMarket storage market = friendMarkets[friendMarketId];
        require(market.active, "Market not active");
        
        // Find and remove member
        bool found = false;
        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == msg.sender) {
                // Swap with last element and pop
                market.members[i] = market.members[market.members.length - 1];
                market.members.pop();
                memberCount[friendMarketId]--;
                found = true;
                break;
            }
        }
        
        require(found, "Not a member");
        
        emit MemberRemoved(friendMarketId, msg.sender, block.timestamp);
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
        bool autoPegged
    ) {
        require(friendMarketId < friendMarketCount, "Invalid market ID");
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
            market.autoPegged
        );
    }
    
    /**
     * @notice Get all markets for a user
     * @param user Address of the user
     */
    function getUserMarkets(address user) external view returns (uint256[] memory) {
        return userMarkets[user];
    }
    
    /**
     * @notice Check if user is a member of a market
     * @param friendMarketId ID of the friend market
     * @param user Address to check
     */
    function isMember(uint256 friendMarketId, address user) public view returns (bool) {
        require(friendMarketId < friendMarketCount, "Invalid market ID");
        FriendMarket storage market = friendMarkets[friendMarketId];
        
        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == user) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * @notice Get member count for a market
     * @param friendMarketId ID of the friend market
     */
    function getMemberCount(uint256 friendMarketId) external view returns (uint256) {
        require(friendMarketId < friendMarketCount, "Invalid market ID");
        return memberCount[friendMarketId];
    }
    
    /**
     * @notice Peg an existing friend market to a public market
     * @param friendMarketId ID of the friend market
     * @param publicMarketId ID of the public market to peg to
     */
    function pegToPublicMarket(uint256 friendMarketId, uint256 publicMarketId) external {
        require(friendMarketId < friendMarketCount, "Invalid friend market ID");
        require(publicMarketId < marketFactory.marketCount(), "Invalid public market ID");
        
        FriendMarket storage market = friendMarkets[friendMarketId];
        require(market.active, "Market not active");
        require(msg.sender == market.creator, "Only creator can peg market");
        require(!market.autoPegged, "Already pegged");
        
        market.peggedPublicMarketId = publicMarketId;
        market.autoPegged = true;
        
        publicMarketToPeggedFriendMarkets[publicMarketId].push(friendMarketId);
        emit MarketPeggedToPublic(friendMarketId, publicMarketId);
    }
    
    /**
     * @notice Automatically resolve friend market based on pegged public market
     * @param friendMarketId ID of the friend market
     */
    function autoResolvePeggedMarket(uint256 friendMarketId) external nonReentrant {
        require(friendMarketId < friendMarketCount, "Invalid friend market ID");
        
        FriendMarket storage market = friendMarkets[friendMarketId];
        require(market.active, "Market not active");
        require(market.autoPegged, "Market not pegged");
        require(market.peggedPublicMarketId > 0, "No pegged market");
        
        // Get the public market resolution
        ConditionalMarketFactory.Market memory publicMarket = marketFactory.getMarket(market.peggedPublicMarketId);
        require(publicMarket.resolved, "Public market not resolved");
        
        // Resolve friend market based on public market outcome
        market.active = false;
        
        emit PeggedMarketAutoResolved(
            friendMarketId,
            market.peggedPublicMarketId,
            publicMarket.passValue,
            publicMarket.failValue
        );
        
        // Also emit standard resolution event
        bool outcome = publicMarket.passValue > publicMarket.failValue;
        emit MarketResolved(friendMarketId, msg.sender, outcome);
    }
    
    /**
     * @notice Batch resolve all pegged markets for a resolved public market
     * @param publicMarketId ID of the resolved public market
     */
    function batchAutoResolvePeggedMarkets(uint256 publicMarketId) external nonReentrant {
        require(publicMarketId < marketFactory.marketCount(), "Invalid public market ID");
        
        // Verify public market is resolved
        ConditionalMarketFactory.Market memory publicMarket = marketFactory.getMarket(publicMarketId);
        require(publicMarket.resolved, "Public market not resolved");
        
        uint256[] storage peggedMarkets = publicMarketToPeggedFriendMarkets[publicMarketId];
        
        for (uint256 i = 0; i < peggedMarkets.length; i++) {
            uint256 friendMarketId = peggedMarkets[i];
            FriendMarket storage market = friendMarkets[friendMarketId];
            
            if (market.active && market.autoPegged) {
                market.active = false;
                
                emit PeggedMarketAutoResolved(
                    friendMarketId,
                    publicMarketId,
                    publicMarket.passValue,
                    publicMarket.failValue
                );
                
                bool outcome = publicMarket.passValue > publicMarket.failValue;
                emit MarketResolved(friendMarketId, msg.sender, outcome);
            }
        }
    }
    
    /**
     * @notice Resolve a friend market (by arbitrator or creator)
     * @param friendMarketId ID of the friend market
     * @param outcome True for positive outcome, false for negative
     */
    function resolveFriendMarket(uint256 friendMarketId, bool outcome) external {
        require(friendMarketId < friendMarketCount, "Invalid market ID");
        FriendMarket storage market = friendMarkets[friendMarketId];
        require(market.active, "Market not active");
        require(!market.autoPegged, "Cannot manually resolve pegged market");
        
        // Only arbitrator or creator can resolve
        bool canResolve = msg.sender == market.creator || 
                         (market.arbitrator != address(0) && msg.sender == market.arbitrator);
        require(canResolve, "Not authorized to resolve");
        
        market.active = false;
        
        // Resolve underlying market
        // Note: In production, this would need proper oracle integration
        // For now, we emit an event for tracking
        emit MarketResolved(friendMarketId, msg.sender, outcome);
    }
    
    /**
     * @notice Withdraw accumulated fees (owner only)
     */
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    /**
     * @notice Update market factory reference (owner only)
     * @param _marketFactory New market factory address
     */
    function updateMarketFactory(address _marketFactory) external onlyOwner {
        require(_marketFactory != address(0), "Invalid address");
        marketFactory = ConditionalMarketFactory(_marketFactory);
    }
    
    /**
     * @notice Update ragequit module reference (owner only)
     * @param _ragequitModule New ragequit module address
     */
    function updateRagequitModule(address payable _ragequitModule) external onlyOwner {
        require(_ragequitModule != address(0), "Invalid address");
        ragequitModule = RagequitModule(_ragequitModule);
    }
    
    /**
     * @notice Get all friend markets pegged to a public market
     * @param publicMarketId ID of the public market
     * @return Array of pegged friend market IDs
     */
    function getPeggedFriendMarkets(uint256 publicMarketId) external view returns (uint256[] memory) {
        require(publicMarketId < marketFactory.marketCount(), "Invalid public market ID");
        return publicMarketToPeggedFriendMarkets[publicMarketId];
    }
    
    receive() external payable {}
}
