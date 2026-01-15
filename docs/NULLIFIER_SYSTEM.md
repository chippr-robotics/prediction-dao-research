# Nullifier System Documentation

## Overview

The Nullifier System provides a cryptographically secure way to manage sets of blocked (nullified) markets and addresses in the FairWins prediction market platform. It uses an **RSA Accumulator** to efficiently prove that a market or address is NOT in the blocked set, enabling the frontend to filter out malicious or problematic content without revealing the full blocklist.

### Why RSA Accumulators?

Traditional blocklists have significant drawbacks:

| Approach | Storage | Lookup | Privacy | Scalability |
|----------|---------|--------|---------|-------------|
| On-chain mapping | O(n) | O(1) | None - list is public | Poor - gas grows with size |
| Merkle Tree | O(log n) proofs | O(log n) | Partial | Good for membership |
| **RSA Accumulator** | **O(1)** | **O(1)** | **Full** | **Excellent** |

RSA Accumulators provide:
- **Constant storage**: Only a single 256-byte value stored on-chain
- **Non-membership proofs**: Efficiently prove something is NOT in the set
- **Privacy**: The accumulator value reveals nothing about set contents
- **Scalability**: Can handle millions of entries with the same storage cost

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ADMIN OPERATIONS                             │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐       │
│  │ Nullify Market│    │Nullify Address│    │   Reinstate   │       │
│  └───────┬───────┘    └───────┬───────┘    └───────┬───────┘       │
│          │                    │                    │                │
│          └────────────────────┼────────────────────┘                │
│                               ▼                                     │
│                    ┌─────────────────────┐                         │
│                    │  NullifierRegistry  │                         │
│                    │    (On-Chain)       │                         │
│                    ├─────────────────────┤                         │
│                    │ • RSA Accumulator   │                         │
│                    │ • Nullified Markets │                         │
│                    │ • Nullified Addrs   │                         │
│                    │ • Statistics        │                         │
│                    └──────────┬──────────┘                         │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ TreasuryVault │      │Conditional    │      │   Frontend    │
│               │      │MarketFactory  │      │               │
├───────────────┤      ├───────────────┤      ├───────────────┤
│ Block nullified      │ Block nullified      │ Filter nullified
│ withdrawal    │      │ trading       │      │ markets from  │
│ recipients    │      │ for addresses │      │ display       │
└───────────────┘      └───────────────┘      └───────────────┘
```

## Core Concepts

### 1. Prime Number Mapping

Every market and address is mapped to a unique prime number using deterministic hashing:

```
Market Hash → keccak256(proposalId, collateralToken, conditionId, passPositionId, failPositionId)
Address Hash → keccak256(address)

Hash → Prime Number (using Miller-Rabin primality test with incremental search)
```

This ensures:
- Same input always produces the same prime
- Different inputs produce different primes (with overwhelming probability)
- Primes are suitable for RSA accumulator operations

### 2. RSA Accumulator Operations

The accumulator value `A` represents the product of all nullified primes:

```
A = g^(p1 × p2 × p3 × ... × pn) mod n

Where:
  n = RSA modulus (product of two secret safe primes)
  g = Generator (coprime to n)
  p1...pn = Prime numbers of nullified elements
```

**Adding an element (nullification)**:
```
A_new = A^prime mod n
```

**Non-membership proof** (for frontend validation):
Given element `x` that is NOT in the set, prove it using Bezout's identity:
```
If gcd(x, product_of_all_primes) = 1
Then there exist integers a, b such that:
  a*x + b*product = 1

The witness (d, b) satisfies:
  A^b * g^a ≡ A mod n  (only if x is NOT in the set)
