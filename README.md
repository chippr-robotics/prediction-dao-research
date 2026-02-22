# FairWins — P2P Wager Management Layer

> A smart contract infrastructure for managing peer-to-peer wagers that resolve based on external oracle sources.

FairWins is **not** a prediction market. It's a wager management layer that enables friends and groups to create private wagers that automatically resolve based on trusted external sources like Polymarket, Chainlink price feeds, and UMA's optimistic oracle.

## Key Insight

Rather than compete with established prediction markets, FairWins **leverages** them. When you and your friends want to bet on whether Bitcoin will hit $100k, FairWins handles the stake management, dispute resolution, and payout distribution—while the actual outcome is determined by battle-tested oracles.

## Features

### Multi-Oracle Resolution

Create wagers that resolve from multiple oracle sources:

| Oracle | Use Case | Resolution Type |
|--------|----------|-----------------|
| **Polymarket** | Event outcomes | Binary YES/NO markets |
| **Chainlink** | Price targets | Above/below thresholds |
| **UMA** | Custom claims | Optimistic assertion with disputes |
| **Manual** | Friend disputes | Challenge period + arbitration |

### Friend Group Markets

Private wagers between trusted groups with:

- **1v1 Markets**: Direct bets between two parties
- **Group Markets**: 3-10 participants for pools and props
- **Market Pegging**: Auto-resolve based on Polymarket outcomes
- **Manual Resolution**: Creator-resolved with challenge period

### Safety Mechanisms

- **24-hour Challenge Period**: Dispute manual resolutions before finalization
- **90-day Claim Timeout**: Unclaimed funds return to treasury
- **30-day Oracle Timeout**: Stuck markets trigger mutual refund option
- **Stake Escrow**: All funds locked in contract until resolution

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FriendGroupMarketFactory                 │
│  • Create wagers  • Manage stakes  • Handle resolutions     │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Polymarket │  │  Chainlink  │  │     UMA     │
│   Adapter   │  │   Adapter   │  │   Adapter   │
│             │  │             │  │             │
│ Event bets  │  │ Price bets  │  │ Custom bets │
└─────────────┘  └─────────────┘  └─────────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
                 ┌─────────────┐
                 │   Oracle    │
                 │  Registry   │
                 │             │
                 │ Aggregation │
                 └─────────────┘
```

## Quick Start

### Installation

```bash
npm install
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Create a Wager (Pegged to Polymarket)

```solidity
// Create a market pegged to Polymarket's Bitcoin $100k market
uint256 marketId = factory.createPeggedMarket(
    "BTC $100k Pool",
    polymarketConditionId,
    [alice, bob, carol],
    1 ether  // stake per person
);

// After Polymarket resolves, anyone can trigger resolution
factory.resolveFromOracle(marketId);

// Winners claim their stakes
factory.claimWinnings(marketId);
```

### Create a Price-Based Wager (Chainlink)

```solidity
// Create condition: ETH above $5000 by end of 2025
bytes32 conditionId = chainlinkAdapter.createCondition(
    ethPriceFeed,
    5000_00000000,  // $5000 (8 decimals)
    ComparisonType.ABOVE,
    1735689600,     // Dec 31, 2025
    "ETH above $5000 by 2025"
);

// Create wager using this condition
uint256 marketId = factory.createOracleMarket(conditionId, ...);
```

### Create a Custom Wager (UMA)

```solidity
// Create condition for any verifiable claim
bytes32 conditionId = umaAdapter.createCondition(
    "Lakers will win the 2025 NBA Finals",
    deadline
);

// After deadline, someone asserts the outcome (requires bond)
umaAdapter.assertOutcome(conditionId, true);

// After challenge period, settle
umaAdapter.settleCondition(conditionId);
```

## Contracts

### Core

| Contract | Description |
|----------|-------------|
| `FriendGroupMarketFactory` | Creates and manages P2P wagers |
| `OracleRegistry` | Aggregates multiple oracle adapters |

### Oracle Adapters

