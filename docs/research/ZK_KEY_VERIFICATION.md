# Zero-Knowledge Key Verification System

## Overview

This document describes the production-ready zero-knowledge key verification system implemented for the ClearPath governance platform. The system replaces the previous simulated verification with actual cryptographic verification using Groth16 zkSNARKs and manages the complete lifecycle of ZK keys.

## Architecture

### Components

1. **ZKKeyManager.sol** - Manages ZK public key lifecycle
2. **ZKVerifier.sol** - Performs actual proof verification using BN128 precompiles
3. **RoleManager.sol** - Integrates with ZKKeyManager for ClearPath users
4. **PrivacyCoordinator.sol** - Uses ZKVerifier for position proof validation

### Component Relationships

```
┌─────────────────┐
│   RoleManager   │──────────┐
└─────────────────┘          │
        │                    │
        │ (DELEGATE_ROLE)    │
        ▼                    ▼
┌─────────────────┐    ┌──────────────────┐
│  ZKKeyManager   │    │ PrivacyCoordinator│
└─────────────────┘    └──────────────────┘
                              │
                              │
                              ▼
                       ┌──────────────┐
                       │  ZKVerifier  │
                       └──────────────┘
```

## ZKKeyManager

### Features

#### 1. Key Registration
- Validates key format (32-512 characters)
- Creates unique key hash using: user address, public key, timestamp, and incrementing nonce
- Nonce-based approach ensures compatibility with Ethereum Classic (no prevrandao dependency)
- Sets expiration timestamp
- Maintains key history

#### 2. Key Rotation
- Marks old key as ROTATED
- Registers new key with incremented rotation count
- Links to previous key for audit trail
- Enforces rate limiting (default: 4 rotations per year)

#### 3. Key Revocation
- Allows user self-revocation
- Allows admin revocation
- Supports delegate pattern (e.g., RoleManager acting on behalf of users)

#### 4. Key Expiration
- Automatic expiration after configured duration (default: 365 days)
- Manual admin expiration for compromised keys
- Configurable expiration requirement

#### 5. Key Status Tracking
- `NONE` - No key registered
- `ACTIVE` - Key is valid and usable
- `ROTATED` - Key has been replaced
- `REVOKED` - Key has been revoked
- `EXPIRED` - Key has expired

### Usage Example

```javascript
// Deploy ZKKeyManager
const ZKKeyManager = await ethers.getContractFactory("ZKKeyManager");
const zkKeyManager = await ZKKeyManager.deploy();

// User registers a key
await zkKeyManager.connect(user).registerKey("zkp_user_public_key_1234567890...");

// Check if key is valid
const isValid = await zkKeyManager.hasValidKey(user.address);

// User rotates their key
await zkKeyManager.connect(user).rotateKey("zkp_new_public_key_9876543210...");

// Admin revokes a compromised key
await zkKeyManager.connect(admin).revokeKey(compromisedUser.address);

// Configure system settings
await zkKeyManager.connect(admin).updateConfiguration(
    180 * 24 * 60 * 60, // 180 day expiration
    8,                   // 8 rotations per year
    true                 // Require expiration
);
```

### Delegate Pattern

The ZKKeyManager supports a delegate pattern where trusted contracts (like RoleManager) can perform operations on behalf of users. This is implemented using the `DELEGATE_ROLE`.

```javascript
// Grant delegate role to RoleManager
await zkKeyManager.grantRole(DELEGATE_ROLE, roleManagerAddress);

// RoleManager can now register/rotate/revoke keys for users
await zkKeyManager.registerKeyFor(user.address, zkPublicKey);
await zkKeyManager.rotateKeyFor(user.address, newZkPublicKey);
```

## ZKVerifier

### Features

#### 1. Groth16 Proof Verification
- Uses Ethereum's BN128 precompiled contracts
- Supports standard Groth16 zkSNARK proofs
- Validates proof structure and curve points

#### 2. Verification Key Management
- Admin-controlled verification key setup
- Supports multiple public inputs
- Validates all curve points on initialization

#### 3. Proof Validation
- Decodes proof from bytes
- Validates all points are on BN128 curve
- Performs pairing check using precompiles

### Usage Example

