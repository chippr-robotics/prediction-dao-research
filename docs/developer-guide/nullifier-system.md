# Nullifier System

The Nullifier System provides anti-money-laundering (AML) and platform protection capabilities for FairWins prediction markets. It allows administrators to block malicious markets and addresses from participating in the platform.

## Architecture Overview

The system operates in two modes:

1. **Simple Mode (Implemented)** - Direct on-chain mappings for immediate nullification
2. **RSA Accumulator Mode (Advanced)** - Cryptographic proofs for privacy-preserving verification

## Simple Mode (Current Implementation)

### How It Works

The NullifierRegistry contract maintains two mappings:

```solidity
mapping(bytes32 => bool) public nullifiedMarkets;
mapping(address => bool) public nullifiedAddresses;
```

When a market or address is nullified:
1. Admin calls `nullifyMarket(marketHash, reason)` or `nullifyAddress(addr, reason)`
2. The mapping is set to `true`
3. Timestamp and admin address are recorded for audit trail
4. Event is emitted for off-chain indexing

### Integration Points

**FriendGroupMarketFactory:**
- Checks `isAddressNullified()` before allowing market creation
- Checks participants on market acceptance
- Checks new members when added to markets
- Reverts with `AddressNullified()` if any participant is blocked

**Frontend:**
- Admin panel provides UI for nullification management
- Market display filters out nullified markets
- User-facing errors explain when operations are blocked

### Contract Interface

```solidity
// Check nullification status
function isMarketNullified(bytes32 marketHash) external view returns (bool);
function isAddressNullified(address addr) external view returns (bool);

// Admin functions (requires NULLIFIER_ADMIN_ROLE)
function nullifyMarket(bytes32 marketHash, string reason) external;
function nullifyAddress(address addr, string reason) external;
function reinstateMarket(bytes32 marketHash, string reason) external;
function reinstateAddress(address addr, string reason) external;

// Batch operations
function batchNullifyMarkets(bytes32[] marketHashes) external;
function batchNullifyAddresses(address[] addresses) external;
```

### Access Control

| Role | Permissions |
|------|-------------|
| DEFAULT_ADMIN_ROLE | Grant/revoke NULLIFIER_ADMIN_ROLE |
| NULLIFIER_ADMIN_ROLE | Nullify/reinstate markets and addresses |

### Audit Trail

Every nullification records:
- `marketNullifiedAt[hash]` / `addressNullifiedAt[addr]` - Timestamp
- `marketNullifiedBy[hash]` / `addressNullifiedBy[addr]` - Admin who performed action
- Events with reason strings for off-chain indexing

## RSA Accumulator Mode (Advanced)

### Purpose

The RSA accumulator provides cryptographic capabilities not available in simple mode:

1. **Compact Non-Membership Proofs**: Prove an address is NOT nullified in ~256 bytes
2. **Privacy**: Set contents are not revealed, only membership status
3. **Efficiency**: O(1) storage regardless of nullified set size
4. **Batch Operations**: Efficient addition/removal of multiple elements

### How It Works

The accumulator is based on RSA cryptographic assumptions:

```
A = g^(p1 * p2 * p3 * ...) mod n
```

Where:
- `n` = RSA modulus (product of two secret safe primes)
- `g` = Generator
- `p1, p2, p3...` = Prime representations of nullified elements

### Non-Membership Proofs

To prove an element `x` is NOT in the set:
1. Compute prime `p = H(x)` where H maps to primes
2. Provide witness `(d, b)` such that `A^d * g^b = g mod n`
3. Verifier checks the Bezout identity holds

### Initialization Requirements

To use the accumulator:

1. **Trusted Setup**: Generate RSA modulus from two secret safe primes
2. **Initialize Parameters**: Call `initializeRSAParams(n, g)`
3. **Update Accumulator**: Call `updateAccumulator(newValue)` after each change

```solidity
// Initialize RSA parameters (one-time setup)
function initializeRSAParams(bytes n, bytes g) external onlyRole(DEFAULT_ADMIN_ROLE);

// Update accumulator value (after batch operations)
function updateAccumulator(bytes newAccumulator) external onlyRole(NULLIFIER_ADMIN_ROLE);

// Verify non-membership
function verifyNonMembership(bytes32 element, bytes proof) external view returns (bool);
```

### When to Use RSA Mode

| Use Case | Simple Mode | RSA Mode |
|----------|-------------|----------|
| Small nullified set (<1000) | ✓ Recommended | Overkill |
| Large nullified set (>10000) | Gas expensive | ✓ Recommended |
| Privacy requirements | ✗ Set visible | ✓ Set hidden |
| On-chain non-membership proofs | ✗ Not possible | ✓ Compact proofs |
| Quick implementation | ✓ No setup | Requires trusted setup |

### Security Considerations

**Trusted Setup:**
- RSA modulus must be generated securely
- Secret primes must be destroyed after generation
- Consider multi-party computation for modulus generation

**Accumulator Updates:**
- Updates are computed off-chain for gas efficiency
- On-chain verification ensures correctness
- Admin must update accumulator after each nullification batch

## Deployment

### Contract Address
```
NullifierRegistry: 0x239C06E7AD066b5087Ed84686475f04f364ACBb7 (Mordor)
```

### Deployment Script
```bash
npx hardhat run scripts/deploy-nullifier-registry.js --network mordor
```

### Granting Admin Access
```bash
npx hardhat run scripts/admin/grant-nullifier-role-quick.js --network mordor
```

## Frontend Integration

### Admin Panel

The Nullifier tab in the admin panel provides:
- Statistics overview (nullified counts, operations)
- Market nullification by ID
- Address nullification
- List of nullified items with reinstatement option
- RSA accumulator status

### Hook Usage

```javascript
import { useNullifierContracts } from '../hooks/useNullifierContracts'

const {
  isRegistryAvailable,
  hasNullifierRole,
  nullifyAddress,
  reinstateAddress,
  nullifyMarketByHash,
  reinstateMarket,
  fetchNullifierState
} = useNullifierContracts({ provider, signer, account })
```

## Best Practices

1. **Document All Actions**: Always provide reason strings for nullifications
2. **Coordinate With Team**: Notify other admins before batch operations
3. **Periodic Review**: Review nullified items for potential reinstatement
4. **Test First**: Test nullification on testnet before mainnet operations
5. **Backup Audit Logs**: Export nullification events for compliance records

## Future Enhancements

- [ ] Initialize RSA accumulator for privacy-preserving proofs
- [ ] Add time-delayed nullification for dispute period
- [ ] Implement governance-based nullification for decentralization
- [ ] Add appeal process for nullified addresses
