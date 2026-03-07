# Friend Market Contracts (P2P Wager System)

This document covers the smart contract ecosystem that powers end-to-end encrypted peer-to-peer wagers on the Mordor testnet (chain ID 63).

## Deployed Addresses (Mordor Testnet)

| Contract | Address |
|----------|---------|
| FriendGroupMarketFactory | `0xE1eC8d34b36f55015ed636337121CA8EFbA96227` |
| FriendGroupCreationLib | `0xB3060ED1dc17dB2297021D5874821ce13777A657` |
| FriendGroupResolutionLib | `0x1C8780a84539c3c2F98530a2275fB9D2E4eA5aE9` |
| FriendGroupClaimsLib | `0xca3b4c3e0E04E5Ffcb0983d6e2DfE793BbEEfBbc` |
| TieredRoleManager | `0x55e6346Be542B13462De504FCC379a2477D227f0` |
| TierRegistry | `0x476cf3dEA109D6FC95aD19d246FD4e95693c47a3` |
| MembershipPaymentManager | `0x797717EAf6d054b35A30c9afF0e231a35Bb5abB7` |
| PaymentProcessor | `0x6e063138809263820F61146c34a74EB3B2629A59` |
| NullifierRegistry | `0x5569FEe7f8Bab39EEd08bf448Dd6824640C7d272` |
| RagequitModule | `0xD6b6eDE9EacDC90e20Fe95Db1875EaBB07004A1c` |
| ZKKeyManager | Not yet deployed (see `scripts/deploy/deploy-zk-key-manager.js`) |

RPC endpoint: `https://rpc.mordor.etccooperative.org`
Block explorer: `https://etc-mordor.blockscout.com`
Deployment start block: `15658191`

---

## FriendGroupMarketFactory

The primary entry point for all P2P wager operations. Handles wager creation, acceptance, resolution, challenges, and payouts.

### Constructor Dependencies

```solidity
constructor(
    address _marketFactory,
    address payable _ragequitModule,
    address _tieredRoleManager,
    address _paymentManager,
    address _owner
)
```

### Market Types

| Type | Enum Value | Description |
|------|-----------|-------------|
| OneVsOne | 0 | Head-to-head wager between two parties |
| SmallGroup | 1 | Multi-participant wager (up to configurable member limit) |
| EventTracking | 2 | Wager pegged to an external event outcome |
| PropBet | 3 | Proposition bet on a specific occurrence |
| Bookmaker | 4 | Asymmetric odds wager with configurable multiplier |

### State Machine

Every wager progresses through a defined lifecycle:

```
PendingAcceptance --> Active --> PendingResolution --> Resolved --> Claimed
                        |              |
                        |              +--> Challenged --> Resolved --> Claimed
                        |
                        +--> Cancelled / Refunded / OracleTimedOut
```

| Status | Value | Description |
|--------|-------|-------------|
| `pending_acceptance` | 0 | Created, waiting for opponent(s) to accept and stake |
| `active` | 1 | All required participants accepted; trading period running |
| `pending_resolution` | 2 | Trading period ended; awaiting outcome proposal |
| `challenged` | 3 | A proposed resolution has been challenged |
| `resolved` | 4 | Outcome finalized; winnings available to claim |
| `cancelled` | 5 | Wager cancelled before activation |
| `refunded` | 6 | Stakes returned to all participants |
| `oracle_timed_out` | 7 | Oracle resolution deadline passed; mutual refund triggered |

### Key Functions

#### Creation

