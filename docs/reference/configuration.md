# Configuration

System parameters and configuration options.

## Bond Requirements

```solidity
// Proposal submission bond
uint256 public constant PROPOSAL_BOND = 50 ether;

// Oracle reporter bond
uint256 public constant ORACLE_BOND = 100 ether;

// Challenge bond (must exceed reporter bond)
uint256 public constant CHALLENGE_BOND = 150 ether;
```

## Spending Limits

```solidity
// Maximum per proposal
uint256 public constant MAX_PROPOSAL_AMOUNT = 50_000 ether;

// Daily aggregate limit
uint256 public constant DAILY_SPENDING_LIMIT = 100_000 ether;
```

## Time Periods

```solidity
// Review period after submission
uint256 public constant REVIEW_PERIOD = 7 days;

// Trading period range
uint256 public constant MIN_TRADING_PERIOD = 7 days;
uint256 public constant MAX_TRADING_PERIOD = 21 days;

// Settlement window for oracle
uint256 public constant SETTLEMENT_WINDOW = 3 days;

// Challenge period
uint256 public constant CHALLENGE_PERIOD = 2 days;

// Timelock before execution
uint256 public constant TIMELOCK_PERIOD = 2 days;
```

## Market Parameters

```solidity
// LMSR liquidity parameter
uint256 public liquidityParameter = 1000 ether;

// Initial token prices
uint256 public constant INITIAL_PRICE = 0.5 ether;
```

## Guardian Configuration

```solidity
// Guardian multisig threshold
uint256 public guardianThreshold = 5;
uint256 public guardianCount = 7;
```

## Environment Variables

For frontend configuration:

```bash
# Contract addresses
VITE_CONTRACT_FUTARCHY_GOVERNOR=0x...
VITE_CONTRACT_PROPOSAL_REGISTRY=0x...
VITE_CONTRACT_MARKET_FACTORY=0x...

# Network configuration  
VITE_NETWORK_NAME="Hardhat Local"
VITE_NETWORK_CHAIN_ID=1337
VITE_NETWORK_RPC_URL="http://127.0.0.1:8545"
```

## Updating Configuration

Configuration can be updated via governance proposals. See [Governance](../system-overview/governance.md).
