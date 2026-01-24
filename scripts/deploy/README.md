# Deployment Scripts

This directory contains consolidated deployment scripts for the FairWins DAO smart contracts.

## Quick Start

### Local Development (Localhost)

```bash
# Terminal 1: Start Hardhat node
npm run node

# Terminal 2: Deploy contracts
npx hardhat run scripts/deploy/01-deploy-core.js --network localhost
npx hardhat run scripts/deploy/02-deploy-rbac.js --network localhost
npx hardhat run scripts/deploy/03-deploy-markets.js --network localhost
npx hardhat run scripts/deploy/04-deploy-registries.js --network localhost
npx hardhat run scripts/deploy/05-configure.js --network localhost
npx hardhat run scripts/deploy/06-verify.js --network localhost

# Sync frontend
npm run sync:frontend-contracts -- --network localhost --chainId 1337

# Seed test data
npm run seed:local
```

### Mordor Testnet

```bash
# Deploy to Mordor
npx hardhat run scripts/deploy/01-deploy-core.js --network mordor
npx hardhat run scripts/deploy/02-deploy-rbac.js --network mordor
npx hardhat run scripts/deploy/03-deploy-markets.js --network mordor
npx hardhat run scripts/deploy/04-deploy-registries.js --network mordor
npx hardhat run scripts/deploy/05-configure.js --network mordor
npx hardhat run scripts/deploy/06-verify.js --network mordor
```

## Script Overview

| Script | Description |
|--------|-------------|
| `01-deploy-core.js` | Core contracts: RoleManagerCore, WelfareMetricRegistry, ProposalRegistry, ConditionalMarketFactory, PrivacyCoordinator, OracleResolver, RagequitModule, FutarchyGovernor, TokenMintFactory, DAOFactory |
| `02-deploy-rbac.js` | RBAC system: TieredRoleManager, TierRegistry, UsageTracker, MembershipManager, PaymentProcessor, MembershipPaymentManager |
| `03-deploy-markets.js` | Market factories: CTF1155, FriendGroupMarketFactory, PerpetualFuturesFactory (optional) |
| `04-deploy-registries.js` | Registries: MarketCorrelationRegistry, NullifierRegistry |
| `05-configure.js` | Post-deployment configuration: authorization, role prices, contract wiring |
| `06-verify.js` | Verification: checks all contracts are deployed and properly connected |

## Directory Structure

```
scripts/deploy/
├── lib/
│   ├── constants.js     # Centralized addresses, role hashes, tier configs
│   └── helpers.js       # Shared deployment utilities
│
├── 01-deploy-core.js    # Core governance contracts
├── 02-deploy-rbac.js    # Role-based access control
├── 03-deploy-markets.js # Market factories
├── 04-deploy-registries.js # Supporting registries
├── 05-configure.js      # Post-deployment configuration
├── 06-verify.js         # Deployment verification
│
├── archive/             # Deprecated scripts (preserved for reference)
│   └── ...
│
└── README.md            # This file
```

## Deployment Order

Scripts must be run in order due to dependencies:

```
01-deploy-core.js
       ↓
02-deploy-rbac.js (depends on RoleManagerCore from 01)
       ↓
03-deploy-markets.js (depends on MarketFactory, RagequitModule, TieredRoleManager)
       ↓
04-deploy-registries.js (standalone)
       ↓
05-configure.js (configures all deployed contracts)
       ↓
06-verify.js (verifies everything is properly connected)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VERIFY` | `true` | Enable Blockscout verification |
| `VERIFY_RETRIES` | `6` | Verification retry count |
| `VERIFY_DELAY_MS` | `20000` | Delay between retries (ms) |
| `INIT` | `true` | Auto-initialize contracts |
| `DEPLOY_PERPETUALS` | `false` | Deploy perpetual futures contracts |
| `TREASURY_ADDRESS` | deployer | Treasury address for payments |

## Deployment Artifacts

Each script saves a JSON file to `deployments/`:

- `<network>-chain<chainId>-core-deployment.json`
- `<network>-chain<chainId>-rbac-deployment.json`
- `<network>-chain<chainId>-markets-deployment.json`
- `<network>-chain<chainId>-registries-deployment.json`

## Shared Library

### lib/constants.js

Contains centralized configuration:
- `SINGLETON_FACTORY_ADDRESS` - Safe Singleton Factory
- `TOKENS` - Token addresses per network (USC, WETC)
- `ROLE_HASHES` - Pre-computed role hashes
- `MembershipTier` - Tier enum values
- `FRIEND_MARKET_TIERS` / `MARKET_MAKER_TIERS` - Tier configurations
- `SALT_PREFIXES` - Deterministic deployment salts
- `NETWORK_CONFIG` - Network-specific settings

### lib/helpers.js

Contains shared utilities:
- `deployDeterministic()` - CREATE2 deployment via Safe Singleton Factory
- `ensureSingletonFactory()` - Auto-deploy factory on localhost
- `verifyOnBlockscout()` - Contract verification with retry logic
- `tryInitialize()` - Safe contract initialization
- `safeTransferOwnership()` - Ownership transfer with checks
- `saveDeployment()` / `loadDeployment()` - Artifact management
- `configureTier()` - Tier setup helper

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 8545 in use | `kill $(lsof -t -i:8545)` or restart terminal |
| Gas estimation failed | Restart Hardhat node with fresh state |
| Contract already deployed | Expected with deterministic deployment - skipped |
| Frontend not connecting | Check `VITE_RPC_URL=http://127.0.0.1:8545` |
| Verification failed | Can retry later once Blockscout indexes |

## Archive

The `archive/` directory contains deprecated scripts preserved for reference:
- Legacy deployment scripts (superseded by numbered versions)
- One-off fix scripts
- Individual check scripts (consolidated into 06-verify.js)

These are not needed for normal deployments but may be useful for debugging or understanding historical changes.
