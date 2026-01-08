# Smart Contracts Directory Structure

This directory contains all Solidity smart contracts for the FairWins prediction market platform, organized by functional domain.

## Directory Layout

```
contracts/
├── core/                 # Core governance and DAO contracts
├── markets/              # Prediction market contracts
├── access/               # Access control and role management
├── security/             # Security and protection systems
├── treasury/             # Treasury and vault contracts
├── tokens/               # Token-related contracts
├── privacy/              # Privacy and ZK proof contracts
├── oracles/              # Oracle and resolution contracts
├── integrations/         # External protocol integrations
├── metadata/             # Metadata storage contracts
├── libraries/            # Reusable Solidity libraries
├── interfaces/           # External interface definitions
├── mocks/                # Mock contracts for testing
├── modular/              # Modular component contracts
└── test/                 # Fuzz test contracts
```

## Folder Descriptions

### `core/` - Core Governance Contracts

The foundational contracts that orchestrate the DAO and governance system.

| Contract | Description |
|----------|-------------|
| `FutarchyGovernor.sol` | Main governance coordinator using prediction markets for decision-making |
| `TraditionalGovernor.sol` | Traditional token-weighted voting governance |
| `DAOFactory.sol` | Factory for deploying new DAO instances |
| `ProposalRegistry.sol` | Permissionless proposal submission and management |
| `WelfareMetricRegistry.sol` | On-chain storage of protocol success metrics |

### `markets/` - Prediction Market Contracts

Contracts for creating and managing prediction markets.

| Contract | Description |
|----------|-------------|
| `ConditionalMarketFactory.sol` | Creates pass/fail prediction markets using Gnosis CTF |
| `FriendGroupMarketFactory.sol` | Small-scale markets between trusted parties |
| `PredictionMarketExchange.sol` | EIP-712 order book exchange for market positions |
| `MarketCorrelationRegistry.sol` | Groups related markets for correlation analysis |
| `CTF1155.sol` | ERC-1155 conditional tokens for market positions |

### `access/` - Access Control Contracts

Role-based access control and membership management.

| Contract | Description |
|----------|-------------|
| `RoleManager.sol` | Enterprise-grade RBAC with hierarchy and timelocks |
| `MinimalRoleManager.sol` | Lightweight role management for simple deployments |
| `TieredRoleManager.sol` | Role management with membership tiers |
| `TieredRoleManagerLite.sol` | Optimized tier management for gas efficiency |
| `MembershipPaymentManager.sol` | Handles membership payments and renewals |

### `security/` - Security Contracts

Protection mechanisms and safety systems.

| Contract | Description |
|----------|-------------|
| `NullifierRegistry.sol` | RSA accumulator-based blocklist for markets and addresses |
| `RagequitModule.sol` | Minority protection exit mechanism |

### `treasury/` - Treasury Contracts

Fund management and vault contracts.

| Contract | Description |
|----------|-------------|
| `TreasuryVault.sol` | DAO treasury with spending limits and nullification |
| `MarketVault.sol` | Per-market collateral management |

### `tokens/` - Token Contracts

ERC-20 and ERC-721 token contracts.

| Contract | Description |
|----------|-------------|
| `FairWinsToken.sol` | Native governance token with voting capabilities |
| `TokenMintFactory.sol` | Factory for creating custom ERC-20/721 tokens |

### `privacy/` - Privacy Contracts

Zero-knowledge proof and privacy-preserving components.

| Contract | Description |
|----------|-------------|
| `PrivacyCoordinator.sol` | MACI-style encrypted message submission |
| `ZKVerifier.sol` | On-chain zero-knowledge proof verification |
| `ZKKeyManager.sol` | Manages ZK proving keys and verification keys |

### `oracles/` - Oracle Contracts

Market resolution and oracle management.

| Contract | Description |
|----------|-------------|
| `OracleResolver.sol` | Multi-stage resolution with dispute mechanisms |

### `integrations/` - External Integrations

Contracts for integrating with external protocols.

| Contract | Description |
|----------|-------------|
| `ETCSwapV3Integration.sol` | Uniswap V3-compatible DEX integration |
| `GovernanceIntentHandler.sol` | EIP-712 intent handling for gasless operations |

### `metadata/` - Metadata Contracts

On-chain metadata storage.

| Contract | Description |
|----------|-------------|
| `MetadataRegistry.sol` | Stores proposal and market metadata on-chain |

### `libraries/` - Reusable Libraries

Solidity libraries used across multiple contracts.

| Library | Description |
|---------|-------------|
| `RSAAccumulator.sol` | RSA accumulator operations with EIP-198 |
| `PrimeMapping.sol` | Maps hashes to prime numbers for accumulators |

### `interfaces/` - Interface Definitions

External protocol interfaces.

```
interfaces/
└── uniswap-v3/
    ├── INonfungiblePositionManager.sol
    ├── ISwapRouter.sol
    ├── IUniswapV3Factory.sol
    └── IUniswapV3Pool.sol
```

### `mocks/` - Mock Contracts

Test doubles for external dependencies.

```
mocks/
├── MockERC20.sol
└── uniswap-v3/
    ├── MockNonfungiblePositionManager.sol
    ├── MockSwapRouter.sol
    ├── MockUniswapV3Factory.sol
    └── MockUniswapV3Pool.sol
```

### `modular/` - Modular Components

Composable contract components for flexible deployments.

| Contract | Description |
|----------|-------------|
| `RoleManagerCore.sol` | Core role management logic |
| `TierRegistry.sol` | Tier configuration storage |
| `MembershipManager.sol` | Membership lifecycle management |
| `PaymentProcessor.sol` | Payment handling logic |
| `UsageTracker.sol` | Tracks feature usage per tier |

### `test/` - Fuzz Test Contracts

Solidity contracts used for fuzz testing with tools like Echidna.

| Contract | Description |
|----------|-------------|
| `ProposalRegistryFuzzTest.sol` | Invariant tests for ProposalRegistry |
| `WelfareMetricRegistryFuzzTest.sol` | Invariant tests for WelfareMetricRegistry |

## Dependency Graph

```
                    ┌─────────────────┐
                    │   core/         │
                    │ FutarchyGovernor│
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   markets/    │   │   privacy/    │   │   oracles/    │
│ Conditional   │   │ Privacy       │   │ Oracle        │
│ MarketFactory │   │ Coordinator   │   │ Resolver      │
└───────┬───────┘   └───────────────┘   └───────────────┘
        │
        │
        ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   access/     │   │  security/    │   │  treasury/    │
│ TieredRole    │◄──│ Nullifier     │──►│ Treasury      │
│ Manager       │   │ Registry      │   │ Vault         │
└───────────────┘   └───────┬───────┘   └───────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  libraries/   │
                    │ RSAAccumulator│
                    │ PrimeMapping  │
                    └───────────────┘
```

## Import Conventions

When importing contracts, use relative paths based on the current file's location:

```solidity
// From core/ importing from markets/
import "../markets/ConditionalMarketFactory.sol";

// From markets/ importing from access/
import "../access/TieredRoleManager.sol";

// From security/ importing from libraries/
import "../libraries/RSAAccumulator.sol";
```

OpenZeppelin contracts are imported using the package path:

```solidity
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
```

## Compilation

Contracts are compiled using Hardhat:

```bash
# Compile all contracts
npm run compile

# or
npx hardhat compile
```

## Testing

Tests are located in `/test` and can be run with:

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/ConditionalMarketFactory.test.js
```

## Deployment

See the deployment scripts in `/scripts` and deployment documentation in `/docs/research/DEPLOYMENT.md`.
