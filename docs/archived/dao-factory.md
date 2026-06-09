# DAO Factory

Comprehensive system overview for the DAO Factory deployment and management system.

## Overview

The DAO Factory is a smart contract that enables the creation and management of multiple independent DAO instances within the Prediction DAO ecosystem. Each DAO instance comes with a complete set of governance components, allowing organizations to leverage futarchy-based decision-making with privacy-preserving mechanisms.

### Key Features

- **Factory Pattern Deployment**: Create complete DAO instances on-demand with a single transaction
- **Role-Based Access Control**: Hierarchical permission system using OpenZeppelin AccessControl
- **Multi-DAO Support**: Platform can host multiple independent DAOs simultaneously
- **Component Isolation**: Each DAO operates independently with its own set of contracts
- **Minimal Proxy Pattern**: Gas-efficient deployment using EIP-1167 clones

## Architecture

### Core Components

Each DAO instance deployed by the factory consists of seven core components:

1. **FutarchyGovernor**: Central governance contract coordinating all components
2. **WelfareMetricRegistry**: Manages and tracks welfare metrics for decision-making
3. **ProposalRegistry**: Stores and manages proposals
4. **ConditionalMarketFactory**: Creates and manages prediction markets
5. **PrivacyCoordinator**: Handles privacy-preserving trading mechanisms
6. **OracleResolver**: Resolves oracle outcomes for proposals
7. **RagequitModule**: Enables members to exit with proportional treasury share

### Factory Contract Structure

```
DAOFactory
├── Implementation Contracts (Immutable)
│   ├── welfareRegistryImpl
│   ├── proposalRegistryImpl
│   ├── marketFactoryImpl
│   ├── privacyCoordinatorImpl
│   ├── oracleResolverImpl
│   ├── ragequitModuleImpl
│   └── futarchyGovernorImpl
│
├── DAO Instances (Dynamic)
│   ├── DAOInstance[0]
│   ├── DAOInstance[1]
│   └── DAOInstance[n]
│
└── Role Management
    ├── Platform Roles
    └── DAO-Specific Roles
```

## Role Hierarchy

### Platform-Level Roles

The factory implements a hierarchical role system for platform-wide administration:

```
DEFAULT_ADMIN_ROLE (Super Admin)
    ├── Can manage all platform roles
    └── Full administrative control
    
PLATFORM_ADMIN_ROLE
    ├── Managed by DEFAULT_ADMIN_ROLE
    ├── Can manage DAO_CREATOR_ROLE
    ├── Can grant/revoke DAO-specific roles across all DAOs
    └── Can activate/deactivate DAOs
    
DAO_CREATOR_ROLE
    ├── Managed by PLATFORM_ADMIN_ROLE
    └── Can create new DAO instances
```

### DAO-Specific Roles

Each DAO maintains its own role assignments:

```
DAO_ADMIN_ROLE
    ├── Manages roles within the specific DAO
    ├── Can grant/revoke DAO_PARTICIPANT_ROLE
    ├── Can grant/revoke DAO_PROPOSER_ROLE
    └── Can grant/revoke DAO_ORACLE_ROLE
    
DAO_PARTICIPANT_ROLE
    └── Can participate in DAO governance activities
    
DAO_PROPOSER_ROLE
    └── Can submit proposals to the DAO
    
DAO_ORACLE_ROLE
    └── Can submit oracle reports for proposal resolution
```

**Important**: Platform admins can override DAO-specific role decisions, providing a safety mechanism while maintaining DAO autonomy.

## DAO Deployment Flow

### Step 1: Create DAO

```solidity
function createDAO(
    string memory name,
    string memory description,
    address treasuryVault,
    address[] memory admins
) external returns (uint256 daoId)
```

**Process**:
1. Caller must have `DAO_CREATOR_ROLE`
2. Validates inputs (non-empty name, valid treasury address)
3. Increments DAO counter to generate unique ID
4. Deploys all DAO components
5. Initializes components with proper references
6. Transfers ownership to FutarchyGovernor
7. Sets up initial roles
8. Emits `DAOCreated` event

**Parameters**:
- `name`: Human-readable name for the DAO
- `description`: Detailed description of the DAO's purpose
- `treasuryVault`: Address that will hold DAO treasury funds
- `admins`: Array of addresses to receive admin roles

**Returns**:
- `daoId`: Unique identifier for the newly created DAO

### Step 2: Component Deployment

The factory uses EIP-1167 minimal proxy pattern (clones) to deploy gas-efficient instances:

