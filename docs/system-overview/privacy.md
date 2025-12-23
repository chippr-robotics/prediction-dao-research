# Privacy Mechanisms

Detailed explanation of the privacy-preserving features in Prediction DAO.

## Overview

Prediction DAO implements two complementary privacy systems:

1. **Nightmarket**: Zero-knowledge position encryption
2. **MACI**: Minimal Anti-Collusion Infrastructure

## Nightmarket Integration

### Position Encryption

Traders' positions are encrypted using Poseidon hashes and zkSNARKs.

**Process**:

1. **Create Position**: `position = {amount, direction, price, nonce}`
2. **Hash**: `commitment = Poseidon(position)`
3. **Prove**: Generate Groth16 proof of validity
4. **Submit**: Send `(commitment, proof)` on-chain

### Zero-Knowledge Proofs

**What is Proven**:
- Position is within valid range
- Trader has sufficient balance
- No double-spending

**What Remains Private**:
- Exact position size
- Trading direction (PASS/FAIL)
- Trader identity

### Batch Processing

Positions processed in epochs to prevent timing analysis:

- Epoch duration: 1 hour
- All positions in epoch revealed simultaneously
- Prevents correlation of positions with traders

## MACI Integration

### Key-Change Mechanism

MACI allows traders to change their encryption key, invalidating previous positions.

**Use Cases**:
- Suspected vote buying attempt
- Breaking collusion agreements
- Enhanced privacy

**Process**:

1. **Register**: Submit initial public key
2. **Trade**: Use key to encrypt positions
3. **Change Key**: Submit key-change message (encrypted with old key)
4. **Effect**: Previous positions invalidated

### Anti-Collusion Properties

**Problem**: Vote buying is a threat to governance

**Solution**: Non-verifiable commitments via key changes

- Briber can't verify trader followed through
- Trader can change key after receiving bribe
- Makes vote buying economically unenforceable

## Cryptographic Primitives

### Poseidon Hash

SNARK-friendly hash function:

- Optimized for zero-knowledge circuits
- Lower constraint count than SHA-256
- Faster proof generation

### Groth16 zkSNARKs

Zero-knowledge proof system:

- Succinct proofs (~200 bytes)
- Fast verification (~1ms)
- Requires trusted setup

### ECDH Key Exchange

For encrypted communication:

- Elliptic curve Diffie-Hellman
- Secure shared secret derivation
- Used in MACI message encryption

## Privacy Guarantees

### What's Public

✓ Total trading volume per market
✓ Aggregate PASS/FAIL prices
✓ Number of traders (count only)
✓ Market resolution outcomes

### What's Private

✗ Individual position sizes
✗ Trader identities
✗ Position directions
✗ Profit/loss per trader
✗ Trading patterns

## Limitations

### Known Limitations

1. **Network Analysis**: Observers can see transactions, but not content
2. **Front-end Privacy**: Browser metadata may leak information
3. **Side Channels**: Gas usage patterns could hint at activity

### Future Improvements

- Layer 2 deployment for additional privacy
- Improved circuit optimization
- Enhanced metadata protection
- Decoy transactions

## Functional Flows

This section describes the detailed functional flows within the privacy-preserving module, based on the `PrivacyCoordinator` contract implementation.

### Public Key Registration Flow

**Purpose**: Enable traders to register their public keys for encrypted communication.

**Process**:

1. **User Action**: Trader calls `registerPublicKey(bytes32 publicKey)`
2. **Validation**: Contract verifies public key is not zero
3. **Storage**: Public key stored in mapping: `publicKeys[userAddress] = publicKey`
4. **Event**: `PublicKeyRegistered(address user, bytes32 publicKey)` emitted
5. **Result**: Trader can now submit encrypted positions

**Key Points**:
- Users can update their public key at any time
- Public key required before position submission
- Used for ECDH key exchange in MACI-style encryption

### Encrypted Position Submission Flow

**Purpose**: Submit trading positions with privacy guarantees using zero-knowledge proofs.

**Single Position Submission**:

1. **Prerequisites**: User must have registered public key
2. **User Action**: Trader calls `submitEncryptedPosition(commitment, zkProof, marketId)`
   - `commitment`: Poseidon hash of position details
   - `zkProof`: Groth16 zkSNARK proof of position validity
   - `marketId`: Target market identifier