```solidity
// 1v1 wager
function createOneVsOneMarketPending(
    address opponent,
    string description,
    uint256 tradingPeriod,
    address arbitrator,
    uint256 acceptanceDeadline,
    uint256 stakeAmount,
    address stakeToken,
    ResolutionType resolutionType
) external payable returns (uint256 friendMarketId)

// Small group wager
function createSmallGroupMarketPending(
    string description,
    address[] invitedMembers,
    uint256 memberLimit,
    uint256 tradingPeriod,
    address arbitrator,
    uint256 acceptanceDeadline,
    uint256 minAcceptanceThreshold,
    uint256 stakeAmount,
    address stakeToken
) external payable returns (uint256 friendMarketId)

// Bookmaker wager (asymmetric odds)
function createBookmakerMarket(
    address opponent,
    string description,
    uint256 tradingPeriod,
    uint256 acceptanceDeadline,
    uint256 opponentStakeAmount,
    uint16 opponentOddsMultiplier,
    address stakeToken,
    ResolutionType resolutionType,
    address arbitrator
) external payable returns (uint256 friendMarketId)
```

The `description` field stores either plaintext or an encrypted IPFS reference (`encrypted:ipfs://<CID>`) for private wagers.

#### Acceptance

```solidity
function acceptMarket(uint256 friendMarketId) external payable
```

The caller must be an invited member and send the required stake amount. Once the minimum acceptance threshold is met, the wager transitions to `active`.

#### Resolution

```solidity
// Propose an outcome (either party, depending on ResolutionType)
function resolveFriendMarket(uint256 friendMarketId, bool outcome) external

// Finalize after challenge period expires with no challenge
function finalizeResolution(uint256 friendMarketId) external

// Force resolution from oracle source
function resolveFromOracle(uint256 friendMarketId) external
function resolveFromPolymarket(uint256 friendMarketId) external

// Arbitrator resolves a dispute
function resolveDispute(uint256 friendMarketId, bool outcome) external
function forceOracleResolution(uint256 friendMarketId, bool outcome) external
```

#### Challenge

```solidity
function challengeResolution(uint256 friendMarketId) external payable
```

The challenger must post a bond. If the challenge succeeds, the bond is returned. If it fails, the bond is forfeited.

#### Claim

```solidity
function claimWinnings(uint256 friendMarketId) external
```

Winners call this after resolution to withdraw their winnings. A 90-day `claimTimeout` applies; after that, unclaimed funds are swept to the treasury.

#### Refund

```solidity
function acceptMutualRefund(uint256 friendMarketId) external
```

Both parties can agree to a mutual refund. A 30-day oracle timeout also triggers automatic refunds.

### Resolution Types

```solidity
enum ResolutionType {
    Either,       // 0 - Either party can propose
    Initiator,    // 1 - Only creator proposes
    Receiver,     // 2 - Only opponent proposes
    ThirdParty,   // 3 - Designated arbitrator resolves
    AutoPegged    // 4 - Resolved from external oracle
}
```

### Read Functions

```solidity
function getFriendMarketWithStatus(uint256 friendMarketId) external view returns (FriendMarket memory)
function getParticipantAcceptance(uint256 friendMarketId, address member) external view returns (AcceptanceRecord memory)
function acceptedParticipantCount(uint256 friendMarketId) external view returns (uint256)
function friendMarketCount() external view returns (uint256)
function claimTimeout() external view returns (uint256)
function friendMarketFee() external view returns (uint256)
function enforceNullification() external view returns (bool)
function expectedResolutionTime(uint256 friendMarketId) external view returns (uint256)
```

### Events

```solidity
event FriendMarketCreated(uint256 indexed friendMarketId, address indexed creator, uint8 marketType)
event MemberAdded(uint256 indexed friendMarketId, address indexed member)
event MarketAccepted(uint256 indexed friendMarketId, address indexed participant)
event ResolutionProposed(uint256 indexed friendMarketId, bool outcome, address indexed proposer)
event ResolutionChallenged(uint256 indexed friendMarketId, address indexed challenger)
event MarketResolved(uint256 indexed friendMarketId, bool outcome)
event WinningsClaimed(uint256 indexed friendMarketId, address indexed winner, uint256 amount, address token)
```

---

## Supporting Libraries

The factory delegates logic to external libraries to stay within contract size limits.

### FriendGroupCreationLib (`0xB3060ED1dc17dB2297021D5874821ce13777A657`)

Handles wager creation logic:
- Input validation (stake amounts, deadlines, member limits)
- Member initialization and invitation
- Fee calculation and collection
- Encrypted description storage