```solidity
// Clone implementation contracts
address welfareRegistry = Clones.clone(welfareRegistryImpl);
address proposalRegistry = Clones.clone(proposalRegistryImpl);
// ... (other components)
```

**Benefits**:
- ~99% gas savings compared to full contract deployment
- All instances share implementation code
- Each instance maintains independent state

### Step 3: Component Initialization

Each cloned component is initialized with factory as temporary owner:

```solidity
WelfareMetricRegistry(welfareRegistry).initialize(address(this));
ProposalRegistry(proposalRegistry).initialize(address(this));
// ... (other components)

// FutarchyGovernor initialized with all component references
FutarchyGovernor(futarchyGovernor).initialize(
    address(this),
    welfareRegistry,
    proposalRegistry,
    marketFactory,
    privacyCoordinator,
    oracleResolver,
    ragequitModule,
    treasuryVault
);
```

### Step 4: Ownership Transfer

Factory transfers ownership of all components to FutarchyGovernor:

```solidity
WelfareMetricRegistry(welfareRegistry).transferOwnership(futarchyGovernor);
ProposalRegistry(proposalRegistry).transferOwnership(futarchyGovernor);
ConditionalMarketFactory(marketFactory).transferOwnership(futarchyGovernor);
OracleResolver(oracleResolver).transferOwnership(futarchyGovernor);
RagequitModule(ragequitModule).transferOwnership(futarchyGovernor);
```

**Result**: FutarchyGovernor has full control over all components, enabling decentralized governance.

### Step 5: Role Setup

Factory grants initial roles:

```solidity
// Creator receives all core roles
_grantDAORole(daoId, msg.sender, DAO_ADMIN_ROLE);
_grantDAORole(daoId, msg.sender, DAO_PARTICIPANT_ROLE);
_grantDAORole(daoId, msg.sender, DAO_PROPOSER_ROLE);

// Grant admin roles to specified addresses
for (uint256 i = 0; i < admins.length; i++) {
    _grantDAORole(daoId, admins[i], DAO_ADMIN_ROLE);
    _grantDAORole(daoId, admins[i], DAO_PARTICIPANT_ROLE);
}
```

## Access Control Management

### Granting Roles

**Who Can Grant Roles**:
- DAO Admins (for their specific DAO)
- Platform Admins (for any DAO)

**Process**:
```solidity
function grantDAORole(
    uint256 daoId,
    address user,
    bytes32 role
) external
```

**Authorization Check**:
```solidity
require(
    hasRole(PLATFORM_ADMIN_ROLE, msg.sender) ||
    daoRoles[daoId][msg.sender][DAO_ADMIN_ROLE],
    "Not authorized"
);
```

### Revoking Roles

Similar authorization requirements as granting roles:

```solidity
function revokeDAORole(
    uint256 daoId,
    address user,
    bytes32 role
) external
```

### Checking Roles

```solidity
function hasDAORole(
    uint256 daoId,
    address user,
    bytes32 role
) external view returns (bool)
```

**Note**: Platform admins automatically have all DAO roles via override mechanism.

## Multi-DAO Features

### DAO Instance Tracking

Each DAO instance stores comprehensive metadata:

```solidity
struct DAOInstance {
    string name;
    string description;
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

### User Association Tracking

The factory maintains bidirectional associations:

```solidity
// DAO ID => DAOInstance
mapping(uint256 => DAOInstance) public daos;

// User address => array of DAO IDs
mapping(address => uint256[]) public userDAOs;

// DAO ID => address => role => bool
mapping(uint256 => mapping(address => mapping(bytes32 => bool))) public daoRoles;
```

**Benefits**:
- Quick lookup of user's DAOs
- Efficient role checking
- Support for cross-DAO queries

### Querying DAOs

**Get Single DAO**:
```solidity
function getDAO(uint256 daoId) external view returns (DAOInstance memory)
```

**Get All DAOs (Paginated)**:
```solidity
function getAllDAOs(uint256 start, uint256 limit) 
    external view returns (DAOInstance[] memory)
```

**Get User's DAOs**:
```solidity
function getUserDAOs(address user) external view returns (uint256[] memory)
```

## DAO Status Management

Platform admins can control DAO operational status:

```solidity
function setDAOStatus(uint256 daoId, bool active) 
    external onlyRole(PLATFORM_ADMIN_ROLE)
```

**Use Cases**:
- Temporarily disable problematic DAOs
- Sunset deprecated DAOs
- Maintenance modes
- Emergency responses

**Important**: Deactivating a DAO doesn't destroy it - all data and roles remain intact. It serves as an administrative flag that can be checked by frontend applications.

## Integration Patterns

### Creating a DAO (JavaScript/TypeScript)

```javascript
const daoFactory = await ethers.getContractAt("DAOFactory", factoryAddress);

