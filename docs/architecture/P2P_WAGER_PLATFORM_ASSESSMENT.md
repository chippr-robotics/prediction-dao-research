# P2P Wager Platform Architecture Assessment

## Vision Statement

FairWins is a **wager management layer** that helps users track and manage peer-to-peer wagers across their existing social networks and resolve them using established prediction markets and on-chain oracles—without fragmenting liquidity or duplicating existing infrastructure.

### Core Principles

1. **Meet users where they are** - Leverage existing social media for sharing/connecting
2. **Aggregate, don't duplicate** - Integrate existing prediction markets as resolution sources
3. **Discovery over creation** - Find and connect to existing oracles, not build new ones
4. **User's wager portfolio** - Single view of positions across all platforms and networks
5. **Network agnostic** - Work across chains where users already have assets

---

## Current Architecture Analysis

### What Exists (Strengths)

| Component | Status | Notes |
|-----------|--------|-------|
| **FriendGroupMarketFactory** | Production-ready | Full P2P wager mechanics with multi-party acceptance |
| **PolymarketOracleAdapter** | Implemented | Can resolve from Polymarket conditions |
| **OracleResolver** | Implemented | UMA-style dispute resolution pattern |
| **QR Code Sharing** | Basic | Share market links via QR |
| **Multicall3 Batching** | Implemented | Efficient batch contract reads |
| **Multi-party Acceptance** | Implemented | Invitation/acceptance flow with deadlines |
| **Custom Odds (Bookmaker)** | Implemented | Asymmetric stake ratios |

### What's Missing (Gaps)

| Gap | Priority | Impact |
|-----|----------|--------|
| **Multi-oracle Registry** | HIGH | Can only resolve via Polymarket currently |
| **External Market Discovery** | HIGH | No indexing of other prediction platforms |
| **Social Share-out** | MEDIUM | Can't 1-click share to Twitter/Discord |
| **Position Aggregation** | HIGH | No unified view of user's wagers |
| **Multi-chain Support** | MEDIUM | Single network only (ETC) |
| **REST/GraphQL API** | MEDIUM | Frontend-only, no external integrations |
| **Notification System** | MEDIUM | No alerts for wager status changes |

---

## Proposed Architecture Changes

### Layer 1: Oracle Registry (Smart Contracts)

Replace single-oracle pattern with a **registry of verified oracle sources**.

```
┌─────────────────────────────────────────────────────────────┐
│                    OracleRegistry                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ Polymarket  │ │   UMA v3    │ │  Chainlink  │            │
│  │   Adapter   │ │   Adapter   │ │   Adapter   │   ...      │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘            │
│         │               │               │                    │
│         └───────────────┼───────────────┘                    │
│                         ▼                                    │
│              ┌─────────────────────┐                        │
│              │  IOracleAdapter     │                        │
│              │  - isResolved()     │                        │
│              │  - getOutcome()     │                        │
│              │  - getConfidence()  │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

**New Contracts Needed:**
- `OracleRegistry.sol` - Registry of verified oracle adapters
- `IExternalOracle.sol` - Standard interface for oracle adapters
- `UMAOracleAdapter.sol` - Direct UMA v3 integration
- `ChainlinkOracleAdapter.sol` - Chainlink data feeds adapter
- `API3OracleAdapter.sol` - API3 dAPI integration

### Layer 2: Market Discovery Index (Off-chain)

Index existing prediction markets for resolution source discovery.

```
┌─────────────────────────────────────────────────────────────┐
│                  Market Discovery Service                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Data Sources:                                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │  Polymarket  │ │    Kalshi    │ │   Manifold   │         │
│  │   GraphQL    │ │     API      │ │     API      │         │
│  └──────────────┘ └──────────────┘ └──────────────┘         │
│                                                              │
│  Indexed Data:                                               │
│  - Market questions (normalized text)                        │
│  - Resolution timestamps                                     │
│  - Current odds/prices                                       │
│  - Chain/network location                                    │
│  - Oracle/resolution source                                  │
│                                                              │
│  Search Capabilities:                                        │
│  - "Find markets about [topic]"                              │
│  - "Markets resolving in next 7 days"                        │
│  - "High-volume markets on [chain]"                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Options:**
1. **The Graph Subgraph** - Index on-chain markets (Polymarket, Gnosis, etc.)
2. **Lightweight API Service** - Poll external APIs (Kalshi, Manifold, PredictIt)
3. **Hybrid** - Graph for on-chain + API service for off-chain markets