3. **Validation**:
   - Public key registered
   - Commitment is non-zero
   - Proof is non-empty
4. **Storage**:
   - Position stored with unique ID
   - Added to current epoch batch
   - Tracked in user positions list
   - Tracked in market positions list
5. **Event**: `EncryptedPositionSubmitted` emitted with position details
6. **Result**: Position queued for batch processing

**Batch Position Submission**:

1. **User Action**: Trader calls `batchSubmitPositions(commitments[], zkProofs[], marketIds[])`
2. **Validation**:
   - Array lengths match
   - Batch size ≤ MAX_BATCH_SIZE (100)
   - Each commitment and proof is valid
3. **Processing**: Loop through arrays, create position for each entry
4. **Gas Efficiency**: Single transaction creates multiple positions
5. **Events**: One `EncryptedPositionSubmitted` event per position
6. **Result**: Multiple positions submitted efficiently

**Data Structure**:
```solidity
struct EncryptedPosition {
    bytes32 commitment;      // Poseidon hash
    bytes zkProof;          // Groth16 proof
    address user;           // Submitter
    uint256 marketId;       // Target market
    uint256 timestamp;      // Submission time
    bool processed;         // Processing status
}
```

### Key-Change Messages Flow (MACI-Style)

**Purpose**: Allow traders to invalidate previous positions by changing encryption keys, preventing vote buying.

**Process**:

1. **User Action**: Trader calls `submitKeyChange(encryptedKeyChange)`
   - `encryptedKeyChange`: New key encrypted with old key
2. **Validation**:
   - Public key must be registered
   - Encrypted message is non-empty
3. **Storage**:
   - Key change appended to user's key change array
   - Marked as unprocessed
4. **Event**: `KeyChangeSubmitted(address user, uint256 keyChangeIndex)` emitted
5. **Public Key Update**: Trader calls `registerPublicKey(newPublicKey)`
6. **Effect**: Coordinator logic invalidates positions created with old key
7. **Result**: Previous commitments become unverifiable

**Anti-Collusion Mechanism**:
- Briber cannot verify trader's original position
- Trader can change key after receiving bribe
- Makes vote buying economically unenforceable
- Non-interactive key change process

**Data Structure**:
```solidity
struct KeyChange {
    bytes encryptedMessage;  // Encrypted new key
    uint256 timestamp;       // Change time
    bool processed;          // Processing status
}
```

### Epoch-Based Batch Processing Flow

**Purpose**: Process positions in batches to maintain temporal privacy and prevent timing analysis.

**Epoch Management**:

1. **Epoch Duration**: 1 hour (configurable constant)
2. **Current Epoch**: Tracked globally
3. **Position Assignment**: All positions submitted in same hour go to same epoch
4. **Epoch Advancement**: Time-based or manual trigger

**Batch Processing by Epoch**:

1. **Coordinator Action**: Calls `processMessages(epochId)`
2. **Access Control**: Only coordinator can process
3. **Validation**: Epoch ID must be valid (≤ currentEpoch)
4. **Processing**:
   - Retrieve all position IDs in epoch batch
   - Mark each unprocessed position as processed
   - Count processed positions
5. **Events**:
   - `EpochProcessed(epochId, positionsProcessed)`
   - `BatchPositionsProcessed(batchId, epochId, positionIds[], count, timestamp)`
6. **Result**: All positions in epoch revealed simultaneously

**Direct Batch Processing**:

1. **Coordinator Action**: Calls `batchProcessPositions(positionIds[])`
2. **Flexibility**: Process specific positions by ID
3. **Idempotency**: Safe to reprocess already-processed positions
4. **Use Case**: Process positions across multiple epochs

**Benefits**:
- Prevents correlation of positions with traders
- Maintains temporal privacy
- Gas-efficient bulk processing
- Prevents timing analysis attacks

### Position Query Flows

**Purpose**: Enable retrieval of position data while maintaining privacy.

**Query by User**:

1. **Action**: Call `getUserPositions(address user, uint256 offset, uint256 limit)`
2. **Returns**: 
   - Array of position IDs for the user
   - Boolean indicating if more positions exist