// Grant creator role if needed
const DAO_CREATOR_ROLE = await daoFactory.DAO_CREATOR_ROLE();
await daoFactory.grantRole(DAO_CREATOR_ROLE, creatorAddress);

// Create DAO
const tx = await daoFactory.createDAO(
    "My Organization DAO",
    "Futarchy-based governance for our organization",
    treasuryVaultAddress,
    [admin1Address, admin2Address]
);

const receipt = await tx.wait();

// Get DAO ID from event
const event = receipt.events.find(e => e.event === 'DAOCreated');
const daoId = event.args.daoId;

// Get DAO instance
const dao = await daoFactory.getDAO(daoId);
console.log("FutarchyGovernor:", dao.futarchyGovernor);
```

### Managing Roles

```javascript
// Grant proposer role
const DAO_PROPOSER_ROLE = await daoFactory.DAO_PROPOSER_ROLE();
await daoFactory.grantDAORole(daoId, proposerAddress, DAO_PROPOSER_ROLE);

// Check if user has role
const hasRole = await daoFactory.hasDAORole(
    daoId,
    userAddress,
    DAO_PROPOSER_ROLE
);

// Revoke role
await daoFactory.revokeDAORole(daoId, userAddress, DAO_PROPOSER_ROLE);
```

### Querying User DAOs

```javascript
// Get all DAOs for a user
const userDaoIds = await daoFactory.getUserDAOs(userAddress);

// Get details for each DAO
const userDaos = await Promise.all(
    userDaoIds.map(id => daoFactory.getDAO(id))
);

// Filter active DAOs
const activeDaos = userDaos.filter(dao => dao.active);
```

## Security Considerations

### Access Control

1. **Role Hierarchy**: Platform admins can override DAO admin decisions
2. **Role Isolation**: Roles are specific to each DAO (except platform roles)
3. **Authorization Checks**: All state-changing functions verify caller permissions

### Deployment Safety

1. **Reentrancy Protection**: Uses OpenZeppelin's ReentrancyGuard on createDAO
2. **Input Validation**: Validates all user inputs before deployment
3. **Ownership Transfer**: Secure two-step ownership transfer process

### Component Isolation

1. **Independent State**: Each DAO has completely separate contract instances
2. **No Shared Storage**: DAOs cannot interfere with each other's data
3. **Gas Efficiency**: Minimal proxy pattern prevents code duplication

### Emergency Controls

1. **Platform Admin Override**: Can intervene in critical situations
2. **DAO Status Control**: Can disable problematic DAOs
3. **Role Management**: Can adjust roles across all DAOs if needed

## Gas Optimization

### Minimal Proxy Pattern

Using EIP-1167 clones reduces deployment costs:

- **Full deployment**: ~5-8M gas per DAO
- **With clones**: ~500-800K gas per DAO
- **Savings**: ~90% reduction in deployment costs

### Batch Operations

Factory supports efficient batch role management:

```solidity
// Multiple admins assigned in one transaction during creation
createDAO(name, description, vault, [admin1, admin2, admin3])
```

### Storage Optimization

- Uses mappings for O(1) lookups
- Minimal storage in DAOInstance struct
- Efficient role checking with bitmap potential

## Testing and Validation

### Integration Tests

The factory includes comprehensive integration tests covering:

1. **Complete DAO Deployment**
   - Verifies all 7 components are deployed
   - Validates ownership transfers
   - Checks component initialization

2. **Configuration and Access Control**
   - Role setup verification
   - Authorization checks
   - Platform admin overrides

3. **Multi-DAO Scenarios**
   - Independent DAO deployment
   - Role isolation between DAOs
   - User association tracking
   - Pagination support

4. **Status Management**
   - Activation/deactivation
   - Authorization controls

5. **Complete Lifecycle**
   - End-to-end DAO creation and configuration
   - Role management workflows
   - User association tracking

See `test/integration/factory/dao-factory-deployment.test.js` for complete test suite.

## Common Usage Patterns

### Pattern 1: Single Organization DAO

Most common use case - one organization creates one DAO:

```javascript
// Organization creates their DAO
const tx = await factory.createDAO(
    "Acme Corp DAO",
    "Governance for Acme Corporation decisions",
    acmeTreasuryAddress,
    [ceo, cfo, cto]
);

