# RBAC Smart Contract Implementation

## Overview

Comprehensive Role-Based Access Control (RBAC) smart contract system implementing enterprise-grade security patterns with tiered membership levels.

## Architecture

### Contract Hierarchy

```
RoleManager (Base)
└── TieredRoleManager (Extends with membership tiers)
```

## RoleManager.sol

Base RBAC contract with enterprise security features.

### Role Hierarchy

```
DEFAULT_ADMIN_ROLE (Owner)
├── CORE_SYSTEM_ADMIN_ROLE (Critical upgrades, 3-sig, 7-day timelock)
│   └── OPERATIONS_ADMIN_ROLE (Day-to-day operations, 2-sig, 2-day timelock)
│       ├── EMERGENCY_GUARDIAN_ROLE (Emergency pause, 1-sig, 1-hour timelock)
│       ├── MARKET_MAKER_ROLE (Premium, create markets)
│       ├── CLEARPATH_USER_ROLE (Premium, DAO governance)
│       └── TOKENMINT_ROLE (Premium, mint tokens/NFTs)
└── OVERSIGHT_COMMITTEE_ROLE (Independent verification, 2-sig, 1-day timelock)
```

### Key Features

#### 1. Role Metadata
```solidity
struct RoleMetadata {
    string name;
    string description;
    uint256 minApprovals;    // Multisig threshold
    uint256 timelockDelay;   // Delay before execution
    bool isPremium;          // Requires payment
    uint256 price;           // Price in wei
    bool isActive;
    uint256 maxMembers;      // Max role holders
    uint256 currentMembers;
}
```

#### 2. Timelock & Multisig
```solidity
// Propose action with timelock
proposeRoleAction(role, target, isGrant) → actionId

// Approve action (multisig)
approveRoleAction(actionId)

// Execute after timelock + sufficient approvals
executeRoleAction(actionId)

// Emergency cancel
cancelRoleAction(actionId) // Guardian only
```

#### 3. Emergency Functions
```solidity
emergencyPause()  // Guardian pauses contract
unpause()         // Operations Admin unpauses
```

#### 4. Role Purchase
```solidity
purchaseRole(role) payable    // Buy premium role
registerZKKey(zkPublicKey)    // ClearPath ZK key
```

### Security Principles

- **Principle of Least Privilege**: Each role has minimum necessary permissions
- **Separation of Duties**: No single entity has full control
- **Defense in Depth**: Multiple security layers (timelock + multisig + pause)
- **Transparency**: All actions emit events
- **Auditability**: Complete on-chain history

## TieredRoleManager.sol

Extends RoleManager with membership tiers and usage limits.

### Membership Tiers

```
NONE (0) → BRONZE (1) → SILVER (2) → GOLD (3) → PLATINUM (4)
```

### Tier Structure

#### Market Maker Role

| Tier | Price | Daily Bets | Monthly Markets | Max Position | Concurrent | Withdrawal | Private Markets | Fee Discount |
|------|-------|------------|-----------------|--------------|------------|------------|----------------|--------------|
| Bronze | 100 ETH | 10 | 5 | 10 ETH | 3 | 50 ETH | ❌ | 0% |
| Silver | 150 ETH | 25 | 15 | 50 ETH | 10 | 200 ETH | ❌ | 5% |
| Gold | 250 ETH | 100 | 50 | 200 ETH | 30 | 1000 ETH | ✅ | 10% |
| Platinum | 500 ETH | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | ✅ | 20% |

#### ClearPath User Role

| Tier | Price | Daily Bets | Monthly Markets | Max Position | Concurrent | Withdrawal | Private Markets | Fee Discount |
|------|-------|------------|-----------------|--------------|------------|------------|----------------|--------------|
| Bronze | 250 ETH | 5 | 2 | 5 ETH | 2 | 25 ETH | ❌ | 0% |
| Silver | 200 ETH | 15 | 10 | 25 ETH | 5 | 100 ETH | ❌ | 5% |
| Gold | 350 ETH | 50 | 30 | 100 ETH | 15 | 500 ETH | ✅ | 10% |
| Platinum | 750 ETH | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | ✅ | 25% |

