// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWagerRegistryTypes
/// @notice Shared enums, structs, and events for the WagerRegistry system. Split from
///         {IWagerRegistry} (spec 035) so both registry facets — the main {WagerRegistry}
///         implementation and the {WagerRegistryIntents} extension — reference one
///         declaration set without inheriting the full function surface.
interface IWagerRegistryTypes {
    enum ResolutionType { Either, Creator, Opponent, ThirdParty, Polymarket, ChainlinkDataFeed, ChainlinkFunctions, UMA }
    enum Status { None, Open, Active, Resolved, Cancelled, Refunded, Draw }

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
    event WagerDrawn(uint256 indexed wagerId, address indexed creator, address indexed opponent, address by);
    event DrawProposed(uint256 indexed wagerId, address indexed proposer);
    event DrawRevoked(uint256 indexed wagerId, address indexed proposer);
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

    /// @notice Emitted when an open challenge (no named opponent, code-gated) is created (feature 024).
    ///         The opponent is bound later via {WagerAccepted} on acceptOpenWager.
    event OpenWagerCreated(
        uint256 indexed wagerId,
        address indexed creator,
        address indexed claimAuthority,
        address token,
        uint128 stake,
        ResolutionType resolutionType,
        bytes32 metadataHash,
        string  metadataUri
    );

    /// @notice Governing T&C version bound at creation (Spec 007, FR-056/FR-058).
    event WagerTermsBound(uint256 indexed wagerId, bytes32 indexed termsVersionHash);
}