### Layer 3: Social Share-out (No Social Graph)

Export wagers TO social platforms, don't import relationships FROM them.

```
┌─────────────────────────────────────────────────────────────┐
│                    Share-out Service                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Share Formats:                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Twitter/X Card                                      │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │ 🎯 New Wager on FairWins                     │    │    │
│  │  │ "ETH > $5000 by Dec 31, 2024"               │    │    │
│  │  │ Stakes: 0.5 ETH each | Odds: 2:1            │    │    │
│  │  │ Resolution: Polymarket #abc123               │    │    │
│  │  │ [Accept Wager] [View Details]                │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Channels:                                                   │
│  - Twitter/X (Open Graph + deep link)                       │
│  - Discord (Webhook + embed)                                │
│  - Telegram (Bot message + inline buttons)                  │
│  - Farcaster (Cast with frame)                              │
│  - Link/QR (Universal, already exists)                      │
│                                                              │
│  Features:                                                   │
│  - 1-click share from wager creation                        │
│  - Auto-generated preview images (OG cards)                 │
│  - Deep links back to FairWins for acceptance               │
│  - Resolution announcements (optional)                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Layer 4: Position Dashboard (User's Wager Portfolio)

Unified view of all wager positions across platforms.

```
┌─────────────────────────────────────────────────────────────┐
│                    User Dashboard                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  OPEN POSITIONS                               (4)      │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  📊 ETH > $5000 by Dec 2024                           │  │
│  │     Staked: 0.5 ETH | Side: YES | vs: @alice          │  │
│  │     Resolution: Polymarket | Status: Awaiting         │  │
│  │     [Share] [Cancel]                                  │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  🏈 Chiefs win Super Bowl                             │  │
│  │     Staked: 100 USDC | Side: NO | vs: @bob            │  │
│  │     Resolution: Manual (Arbitrator: @charlie)         │  │
│  │     [Share] [Dispute]                                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  PENDING INVITATIONS                          (2)      │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  BTC halving date prediction                          │  │
│  │     From: @dave | Stake: 0.1 BTC | Expires: 2h        │  │
│  │     [Accept] [Decline] [Counter-offer]                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  METRICS                                               │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  Total Wagered: $12,450 | Win Rate: 62%               │  │
│  │  Lifetime P&L: +$2,340 | Active Wagers: 4             │  │
│  │  Most Active Topic: Crypto | Avg Stake: $250          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Data Sources for Dashboard:**
1. **On-chain** - FriendGroupMarketFactory events (primary)
2. **Indexed** - Subgraph for historical aggregation
3. **Cached** - Local storage for UI responsiveness

---

## Smart Contract Changes

### 1. Simplify FriendGroupMarketFactory

Remove dependency on ConditionalMarketFactory for P2P wagers:

```solidity
// Current: P2P wagers create underlying CTF markets
// Problem: Unnecessary complexity, gas cost, liquidity fragmentation

// Proposed: Standalone P2P wager contract
contract P2PWagerFactory {
    struct Wager {
        uint256 wagerId;
        address creator;
        address opponent;
        address arbitrator;
        uint256 creatorStake;
        uint256 opponentStake;
        address stakeToken;
        string description;
        bytes32 oracleId;           // Reference to OracleRegistry
        bytes32 externalCondition;   // Polymarket conditionId, Chainlink feedId, etc.
        WagerStatus status;
        uint256 acceptanceDeadline;
        uint256 resolutionDeadline;
    }

    enum WagerStatus {
        Pending,    // Awaiting opponent acceptance
        Active,     // Both parties staked
        Resolved,   // Outcome determined
        Disputed,   // In arbitration
        Cancelled,  // Refunded
        Expired     // Deadline passed
    }

    // Core functions
    function createWager(...) external payable returns (uint256 wagerId);
    function acceptWager(uint256 wagerId) external payable;
    function resolveFromOracle(uint256 wagerId) external;
    function resolveManually(uint256 wagerId, bool outcome) external;
    function disputeResolution(uint256 wagerId) external;
    function claimWinnings(uint256 wagerId) external;
}
```