### FriendGroupResolutionLib (`0x1C8780a84539c3c2F98530a2275fB9D2E4eA5aE9`)

Handles resolution and challenge logic:
- Outcome proposal validation
- Challenge period management
- Arbitrator resolution flow
- Oracle integration (Polymarket, Chainlink, UMA pegging)
- Oracle timeout detection and refund triggering

### FriendGroupClaimsLib (`0xca3b4c3e0E04E5Ffcb0983d6e2DfE793BbEEfBbc`)

Handles payout logic:
- Winner payout calculation
- Claim timeout enforcement (90-day window)
- Treasury sweep for unclaimed funds
- Mutual refund processing
- Challenge bond distribution

### FriendGroupMarketTypes

Shared type definitions used across all libraries:
- `FriendMarket` struct (core wager data)
- `AcceptanceRecord` struct (per-participant acceptance status)
- `ResolutionType` enum
- `MarketStatus` enum
- `MarketType` enum

---

## ZKKeyManager

Manages the on-chain encryption key registry. Users register their public encryption keys so that wager creators can look up an opponent's key and encrypt wager details without any direct key exchange.

### Key Lifecycle

1. **Registration** -- User calls `registerKey(publicKey)` with their hex-encoded public key
2. **Active use** -- Key is available for lookup via `getPublicKey(address)` and `hasValidKey(address)`
3. **Rotation** -- User calls `rotateKey(newPublicKey)` to replace their current key (previous key hash is preserved in history)
4. **Revocation** -- Admin calls `revokeKey(user)` to invalidate a compromised key
5. **Expiration** -- Keys have a configurable `expiresAt` timestamp; expired keys fail `hasValidKey` checks

### Key Functions

```solidity
// Write
function registerKey(string publicKey) external
function rotateKey(string newPublicKey) external
function revokeKey(address user) external

// Read
function getPublicKey(address user) external view returns (string)
function hasValidKey(address user) external view returns (bool)
function hasActiveKey(address user) external view returns (bool)
function currentKeyHash(address user) external view returns (bytes32)
function getKeyMetadata(address user) external view returns (ZKKey memory)
function getKeyHistory(address user) external view returns (bytes32[])
function isKeyValid(bytes32 keyHash) external view returns (bool)
```

### Key Metadata Struct

```solidity
struct ZKKey {
    bytes32 keyHash;
    string publicKey;
    uint256 registeredAt;
    uint256 expiresAt;
    uint8 status;           // 0=Active, 1=Rotated, 2=Revoked, 3=Expired
    uint256 rotationCount;
    bytes32 previousKeyHash;
}
```

### Events

```solidity
event KeyRegistered(address indexed user, bytes32 indexed keyHash, uint256 expiresAt, uint256 timestamp)
event KeyRotated(address indexed user, bytes32 indexed oldKeyHash, bytes32 indexed newKeyHash, uint256 timestamp)
event KeyRevoked(address indexed user, bytes32 indexed keyHash, address indexed revoker, uint256 timestamp)
event KeyExpired(address indexed user, bytes32 indexed keyHash, uint256 timestamp)
```

---

## RBAC System

Access control uses a modular role-based system with tiered memberships.

### TieredRoleManager (`0x55e6346Be542B13462De504FCC379a2477D227f0`)

Manages role assignments with membership tiers. The FriendGroupMarketFactory checks `TieredRoleManager.hasRole()` before allowing wager creation.

**Roles:**

| Role | Hash Derivation | Purpose |
|------|----------------|---------|
| FRIEND_MARKET_ROLE | `keccak256("FRIEND_MARKET_ROLE")` | Create P2P wagers |
| MARKET_MAKER_ROLE | `keccak256("MARKET_MAKER_ROLE")` | Advanced market operations |
| ADMIN | `0x00...00` (DEFAULT_ADMIN_ROLE) | System administration |
| OPERATIONS_ADMIN | `keccak256("OPERATIONS_ADMIN_ROLE")` | Operational management |
| EMERGENCY_GUARDIAN | `keccak256("EMERGENCY_GUARDIAN_ROLE")` | Emergency pause |

