# Contract Interfaces

The public interfaces off-chain integrators (frontend, indexers, bots) build
against. Source of truth: `contracts/interfaces/` and
`contracts/oracles/IOracleAdapter.sol`. Deployed addresses live in
[`deployments/`](https://github.com/chippr-robotics/prediction-dao-research/tree/main/deployments)
and are tabulated in the [Smart Contracts guide](../developer-guide/smart-contracts.md#deployed-addresses).

## IWagerRegistry

`contracts/interfaces/IWagerRegistry.sol` — the full wager lifecycle.

```solidity
interface IWagerRegistry {
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

    // Lifecycle
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
    function declareDraw(uint256 wagerId) external;
    function revokeDraw(uint256 wagerId) external;
    function autoResolveFromPolymarket(uint256 wagerId) external;
    function autoResolveFromOracle(uint256 wagerId) external;
    function claimPayout(uint256 wagerId) external;
    function claimRefund(uint256 wagerId) external;
    function batchExpireOpen(uint256[] calldata wagerIds) external;

    // Moderation (ACCOUNT_MODERATOR_ROLE)
    function freezeAccount(address user, string calldata reason) external;
    function unfreezeAccount(address user) external;
    function isFrozen(address user) external view returns (bool);

    // Views
    function getWager(uint256 wagerId) external view returns (Wager memory);
    function drawConsent(uint256 wagerId) external view returns (bool creatorAgreed, bool opponentAgreed);
    function isAllowedToken(address token) external view returns (bool);
    function nextWagerId() external view returns (uint256);
    function getUserWagerCount(address user) external view returns (uint256);
    function getUserWagerIds(address user, uint256 offset, uint256 limit) external view returns (uint256[] memory);
    function getUserWagers(address user, uint256 offset, uint256 limit) external view returns (Wager[] memory);

    // Events
    event WagerCreated(uint256 indexed wagerId, address indexed creator, address indexed opponent,
        address token, uint128 creatorStake, uint128 opponentStake,
        ResolutionType resolutionType, bytes32 metadataHash, string metadataUri);
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
    event OracleConditionLinked(uint256 indexed wagerId, ResolutionType indexed resolutionType,
        bytes32 indexed conditionId, bool creatorIsYes);
    event OracleAdapterUpdated(ResolutionType indexed resolutionType, address indexed adapter);
    event AccountFrozen(address indexed user, address indexed by, string reason);
    event AccountUnfrozen(address indexed user, address indexed by);
}
```

The implementation additionally exposes `createWagerWithTerms(...)`, which
takes the same parameters plus the accepted terms-version hash and binds it
on-chain (Spec 007).

## IMembershipManager

`contracts/interfaces/IMembershipManager.sol` — tier purchases, limits, and
the hooks `WagerRegistry` calls.

```solidity
interface IMembershipManager {
    enum Tier { None, Bronze, Silver, Gold, Platinum }

    struct Limits {
        uint32 monthlyMarketCreation;
        uint32 maxConcurrentMarkets;
    }

    struct TierConfig {
        uint128 priceUSDC;
        uint32  durationDays;
        bool    active;
        Limits  limits;
    }

    struct Membership {
        Tier    tier;
        uint64  expiresAt;
        uint32  monthCount;    // creations this month
        uint32  activeCount;   // currently open wagers
        uint64  monthAnchor;
    }

    // Hooks (authorized callers only — i.e. WagerRegistry)
    function checkCanCreate(address user, bytes32 role) external view returns (bool);
    function recordCreate(address user, bytes32 role) external;
    function recordClose(address user, bytes32 role) external;

    // Role-manager surface (out-of-band grants / revokes)
    function grantMembership(address user, bytes32 role, Tier tier, uint32 durationDays) external;
    function revokeMembership(address user, bytes32 role) external;

    // Views
    function hasActiveRole(address user, bytes32 role) external view returns (bool);
    function getActiveTier(address user, bytes32 role) external view returns (Tier);
    function getMembership(address user, bytes32 role) external view returns (Membership memory);
    function getTierConfig(bytes32 role, Tier tier) external view returns (TierConfig memory);

    event MembershipRevoked(address indexed user, bytes32 indexed role, address indexed by);
}
```

The implementation's purchase surface (USDC-denominated):

```solidity
function purchaseTier(bytes32 role, Tier tier) external;
function purchaseTierWithTerms(bytes32 role, Tier tier, bytes32 acceptedTermsHash) external;
function upgradeTier(bytes32 role, Tier newTier) external;
function upgradeTierWithTerms(bytes32 role, Tier newTier, bytes32 acceptedTermsHash) external;
function extendMembership(bytes32 role) external;
```

The role for wager participation is
`keccak256("WAGER_PARTICIPANT_ROLE")`.

## ISanctionsGuard

`contracts/interfaces/ISanctionsGuard.sol` — non-bypassable screening
consulted by `createWager` / `acceptWager` / tier purchases. Fail-closed: an
unreachable or erroring oracle means *not allowed*.

```solidity
interface ISanctionsGuard {
    // Views
    function isAllowed(address account) external view returns (bool);
    function checkBlocked(address account) external view;   // reverts SanctionedAddress
    function isDenied(address account) external view returns (bool);
    function sanctionsOracle() external view returns (address);

    // Admin
    function setDenied(address account, bool denied, string calldata reason) external; // SANCTIONS_ADMIN_ROLE
    function setSanctionsOracle(address oracle) external;                              // DEFAULT_ADMIN_ROLE

    event DenyListUpdated(address indexed account, bool denied, address indexed actor, string reason);
    event SanctionsOracleUpdated(address indexed oracle);

    error SanctionedAddress(address account);
}
```

## KeyRegistry

`contracts/privacy/KeyRegistry.sol` — public-key directory for envelope
encryption (keys are 32–2048 bytes; X25519 or X-Wing hybrid).

```solidity
function registerKey(bytes calldata publicKey) external;
function registerKeyWithEligibility(bytes calldata publicKey, bytes32 termsRef) external;
function getPublicKey(address user) external view returns (bytes memory);
function hasKey(address user) external view returns (bool);

event KeyRegistered(address indexed user, bytes key, uint64 timestamp);
event EligibilityAcknowledged(address indexed account, bytes32 termsRef, uint64 timestamp);

error KeyTooShort();
error KeyTooLong();
```

## IOracleAdapter

`contracts/oracles/IOracleAdapter.sol` — implemented by all four adapters
(Polymarket, Chainlink Data Feed, Chainlink Functions, UMA OO-V3), so
`WagerRegistry` resolves any oracle-typed wager through one code path.

```solidity
interface IOracleAdapter {
    function oracleType() external view returns (string memory);
    function isAvailable() external view returns (bool available);
    function getConfiguredChainId() external view returns (uint256 chainId);
    function isConditionSupported(bytes32 conditionId) external view returns (bool supported);
    function isConditionResolved(bytes32 conditionId) external view returns (bool resolved);

    /// outcome: true if the "YES"/"PASS" side won
    /// confidence: 0–10000 basis points
    function getOutcome(bytes32 conditionId) external view returns (
        bool outcome, uint256 confidence, uint256 resolvedAt
    );

    function getConditionMetadata(bytes32 conditionId) external view returns (
        string memory description, uint256 expectedResolutionTime
    );

    event ConditionRegistered(bytes32 indexed conditionId, string description, uint256 expectedResolutionTime);
    event ConditionResolved(bytes32 indexed conditionId, bool outcome, uint256 confidence, uint256 resolvedAt);
}
```

## For more details

- [API Reference](api.md) — practical ethers.js examples per flow
- [Smart Contracts](../developer-guide/smart-contracts.md) — implementation
  notes, state machine, deployed addresses
- [Configuration](configuration.md) — on-chain bounds and frontend defaults