```

### 3. Market Hash Computation

Markets are identified by a deterministic hash of their core parameters:

```solidity
bytes32 marketHash = keccak256(abi.encodePacked(
    "MARKET_V1",           // Version prefix for future compatibility
    proposalId,            // Unique proposal identifier
    collateralToken,       // Token used for collateral
    conditionId,           // Gnosis CTF condition ID
    passPositionId,        // Position ID for PASS outcome
    failPositionId         // Position ID for FAIL outcome
));
```

## Smart Contracts

### NullifierRegistry.sol

The central contract managing all nullification state.

#### Roles

| Role | Permission | Managed By |
|------|------------|------------|
| `DEFAULT_ADMIN_ROLE` | Grant/revoke all roles | Contract deployer |
| `NULLIFIER_ADMIN_ROLE` | Add/remove nullifications | Operations Admin |

#### Key Functions

**Initialization**:
```solidity
// Set up RSA parameters (owner only, once)
function initializeRSAParams(
    bytes memory _n,           // RSA modulus (256 bytes)
    bytes memory _g,           // Generator (256 bytes)
    bytes memory _initialAcc   // Initial accumulator = g
) external;
```

**Nullification Operations**:
```solidity
// Nullify a single market
function nullifyMarket(bytes32 marketHash) external;

// Nullify a single address
function nullifyAddress(address addr) external;

// Batch nullify markets (max 50 per call)
function batchNullifyMarkets(bytes32[] memory marketHashes) external;

// Batch nullify addresses (max 50 per call)
function batchNullifyAddresses(address[] memory addrs) external;

// Reinstate previously nullified market
function reinstateMarket(bytes32 marketHash) external;

// Reinstate previously nullified address
function reinstateAddress(address addr) external;
```

**Query Functions**:
```solidity
// Check if a market is nullified
function isMarketNullified(bytes32 marketHash) external view returns (bool);

// Check if an address is nullified
function isAddressNullified(address addr) external view returns (bool);

// Get current accumulator value
function getAccumulator() external view returns (bytes memory);

// Get nullification statistics
function getStatistics() external view returns (
    uint256 nullifiedMarketCount,
    uint256 nullifiedAddressCount,
    uint256 totalNullifications,
    uint256 totalReinstatements,
    uint256 lastAccumulatorUpdate
);

// Paginated list of nullified markets
function getNullifiedMarkets(uint256 offset, uint256 limit)
    external view returns (bytes32[] memory, uint256 total);

// Paginated list of nullified addresses
function getNullifiedAddresses(uint256 offset, uint256 limit)
    external view returns (address[] memory, uint256 total);
```

#### Events

```solidity
event RSAParamsInitialized(bytes n, bytes g);
event MarketNullified(bytes32 indexed marketHash, address indexed nullifiedBy);
event MarketReinstated(bytes32 indexed marketHash, address indexed reinstatedBy);
event AddressNullified(address indexed addr, address indexed nullifiedBy);
event AddressReinstated(address indexed addr, address indexed reinstatedBy);
event AccumulatorUpdated(bytes newAccumulator);
```

### TreasuryVault Integration

The TreasuryVault can optionally block withdrawals to nullified addresses.

#### Configuration

```solidity
// Set the NullifierRegistry address (owner only)
function setNullifierRegistry(address _nullifierRegistry) external;

// Enable/disable enforcement (owner only)
function setNullificationEnforcement(bool _enforce) external;

// Check if an address would be blocked
function isRecipientNullified(address recipient) external view returns (bool);
```

#### Behavior

When enforcement is **enabled**:
- `withdrawETH()` reverts if recipient is nullified
- `withdrawERC20()` reverts if recipient is nullified
- `WithdrawalBlockedByNullification` event is emitted before revert

When enforcement is **disabled** (default):
- Withdrawals proceed normally regardless of nullification status

### ConditionalMarketFactory Integration

The market factory can optionally block trading for nullified markets and addresses.

#### Configuration

```solidity
// Set the NullifierRegistry address (owner only)
function setNullifierRegistry(address _nullifierRegistry) external;

// Enable/disable on-chain enforcement (owner only)
function setNullificationEnforcement(bool _enforce) external;

// Check if a market is nullified
function isMarketNullified(uint256 marketId) external view returns (bool);
```

#### Behavior

When enforcement is **enabled**:
- `buyTokens()` reverts if market or caller is nullified
- `sellTokens()` reverts if market or caller is nullified
- Trading is blocked for all nullified entities

When enforcement is **disabled**:
- Trading proceeds normally
- Frontend is expected to filter markets

## Frontend Integration

### React Hooks

#### useNullifierContracts

Provides contract interactions for the NullifierRegistry:

```javascript
import { useNullifierContracts } from '../hooks/useNullifierContracts';

