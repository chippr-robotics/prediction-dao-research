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

### Polygon Amoy (Polymarket testnet)

```bash
# Deploy to Polygon Amoy
npx hardhat run scripts/deploy/01-deploy-core.js --network amoy
npx hardhat run scripts/deploy/02-deploy-rbac.js --network amoy
npx hardhat run scripts/deploy/03-deploy-markets.js --network amoy
npx hardhat run scripts/deploy/04-deploy-registries.js --network amoy
npx hardhat run scripts/deploy/05-configure.js --network amoy
npx hardhat run scripts/deploy/06-verify.js --network amoy
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

## Upgradeable contracts (UUPS proxies)

Two contracts deploy as **UUPS proxies** (via `scripts/deploy/lib/upgradeable.js`):
`WagerRegistry` (spec 025) and `MembershipManager` (spec 027). Each records a
stable **proxy** address (consumed by the frontend and subgraph) plus a current
**implementation** address (changes on every upgrade):

| Contract | Proxy key | Implementation key |
|----------|-----------|--------------------|
| WagerRegistry | `wagerRegistry` | `wagerRegistryImpl` |
| MembershipManager | `membershipManager` | `membershipManagerImpl` |

If a prior non-upgradeable registry coexists, it is recorded as
`wagerRegistryLegacy` (settle-only).

**Registry → membership repoint (cutover).** `WagerRegistry` resolves
membership against the `MembershipManager` **proxy**. On a fresh full deploy the
registry is initialized pointing at the proxy directly; when migrating a network
whose registry pointed at a non-proxy membership authority, repoint it with
`WagerRegistry.setMembershipManager(<membershipManager proxy>)` at cutover (and
withdraw any accrued fees from the legacy authority via its admin path). The
voucher rail (spec 026) ships as the **first in-place upgrade** of the
`membershipManager` proxy — never a redeploy.

**Pre-flight gate.** Before deploying or upgrading, run:

```bash
npm run check:storage-layout
```

Storage is append-only; this check validates the layout against the recorded
baseline and **gates CI**, so an incompatible layout fails before anything
reaches a network.

**Ship logic changes as in-place upgrades, not redeploys.** Re-running
`deploy.js` mints a **new** proxy at a new address — it is **not** idempotent
for the proxy, so a fresh deploy would strand existing wagers behind the old
address. To change `WagerRegistry` logic on a live network, perform an upgrade
(authorised by `UPGRADER_ROLE`, signed with the floppy keystore) following the
[Contract upgrades runbook](../../docs/runbooks/contract-upgrades.md). The proxy
address and all escrowed state are preserved; only `wagerRegistryImpl` changes.

## Shared Library

### lib/constants.js

Contains centralized configuration:
- `SINGLETON_FACTORY_ADDRESS` - Safe Singleton Factory
- `TOKENS` - Token addresses per network (USDC, WMATIC)
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