// All organization members can be added as participants
await factory.grantDAORole(daoId, employee1, PARTICIPANT_ROLE);
await factory.grantDAORole(daoId, employee2, PARTICIPANT_ROLE);
```

### Pattern 2: Platform Hosting Multiple DAOs

Platform operator manages multiple independent organizations:

```javascript
// Platform creates DAOs for different organizations
await factory.createDAO("Org A DAO", "...", vaultA, [adminA]);
await factory.createDAO("Org B DAO", "...", vaultB, [adminB]);
await factory.createDAO("Org C DAO", "...", vaultC, [adminC]);

// Each DAO operates independently
// Platform admin can monitor/intervene if needed
```

### Pattern 3: User Participating in Multiple DAOs

Users can have roles in multiple DAOs:

```javascript
// User is member of multiple DAOs
const userDaos = await factory.getUserDAOs(userAddress);

// User can have different roles in each DAO
for (const daoId of userDaos) {
    const isAdmin = await factory.hasDAORole(daoId, userAddress, ADMIN_ROLE);
    const isProposer = await factory.hasDAORole(daoId, userAddress, PROPOSER_ROLE);
    // Display UI based on roles
}
```

### Pattern 4: Progressive Decentralization

Start with centralized control, gradually distribute:

```javascript
// Phase 1: Platform admin maintains control
await factory.createDAO("New DAO", "...", vault, []);

// Phase 2: Grant admin roles to community members
await factory.grantDAORole(daoId, communityMember1, ADMIN_ROLE);
await factory.grantDAORole(daoId, communityMember2, ADMIN_ROLE);

// Phase 3: Platform admin steps back
// Community admins now manage the DAO
```

## Best Practices

### DAO Creation

1. **Choose Meaningful Names**: Use clear, descriptive names for easy identification
2. **Set Appropriate Admins**: Start with 2-3 trusted admins
3. **Secure Treasury**: Use multisig or secure contract for treasury vault
4. **Document Purpose**: Provide detailed descriptions for transparency

### Role Management

1. **Principle of Least Privilege**: Only grant necessary roles
2. **Regular Audits**: Periodically review role assignments
3. **Separation of Duties**: Don't grant all roles to single users
4. **Role Documentation**: Keep off-chain records of role purposes

### Operations

1. **Monitor Activity**: Track DAO operations and transactions
2. **Emergency Procedures**: Have clear escalation paths
3. **Regular Updates**: Keep stakeholders informed of changes
4. **Backup Admins**: Ensure multiple admins to prevent single points of failure

### Security

1. **Verify Addresses**: Double-check all addresses before transactions
2. **Test on Testnet**: Validate DAO creation flow before mainnet
3. **Gradual Rollout**: Start with small DAOs before scaling
4. **Audit Components**: Review all deployed component contracts

## Troubleshooting

### Common Issues

**DAO Creation Fails**:
- Verify caller has `DAO_CREATOR_ROLE`
- Check treasury vault address is valid (not zero address)
- Ensure name is not empty

**Cannot Grant Roles**:
- Verify caller is DAO admin or platform admin
- Check DAO ID is valid
- Ensure target user address is valid

**Gas Issues**:
- Break large admin arrays into multiple transactions
- Use pagination for querying large DAO lists

**Missing Permissions**:
- Platform admins have override capability
- Check role hierarchy and inheritance

## Future Enhancements

Potential improvements to the factory system:

1. **DAO Templates**: Pre-configured templates for common use cases
2. **Upgradeable Components**: UUPS proxy pattern for components
3. **Cross-DAO Governance**: Mechanisms for inter-DAO coordination
4. **Advanced Roles**: More granular permission levels
5. **DAO Migration**: Tools for migrating between factory versions
6. **Analytics**: Built-in DAO activity tracking
7. **Token Integration**: Automatic governance token deployment
8. **Automated Roles**: Role assignment based on token holdings

## Related Documentation

- [Governance Overview](governance.md) - Futarchy governance process
- [How It Works](how-it-works.md) - System architecture
- [Oracle Resolution](oracle-resolution.md) - Oracle mechanisms
- [Privacy](privacy.md) - Privacy-preserving features
- [Ragequit Protection](ragequit-protection.md) - Exit mechanisms
- [Security](security.md) - Security model

## Additional Resources

- **Smart Contract**: `contracts/DAOFactory.sol`
- **Unit Tests**: `test/DAOFactory.test.js`
- **Integration Tests**: `test/integration/factory/dao-factory-deployment.test.js`
- **Deployment Guide**: `FACTORY_DEPLOYMENT.md`
- **Implementation Summary**: `FACTORY_IMPLEMENTATION_SUMMARY.md`