### 2. Add OracleRegistry

```solidity
interface IOracleAdapter {
    function isSupported(bytes32 conditionId) external view returns (bool);
    function isResolved(bytes32 conditionId) external view returns (bool);
    function getOutcome(bytes32 conditionId) external view returns (bool outcome, uint256 confidence);
    function getMetadata(bytes32 conditionId) external view returns (string memory);
}

contract OracleRegistry {
    mapping(bytes32 => address) public oracleAdapters; // oracleId => adapter address
    mapping(address => bool) public verifiedAdapters;

    function registerAdapter(bytes32 oracleId, address adapter) external onlyOwner;
    function resolveCondition(bytes32 oracleId, bytes32 conditionId) external returns (bool, uint256);
    function findAdapterForCondition(bytes32 conditionId) external view returns (address);
}
```

### 3. Add Chainlink Adapter

```solidity
contract ChainlinkOracleAdapter is IOracleAdapter {
    function isResolved(bytes32 feedId) external view returns (bool) {
        // Check if price feed has been updated
        AggregatorV3Interface feed = AggregatorV3Interface(feedIdToAddress[feedId]);
        (, , , uint256 updatedAt, ) = feed.latestRoundData();
        return updatedAt > conditionTimestamps[feedId];
    }

    function getOutcome(bytes32 feedId) external view returns (bool outcome, uint256 confidence) {
        // Compare price to threshold
        int256 price = getPrice(feedId);
        int256 threshold = conditionThresholds[feedId];
        outcome = price >= threshold;
        confidence = 100; // Chainlink is deterministic
    }
}
```

### 4. Add UMA Direct Integration

```solidity
contract UMAOracleAdapter is IOracleAdapter {
    OptimisticOracleV3 public immutable oo;

    function requestResolution(bytes32 questionId, string memory ancillaryData) external {
        oo.assertTruth(
            abi.encodePacked(ancillaryData),
            address(this),
            address(0), // No callback
            address(0), // No escalation manager
            7200,       // 2 hour liveness
            IERC20(defaultCurrency),
            bond,
            questionId,
            block.timestamp
        );
    }

    function getOutcome(bytes32 questionId) external view returns (bool outcome, uint256 confidence) {
        // Check UMA assertion result
        int256 result = oo.getAssertionResult(assertions[questionId]);
        outcome = result > 0;
        confidence = 100;
    }
}
```

---

## Frontend Changes

### 1. Navigation Restructure

```
Current:                          Proposed:
├── Markets (primary)             ├── My Wagers (primary)
├── Governance                    │   ├── Open Positions
├── Friend Markets (modal)        │   ├── Pending Invites
└── Profile                       │   ├── History
                                  │   └── Metrics
                                  ├── Create Wager
                                  │   ├── Pick Resolution Source
                                  │   └── Set Terms
                                  ├── Discover Markets
                                  │   ├── Polymarket
                                  │   ├── Kalshi (off-chain)
                                  │   └── On-chain Oracles
                                  └── Settings
```

### 2. Create Wager Flow

```
Step 1: Define the Bet
┌─────────────────────────────────────────────────────────────┐
│  What are you betting on?                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ "ETH will be above $5000 by December 31, 2024"      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  How will this be resolved?                                 │
│  ○ Find existing market (Polymarket, Kalshi, etc.)         │
│  ○ Use price oracle (Chainlink, API3)                      │
│  ○ Manual resolution (you or opponent decides)             │
│  ○ Third-party arbitrator                                  │
│                                                              │
│  [Search Existing Markets...]                               │
└─────────────────────────────────────────────────────────────┘

Step 2: Set Stakes
┌─────────────────────────────────────────────────────────────┐
│  Your stake: [____] ETH                                     │
│  Opponent's stake: [____] ETH  (or set custom odds)        │
│                                                              │
│  ○ Equal stakes (1:1)                                       │
│  ○ Custom odds: You risk [__] to win [__]                  │
│                                                              │
│  Payment token: [ETH ▼] [USDC] [USDT]                      │
└─────────────────────────────────────────────────────────────┘

Step 3: Invite Opponent
┌─────────────────────────────────────────────────────────────┐
│  Who are you betting against?                               │
│                                                              │
│  ○ Enter wallet address: [0x...]                           │
│  ○ Share via link (anyone can accept)                      │
│                                                              │
│  Acceptance deadline: [24 hours ▼]                         │
│                                                              │
│  [Create & Share Wager]                                     │
│                                                              │
│  Share to: [Twitter] [Discord] [Telegram] [Copy Link]      │
└─────────────────────────────────────────────────────────────┘
```