#### TokenMint Role

| Tier | Price | Monthly Mints | Active Contracts | Max Mint Value | Withdrawal | Private Markets | Fee Discount |
|------|-------|---------------|------------------|----------------|------------|----------------|--------------|
| Bronze | 150 ETH | 10 | 5 | 100 ETH | 50 ETH | ❌ | 0% |
| Silver | 200 ETH | 30 | 15 | 500 ETH | 200 ETH | ❌ | 5% |
| Gold | 350 ETH | 100 | 50 | 2000 ETH | 1000 ETH | ✅ | 10% |
| Platinum | 600 ETH | Unlimited | Unlimited | Unlimited | Unlimited | ✅ | 20% |

### Usage Tracking

```solidity
struct UsageStats {
    uint256 dailyBetsCount;
    uint256 weeklyBetsCount;
    uint256 monthlyMarketsCreated;
    uint256 dailyWithdrawals;
    uint256 activeMarketsCount;
    uint256 lastDailyReset;
    uint256 lastWeeklyReset;
    uint256 lastMonthlyReset;
}
```

### Key Functions

#### Purchase & Upgrade
```solidity
// Purchase role at specific tier
purchaseRoleWithTier(role, tier) payable

// Upgrade to higher tier
upgradeTier(role, newTier) payable
```

#### Usage Enforcement
```solidity
// Check and record bet (enforces limits)
checkBetLimit(role) → bool

// Check market creation (enforces limits)
checkMarketCreationLimit(role) → bool

// Record market closure
recordMarketClosure(role)

// Check withdrawal limit
checkWithdrawalLimit(role, amount) → bool
```

#### View Functions
```solidity
getUserTier(user, role) → MembershipTier
getTierMetadata(role, tier) → TierMetadata
getTierLimits(role, tier) → TierLimits
getUserUsageStats(user, role) → UsageStats
canCreatePrivateMarkets(user, role) → bool
canUseAdvancedFeatures(user, role) → bool
getFeeDiscount(user, role) → uint256
```

### Automatic Resets

- **Daily** (24 hours): Bet counts, withdrawals
- **Weekly** (7 days): Weekly bet counts
- **Monthly** (30 days): Market creation counts

## Usage Examples

### Deploy Contracts

```javascript
const RoleManager = await ethers.getContractFactory("RoleManager");
const roleManager = await RoleManager.deploy();

const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
const tieredRoleManager = await TieredRoleManager.deploy();
```

### Purchase Role with Tier

```javascript
const MARKET_MAKER_ROLE = await tieredRoleManager.MARKET_MAKER_ROLE();
const Tier = { BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

// Purchase Gold tier
await tieredRoleManager.connect(user).purchaseRoleWithTier(
    MARKET_MAKER_ROLE,
    Tier.GOLD,
    { value: ethers.parseEther("250") }
);
```

### Upgrade Tier

```javascript
// Upgrade from Gold to Platinum
await tieredRoleManager.connect(user).upgradeTier(
    MARKET_MAKER_ROLE,
    Tier.PLATINUM,
    { value: ethers.parseEther("500") }
);
```

### Check Usage Limits

```javascript
// Before placing bet
const canBet = await tieredRoleManager.connect(user).checkBetLimit(MARKET_MAKER_ROLE);
if (canBet) {
    // Place bet
}

// Before creating market
const canCreate = await tieredRoleManager.connect(user).checkMarketCreationLimit(MARKET_MAKER_ROLE);
if (canCreate) {
    // Create market
}
```

### Admin Operations