**Key functions:**

```solidity
function hasRole(bytes32 role, address account) external view returns (bool)
function getUserTier(address user, bytes32 role) external view returns (MembershipTier)
function isMembershipActive(address user, bytes32 role) external view returns (bool)
```

### TierRegistry (`0x476cf3dEA109D6FC95aD19d246FD4e95693c47a3`)

Stores tier assignments independently from role grants. Used as the source of truth for which tier a user has purchased.

**Membership Tiers:**

| Tier | Value | Name |
|------|-------|------|
| 0 | NONE | No membership |
| 1 | BRONZE | Basic access |
| 2 | SILVER | Standard access |
| 3 | GOLD | Premium access |
| 4 | PLATINUM | Full access |

### MembershipPaymentManager (`0x797717EAf6d054b35A30c9afF0e231a35Bb5abB7`)

Coordinates payment processing for role purchases. Integrates with the PaymentProcessor to handle ERC-20 token payments (primarily USC stablecoin).

### Role Sync

The TierRegistry and TieredRoleManager are separate systems. When a user purchases a tier through TierRegistry, the role must be synced to TieredRoleManager for the factory to recognize it. The frontend detects sync mismatches and prompts the user to resolve them.

---

## RagequitModule (`0xD6b6eDE9EacDC90e20Fe95Db1875EaBB07004A1c`)

Provides a fair exit mechanism for participants. If a user disagrees with a wager's direction or terms, they can ragequit to receive their proportional share of the staked funds before resolution.

Key properties:
- Moloch-style proportional withdrawal
- Time-windowed execution (cannot ragequit after resolution has been proposed)
- Prevents forced participation in disputed outcomes
- Integrated as a constructor dependency of FriendGroupMarketFactory

---

## NullifierRegistry (`0x5569FEe7f8Bab39EEd08bf448Dd6824640C7d272`)

Maintains a registry of nullified (blocked) addresses to prevent abuse.

**Behavior:**
- When `enforceNullification` is enabled on the factory, all creation and acceptance calls check the NullifierRegistry
- If any participant address is nullified, the transaction reverts with `AddressNullified`
- Nullification is checked for: wager creators, invited members, and accepting participants
- Queries are privacy-preserving (yes/no per address, no public list)

**Use cases:**
- Anti-money-laundering enforcement
- Terms of service violation blocking
- Regulatory compliance

---

## Frontend Integration

Contract addresses are configured in `frontend/src/config/contracts.js`. The frontend reads addresses from environment variables first (`VITE_*_ADDRESS`), falling back to the hardcoded deployed addresses.

```javascript
import { getContractAddress } from '../config/contracts'
import { getContract } from '../utils/blockchainService'

// Get a read-only contract instance
const factory = getContract('friendGroupMarketFactory')

// Or with a signer for write operations
const factory = getContract('friendGroupMarketFactory', signer)
```

Market discovery uses `MemberAdded` events with incremental block scanning (cached watermark in localStorage) rather than on-chain user-to-market mappings, preserving user privacy.

---

## Testing

Test files are located at:
- `test/FriendGroupMarketFactory.test.js` -- Core wager lifecycle
- `test/FriendGroupMarketFactory.Challenge.test.js` -- Challenge and dispute flows
- `test/FriendGroupMarketFactory.Claim.test.js` -- Payout and claim timeout
- `test/FriendGroupMarketFactory.Timeout.test.js` -- Deadline and timeout behavior
- `test/FriendGroupMarketFactory.OracleTimeout.test.js` -- Oracle timeout refunds
- `test/FriendGroupMarketFactory.OracleIntegration.test.js` -- Oracle pegging
- `test/FriendGroupMarketFactory.UMAIntegration.test.js` -- UMA escalation

Run tests:

```bash
npx hardhat test test/FriendGroupMarketFactory*.test.js --network hardhat
```