### 3. Market Discovery Component

```jsx
// components/MarketDiscovery.jsx
export function MarketDiscovery({ onSelectMarket }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);

  // Search across multiple sources
  const searchMarkets = async (query) => {
    const [polymarket, chainlink, uma] = await Promise.all([
      searchPolymarket(query),
      searchChainlinkFeeds(query),
      searchUMAAssertions(query),
    ]);

    return normalizeResults([...polymarket, ...chainlink, ...uma]);
  };

  return (
    <div>
      <SearchInput value={searchQuery} onChange={setSearchQuery} />
      <MarketResults
        results={results}
        onSelect={(market) => onSelectMarket({
          oracleId: market.oracleId,
          conditionId: market.conditionId,
          description: market.question,
          resolvesAt: market.resolutionDate,
        })}
      />
    </div>
  );
}
```

### 4. Share-out Service

```javascript
// services/socialShare.js
export const ShareService = {
  generateTwitterIntent(wager) {
    const text = `🎯 New wager on @FairWins\n\n"${wager.description}"\n\nStakes: ${wager.stake} ${wager.token}\nResolution: ${wager.oracleSource}\n\nAccept the challenge:`;
    const url = `https://fairwins.io/wager/${wager.id}`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  },

  generateDiscordEmbed(wager) {
    return {
      title: "New Wager Challenge",
      description: wager.description,
      fields: [
        { name: "Stake", value: `${wager.stake} ${wager.token}`, inline: true },
        { name: "Odds", value: wager.odds, inline: true },
        { name: "Resolution", value: wager.oracleSource, inline: true },
      ],
      url: `https://fairwins.io/wager/${wager.id}`,
      color: 0x00ff00,
    };
  },

  generateOGImage(wager) {
    // Generate dynamic Open Graph image for link previews
    return `https://fairwins.io/api/og?wagerId=${wager.id}`;
  },
};
```

---

## Data Architecture

### Position Tracking (The Graph Subgraph)

```graphql
type User @entity {
  id: Bytes! # wallet address
  wagersCreated: [Wager!]! @derivedFrom(field: "creator")
  wagersAccepted: [Wager!]! @derivedFrom(field: "opponent")
  totalWagered: BigInt!
  totalWon: BigInt!
  totalLost: BigInt!
  winCount: Int!
  lossCount: Int!
  activeWagerCount: Int!
}

type Wager @entity {
  id: ID!
  creator: User!
  opponent: User
  arbitrator: Bytes
  creatorStake: BigInt!
  opponentStake: BigInt!
  stakeToken: Bytes!
  description: String!
  oracleId: Bytes!
  externalCondition: Bytes!
  status: WagerStatus!
  outcome: Boolean
  winner: User
  createdAt: BigInt!
  acceptedAt: BigInt
  resolvedAt: BigInt
  resolutionSource: String # "polymarket", "chainlink", "manual", etc.
}

enum WagerStatus {
  PENDING
  ACTIVE
  RESOLVED
  DISPUTED
  CANCELLED
  EXPIRED
}

type OracleSource @entity {
  id: Bytes! # oracleId
  name: String!
  adapterAddress: Bytes!
  totalResolutions: Int!
  activeConditions: Int!
}
```

### Metrics Queries

```graphql
# User's wager portfolio
query UserPortfolio($address: Bytes!) {
  user(id: $address) {
    totalWagered
    totalWon
    totalLost
    winCount
    lossCount
    activeWagerCount
    wagersCreated(where: { status: ACTIVE }) {
      id
      description
      creatorStake
      opponent { id }
      status
    }
    wagersAccepted(where: { status: PENDING }) {
      id
      description
      opponentStake
      creator { id }
      acceptanceDeadline
    }
  }
}