function AdminPanel() {
  const {
    // State
    isLoading,
    error,
    statistics,
    nullifiedMarkets,
    nullifiedAddresses,

    // Actions
    nullifyMarket,
    nullifyAddress,
    reinstateMarket,
    reinstateAddress,
    batchNullifyMarkets,
    batchNullifyAddresses,

    // Queries
    isMarketNullified,
    isAddressNullified,
    refreshStatistics,
  } = useNullifierContracts();

  // Use in component...
}
```

#### useMarketNullification

Provides market filtering for display components:

```javascript
import { useMarketNullification } from '../hooks/useMarketNullification';

function MarketGrid({ markets }) {
  const {
    filterMarkets,
    isLoading,
    isMarketNullified
  } = useMarketNullification();

  // Filter out nullified markets before display
  const visibleMarkets = useMemo(() => {
    if (isLoading) return markets;
    return filterMarkets(markets);
  }, [markets, filterMarkets, isLoading]);

  return (
    <div>
      {visibleMarkets.map(market => (
        <MarketCard key={market.id} market={market} />
      ))}
    </div>
  );
}
```

### JavaScript RSA Accumulator Library

Located in `frontend/src/utils/rsaAccumulator.js`:

```javascript
import {
  RSAAccumulator,
  hashToPrime,
  computeMarketHash
} from '../utils/rsaAccumulator';

// Create accumulator instance
const accumulator = new RSAAccumulator(nHex, gHex);

// Compute market hash
const marketHash = computeMarketHash({
  proposalId: 123,
  collateralToken: '0x...',
  conditionId: '0x...',
  passPositionId: 1,
  failPositionId: 2
});

// Convert to prime
const prime = hashToPrime(marketHash);

// Check membership (for debugging)
const isMember = accumulator.contains(prime);

// Generate non-membership witness
const witness = accumulator.generateNonMembershipWitness(prime);

// Verify non-membership
const isNotMember = accumulator.verifyNonMembership(prime, witness);
```

### Admin Panel

The NullifierTab component provides a UI for managing nullifications:

**Features**:
- View statistics (counts, last update time)
- Nullify markets by hash or market data
- Nullify addresses
- View paginated lists of nullified items
- Reinstate markets and addresses
- Batch operations

**Access Control**:
- Requires `NULLIFIER_ADMIN_ROLE` or `OPERATIONS_ADMIN_ROLE`
- Read-only mode for users without admin permissions

## Security Considerations

### RSA Modulus Generation

The security of the RSA accumulator depends on the RSA modulus `n` being the product of two secret safe primes.

**Trusted Setup Requirements**:
1. Generate two large safe primes `p` and `q` (each ~1024 bits)
2. Compute `n = p × q`
3. **Securely destroy** `p` and `q` after computing `n`
4. Use a verifiable ceremony or secure multi-party computation

If the factorization of `n` is known, an attacker could:
- Forge membership/non-membership proofs
- Add elements without detection

### On-Chain vs Off-Chain Enforcement

| Mode | Frontend | On-Chain | Use Case |
|------|----------|----------|----------|
| Off-chain only | Filters markets | No checks | Low gas, trust frontend |
| On-chain enabled | Filters markets | Blocks trades | High security, higher gas |
| Hybrid | Filters markets | Blocks critical ops | Balance security/cost |

**Recommendation**: Enable on-chain enforcement for TreasuryVault (critical funds) and optionally for ConditionalMarketFactory based on threat model.

### Role Management

```
DEFAULT_ADMIN_ROLE
       │
       ▼
