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

## For More Details

- [Introduction](introduction.md)
- [How It Works](how-it-works.md)
- [Security Model](security.md)