| Contract | Oracle | Use Case |
|----------|--------|----------|
| `PolymarketOracleAdapter` | Polymarket CTF | Event outcome markets |
| `ChainlinkOracleAdapter` | Chainlink | Price threshold conditions |
| `UMAOracleAdapter` | UMA OOv3 | Arbitrary truth assertions |

### Interfaces

| Interface | Description |
|-----------|-------------|
| `IOracleAdapter` | Standard interface for oracle adapters |

## Wager Lifecycle

```
1. CREATE       → Stakes locked in escrow
2. ACTIVE       → Waiting for resolution source
3. RESOLVE      → Oracle provides outcome OR manual resolution
   └─ CHALLENGE → 24h dispute window (manual only)
4. FINALIZE     → Resolution confirmed
5. CLAIM        → Winners withdraw stakes
   └─ TIMEOUT   → 90 days to claim, then treasury
```

## Safety Features

### Challenge Period (Manual Resolutions)

When markets are resolved manually, a 24-hour challenge period allows participants to dispute:

```solidity
// Challenger must post a bond
factory.challengeResolution{value: 0.1 ether}(marketId);

// Admin resolves dispute
factory.resolveDispute(marketId, true);  // Challenger wins
```

### Oracle Timeout

If an oracle-pegged market doesn't resolve within 30 days of expected time:

```solidity
// Anyone can trigger timeout mode
factory.triggerOracleTimeout(marketId);

// Both parties can accept mutual refund
factory.acceptMutualRefund(marketId);  // Each party calls

// Or admin can force resolution
factory.forceOracleResolution(marketId, true);
```

### Claim Timeout

Unclaimed winnings return to treasury after 90 days:

```solidity
// After 90 days, treasury can sweep
factory.sweepUnclaimedFunds(marketId);
```

## Testing

The test suite covers all functionality:

```
1237 passing tests

Test Files:
- FriendGroupMarketFactory.test.js (78 tests)
- FriendGroupMarketFactory.Claim.test.js (16 tests)
- FriendGroupMarketFactory.Challenge.test.js (31 tests)
- FriendGroupMarketFactory.Timeout.test.js (18 tests)
- FriendGroupMarketFactory.OracleTimeout.test.js (22 tests)
- OracleRegistry.test.js (34 tests)
- ChainlinkOracleAdapter.test.js (35 tests)
- UMAOracleAdapter.test.js (25 tests)
- PolymarketOracleAdapter.test.js (various)
```

## Why Not Build a Prediction Market?

Prediction markets are hard:

1. **Liquidity** — Need market makers and deep order books
2. **Oracles** — Need reliable resolution for every market
3. **Regulation** — Complex legal landscape
4. **Competition** — Polymarket, Kalshi, etc. already exist

FairWins sidesteps these by:

1. **No liquidity needed** — Fixed stakes, no AMM required
2. **Leverage existing oracles** — Polymarket, Chainlink, UMA do the hard work
3. **P2P focus** — Friends betting with friends
4. **Complementary** — Use alongside prediction markets, not instead of

## Development

### Prerequisites

- Node.js v18+
- npm or yarn

### Local Development

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/OracleRegistry.test.js

# Generate coverage report
npx hardhat coverage
```

### Adding a New Oracle Adapter

1. Implement `IOracleAdapter` interface
2. Add to `OracleRegistry`
3. Write tests
4. Update documentation

```solidity
contract MyOracleAdapter is IOracleAdapter {
    function oracleType() external pure returns (string memory) {
        return "MyOracle";
    }

    function isConditionSupported(bytes32 conditionId) external view returns (bool);
    function isConditionResolved(bytes32 conditionId) external view returns (bool);
    function getOutcome(bytes32 conditionId) external view returns (
        bool outcome, uint256 confidence, uint256 resolvedAt
    );
    function getConditionMetadata(bytes32 conditionId) external view returns (
        string memory description, uint256 expectedResolutionTime
    );
}
```

## License

Apache License 2.0

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## Security

For security concerns, please email security@fairwins.app