OPERATIONS_ADMIN_ROLE ──────► NULLIFIER_ADMIN_ROLE
```

- Only `OPERATIONS_ADMIN_ROLE` holders can grant `NULLIFIER_ADMIN_ROLE`
- Consider multi-sig or timelock for admin operations
- Monitor `MarketNullified` and `AddressNullified` events

### Attack Vectors & Mitigations

| Attack | Mitigation |
|--------|------------|
| Admin key compromise | Multi-sig, timelock, role separation |
| Malicious nullification | Governance review, reinstatement capability |
| RSA modulus factorization | Proper trusted setup, large primes |
| Frontend bypass | On-chain enforcement for critical operations |
| DoS via large batch | MAX_BATCH_SIZE = 50 |

## Deployment & Configuration

### 1. Deploy NullifierRegistry

```javascript
const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
const nullifierRegistry = await NullifierRegistry.deploy();
await nullifierRegistry.waitForDeployment();
```

### 2. Initialize RSA Parameters

```javascript
// Generate or use pre-generated RSA parameters
const n = "0x..."; // 256 bytes (2048-bit modulus)
const g = "0x03"; // Generator (typically 3)
const initialAcc = g; // Initial accumulator = generator

await nullifierRegistry.initializeRSAParams(n, g, initialAcc);
```

### 3. Grant Admin Roles

```javascript
const NULLIFIER_ADMIN_ROLE = ethers.keccak256(
  ethers.toUtf8Bytes("NULLIFIER_ADMIN_ROLE")
);

await nullifierRegistry.grantRole(NULLIFIER_ADMIN_ROLE, adminAddress);
```

### 4. Integrate with TreasuryVault

```javascript
// Set the registry
await treasuryVault.setNullifierRegistry(nullifierRegistry.address);

// Enable enforcement
await treasuryVault.setNullificationEnforcement(true);
```

### 5. Integrate with ConditionalMarketFactory

```javascript
// Set the registry
await marketFactory.setNullifierRegistry(nullifierRegistry.address);

// Optionally enable on-chain enforcement
await marketFactory.setNullificationEnforcement(true);
```

### 6. Frontend Configuration

Update the contract addresses in frontend configuration:

```javascript
// src/config/contracts.js
export const CONTRACTS = {
  // ... other contracts
  NULLIFIER_REGISTRY: '0x...',
};
```

## Testing

### Unit Tests

```bash
# Run NullifierRegistry tests
npx hardhat test test/NullifierRegistry.test.js

# Run TreasuryVault tests (includes nullification tests)
npx hardhat test test/TreasuryVault.test.js
```

### Integration Tests

```bash
# Run nullifier integration tests
npx hardhat test test/integration/nullifier/nullifier-integration.test.js
```

### E2E Tests

```bash
# Run Cypress E2E tests for admin panel
npx cypress run --spec "cypress/e2e/08-nullifier-management.cy.js"
```

## Troubleshooting

### Common Issues

**"RSA params already initialized"**
- RSA parameters can only be set once
- Deploy a new contract if you need different parameters

**"Not authorized" on nullification**
- Caller needs `NULLIFIER_ADMIN_ROLE`
- Check role with `hasRole(NULLIFIER_ADMIN_ROLE, address)`

**"Recipient address is nullified"**
- Address is in the nullified set
- Either reinstate the address or disable enforcement

**Frontend not filtering markets**
- Check that NullifierRegistry address is configured
- Verify the hook is properly initialized
- Check browser console for errors

**High gas costs**
- Use batch operations for multiple nullifications
- Consider off-chain enforcement for lower priority cases

## API Reference

### NullifierRegistry ABI

See `frontend/src/abis/NullifierRegistry.js` for the complete ABI.

### Key TypeScript Types

```typescript
interface NullifierStatistics {
  nullifiedMarketCount: bigint;
  nullifiedAddressCount: bigint;
  totalNullifications: bigint;
  totalReinstatements: bigint;
  lastAccumulatorUpdate: bigint;
}

interface MarketData {
  proposalId: number | bigint;
  collateralToken: string;
  conditionId: string;
  passPositionId: number | bigint;
  failPositionId: number | bigint;
}
```

## Changelog

### v1.0.0 (Initial Release)
- RSA Accumulator-based nullifier system
- NullifierRegistry contract
- TreasuryVault integration
- ConditionalMarketFactory integration
- Frontend hooks and admin panel
- Comprehensive test coverage
