# Master Data Plan

## Overview

This document defines the master data architecture for the FairWins prediction market platform. It establishes data object definitions, relationships, metadata standards, and the migration path from mock data to IPFS-based storage.

## Executive Summary

The FairWins platform currently uses mock data stored in JSON files during development. This plan defines:

1. **Data Objects**: Core entities (Markets, Proposals, DAOs, Tokens) and their relationships
2. **Metadata Standards**: Adoption of OpenSea-compatible metadata format for IPFS storage
3. **Smart Contract Mappings**: How on-chain data relates to off-chain metadata
4. **UI Mappings**: How frontend components consume data
5. **Migration Strategy**: Path from mock data to production IPFS storage

## Table of Contents

1. [Core Data Objects](#core-data-objects)
2. [OpenSea Metadata Standard Adoption](#opensea-metadata-standard-adoption)
3. [Smart Contract to Metadata Mappings](#smart-contract-to-metadata-mappings)
4. [UI Data Object Mappings](#ui-data-object-mappings)
5. [IPFS Storage Architecture](#ipfs-storage-architecture)
6. [Data Relationships](#data-relationships)
7. [Migration Strategy](#migration-strategy)
8. [Example Metadata Files](#example-metadata-files)

---

## Core Data Objects

### 1. Market

A prediction market representing a binary outcome question.

**On-Chain Properties** (from ConditionalMarketFactory.sol):
```solidity
struct Market {
    uint256 proposalId;
    address passToken;
    address failToken;
    address collateralToken;
    uint256 tradingEndTime;
    uint256 liquidityParameter;
    uint256 totalLiquidity;
    bool resolved;
    uint256 passValue;
    uint256 failValue;
    MarketStatus status;
    BetType betType;
}
```

**Off-Chain Metadata** (IPFS):
- Market description (markdown supported)
- Category and subcategory
- Tags for searchability
- Resolution criteria details
- External links and references
- Media assets (images, videos)
- Creator information
- Correlation group membership

### 2. Proposal

A governance proposal for funding or action.

**On-Chain Properties** (from ProposalRegistry.sol):
```solidity
struct Proposal {
    address proposer;
    string title;
    string description;
    uint256 fundingAmount;
    address payable recipient;
    uint256 welfareMetricId;
    uint256 bondAmount;
    uint256 submittedAt;
    uint256 reviewEndsAt;
    uint256 executionDeadline;
    uint256 startDate;
    address fundingToken;
    ProposalStatus status;
    Milestone[] milestones;
}
```

**Off-Chain Metadata** (IPFS):
- Extended description (markdown)
- Supporting documents
- Team information
- Roadmap and timeline
- Budget breakdown
- Expected outcomes
- Community discussion links

### 3. Token

ERC20 or ERC721 tokens created through TokenMintFactory.

**On-Chain Properties** (from TokenMintFactory.sol):
```solidity
struct TokenInfo {
    uint256 tokenId;
    TokenType tokenType;
    address tokenAddress;
    address owner;
    string name;
    string symbol;
    string metadataURI;  // IPFS CID
    uint256 createdAt;
    bool listedOnETCSwap;
    bool isBurnable;
    bool isPausable;
}
```

**Off-Chain Metadata** (IPFS):
- Token description
- Logo/image URL
- Project website
- Social media links
- Token utility description
- Attributes/traits (for NFTs)

### 4. DAO

A decentralized autonomous organization instance.

**On-Chain Properties** (from DAOFactory.sol):
```solidity
struct DAOInfo {
    address futarchyGovernor;
    address welfareRegistry;
    address proposalRegistry;
    address marketFactory;
    address privacyCoordinator;
    address oracleResolver;
    address ragequitModule;
    address treasuryVault;
    address creator;
    uint256 createdAt;
    bool active;
}
```

**Off-Chain Metadata** (IPFS):
- DAO name and description
- Mission and vision
- Governance rules
- Member benefits
- Visual branding
- Documentation links
- Community channels

### 5. Welfare Metric

Metrics used to measure DAO success in futarchy governance.

**Properties**:
- Metric name
- Description
- Calculation method
- Weight in decision-making
- Historical values
- Data sources

### 6. Correlation Group

Groups of related markets that share outcomes.

**Properties**:
- Group name and description
- Category
- Market IDs
- Creator
- Rules for correlation

---

## OpenSea Metadata Standard Adoption

### Why OpenSea Standard?

The OpenSea metadata standard is industry-standard for NFTs and provides:
- Well-documented JSON schema
- Support for rich media
- Trait/attribute system for filtering
- Compatibility with major platforms
- IPFS-friendly structure

### Core Metadata Schema

All data objects stored in IPFS will follow this base structure:

```json
{
  "name": "Market/Token Name",
  "description": "Detailed description (markdown supported)",
  "external_url": "https://fairwins.app/market/123",
  "image": "ipfs://Qm.../image.png",
  "animation_url": "ipfs://Qm.../video.mp4",
  "background_color": "FF6B35",
  "attributes": [
    {
      "trait_type": "Category",
      "value": "Finance"
    },
    {
      "trait_type": "Status",
      "value": "Active"
    }
  ]
}
```

### Field Definitions

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `name` | Yes | Human-readable name | "Bitcoin reaches $100K in 2025" |
| `description` | Yes | Detailed description (markdown) | "Will Bitcoin reach $100,000 USD..." |
| `external_url` | No | Link to item page | "https://fairwins.app/market/11" |
| `image` | Yes | Primary image URI | "ipfs://QmXXX/image.png" |
| `animation_url` | No | Video/animation URI | "ipfs://QmYYY/video.mp4" |
| `background_color` | No | Hex color (no #) | "FF6B35" |
| `attributes` | Yes | Array of traits | See below |

### Attribute Schema

Attributes enable filtering, sorting, and advanced queries:

```json
{
  "trait_type": "Category",
  "value": "Finance",
  "display_type": "string"
}
```

For numeric attributes:
```json
{
  "trait_type": "Total Liquidity",
  "value": 125000,
  "display_type": "number",
  "max_value": 1000000
}
```

For dates:
```json
{
  "trait_type": "Trading Ends",
  "value": 1735689600,
  "display_type": "date"
}
```

---

## Smart Contract to Metadata Mappings

### Market Creation Flow

1. **On-Chain Creation** (ConditionalMarketFactory):
   ```solidity
   function createMarket(
       uint256 proposalId,
       address collateralToken,
       uint256 tradingEndTime,
       uint256 liquidityParameter,
       BetType betType
   ) returns (uint256 marketId)
   ```

2. **Metadata Generation** (Off-chain):
   - Create metadata JSON with market details
   - Upload to IPFS
   - Store IPFS CID in contract event or separate registry

3. **Metadata Retrieval** (Frontend):
   - Fetch market ID from contract
   - Look up IPFS CID from registry
   - Fetch metadata from IPFS gateway
   - Display in UI

### Proposal Submission Flow

1. **On-Chain Submission** (ProposalRegistry):
   ```solidity
   function submitProposal(
       string memory title,
       string memory description,
       uint256 fundingAmount,
       address payable recipient,
       uint256 welfareMetricId
   ) payable returns (uint256 proposalId)
   ```

2. **Extended Metadata** (IPFS):
   - Supporting documents
   - Team bios
   - Budget details
   - Roadmap

3. **Retrieval Flow**:
   - Contract emits ProposalSubmitted event
   - Event includes basic data
   - IPFS CID stored in event or registry
   - Frontend fetches extended metadata

### Token Creation Flow

1. **On-Chain Creation** (TokenMintFactory):
   ```solidity
   function createERC20Token(
       string memory name,
       string memory symbol,
       uint256 initialSupply,
       string memory metadataURI,
       bool burnable,
       bool pausable
   ) returns (address tokenAddress)
   ```

2. **Metadata Structure** (at metadataURI):
   ```json
   {
     "name": "FairWins Governance",
     "symbol": "FWIN",
     "description": "Governance token for FairWins DAO",
     "image": "ipfs://QmXXX/logo.png",
     "external_url": "https://fairwins.app",
     "decimals": 18,
     "attributes": [
       {"trait_type": "Type", "value": "Governance"},
       {"trait_type": "Supply", "value": 100000000}
     ]
   }
   ```

### DAO Creation Flow

1. **On-Chain Creation** (DAOFactory):
   ```solidity
   function createDAO(
       string memory name,
       string memory metadataURI,
       // ... other params
   ) returns (address daoAddress)
   ```

2. **DAO Metadata** (IPFS):
   ```json
   {
     "name": "ETC Treasury DAO",
     "description": "Main governance DAO...",
     "image": "ipfs://QmXXX/logo.png",
     "external_url": "https://fairwins.app/dao/etc-treasury",
     "attributes": [
       {"trait_type": "Type", "value": "Futarchy"},
       {"trait_type": "Members", "value": 847}
     ]
   }
   ```

---

## UI Data Object Mappings

### Market Display Components

**MarketTile.jsx** needs:
```javascript
{
  id: 0,
  name: "Bitcoin reaches $100K in 2025",
  description: "Will Bitcoin reach...",
  category: "crypto",
  passTokenPrice: "0.59",
  failTokenPrice: "0.41",
  totalLiquidity: "245600",
  tradingEndTime: "2025-07-19T00:00:00Z",
  status: "Active",
  image: "ipfs://QmXXX/btc.png",
  volume24h: "18200",
  tradesCount: 567
}
```

**Data Sources**:
- On-chain: prices, liquidity, status, tradingEndTime
- IPFS: name, description, category, image
- Aggregation service: volume24h, tradesCount

### Dashboard Statistics

**Dashboard.jsx** needs:
```javascript
{
  totalValueLocked: "2847500",
  totalVolume24h: "342800",
  activeMarkets: 42,
  totalTraders: 1847,
  // ... other stats
}
```

**Data Sources**:
- On-chain: totalValueLocked from markets
- Indexer/subgraph: volume, trader counts, transaction counts

### Position Tracking

**Portfolio components** need:
```javascript
{
  id: 0,
  marketId: 0,
  marketName: "Bitcoin reaches $100K",
  tokenType: "PASS",
  amount: "100",
  entryPrice: "0.60",
  currentPrice: "0.62",
  unrealizedPnL: "+3.33",
  status: "Active"
}
```

**Data Sources**:
- On-chain: amount, market reference
- IPFS: market name
- Price oracle/DEX: currentPrice
- Calculation: PnL

---

## IPFS Storage Architecture

### Directory Structure

```
ipfs://fairwins.app/
├── markets/
│   ├── {marketId}/
│   │   ├── metadata.json          # Full market metadata
│   │   ├── description.md         # Detailed description
│   │   ├── resolution-criteria.md # How market resolves
│   │   ├── image.png              # Market image
│   │   └── assets/
│   │       ├── chart.png
│   │       └── video.mp4
│   └── index.json                 # Market registry
├── proposals/
│   ├── {proposalId}/
│   │   ├── metadata.json
│   │   ├── full-proposal.md
│   │   ├── budget.pdf
│   │   └── team/
│   │       ├── member1.json
│   │       └── member2.json
│   └── index.json
├── tokens/
│   ├── {tokenAddress}/
│   │   ├── metadata.json
│   │   └── logo.png
│   └── index.json
├── daos/
│   ├── {daoAddress}/
│   │   ├── metadata.json
│   │   ├── constitution.md
│   │   └── branding/
│   │       ├── logo.png
│   │       └── banner.png
│   └── index.json
└── schemas/
    ├── market-v1.json
    ├── proposal-v1.json
    ├── token-v1.json
    └── dao-v1.json
```

### Path Conventions

Following the established IPFS_IMPLEMENTATION_SUMMARY.md conventions:

- **Token Metadata**: `/token/{address}/metadata.json`
- **Market Data**: `/market/{id}/data.json`
- **Market Metadata**: `/market/{id}/metadata.json`
- **Proposal Metadata**: `/proposal/{id}/metadata.json`
- **DAO Metadata**: `/dao/{address}/metadata.json`

### IPFS Gateway Integration

The platform already has IPFS infrastructure (see IPFS_IMPLEMENTATION_SUMMARY.md):

**Service Layer** (`frontend/src/utils/ipfsService.js`):
- `fetchTokenMetadata(address)`
- `fetchMarketData(marketId)`
- `fetchMarketMetadata(marketId)`
- Generic `fetchFromIpfs(cid)`

**React Hooks** (`frontend/src/hooks/useIpfs.js`):
- `useTokenMetadata(address)`
- `useMarketData(marketId)`
- `useMarketMetadata(marketId)`
- `useIpfsByCid(cid)`

**Configuration** (`.env`):
```env
VITE_IPFS_GATEWAY=https://ipfs.fairwins.app
```

### Caching Strategy

- **In-memory cache**: 5-minute duration (existing)
- **Browser localStorage**: For frequently accessed data
- **Service worker cache**: For offline support
- **CDN caching**: At IPFS gateway level

---

## Data Relationships

### Entity Relationship Diagram

```
┌─────────────┐
│    DAO      │
└──────┬──────┘
       │ creates
       ├──────────────┐
       │              │
       ▼              ▼
┌─────────────┐  ┌─────────────┐
│  Proposal   │  │   Token     │
└──────┬──────┘  └──────┬──────┘
       │                │
       │ creates        │ used in
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│   Market    │◄─┤  Position   │
└──────┬──────┘  └─────────────┘
       │
       │ belongs to
       ▼
┌─────────────┐
│ Correlation │
│    Group    │
└─────────────┘
```

### Relationship Details

**DAO → Proposal** (One-to-Many):
- A DAO can have multiple proposals
- Each proposal belongs to one DAO
- Key: `proposal.daoAddress`

**DAO → Token** (One-to-Many):
- A DAO can create multiple tokens
- Tokens reference their DAO
- Key: `token.daoAddress`

**Proposal → Market** (One-to-One):
- Each proposal can have one market
- Markets reference their proposal
- Key: `market.proposalId`

**Market → Position** (One-to-Many):
- Markets have many positions
- Positions belong to one market
- Key: `position.marketId`

**Market → Correlation Group** (Many-to-One):
- Markets can belong to one group
- Groups contain multiple markets
- Key: `market.correlationGroupId`

**Token → Market** (One-to-Many):
- Tokens (PASS/FAIL) belong to markets
- Markets have two tokens
- Keys: `market.passToken`, `market.failToken`

---

## Migration Strategy

### Phase 1: Schema Definition (Complete)
✅ Define metadata schemas for all data objects
✅ Map smart contract fields to metadata
✅ Document IPFS path conventions

### Phase 2: Metadata Generation Service (Next)

Create a service to generate IPFS metadata from smart contract events:

```javascript
// services/metadataGenerator.js
async function generateMarketMetadata(marketId, onChainData) {
  const metadata = {
    name: onChainData.title,
    description: onChainData.description,
    external_url: `https://fairwins.app/market/${marketId}`,
    image: onChainData.imageUrl || defaultMarketImage,
    attributes: [
      { trait_type: "Category", value: onChainData.category },
      { trait_type: "Status", value: onChainData.status },
      { trait_type: "Total Liquidity", value: onChainData.totalLiquidity, display_type: "number" },
      { trait_type: "Trading Ends", value: onChainData.tradingEndTime, display_type: "date" }
    ]
  }
  
  // Upload to IPFS
  const cid = await uploadToIpfs(metadata)
  
  // Store CID reference
  await storeMetadataReference(marketId, cid)
  
  return cid
}
```

### Phase 3: Metadata Registry Contract

Create a simple registry to map IDs to IPFS CIDs:

```solidity
// contracts/MetadataRegistry.sol
contract MetadataRegistry {
    mapping(string => string) public metadata; // resourceType:id => IPFS CID
    
    function setMetadata(
        string calldata resourceType,
        uint256 resourceId,
        string calldata ipfsCid
    ) external {
        string memory key = string.concat(resourceType, ":", Strings.toString(resourceId));
        metadata[key] = ipfsCid;
    }
    
    function getMetadata(
        string calldata resourceType,
        uint256 resourceId
    ) external view returns (string memory) {
        string memory key = string.concat(resourceType, ":", Strings.toString(resourceId));
        return metadata[key];
    }
}
```

### Phase 4: Frontend Integration

Update components to fetch from IPFS:

**Before** (mock data):
```javascript
import { getMockMarkets } from '../utils/mockDataLoader'
const markets = getMockMarkets()
```

**After** (IPFS):
```javascript
import { useMarketData } from '../hooks/useIpfs'

function MarketDisplay({ marketId }) {
  const { data, loading, error } = useMarketData(marketId)
  // ... render
}
```

### Phase 5: Gradual Migration

1. **Parallel Operation**: Run both mock data and IPFS simultaneously
2. **Feature Flag**: Toggle between data sources
3. **Validation**: Compare IPFS data with mock data
4. **Monitoring**: Track fetch times, errors, cache hits
5. **Full Transition**: Remove mock data when IPFS is stable

### Phase 6: Optimization

- Implement batch fetching for lists
- Add service worker for offline support
- Optimize image sizes and formats
- Set up CDN caching rules
- Monitor and tune cache durations

---

## Example Metadata Files

### Example 1: Market Metadata

**File**: `ipfs://QmXXX/markets/0/metadata.json`

```json
{
  "name": "Bitcoin reaches $100K in 2025",
  "description": "Will Bitcoin (BTC) reach a price of $100,000 USD or higher at any point during the calendar year 2025?\n\n**Resolution Criteria:**\n- Market resolves to PASS if Bitcoin reaches $100,000 on any major exchange (Coinbase, Binance, Kraken) at any time during 2025\n- Market resolves to FAIL if Bitcoin does not reach $100,000 by December 31, 2025 11:59:59 PM UTC\n- Price data will be sourced from CoinGecko and verified across multiple exchanges\n\n**Important Notes:**\n- Intraday peaks count - the price only needs to hit $100K momentarily\n- All major exchanges are considered\n- UTC timezone is used for all dates",
  "external_url": "https://fairwins.app/market/11",
  "image": "ipfs://QmYYY/bitcoin-100k.png",
  "background_color": "F7931A",
  "attributes": [
    {
      "trait_type": "Category",
      "value": "Crypto"
    },
    {
      "trait_type": "Subcategory",
      "value": "Price Predictions"
    },
    {
      "trait_type": "Status",
      "value": "Active"
    },
    {
      "trait_type": "Total Liquidity",
      "value": 245600,
      "display_type": "number"
    },
    {
      "trait_type": "Trading End Time",
      "value": 1735689600,
      "display_type": "date"
    },
    {
      "trait_type": "Pass Token Price",
      "value": 0.59,
      "display_type": "number",
      "max_value": 1.0
    },
    {
      "trait_type": "Fail Token Price",
      "value": 0.41,
      "display_type": "number",
      "max_value": 1.0
    },
    {
      "trait_type": "Correlation Group",
      "value": "Bitcoin 2025 Price Milestones"
    },
    {
      "trait_type": "Bet Type",
      "value": "AboveBelow"
    },
    {
      "trait_type": "Oracle Type",
      "value": "Chainlink Price Feed"
    }
  ],
  "properties": {
    "market_id": 11,
    "proposal_id": 5,
    "pass_token": "0x1234...5678",
    "fail_token": "0xabcd...efgh",
    "collateral_token": "0x0000000000000000000000000000000000000000",
    "creator": "0x9012...3456",
    "created_at": "2024-10-15T14:30:00Z",
    "correlation_group_id": "btc-2025-milestones",
    "tags": ["bitcoin", "btc", "price", "2025", "milestone"],
    "oracle_sources": [
      "Chainlink BTC/USD",
      "CoinGecko API",
      "Binance API",
      "Coinbase API"
    ],
    "resolution_bond": "50",
    "challenge_period_hours": 24
  }
}
```

### Example 2: Proposal Metadata

**File**: `ipfs://QmZZZ/proposals/1/metadata.json`

```json
{
  "name": "Security Audit Partnership Program",
  "description": "Establish ongoing security audit partnerships with Trail of Bits and OpenZeppelin to ensure continuous security review of FairWins smart contracts.",
  "external_url": "https://fairwins.app/proposal/1",
  "image": "ipfs://QmAAA/security-audit.png",
  "attributes": [
    {
      "trait_type": "Category",
      "value": "Security"
    },
    {
      "trait_type": "Status",
      "value": "Active"
    },
    {
      "trait_type": "Funding Amount",
      "value": 40000,
      "display_type": "number"
    },
    {
      "trait_type": "Funding Token",
      "value": "ETC"
    },
    {
      "trait_type": "Welfare Metric",
      "value": "Hash Rate Security"
    },
    {
      "trait_type": "Phase",
      "value": "Market Trading"
    }
  ],
  "properties": {
    "proposal_id": 1,
    "dao_id": 0,
    "market_id": 1,
    "proposer": "0xprop...6789",
    "recipient": "0xsec1...2345",
    "bond_amount": "50",
    "submitted_at": "2024-12-14T10:00:00Z",
    "execution_deadline": "2025-01-31T23:59:59Z",
    "milestones": [
      {
        "description": "Trail of Bits initial audit",
        "percentage": 5000,
        "completion_criteria": "Complete audit report delivered",
        "timelock_days": 7
      },
      {
        "description": "OpenZeppelin partnership agreement",
        "percentage": 2500,
        "completion_criteria": "Signed contract for ongoing reviews",
        "timelock_days": 3
      },
      {
        "description": "Quarterly review program",
        "percentage": 2500,
        "completion_criteria": "First quarterly review completed",
        "timelock_days": 7
      }
    ],
    "documents": [
      {
        "name": "Full Proposal",
        "url": "ipfs://QmBBB/full-proposal.pdf",
        "type": "application/pdf"
      },
      {
        "name": "Budget Breakdown",
        "url": "ipfs://QmCCC/budget.pdf",
        "type": "application/pdf"
      }
    ],
    "team": [
      {
        "name": "Security Team Lead",
        "role": "Project Manager",
        "bio": "10 years experience in smart contract security",
        "avatar": "ipfs://QmDDD/avatar1.png"
      }
    ]
  }
}
```

### Example 3: Token Metadata

**File**: `ipfs://QmEEE/tokens/0xtoken1234/metadata.json`

```json
{
  "name": "FairWins Governance",
  "symbol": "FWIN",
  "description": "The FWIN token grants governance rights in the FairWins DAO, allowing holders to vote on protocol upgrades, parameter changes, and treasury allocation.",
  "external_url": "https://fairwins.app/token/fwin",
  "image": "ipfs://QmFFF/fwin-logo.png",
  "background_color": "3B82F6",
  "attributes": [
    {
      "trait_type": "Token Type",
      "value": "ERC20"
    },
    {
      "trait_type": "Category",
      "value": "Governance"
    },
    {
      "trait_type": "Total Supply",
      "value": 100000000,
      "display_type": "number"
    },
    {
      "trait_type": "Circulating Supply",
      "value": 42500000,
      "display_type": "number"
    },
    {
      "trait_type": "Holders",
      "value": 2847,
      "display_type": "number"
    },
    {
      "trait_type": "Burnable",
      "value": "Yes"
    },
    {
      "trait_type": "Pausable",
      "value": "Yes"
    }
  ],
  "properties": {
    "token_address": "0xtoken1234567890abcdef1234567890abcdef1234",
    "decimals": 18,
    "created_at": "2024-09-01T00:00:00Z",
    "creator": "0xowner1234567890abcdef1234567890abcdef1234",
    "listed_on_etcswap": true,
    "contract_verified": true,
    "tokenomics": {
      "initial_supply": 100000000,
      "max_supply": 100000000,
      "distribution": {
        "community": 40,
        "team": 20,
        "treasury": 30,
        "liquidity": 10
      }
    },
    "utility": [
      "Governance voting",
      "Proposal submission",
      "Fee discounts",
      "Staking rewards"
    ],
    "links": {
      "website": "https://fairwins.app",
      "twitter": "https://twitter.com/fairwins",
      "discord": "https://discord.gg/fairwins",
      "github": "https://github.com/fairwins"
    }
  }
}
```

### Example 4: DAO Metadata

**File**: `ipfs://QmGGG/daos/0xdao1234/metadata.json`

```json
{
  "name": "ETC Treasury DAO",
  "description": "Main governance DAO for Ethereum Classic treasury management and protocol upgrades. Uses futarchy governance to make data-driven decisions about protocol development and funding allocation.",
  "external_url": "https://fairwins.app/dao/etc-treasury",
  "image": "ipfs://QmHHH/etc-dao-logo.png",
  "banner_image": "ipfs://QmIII/etc-dao-banner.png",
  "background_color": "669900",
  "attributes": [
    {
      "trait_type": "Governance Type",
      "value": "Futarchy"
    },
    {
      "trait_type": "Status",
      "value": "Active"
    },
    {
      "trait_type": "Members",
      "value": 847,
      "display_type": "number"
    },
    {
      "trait_type": "Proposals",
      "value": 23,
      "display_type": "number"
    },
    {
      "trait_type": "Total Funding",
      "value": 1250000,
      "display_type": "number"
    },
    {
      "trait_type": "Treasury Value",
      "value": 12450000,
      "display_type": "number"
    }
  ],
  "properties": {
    "dao_address": "0x1234567890abcdef1234567890abcdef12345678",
    "created_at": "2024-10-01T00:00:00Z",
    "creator": "0x9012345678abcdef9012345678abcdef90123456",
    "contracts": {
      "futarchy_governor": "0x1234567890abcdef1234567890abcdef12345678",
      "welfare_registry": "0x2345678901abcdef2345678901abcdef23456789",
      "proposal_registry": "0x3456789012abcdef3456789012abcdef34567890",
      "market_factory": "0x4567890123abcdef4567890123abcdef45678901",
      "privacy_coordinator": "0x5678901234abcdef5678901234abcdef56789012",
      "oracle_resolver": "0x6789012345abcdef6789012345abcdef67890123",
      "ragequit_module": "0x7890123456abcdef7890123456abcdef78901234",
      "treasury_vault": "0x8901234567abcdef8901234567abcdef89012345"
    },
    "governance": {
      "type": "futarchy",
      "voting_token": "0xtoken1234567890abcdef1234567890abcdef1234",
      "quorum": 40,
      "proposal_bond": "50",
      "review_period_days": 7,
      "trading_period_days": 10
    },
    "welfare_metrics": [
      {
        "id": 0,
        "name": "Treasury Value",
        "weight": 5000
      },
      {
        "id": 1,
        "name": "Network Activity",
        "weight": 3000
      },
      {
        "id": 2,
        "name": "Hash Rate Security",
        "weight": 1500
      },
      {
        "id": 3,
        "name": "Developer Activity",
        "weight": 500
      }
    ],
    "documents": [
      {
        "name": "Constitution",
        "url": "ipfs://QmJJJ/constitution.md",
        "type": "text/markdown"
      },
      {
        "name": "Governance Guidelines",
        "url": "ipfs://QmKKK/governance.pdf",
        "type": "application/pdf"
      }
    ],
    "links": {
      "website": "https://ethereumclassic.org",
      "forum": "https://forum.ethereumclassic.org",
      "discord": "https://discord.gg/etc",
      "twitter": "https://twitter.com/eth_classic"
    }
  }
}
```

### Example 5: Correlation Group Metadata

**File**: `ipfs://QmLLL/correlation-groups/btc-2025-milestones/metadata.json`

```json
{
  "name": "Bitcoin 2025 Price Milestones",
  "description": "All markets related to Bitcoin price milestones during 2025. These markets are correlated because only one outcome can occur (mutually exclusive price levels).",
  "external_url": "https://fairwins.app/correlation-group/btc-2025-milestones",
  "image": "ipfs://QmMMM/btc-milestones.png",
  "attributes": [
    {
      "trait_type": "Category",
      "value": "Crypto"
    },
    {
      "trait_type": "Market Count",
      "value": 4,
      "display_type": "number"
    },
    {
      "trait_type": "Status",
      "value": "Active"
    },
    {
      "trait_type": "Correlation Type",
      "value": "Mutually Exclusive"
    }
  ],
  "properties": {
    "group_id": "btc-2025-milestones",
    "creator": "0xcreator4567890123abcdef4567890123abcdef",
    "created_at": "2024-11-01T00:00:00Z",
    "markets": [
      {
        "market_id": 49,
        "name": "Bitcoin reaches $75K by March 2025",
        "relationship": "milestone"
      },
      {
        "market_id": 11,
        "name": "Bitcoin reaches $100K in 2025",
        "relationship": "milestone"
      },
      {
        "market_id": 50,
        "name": "Bitcoin reaches $150K in 2025",
        "relationship": "milestone"
      }
    ],
    "correlation_rules": {
      "type": "price_ladder",
      "description": "Markets represent successive price milestones. If a higher milestone is reached, all lower milestones automatically resolve to PASS.",
      "resolution_logic": "cascading"
    },
    "tags": ["bitcoin", "price", "2025", "milestones", "correlated"]
  }
}
```

---

## Implementation Checklist

### Immediate Actions

- [x] Document metadata standard adoption
- [x] Define data object schemas
- [x] Create example metadata files
- [ ] Create MetadataRegistry smart contract
- [ ] Deploy MetadataRegistry to testnet
- [ ] Build metadata generation service
- [ ] Add IPFS upload functionality to market creation UI

### Short-term (1-2 weeks)

- [ ] Update ConditionalMarketFactory to emit metadata CIDs
- [ ] Update ProposalRegistry to emit metadata CIDs
- [ ] Create metadata validation service
- [ ] Build metadata preview in create-market flow
- [ ] Add IPFS metadata fetching to market display components
- [ ] Update useIpfs hooks for new schemas

### Medium-term (3-4 weeks)

- [ ] Migrate 50% of mock data to IPFS
- [ ] Implement feature flag for data source switching
- [ ] Add metadata editing UI for market creators
- [ ] Create admin tools for metadata management
- [ ] Set up monitoring for IPFS performance
- [ ] Document migration process for developers

### Long-term (1-2 months)

- [ ] Complete migration from mock data to IPFS
- [ ] Remove mock data files
- [ ] Optimize IPFS caching strategies
- [ ] Add metadata versioning support
- [ ] Implement metadata search/indexing
- [ ] Create metadata analytics dashboard

---

## Best Practices

### For Market Creators

1. **Rich Descriptions**: Use markdown to format detailed market descriptions
2. **Clear Resolution Criteria**: Be explicit about how and when markets resolve
3. **Quality Images**: Use high-resolution images (min 400x400px)
4. **Relevant Attributes**: Add searchable attributes for better discoverability
5. **External Links**: Reference data sources and related information

### For Developers

1. **Validate Schemas**: Always validate metadata against schemas before upload
2. **Handle Failures**: Implement fallbacks when IPFS is unavailable
3. **Cache Aggressively**: Use multi-layer caching to reduce IPFS calls
4. **Version Metadata**: Support schema versioning for upgrades
5. **Monitor Performance**: Track fetch times and error rates

### For Platform Operators

1. **Pin Important Data**: Pin high-traffic metadata on IPFS nodes
2. **CDN Integration**: Use CDN for IPFS gateway caching
3. **Backup Strategy**: Maintain backups of all metadata
4. **Regular Audits**: Verify metadata integrity periodically
5. **User Education**: Provide guides for creating quality metadata

---

## Conclusion

This master data plan establishes a robust foundation for transitioning from mock data to production-ready IPFS metadata storage. By adopting OpenSea standards, we ensure:

- **Compatibility**: Works with existing NFT infrastructure
- **Extensibility**: Easy to add new attributes and features
- **Discoverability**: Rich metadata enables powerful search and filtering
- **Consistency**: Standard format across all data objects
- **Reliability**: Decentralized storage with proven tooling

The implementation is designed to be gradual, allowing parallel operation during transition and minimizing risk to the platform.

---

## Appendix A: Schema Files

Create schema files in `frontend/src/schemas/` for validation:

### market-metadata-schema.json
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "description", "image", "attributes"],
  "properties": {
    "name": { "type": "string" },
    "description": { "type": "string" },
    "external_url": { "type": "string", "format": "uri" },
    "image": { "type": "string", "format": "uri" },
    "animation_url": { "type": "string", "format": "uri" },
    "background_color": { "type": "string", "pattern": "^[0-9A-Fa-f]{6}$" },
    "attributes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["trait_type", "value"],
        "properties": {
          "trait_type": { "type": "string" },
          "value": { "type": ["string", "number"] },
          "display_type": { "enum": ["string", "number", "date", "boost_number", "boost_percentage"] }
        }
      }
    },
    "properties": { "type": "object" }
  }
}
```

## Appendix B: References

- **OpenSea Metadata Standards**: https://docs.opensea.io/docs/metadata-standards
- **ERC721 Specification**: https://eips.ethereum.org/EIPS/eip-721
- **IPFS Documentation**: https://docs.ipfs.tech/
- **FairWins IPFS Integration**: `IPFS_IMPLEMENTATION_SUMMARY.md`
- **Existing Smart Contracts**: See `contracts/` directory

---

*Document Version: 1.0*  
*Last Updated: 2024-12-28*  
*Author: FairWins Development Team*
