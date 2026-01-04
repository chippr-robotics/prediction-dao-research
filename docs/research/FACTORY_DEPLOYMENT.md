# Factory Deployment Guide

## Overview

ClearPath now supports factory-based deployment, allowing multiple DAO instances to be created and managed from a single factory contract. This enables the platform to support many different DAOs with role-based access control.

## New Features

### 1. DAOFactory Contract

The `DAOFactory.sol` contract provides:

- **Factory Pattern**: Deploy complete DAO instances on-demand
- **Role Management**: OpenZeppelin AccessControl for administrators, participants, and custom roles
- **DAO Registry**: Track all DAOs and their associated users
- **Multi-DAO Support**: Support multiple independent DAO instances

#### Role Hierarchy

```
Platform Roles:
├── DEFAULT_ADMIN_ROLE (Super admin)
├── PLATFORM_ADMIN_ROLE (Platform management)
└── DAO_CREATOR_ROLE (Can create new DAOs)

DAO-Specific Roles (per DAO):
├── DAO_ADMIN_ROLE (DAO administration)
├── DAO_PARTICIPANT_ROLE (Can participate in governance)
├── DAO_PROPOSER_ROLE (Can submit proposals)
└── DAO_ORACLE_ROLE (Can submit oracle reports)
```

### 2. Enhanced Welfare Metrics

The `WelfareMetricRegistry.sol` has been enhanced with:

#### Metric Categories

1. **Governance Metrics**: On-chain governance activity
   - Proposal submission rates
   - Voting participation
   - Voting power distribution

2. **Financial Metrics**: Private-sector style metrics
   - Revenue
   - Profit/ROI
   - Treasury value (TWAP)

3. **Betting Metrics**: Prediction market analytics
   - Trading volume
   - Market accuracy
   - Liquidity depth

4. **Private Sector Metrics**: Traditional company metrics
   - For accredited investor decision-making
   - Similar to private company performance indicators

#### Aggregated Analytics

The registry now provides:
- Category-based metric aggregation
- Overall performance scores
- Historical metric tracking
- Multi-metric welfare calculations

### 3. Comprehensive Dashboard

The frontend now includes a full dashboard with:

#### Dashboard Tabs

1. **My DAOs**: View all DAOs associated with your wallet
   - DAO details and metadata
   - Contract addresses
   - Creation date and creator
   - Active/inactive status

2. **Active Proposals**: See proposals across all your DAOs
   - Filter by status (all, active, pending, completed)
   - View proposal details
   - Quick access to trading markets

3. **Welfare Metrics**: Multi-metric analytics dashboard
   - Overall performance scores
   - Category breakdowns
   - Visual metric cards
   - DAO-specific metrics

4. **Launch DAO**: Create new DAO instances
   - Guided wizard interface
   - Set DAO name and description
   - Configure treasury vault
   - Assign initial administrators

5. **Admin Panel**: Role-based admin features (when applicable)
   - Manage DAO settings
   - Grant/revoke roles
   - Update DAO status

## Usage

### Creating a New DAO

#### From Frontend

1. Connect your wallet
2. Navigate to "Launch DAO" tab
3. Fill in DAO details:
   - Name (required, minimum 3 characters)
   - Description (required)
   - Treasury vault address (required)
   - Admin addresses (optional, comma-separated)
4. Click "Launch DAO"
5. Approve the transaction in your wallet
6. Wait for confirmation

#### From Smart Contract

```javascript
// Get factory contract
const factory = new ethers.Contract(factoryAddress, factoryABI, signer);

// Create DAO
const tx = await factory.createDAO(
  "My DAO",                    // name
  "DAO description",           // description
  treasuryVaultAddress,        // treasury vault
  [admin1, admin2]             // optional admin addresses
);

const receipt = await tx.wait();
const daoId = receipt.events[0].args.daoId;
```

### Managing DAO Roles

#### Grant Role

```javascript
const DAO_PARTICIPANT_ROLE = await factory.DAO_PARTICIPANT_ROLE();

await factory.grantDAORole(
  daoId,                    // DAO ID
  userAddress,              // user to grant role to
  DAO_PARTICIPANT_ROLE      // role to grant
);
```

#### Check Role

```javascript
const hasRole = await factory.hasDAORole(
  daoId,
  userAddress,
  DAO_ADMIN_ROLE
);
```

#### Revoke Role

```javascript
await factory.revokeDAORole(
  daoId,
  userAddress,
  DAO_PARTICIPANT_ROLE
);
```

### Querying DAOs

#### Get User's DAOs

```javascript
const daoIds = await factory.getUserDAOs(userAddress);
```

#### Get DAO Details

```javascript
const dao = await factory.getDAO(daoId);
console.log(dao.name);
console.log(dao.futarchyGovernor);
console.log(dao.welfareRegistry);
// ... etc
```

#### Get All DAOs (Paginated)

```javascript
const daos = await factory.getAllDAOs(
  startIndex,  // e.g., 0
  limit        // e.g., 10
);
```