# Leaderboard (optional - competitive element without social graph)
query Leaderboard($limit: Int!) {
  users(first: $limit, orderBy: totalWon, orderDirection: desc) {
    id
    totalWon
    winCount
    lossCount
  }
}
```

---

## Implementation Phases

### Phase 1: Core P2P Simplification (2-3 weeks)
- [ ] Create standalone `P2PWagerFactory.sol` (simpler than FriendGroupMarketFactory)
- [ ] Create `OracleRegistry.sol` with adapter pattern
- [ ] Migrate Polymarket adapter to new interface
- [ ] Update frontend to use new wager flow
- [ ] Deploy subgraph for position tracking

### Phase 2: Oracle Expansion (2 weeks)
- [ ] Implement `ChainlinkOracleAdapter.sol`
- [ ] Implement `UMAOracleAdapter.sol`
- [ ] Add oracle discovery in UI
- [ ] Search across all oracle sources

### Phase 3: Market Discovery (2 weeks)
- [ ] Build market aggregator service (index Polymarket, Kalshi APIs)
- [ ] "Find existing market" flow in wager creation
- [ ] Auto-link wagers to discovered markets
- [ ] Resolution timestamp tracking

### Phase 4: Social Share-out (1-2 weeks)
- [ ] Twitter/X share intent generation
- [ ] Discord webhook integration
- [ ] Telegram bot for notifications
- [ ] Open Graph image generation for link previews
- [ ] Deep link handling for wager acceptance

### Phase 5: Dashboard & Metrics (2 weeks)
- [ ] Build position dashboard component
- [ ] Aggregate user metrics from subgraph
- [ ] Add pending invitations view
- [ ] History and P&L tracking
- [ ] Export capabilities (CSV, share)

### Phase 6: Multi-chain (Future)
- [ ] Deploy on Polygon (same network as Polymarket)
- [ ] Deploy on Arbitrum (UMA v3)
- [ ] Cross-chain wager acceptance (bridge stakes)
- [ ] Unified dashboard across chains

---

## Key Decisions

### 1. Remove CTF Dependency for P2P
**Current:** Friend markets create underlying ConditionalMarketFactory markets
**Proposed:** Standalone wager contract with direct stake escrow

**Rationale:**
- Simpler gas costs
- No need for conditional tokens for 1v1 wagers
- Faster resolution
- No liquidity fragmentation

### 2. Oracle Registry vs. Hardcoded Adapters
**Proposed:** Registry pattern with pluggable adapters

**Rationale:**
- New oracle sources can be added without contract upgrades
- Community can propose and verify new adapters
- Clear separation of concerns

### 3. Subgraph vs. Backend API
**Proposed:** Subgraph for on-chain data, lightweight API for off-chain market discovery

**Rationale:**
- Subgraph handles position tracking efficiently
- API needed for Kalshi/Manifold (off-chain markets)
- No need for heavy backend infrastructure

### 4. Social Share-out vs. Social Graph
**Proposed:** Export to existing platforms, don't build internal social

**Rationale:**
- Users already have audiences on Twitter/Discord
- Building social from scratch is expensive
- Focus on core wager mechanics
- Let virality happen on established platforms

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Wagers created | 1000/month | Subgraph query |
| Unique users | 500/month | Unique wallet addresses |
| Resolution success rate | >95% | Resolved / (Resolved + Disputed) |
| Share-to-acceptance rate | >10% | Accepted wagers from shared links |
| Avg. resolution time | <24h after event | Subgraph timestamps |
| Multi-oracle usage | >3 sources active | OracleRegistry stats |

---

## Summary

This architecture pivot transforms FairWins from a prediction market platform to a **wager management layer**:

1. **P2P wagers are the product** - Simple, direct bets between parties
2. **Existing markets are infrastructure** - Polymarket, Chainlink, UMA provide resolution
3. **Social platforms are distribution** - Twitter, Discord, Telegram for sharing
4. **User dashboard is the interface** - Track positions across all sources
5. **No liquidity fragmentation** - Leverage existing market depth

The result is a focused product that helps users bet with friends using the best available resolution sources—without trying to compete with established prediction markets.