```javascript
// Deploy ZKVerifier
const ZKVerifier = await ethers.getContractFactory("ZKVerifier");
const zkVerifier = await ZKVerifier.deploy();

// Set verification key (from trusted setup)
await zkVerifier.connect(admin).setVerificationKey(
    alpha,      // G1 point
    beta,       // G2 point
    gamma,      // G2 point
    delta,      // G2 point
    gammaABC    // Array of G1 points
);

// Verify a proof
const isValid = await zkVerifier.verifyProof(proofBytes, publicInputs);

// Or with proof components
const isValid = await zkVerifier.verifyProofComponents(
    [a_x, a_y],           // Proof A
    [[b_x0, b_x1], [b_y0, b_y1]], // Proof B
    [c_x, c_y],           // Proof C
    publicInputs          // Public inputs
);
```

### BN128 Precompiles

The ZKVerifier uses three Ethereum precompiles for efficient curve operations:

- **ecAdd (0x06)** - Point addition on BN128 curve
- **ecMul (0x07)** - Scalar multiplication on BN128 curve
- **ecPairing (0x08)** - Bilinear pairing check

These precompiles provide gas-efficient curve operations that would be prohibitively expensive in Solidity.

## Integration with RoleManager

### Enhanced Functions

#### 1. registerZKKey
```solidity
function registerZKKey(string memory zkPublicKey) external whenNotPaused
```
- Requires ClearPath role
- Validates key format
- Registers with ZKKeyManager if set
- Falls back to local storage for backward compatibility

#### 2. rotateZKKey
```solidity
function rotateZKKey(string memory newZKPublicKey) external whenNotPaused
```
- Requires ClearPath role
- Requires ZKKeyManager to be set
- Performs key rotation through ZKKeyManager
- Updates local storage

#### 3. revokeZKKey
```solidity
function revokeZKKey() external whenNotPaused
```
- Requires ClearPath role
- Requires ZKKeyManager to be set
- Revokes key through ZKKeyManager
- Clears local storage

#### 4. hasValidZKKey
```solidity
function hasValidZKKey(address user) external view returns (bool)
```
- Checks ZKKeyManager if set
- Falls back to local storage check
- Returns true only if key is ACTIVE and not expired

## Integration with PrivacyCoordinator

### Enhanced Functions

#### 1. setZKVerifier
```solidity
function setZKVerifier(address _zkVerifier) external onlyOwner
```
- Links PrivacyCoordinator to ZKVerifier
- Required for production proof verification

#### 2. verifyPositionProof
```solidity
function verifyPositionProof(uint256 positionId) external view returns (bool)
```
- Falls back to simple check if ZKVerifier not set
- Uses ZKVerifier when available
- Maintains backward compatibility

#### 3. verifyPositionProofWithInputs
```solidity
function verifyPositionProofWithInputs(
    uint256 positionId,
    uint256[] calldata publicInputs
) external returns (bool)
```
- New function for explicit verification with public inputs
- Requires ZKVerifier to be set
- Performs full Groth16 verification

## Security Considerations

### 1. Key Lifecycle Security
- **Rate Limiting**: Prevents excessive key rotations (default: 4 per year)
- **Expiration**: Forces periodic key rotation (default: 365 days)
- **Revocation**: Immediate invalidation of compromised keys
- **Audit Trail**: Complete history maintained for all keys
- **Nonce-Based Hashing**: Uses incrementing nonce combined with user address, public key, and timestamp to ensure unique and unpredictable key hashes. This approach is compatible with Ethereum Classic and doesn't rely on post-merge features like prevrandao.

### 2. Access Control
- **Admin Role**: Can expire keys and update configuration
- **Delegate Role**: Allows trusted contracts to act on behalf of users
- **User Self-Service**: Users can register, rotate, and revoke their own keys

### 3. Proof Verification Security
- **Curve Validation**: All points validated to be on BN128 curve
- **Field Validation**: Public inputs validated against field modulus
- **Precompile Safety**: Uses battle-tested Ethereum precompiles

### 4. Emergency Response
- **Pause Capability**: Admin can pause key operations
- **Manual Expiration**: Admin can immediately expire compromised keys
- **Gradual Rollout**: System supports fallback to simple verification

## Testing

### Unit Tests

#### ZKKeyManager (36 tests)
- Deployment configuration
- Key registration (valid/invalid formats)
- Key rotation (with rate limiting)
- Key revocation (user/admin)
- Key expiration (automatic/manual)
- Configuration management
- Pause/unpause functionality
- View functions

#### ZKVerifier (18 tests)
- Deployment and initialization
- Verification key management
- Proof structure validation
- Curve point validation
- Proof verification
- Field element validation
- Gas optimization