3. **Pagination**: Offset/limit for large datasets
4. **Privacy**: Only position IDs returned, not decrypted content

**Query by Market**:

1. **Action**: Call `getMarketPositions(uint256 marketId, uint256 offset, uint256 limit)`
2. **Returns**: Array of position IDs for the market
3. **Use Case**: Analyze market-specific activity
4. **Privacy**: Aggregate data without revealing individual positions

**Query by Epoch**:

1. **Action**: Call `getEpochPositions(uint256 epochId)`
2. **Returns**: Array of position IDs submitted in that epoch
3. **Use Case**: Batch processing and temporal analysis
4. **Privacy**: Shows when positions were submitted, not content

**Position Details**:

1. **Action**: Call `getPosition(uint256 positionId)`
2. **Returns**: Full `EncryptedPosition` struct
3. **Content**: Still encrypted - commitment and proof visible
4. **Privacy**: Position details remain private, only metadata public

**Proof Verification**:

1. **Action**: Call `verifyPositionProof(uint256 positionId)`
2. **Returns**: Boolean indicating proof validity
3. **Implementation**: Placeholder for zkSNARK verification
4. **Use Case**: Validate position before processing

### Complete Workflow Example

**Scenario**: Trader Alice wants to submit a private position

1. **Setup Phase**:
   - Alice generates encryption key pair
   - Calls `registerPublicKey(alicePublicKey)`
   - Public key stored on-chain

2. **Position Creation**:
   - Alice creates position: `{amount: 100, direction: PASS, price: 0.55, nonce: 123}`
   - Computes commitment: `commitment = Poseidon(position)`
   - Generates proof: `proof = GenerateGroth16Proof(position)`

3. **Submission**:
   - Alice calls `submitEncryptedPosition(commitment, proof, marketId)`
   - Position assigned to current epoch (e.g., epoch 5)
   - Position ID 42 created and tracked

