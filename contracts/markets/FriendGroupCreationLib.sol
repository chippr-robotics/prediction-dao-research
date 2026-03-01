// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./FriendGroupMarketTypes.sol";
import "./ConditionalMarketFactory.sol";

/**
 * @title FriendGroupCreationLib
 * @notice External library for market creation, acceptance, activation, and member management
 * @dev Uses storage references to avoid struct encoding overhead. Deployed separately via DELEGATECALL.
 */
library FriendGroupCreationLib {
    // Errors (redeclared to match main contract selectors)
    error NotPending();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error AlreadyAccepted();
    error NotInvited();
    error NotActive();
    error NotAuthorized();
    error InvalidMember();
    error MemberLimitReached();
    error AlreadyMember();
    error NotMember();
    error TransferFailed();

    // Events (emitted via DELEGATECALL, appear as main contract events)
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
    event MemberAdded(uint256 indexed friendMarketId, address indexed member);
    event ArbitratorSet(uint256 indexed friendMarketId, address indexed arbitrator);
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
    event StakeRefunded(
        uint256 indexed friendMarketId,
        address indexed participant,
        uint256 amount
    );
    event AcceptanceDeadlinePassed(
        uint256 indexed friendMarketId,
        uint256 deadline,
        uint256 acceptedCount,
        uint256 requiredCount
    );
    event MemberRemoved(uint256 indexed friendMarketId, address indexed member);
    event MarketCancelledByCreator(
        uint256 indexed friendMarketId,
        address indexed creator,
        uint256 cancelledAt
    );

    // ========== Market Initialization ==========

    function initializeMarket(
        FriendMarket storage market,
        AcceptanceRecord storage creatorAcceptance,
        uint256 friendMarketId,
        MarketType marketType,
        address creator,
        address[] memory members,
        address arbitrator,
        uint256 memberLimit,
        string memory description,
        uint256 acceptanceDeadline,
        uint256 minAcceptanceThreshold,
        uint256 stakePerParticipant,
        address stakeToken,
        uint256 tradingPeriodSeconds,
        uint16 opponentOddsMultiplier,
        ResolutionType resolutionType,
        uint256 creatorStakedAmount
    ) public {
        // Write market fields individually (avoids expensive struct literal bytecode)
        market.marketId = 0;
        market.marketType = marketType;
        market.creator = creator;
        market.members = members;
        market.arbitrator = arbitrator;
        market.memberLimit = memberLimit;
        market.creationFee = 0;
        market.createdAt = block.timestamp;
        market.active = false;
        market.description = description;
        market.peggedPublicMarketId = 0;
        market.autoPegged = false;
        market.paymentToken = stakeToken;
        market.liquidityAmount = 0;
        market.status = FriendMarketStatus.PendingAcceptance;
        market.acceptanceDeadline = acceptanceDeadline;
        market.minAcceptanceThreshold = minAcceptanceThreshold;
        market.stakePerParticipant = stakePerParticipant;
        market.stakeToken = stakeToken;
        market.tradingPeriodSeconds = tradingPeriodSeconds;
        market.opponentOddsMultiplier = opponentOddsMultiplier;
        market.resolutionType = resolutionType;
        market.polymarketConditionId = bytes32(0);

        // Initialize creator acceptance record
        creatorAcceptance.participant = creator;
        creatorAcceptance.stakedAmount = creatorStakedAmount;
        creatorAcceptance.acceptedAt = block.timestamp;
        creatorAcceptance.hasAccepted = true;
        creatorAcceptance.isArbitrator = false;

        // Emit member events
        for (uint256 i = 0; i < members.length; i++) {
            emit MemberAdded(friendMarketId, members[i]);
        }

        emit MarketCreatedPending(
            friendMarketId,
            creator,
            acceptanceDeadline,
            stakePerParticipant,
            opponentOddsMultiplier,
            stakeToken,
            members,
            arbitrator
        );

        if (arbitrator != address(0)) {
            emit ArbitratorSet(friendMarketId, arbitrator);
        }
    }

    // ========== Acceptance ==========

    function validateAcceptance(
        FriendMarket storage market,
        bool alreadyAccepted,
        address caller
    ) public view returns (bool isInvited, bool isArbitrator) {
        if (market.status != FriendMarketStatus.PendingAcceptance) revert NotPending();
        if (block.timestamp >= market.acceptanceDeadline) revert DeadlinePassed();
        if (alreadyAccepted) revert AlreadyAccepted();

        isArbitrator = market.arbitrator == caller;
        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == caller) {
                isInvited = true;
                break;
            }
        }
        if (!isInvited && !isArbitrator) revert NotInvited();
    }

    // ========== Activation ==========

    function activateMarket(
        FriendMarket storage market,
        uint256 friendMarketId,
        uint256 totalStaked,
        address defaultCollateral,
        ConditionalMarketFactory mf,
        uint256 acceptedCount
    ) public {
        uint256 proposalId = uint256(keccak256(abi.encodePacked(address(this), friendMarketId)));
        address collateral = defaultCollateral != address(0) ? defaultCollateral : market.stakeToken;

        if (collateral != address(0)) {
            IERC20(collateral).approve(address(mf), totalStaked);
        }

        uint256 underlyingMarketId = mf.deployMarketPair(
            proposalId,
            collateral,
            totalStaked,
            0.01 ether,
            market.tradingPeriodSeconds,
            ConditionalMarketFactory.BetType.YesNo
        );

        market.marketId = underlyingMarketId;
        market.status = FriendMarketStatus.Active;
        market.active = true;
        market.liquidityAmount = totalStaked;

        emit MarketActivated(friendMarketId, underlyingMarketId, block.timestamp, totalStaked, acceptedCount);
    }

    // ========== Refunds ==========

    function refundAllStakes(
        FriendMarket storage market,
        mapping(uint256 => mapping(address => AcceptanceRecord)) storage acceptances,
        uint256 friendMarketId
    ) public {
        for (uint256 i = 0; i < market.members.length; i++) {
            address participant = market.members[i];
            AcceptanceRecord storage record = acceptances[friendMarketId][participant];
            if (record.hasAccepted && record.stakedAmount > 0) {
                _transferStake(participant, market.stakeToken, record.stakedAmount);
                emit StakeRefunded(friendMarketId, participant, record.stakedAmount);
            }
        }
    }

    // ========== Deadline Processing ==========

    function processExpiredDeadline(
        FriendMarket storage market,
        uint256 friendMarketId,
        uint256 acceptedCount,
        bool arbitratorAccepted
    ) public returns (bool shouldActivate) {
        if (market.status != FriendMarketStatus.PendingAcceptance) revert NotPending();
        if (block.timestamp < market.acceptanceDeadline) revert DeadlineNotPassed();

        bool arbitratorOk = market.arbitrator == address(0) || arbitratorAccepted;
        shouldActivate = acceptedCount >= market.minAcceptanceThreshold && arbitratorOk;

        if (!shouldActivate) {
            market.status = FriendMarketStatus.Refunded;
            emit AcceptanceDeadlinePassed(
                friendMarketId, market.acceptanceDeadline, acceptedCount, market.minAcceptanceThreshold
            );
        }
    }

    // ========== Member Management ==========

    function validateAddMember(
        FriendMarket storage market,
        uint256 currentMemberCount,
        address caller,
        address newMember
    ) public view {
        if (!market.active) revert NotActive();
        if (caller != market.creator) revert NotAuthorized();
        if (newMember == address(0)) revert InvalidMember();
        if (currentMemberCount >= market.memberLimit) revert MemberLimitReached();
        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == newMember) revert AlreadyMember();
        }
    }

    function executeRemoveSelf(
        FriendMarket storage market,
        uint256 fmId,
        address caller
    ) public {
        if (!market.active) revert NotActive();
        bool found = false;
        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == caller) {
                market.members[i] = market.members[market.members.length - 1];
                market.members.pop();
                found = true;
                break;
            }
        }
        if (!found) revert NotMember();
        emit MemberRemoved(fmId, caller);
    }

    // ========== Transfer Helpers ==========

    /**
     * @notice Public transfer function to avoid inlining overhead in main contract
     * @dev Called by main contract for claim, sweep, refund, and dispute transfers
     */
    function transferStake(address token, address recipient, uint256 amount) public {
        if (token == address(0)) {
            (bool success, ) = payable(recipient).call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            (bool success, bytes memory returnData) = token.call(
                abi.encodeWithSelector(IERC20.transfer.selector, recipient, amount)
            );
            if (!success) revert TransferFailed();
            if (returnData.length > 0 && !abi.decode(returnData, (bool))) revert TransferFailed();
        }
    }

    function _transferStake(address recipient, address token, uint256 amount) private {
        transferStake(token, recipient, amount);
    }
}