### Integration Tests (22 tests)
- Complete registration flow
- Key rotation flow
- Key revocation flow
- Key expiration flow
- Multi-user scenarios
- PrivacyCoordinator integration
- Configuration changes
- Emergency scenarios

### Running Tests

```bash
# Run all ZK-related tests
npx hardhat test test/ZKKeyManager.test.js
npx hardhat test test/ZKVerifier.test.js
npx hardhat test test/RoleManager.test.js
npx hardhat test test/integration/rbac/zk-lifecycle-integration.test.js

# Run specific test suite
npx hardhat test --grep "Key Rotation"

# Run with gas reporting
REPORT_GAS=true npx hardhat test test/ZKVerifier.test.js
```

## Deployment Guide

### 1. Deploy Contracts

```javascript
// Deploy ZKKeyManager
const ZKKeyManager = await ethers.getContractFactory("ZKKeyManager");
const zkKeyManager = await ZKKeyManager.deploy();
await zkKeyManager.waitForDeployment();

// Deploy ZKVerifier
const ZKVerifier = await ethers.getContractFactory("ZKVerifier");
const zkVerifier = await ZKVerifier.deploy();
await zkVerifier.waitForDeployment();

// Link to existing RoleManager
await roleManager.setZKKeyManager(await zkKeyManager.getAddress());

// Link to existing PrivacyCoordinator
await privacyCoordinator.setZKVerifier(await zkVerifier.getAddress());
```

### 2. Grant Roles

```javascript
// Grant admin role
const ADMIN_ROLE = await zkKeyManager.ADMIN_ROLE();
await zkKeyManager.grantRole(ADMIN_ROLE, adminAddress);

// Grant delegate role to RoleManager
const DELEGATE_ROLE = await zkKeyManager.DELEGATE_ROLE();
await zkKeyManager.grantRole(DELEGATE_ROLE, await roleManager.getAddress());

// Grant verifier admin role
const VERIFIER_ADMIN_ROLE = await zkVerifier.VERIFIER_ADMIN_ROLE();
await zkVerifier.grantRole(VERIFIER_ADMIN_ROLE, adminAddress);
```

### 3. Configure System

```javascript
// Configure ZKKeyManager
await zkKeyManager.connect(admin).updateConfiguration(
    365 * 24 * 60 * 60, // 365 day expiration
    4,                   // 4 rotations per year
    true                 // Require expiration
);

// Set verification key (from trusted setup ceremony)
await zkVerifier.connect(admin).setVerificationKey(
    alpha,
    beta,
    gamma,
    delta,
    gammaABC
);
```

## Backward Compatibility

The system maintains backward compatibility with the previous simulated implementation:

1. **RoleManager**: If ZKKeyManager is not set, keys are stored locally
2. **PrivacyCoordinator**: If ZKVerifier is not set, uses simple proof length check
3. **Existing Tests**: All existing tests continue to pass

This allows for gradual rollout:
1. Deploy new contracts
2. Test in parallel with existing system
3. Link contracts when ready
4. Monitor and verify functionality
5. Fully transition to production verification

## Future Enhancements

### 1. Multi-Key Support
- Allow users to register multiple keys
- Support key type differentiation
- Enable key-specific permissions

### 2. Advanced Verification
- Support for different proof systems (PLONK, STARKs)
- Batch proof verification
- Recursive proof verification

### 3. Key Recovery
- Social recovery mechanisms
- Time-locked recovery
- Guardian-based recovery

### 4. Enhanced Monitoring
- Key usage analytics
- Suspicious activity detection
- Automated alerting

## Troubleshooting

### Issue: "ZK key manager not set"
**Solution**: Link RoleManager to ZKKeyManager using `setZKKeyManager()`

### Issue: "Not authorized delegate"
**Solution**: Grant DELEGATE_ROLE to RoleManager

### Issue: "Rate limit exceeded"
**Solution**: Wait for year reset or admin increases `maxRotationsPerYear`

### Issue: "Verification key not set"
**Solution**: Admin must call `setVerificationKey()` on ZKVerifier

### Issue: "Invalid curve point"
**Solution**: Ensure all verification key and proof points are valid BN128 curve points

## References

- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
- [BN128 Curve Specification](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-196.md)
- [Ethereum Precompiles](https://www.evm.codes/precompiled)
- [zkSNARKs Explained](https://z.cash/technology/zksnarks/)

## License

Apache-2.0

## Contact

For questions or security issues, contact the development team.