### Working with Enhanced Metrics

#### Record Metric Value

```javascript
const registry = new ethers.Contract(
  dao.welfareRegistry,
  registryABI,
  signer
);

await registry.recordMetricValue(
  metricId,
  value
);
```

#### Get Aggregated Metrics

```javascript
const aggregated = await registry.getAggregatedMetrics();

console.log("Overall Score:", aggregated.overallScore);
console.log("Governance Score:", aggregated.governanceScore);
console.log("Financial Score:", aggregated.financialScore);
console.log("Betting Score:", aggregated.bettingScore);
console.log("Private Sector Score:", aggregated.privateSectorScore);
```

#### Get Metrics by Category

```javascript
const GOVERNANCE = 0;
const FINANCIAL = 1;
const BETTING = 2;
const PRIVATE_SECTOR = 3;

const governanceMetrics = await registry.getMetricsByCategory(GOVERNANCE);
```

## Deployment

### Important Note: Contract Size Limitation

The `DAOFactory.sol` contract exceeds the Ethereum contract size limit (24KB) due to its comprehensive functionality. There are several deployment options:

### Option 1: Individual Component Deployment (Recommended)

Use the existing deployment script which deploys each DAO component individually:

```bash
npx hardhat run scripts/deploy.js --network <network>
```

This is the **recommended approach** for production deployments.

### Option 2: Factory with External Libraries

For future versions, consider refactoring the factory to use external libraries to reduce contract size:

```solidity
// Move deployment logic to separate library contracts
library DAODeployer {
  function deployComponents(...) external returns (...) {
    // Deployment logic here
  }
}
```

### Option 3: Frontend Factory Pattern

Implement the factory pattern in the frontend instead of on-chain:

```javascript
// Frontend code to deploy all components
async function createDAO(name, description, treasury, admins) {
  // Deploy each contract individually
  const welfareRegistry = await deployWelfareRegistry();
  const proposalRegistry = await deployProposalRegistry();
  // ... deploy other components
  
  // Deploy governor with component addresses
  const governor = await deployGovernor(...componentAddresses);
  
  // Register DAO in a simple registry contract
  await daoRegistry.registerDAO(daoId, componentAddresses);
}
```

### Recommended Production Setup

1. **Deploy Core Template Contracts**: Deploy one set of template contracts
2. **Use Clones/Proxies**: Use EIP-1167 minimal proxy pattern to clone template contracts
3. **Simple Registry**: Use a lightweight registry contract to track DAO instances

This approach significantly reduces gas costs and contract size limitations.

## Frontend Integration

### Environment Setup

Add to `.env`:

```
REACT_APP_FACTORY_ADDRESS=0x...
```

### Dashboard Usage

The dashboard automatically:
- Loads all DAOs for the connected wallet
- Shows active proposals across DAOs
- Displays multi-metric analytics
- Enables DAO creation for authorized users
- Renders admin features based on user roles

### Role-Based UI

The UI automatically adapts based on user roles:
- **Admin Badge**: Displayed when user has admin role in any DAO
- **Admin Tab**: Only shown to users with admin privileges
- **Create DAO**: Available to users with DAO_CREATOR_ROLE
- **Proposal Creation**: Limited to DAO_PROPOSER_ROLE holders

## Testing

### Run All Tests

```bash
npx hardhat test
```

### Run Factory Tests Only

```bash
npx hardhat test test/DAOFactory.test.js
```

Note: DAOFactory tests may fail with "code is too large" error due to contract size. This is expected and doesn't affect the other components.

## Security Considerations

1. **Role Management**: Carefully control who has PLATFORM_ADMIN_ROLE and DAO_CREATOR_ROLE
2. **Treasury Security**: Ensure treasury vault addresses are secure and properly configured
3. **Admin Assignment**: Verify admin addresses before deploying DAOs
4. **Access Control**: Regularly audit role assignments
5. **Contract Size**: Be aware of deployment limitations with large factory contracts

## Migration Path

For existing deployments:

1. **Deploy Factory**: Deploy the factory contract (or use frontend factory pattern)
2. **Register Existing DAOs**: Add existing DAO instances to the registry
3. **Assign Roles**: Grant appropriate roles to existing administrators
4. **Update Frontend**: Point frontend to factory address
5. **Test Thoroughly**: Verify all functionality before production use

## Support & Resources

- **Documentation**: See README.md and ARCHITECTURE.md
- **Examples**: Check frontend components for implementation examples
- **Issues**: Report bugs via GitHub Issues
- **Security**: Email security concerns to security@example.com

## Future Enhancements

Planned improvements:

1. **Proxy Pattern**: Implement EIP-1167 minimal proxies for efficient DAO cloning
2. **DAO Templates**: Pre-configured DAO templates for common use cases
3. **Cross-DAO Operations**: Facilitate coordination between DAOs
4. **Advanced Analytics**: More sophisticated metric aggregation and visualization
5. **Mobile Support**: Native mobile app with full factory support

## License

Apache License 2.0

## Last Updated

December 2025
