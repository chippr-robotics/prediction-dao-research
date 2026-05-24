// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWagerRegistry
/// @notice Public surface area for off-chain integrators (frontend, indexers).
interface IWagerRegistry {
    enum ResolutionType { Either, Creator, Opponent, ThirdParty, Polymarket, ChainlinkDataFeed, ChainlinkFunctions, UMA }
    enum Status { None, Open, Active, Resolved, Cancelled, Refunded }

    struct Wager {
        address creator;
        address opponent;
        address arbitrator;
        address token;
        uint128 creatorStake;
        uint128 opponentStake;
        uint64  acceptDeadline;
        uint64  resolveDeadline;
        ResolutionType resolutionType;
        Status  status;
        bool    paid;
        bool    creatorIsYes;
        address winner;
        bytes32 metadataHash;
        bytes32 polymarketConditionId;
        string  metadataUri;
    }

    event WagerCreated(
        uint256 indexed wagerId,
        address indexed creator,
        address indexed opponent,
        address token,
        uint128 creatorStake,
        uint128 opponentStake,
        ResolutionType resolutionType,
        bytes32 metadataHash,
        string  metadataUri
    );
    event WagerAccepted(uint256 indexed wagerId, address indexed opponent);
    event WagerCancelled(uint256 indexed wagerId);
    event WagerDeclined(uint256 indexed wagerId, address indexed opponent);
    event WagerResolved(uint256 indexed wagerId, address indexed winner, address indexed by);
    event WagerRefunded(uint256 indexed wagerId, address indexed creator, address indexed opponent);
    event PayoutClaimed(uint256 indexed wagerId, address indexed winner, uint256 amount);
    event PolymarketLinked(uint256 indexed wagerId, bytes32 indexed conditionId, bool creatorIsYes);
    event OracleAdapterUpdated(ResolutionType indexed resolutionType, address indexed adapter);
    event OracleConditionLinked(
        uint256 indexed wagerId,
        ResolutionType indexed resolutionType,
        bytes32 indexed conditionId,
        bool creatorIsYes
    );

    event AccountFrozen(address indexed user, address indexed by, string reason);
    event AccountUnfrozen(address indexed user, address indexed by);

    function createWager(
        address opponent,
        address arbitrator,
        address token,
        uint128 creatorStake,
        uint128 opponentStake,
        uint64 acceptDeadline,
        uint64 resolveDeadline,
        ResolutionType resolutionType,
        bytes32 polymarketConditionId,
        bool creatorIsYes,
        bytes32 metadataHash,
        string calldata metadataUri
    ) external returns (uint256 wagerId);

    function acceptWager(uint256 wagerId) external;
    function cancelOpen(uint256 wagerId) external;
    function declineWager(uint256 wagerId) external;
    function declareWinner(uint256 wagerId, address winner) external;
    function autoResolveFromPolymarket(uint256 wagerId) external;
    function autoResolveFromOracle(uint256 wagerId) external;
    function claimPayout(uint256 wagerId) external;
    function claimRefund(uint256 wagerId) external;
    function batchExpireOpen(uint256[] calldata wagerIds) external;

    function freezeAccount(address user, string calldata reason) external;
    function unfreezeAccount(address user) external;
    function isFrozen(address user) external view returns (bool);

    function getWager(uint256 wagerId) external view returns (Wager memory);
    function isAllowedToken(address token) external view returns (bool);
    function nextWagerId() external view returns (uint256);

    function getUserWagerCount(address user) external view returns (uint256);
    function getUserWagerIds(address user, uint256 offset, uint256 limit) external view returns (uint256[] memory);
    function getUserWagers(address user, uint256 offset, uint256 limit) external view returns (Wager[] memory);
}