```javascript
// Setup role hierarchy
await roleManager.grantRole(CORE_SYSTEM_ADMIN_ROLE, coreAdmin.address);
await roleManager.connect(coreAdmin).grantRole(OPERATIONS_ADMIN_ROLE, opsAdmin.address);

// Propose action with timelock
const actionId = await roleManager.connect(coreAdmin).proposeRoleAction(
    OPERATIONS_ADMIN_ROLE,
    newOpsAdmin.address,
    true // grant
);

// Other admins approve
await roleManager.connect(coreAdmin2).approveRoleAction(actionId);
await roleManager.connect(coreAdmin3).approveRoleAction(actionId);

// Wait for timelock (7 days for core admin actions)
await time.increase(7 * 24 * 60 * 60 + 1);

// Execute
await roleManager.connect(coreAdmin).executeRoleAction(actionId);
```

### Emergency Response

```javascript
// Emergency pause
await roleManager.connect(guardian).emergencyPause();

// Cancel malicious pending action
await roleManager.connect(guardian).cancelRoleAction(suspiciousActionId);

// Unpause
await roleManager.connect(opsAdmin).unpause();
```

## Testing

### Unit Tests

**RoleManager.test.js** - 8 test suites:
1. Deployment
2. Role Purchase
3. ZK Key Registration
4. Timelock & Multisig
5. Emergency Functions
6. Admin Functions
7. Access Control
8. View Functions

**TieredRoleManager.test.js** - 7 test suites:
1. Tier Initialization
2. Tier Purchase
3. Tier Upgrades
4. Usage Limits - Betting
5. Usage Limits - Market Creation
6. Feature Access
7. Role-specific Tiers

### Integration Tests

**rolemanager-integration.test.js** - 5 scenarios:
1. Complete Role Lifecycle
2. Multisig Workflow
3. Emergency Response Workflow
4. Oversight Committee Workflow
5. Separation of Duties

### Running Tests

```bash
# Unit tests
npx hardhat test test/RoleManager.test.js
npx hardhat test test/TieredRoleManager.test.js

# Integration tests
npx hardhat test test/integration/rbac/rolemanager-integration.test.js

# All RBAC tests
npx hardhat test test/*RoleManager*.test.js test/integration/rbac/
```

## Gas Optimization

- Uses immutable for implementation addresses
- Efficient storage packing
- Minimal external calls
- ReentrancyGuard for state-changing functions
- View functions for read operations

## Upgrade Path

Contracts can be deployed behind a proxy for upgradeability:

```javascript
const { deployProxy } = require('@openzeppelin/hardhat-upgrades');

const tieredRoleManager = await deployProxy(
    TieredRoleManager,
    [],
    { initializer: false }
);
```

## Security Considerations

### Auditing Checklist

- [ ] Role hierarchy enforced correctly
- [ ] Timelock delays appropriate for each role
- [ ] Multisig thresholds sufficient
- [ ] Emergency pause cannot be abused
- [ ] Reentrancy protection on all payable functions
- [ ] Usage limits cannot be bypassed
- [ ] Integer overflow/underflow impossible (Solidity 0.8+)
- [ ] Access control modifiers correct
- [ ] Events emitted for all state changes

### Known Limitations

1. **Local Storage**: Usage stats are on-chain but could be reset by contract upgrade
2. **Gas Costs**: Tier purchases and limit checks consume gas
3. **Time-based Resets**: Uses block.timestamp (vulnerable to minor miner manipulation)

### Recommendations

1. Deploy with multisig ownership
2. Use timelock for all admin operations
3. Monitor events for suspicious activity
4. Regular security audits
5. Gradual rollout with limits

## Frontend Integration

See `RBAC_IMPLEMENTATION.md` for frontend integration guide linking local storage to on-chain roles.

### Sync Strategy

1. User connects wallet
2. Check on-chain roles: `hasRole(role, user)`
3. Check tier: `getUserTier(user, role)`
4. Check limits: `getTierLimits(role, tier)`
5. Before action: `checkBetLimit()` or `checkMarketCreationLimit()`
6. Update UI based on tier permissions

## License

Apache-2.0

## Contact

For questions or security issues, contact the development team.