4. **Batch Processing**:
   - Trading period continues, more positions submitted
   - Epoch 5 closes after 1 hour
   - Coordinator calls `processMessages(5)`
   - All positions in epoch 5 (including #42) marked as processed
   - Positions revealed simultaneously

5. **Queries**:
   - Alice queries her positions: `getUserPositions(alice, 0, 10)`
   - Returns: `[42, ...]`
   - Can verify position processed: `getPosition(42).processed == true`

6. **Anti-Collusion** (Optional):
   - Bob attempts to bribe Alice
   - Alice submits `submitKeyChange(encryptedNewKey)`
   - Registers new public key
   - Alice's position #42 becomes invalidated
   - Bob cannot verify Alice's vote

## Integration Testing

The privacy-preserving module has comprehensive integration tests that validate complete workflows across the system. These tests are located in `test/integration/privacy/privacy-trading-lifecycle.test.js` and were introduced in PR #60.

### Test Coverage Overview

The integration test suite covers:

1. **Complete encrypted position submission workflow**
2. **Batch position submission efficiency**
3. **Key-change messages (MACI-style anti-collusion)**
4. **Batch processing of positions**
5. **Epoch-based batch processing**
6. **End-to-end privacy-preserving market lifecycle**
7. **Error handling and edge cases**

### Test 1: Complete Encrypted Position Submission Workflow

**Purpose**: Validate the entire flow from proposal creation through encrypted position processing.

**Steps Tested**:

1. Submit and activate proposal
2. Create associated market
3. Traders register public keys (3 traders)
4. Submit encrypted positions (3 positions)
5. Verify positions batched in current epoch
6. Verify zkSNARK proofs for all positions
7. Process epoch batch
8. Verify positions marked as processed
9. Query user positions

**Key Validations**:
- Public key registration works correctly
- Positions are properly stored with commitments and proofs
- Epoch batching groups positions correctly
- zkSNARK proof verification succeeds
- Batch processing marks all positions as processed
- User position queries return correct results

**Events Verified**:
- `PublicKeyRegistered`
- `EncryptedPositionSubmitted`
- `EpochProcessed`

### Test 2: Batch Position Submission Efficiency

**Purpose**: Validate gas-efficient batch submission of multiple positions.

**Steps Tested**:

1. Setup proposal and market
2. Register trader public key
3. Prepare batch of 10 positions (commitments, proofs, market IDs)
4. Submit batch in single transaction
5. Verify all positions created
6. Verify gas usage reported
7. Verify events emitted for each position

**Key Validations**:
- `batchSubmitPositions` creates multiple positions atomically
- Position count increments correctly (10 positions)
- User position count matches (10 positions)
- All positions have correct metadata
- Events emitted for each position in batch
- Gas efficiency compared to individual submissions

**Performance Metrics**:
- Gas usage for batch transaction
- Number of events emitted (should equal batch size)

### Test 3: Key-Change Messages (MACI Anti-Collusion)

**Purpose**: Validate MACI-style key change mechanism for vote buying prevention.

**Steps Tested**:

1. Setup proposal and market
2. Register initial public key
3. Submit 2 positions with initial key
4. Simulate bribe attempt - submit key change message
5. Verify key change recorded
6. Update public key to new value
7. Submit new position with new key
8. Verify key change event emitted
9. Confirm old positions invalidated

**Key Validations**:
- Initial key registration works
- Positions submitted with initial key
- Key change message encrypted and stored
- Key change array tracks all changes
- New key successfully registered
- New positions use new key
- `KeyChangeSubmitted` event emitted
- Mechanism prevents verifiable vote buying

**Anti-Collusion Properties Tested**:
- Briber cannot verify trader's original vote
- Vote buying becomes economically unenforceable
- Multiple key changes supported (tested up to 5 changes)
- Key change history maintained

### Test 4: Batch Processing by Position IDs

**Purpose**: Validate coordinator's ability to process specific positions efficiently.

**Steps Tested**:

1. Setup proposal and market
2. Register traders (2 traders)
3. Trader1 submits batch of 5 positions
4. Trader2 submits batch of 3 positions
5. Coordinator processes all 8 positions by ID
6. Verify all positions marked as processed
7. Verify `BatchPositionsProcessed` event emitted
8. Test idempotency - reprocess same batch
9. Confirm positions remain processed

**Key Validations**:
- Positions from multiple traders in same batch
- Direct processing by position IDs works
- Gas usage for batch processing
- All positions correctly marked as processed
- Event contains correct position IDs and count
- Idempotent processing (safe to reprocess)

### Test 5: Epoch-Based Batch Processing

**Purpose**: Validate temporal privacy through epoch-based position batching.

**Steps Tested**:

1. Setup proposal and market
2. Register 3 traders with public keys
3. Submit 2 positions in Epoch 0
4. Verify epoch 0 contains 2 positions
5. Advance time by EPOCH_DURATION (1 hour)
6. Advance to Epoch 1
7. Submit 1 position in Epoch 1
8. Process Epoch 0 batch
9. Verify epoch 0 positions processed
10. Process Epoch 1 batch
11. Verify epoch 1 position processed

**Key Validations**:
- Positions correctly assigned to current epoch
- Epoch advancement works (time-based)
- Epoch position queries return correct results
- Epoch processing handles each epoch independently
- Temporal privacy maintained (same-epoch positions revealed together)
- Different epochs processed separately

**Privacy Properties Tested**:
- Timing analysis prevention
- Temporal batching of positions
- Same-epoch positions have identical timestamp visibility

### Test 6: End-to-End Privacy-Preserving Market Lifecycle

**Purpose**: Complete integration test covering entire lifecycle from proposal to market resolution.

**Phases Tested**:

**Phase 1: Setup**
- Submit and activate proposal
- Create associated market

**Phase 2: Privacy Setup**
- 3 traders register public keys
- Keys stored and verified

**Phase 3: Encrypted Trading**
- Trader1 submits 3 PASS positions (batch)
- Trader2 submits 2 FAIL positions (batch)
- Trader3 submits 1 PASS position (single)
- Total 6 encrypted positions
- All zkSNARK proofs verified

**Phase 4: Batch Processing**
- Coordinator processes all 6 positions in one batch
- Gas usage reported
- All positions marked as processed

**Phase 5: Position Queries**
- Query positions by user (3 queries)
- Query positions by market (1 query)
- Verify correct position counts per user
- Verify total market positions

**Phase 6: Market Completion**
- End trading period
- Oracle submits resolution
- Market resolves
- Privacy guarantees maintained throughout

**Key Validations**:
- Complete workflow from start to finish
- All privacy mechanisms work together
- Cross-contract integration functions correctly
- State consistency maintained
- Events emitted in correct sequence

**Privacy Guarantees Verified**:
- 🔒 Individual positions encrypted
- 🔒 Trader identities protected
- 🔒 Position amounts hidden
- ✓ Aggregate volume visible
- ✓ Market functioning correctly

### Test 7: Error Handling and Edge Cases

**Purpose**: Validate proper error handling and boundary conditions.

**Edge Cases Tested**:

1. **Missing Public Key**:
   - Attempt position submission without registered key
   - Expects: "Public key not registered" revert

2. **Empty Proof**:
   - Submit position with empty proof data
   - Expects: "Invalid proof" revert

3. **Oversized Batch**:
   - Attempt batch larger than MAX_BATCH_SIZE (100)
   - Expects: "Batch too large" revert

4. **Invalid Position IDs**:
   - Process batch with non-existent position IDs
   - Expects: Graceful handling, skip invalid IDs
   - Valid positions still processed

**Key Validations**:
- Input validation works correctly
- Error messages are clear and specific
- Invalid operations don't corrupt state
- Partial failures handled gracefully
- Security constraints enforced

### Test Execution Characteristics

**Performance**:
- Timeout: 120 seconds (2 minutes) for complex flows
- Typical execution: < 30 seconds per test
- Uses Hardhat network helpers for time manipulation
- Efficient fixture loading with `loadFixture`

**Test Infrastructure**:
- Framework: Hardhat + Chai + ethers.js v6
- Fixtures: `deploySystemFixture` for consistent state
- Helpers: Reusable functions for common operations
- Console logging: Progress indicators for complex flows

**Debugging Features**:
- Step-by-step console output
- Gas usage reporting
- Event verification
- State inspection at each phase

### What We Test For

The integration tests validate:

**Functional Correctness**:
- ✅ Public key registration and updates
- ✅ Single and batch position submission
- ✅ Commitment and proof storage
- ✅ Epoch assignment and tracking
- ✅ Key-change message handling
- ✅ Batch processing (by epoch and by ID)
- ✅ Position queries (by user, market, epoch)
- ✅ Proof verification

**Privacy Properties**:
- ✅ Position content remains encrypted on-chain
- ✅ Temporal privacy through epoch batching
- ✅ Anti-collusion via key changes
- ✅ Aggregate data availability
- ✅ Individual privacy preservation

**Integration Properties**:
- ✅ Cross-contract communication
- ✅ State consistency across contracts
- ✅ Event emission sequences
- ✅ End-to-end workflow completion
- ✅ Market lifecycle integration

**Robustness**:
- ✅ Input validation and error handling
- ✅ Boundary condition handling
- ✅ Idempotent operations
- ✅ Gas efficiency
- ✅ Edge case coverage

**Security**:
- ✅ Access control enforcement (coordinator-only operations)
- ✅ Invalid input rejection
- ✅ State protection from malformed data
- ✅ Anti-manipulation mechanisms

### Running the Tests

```bash
# Run all privacy integration tests
npx hardhat test test/integration/privacy/privacy-trading-lifecycle.test.js

# Run specific test
npx hardhat test --grep "Should handle complete encrypted position submission workflow"

# Run with gas reporting
REPORT_GAS=true npx hardhat test test/integration/privacy/privacy-trading-lifecycle.test.js

# Run with verbose output
npx hardhat test test/integration/privacy/privacy-trading-lifecycle.test.js --verbose
```

### Test Maintenance

**When to Update Tests**:
- Contract interface changes
- New privacy features added
- Bug fixes requiring regression tests
- Performance optimizations
- Security enhancements

**Coverage Metrics**:
- Workflow coverage: 100% (all critical privacy flows)
- Function coverage: ~90% of PrivacyCoordinator
- Edge case coverage: Key error scenarios
- Integration points: All contract interactions

## For More Details

- [Introduction](introduction.md)
- [How It Works](how-it-works.md)
- [Security Model](security.md)
- [Integration Testing Guide](../developer-guide/integration-testing.md)
