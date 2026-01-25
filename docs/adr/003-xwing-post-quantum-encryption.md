# ADR-003: X-Wing Post-Quantum Encryption for Private Markets

**Status**: Accepted

**Date**: 2026-01-24

**Authors**: Development Team

**Deciders**: Core Development Team, Security Lead

## Context

Private prediction markets use envelope encryption to protect market terms. The current implementation uses X25519 for key exchange, which is secure against classical computers but vulnerable to quantum attacks via Shor's algorithm.

### Problem Statement

Encrypted market data is stored publicly on decentralized storage (IPFS). An adversary could:

1. **Harvest now**: Record all encrypted envelopes today
2. **Decrypt later**: When sufficiently powerful quantum computers exist, break the X25519 key exchange and recover the plaintext

This "harvest now, decrypt later" (HNDL) attack is concerning because:

- Private market terms may remain sensitive for years or decades
- Competitive intelligence doesn't have an expiration date
- Regulatory or legal sensitivity may persist indefinitely
- The data is publicly available, making harvesting trivial

### Forces at Play

- **Long-term confidentiality**: Market terms should remain private indefinitely
- **Quantum timeline uncertainty**: Cryptographically relevant quantum computers (CRQCs) may arrive in 10-20 years
- **NIST recommendations**: NIST published post-quantum standards (FIPS 203, 204, 205) in 2024
- **Performance requirements**: Key operations must remain fast for good UX
- **Backward compatibility**: Existing encrypted markets must remain readable
- **Library availability**: Need production-quality JavaScript implementations

## Decision

**We will implement X-Wing hybrid key encapsulation for all new private market envelopes.**

X-Wing combines:
- **X25519**: Classical elliptic curve Diffie-Hellman (32-byte keys)
- **ML-KEM-768**: NIST-standardized lattice-based KEM (1184-byte public keys)

The hybrid shared secret is computed as:
```
SharedSecret = SHA3-256(XWING_LABEL || ss_ML-KEM || ss_X25519 || ct_X25519 || pk_X25519)
```

### Implementation Details

1. **New envelope version**: v2.0 with algorithm `xwing-chacha20poly1305`
2. **Key derivation**: Deterministic from wallet signature (same as v1.0)
3. **Dual keypair management**: Hook derives both X25519 and X-Wing keys from single signature
4. **Unified decrypt**: Auto-detects version and uses appropriate key
5. **Symmetric encryption**: ChaCha20-Poly1305 remains unchanged (256-bit keys are quantum-safe)

### Envelope Format Changes

**v1.0 (X25519):**
```json
{
  "version": "1.0",
  "algorithm": "x25519-chacha20poly1305",
  "keys": [{
    "address": "0x...",
    "ephemeralPublicKey": "32 bytes hex",
    "nonce": "12 bytes hex",
    "wrappedKey": "48 bytes hex"
  }]
}
```

**v2.0 (X-Wing):**
```json
{
  "version": "2.0",
  "algorithm": "xwing-chacha20poly1305",
  "keys": [{
    "address": "0x...",
    "xwingCiphertext": "1120 bytes hex",
    "nonce": "12 bytes hex",
    "wrappedKey": "48 bytes hex"
  }]
}
```

## Rationale

### Why X-Wing Specifically?

X-Wing is defined in [IETF draft-connolly-cfrg-xwing-kem](https://datatracker.ietf.org/doc/draft-connolly-cfrg-xwing-kem/) and provides:

1. **Hybrid security**: Secure if either X25519 OR ML-KEM remains unbroken
2. **Standardized combiner**: SHA3-256-based combination per IETF specification
3. **Optimal balance**: ML-KEM-768 provides 192-bit security level, matching X25519
4. **Clean API**: Single encapsulate/decapsulate interface

### Why Hybrid Instead of Pure ML-KEM?

- **Belt and suspenders**: If ML-KEM has undiscovered weaknesses, X25519 provides fallback
- **Proven classical security**: X25519 has years of cryptanalysis and deployment
- **NIST recommendation**: Hybrid constructions recommended during PQC transition period
- **Conservative approach**: Better to over-engineer security for long-term data

### Why ML-KEM-768 Over Other Options?

| Option | Public Key | Ciphertext | Security Level | Status |
|--------|------------|------------|----------------|--------|
| ML-KEM-512 | 800 bytes | 768 bytes | 128-bit | NIST approved |
| ML-KEM-768 | 1184 bytes | 1088 bytes | 192-bit | NIST approved |
| ML-KEM-1024 | 1568 bytes | 1568 bytes | 256-bit | NIST approved |
| NTRU | 699-1230 | 699-1230 | Various | Not NIST selected |
| McEliece | 261,120 | 128 | 256-bit | Too large |

ML-KEM-768 was chosen because:
- 192-bit security matches X25519's effective security level
- Reasonable key sizes (~1.2KB per participant)
- NIST standardized (FIPS 203)
- Well-analyzed by cryptographic community

### Why @noble/post-quantum?

- **Same author**: Paul Miller also maintains @noble/curves, @noble/hashes, @noble/ciphers already in use
- **Consistent API**: Follows same patterns as existing noble libraries
- **Auditable**: Minimal, readable TypeScript implementation
- **No WASM**: Pure JavaScript avoids build complexity
- **Active maintenance**: Regular updates and security patches

## Consequences

### Positive

- **Long-term confidentiality**: Markets encrypted today remain secure against future quantum computers
- **Industry leadership**: Early adoption of post-quantum standards
- **Regulatory alignment**: Meets emerging quantum-safe requirements (NIST IR 8547)
- **Backward compatible**: Existing v1.0 markets remain fully functional
- **Single signature UX**: Users sign once, get both classical and post-quantum keys
- **Transparent migration**: New markets automatically use X-Wing; no user action required

### Negative

- **Increased key sizes**: 1216 bytes vs 32 bytes per public key (38x larger)
- **Increased ciphertext**: 1120 bytes vs 32 bytes per recipient (35x larger)
- **Slower operations**: ~500μs vs ~50μs for key operations (10x slower, but still imperceptible)
- **Larger envelopes**: ~1.2KB per participant vs ~80 bytes (significant for large groups)
- **Bundle size increase**: @noble/post-quantum adds ~15KB gzipped to frontend bundle

### Mitigations

**For larger envelopes:**
- Private markets typically have 2-10 participants, so overhead is manageable
- IPFS/Arweave storage is cheap; extra kilobytes are negligible cost
- Content is encrypted once regardless of participant count (O(1))

**For performance:**
- Key operations remain <1ms, imperceptible to users
- Key derivation from cached signature is synchronous and fast
- Decryption bottleneck is network fetch, not crypto operations

**For bundle size:**
- Tree-shaking excludes unused ML-DSA and SLH-DSA modules
- Only ML-KEM-768 is loaded for envelope encryption
- Consider dynamic import for non-critical paths if needed

### Risks

**Risk: ML-KEM is broken by classical attack**
- Mitigation: Hybrid construction means X25519 still provides security
- Monitoring: Track cryptographic research on lattice problems

**Risk: Implementation vulnerabilities**
- Mitigation: Using audited @noble/post-quantum library
- Mitigation: Comprehensive test coverage (24 new tests)
- Mitigation: IETF-specified combiner function

**Risk: Quantum computers arrive sooner than expected**
- Mitigation: This is exactly why we're implementing X-Wing now
- All new markets are protected from day one

**Risk: NIST revises ML-KEM standard**
- Mitigation: Envelope version allows migration to new algorithms
- Mitigation: Can add v3.0 format with updated primitives if needed

## Alternatives Considered

### Alternative 1: Pure ML-KEM-768 (No Hybrid)

**Pros:**
- Smaller ciphertext (no X25519 component)
- Simpler implementation
- Already NIST standardized

**Cons:**
- No fallback if ML-KEM is broken
- Less conservative security posture
- Not recommended by NIST for transition period

**Why not chosen:** Hybrid provides defense in depth with minimal overhead

### Alternative 2: NTRU-based Hybrid

**Pros:**
- Mature algorithm with long history
- Smaller ciphertexts than ML-KEM

**Cons:**
- Not selected by NIST for standardization
- Fewer production-quality JS implementations
- Less cryptanalysis than ML-KEM in recent years

**Why not chosen:** NIST standardization of ML-KEM provides stronger confidence

### Alternative 3: Wait for Industry Adoption

**Pros:**
- More mature implementations later
- Clearer best practices
- Potential performance improvements

**Cons:**
- Markets created now remain vulnerable to HNDL
- Data harvesting is happening today
- Later migration doesn't protect historical data

**Why not chosen:** Quantum threat requires proactive protection; can't retrofit old envelopes

### Alternative 4: Server-Side Key Management

**Pros:**
- Could use HSM with PQC support
- Centralized key rotation
- Smaller client-side overhead

**Cons:**
- Contradicts trustless design
- Central point of failure
- Users must trust key custodian
- Defeats privacy guarantees

**Why not chosen:** Fundamentally incompatible with decentralized, trustless architecture

## Implementation Notes

### Files Modified

1. `frontend/package.json` - Added @noble/post-quantum dependency
2. `frontend/src/utils/crypto/constants.js` - Added XWING_ALGORITHM, XWING_ENVELOPE_INFO, SUPPORTED_ALGORITHMS
3. `frontend/src/utils/crypto/envelopeEncryption.js` - Added X-Wing implementation:
   - Internal: `xwingKeygen`, `xwingEncapsulate`, `xwingDecapsulate`, `xwingCombiner`
   - Exported: `deriveXWingKeyPair`, `xwingPublicKeyFromSignature`, `deriveXWingKeyPairFromSignature`
   - Exported: `encryptEnvelopeXWing`, `decryptEnvelopeXWing`, `addRecipientXWing`
   - Exported: `decryptEnvelopeUnified`, `addParticipantUnified`
   - Exported: `isXWingEnvelope`, `isX25519Envelope`
4. `frontend/src/hooks/useEncryption.js` - Updated for dual keypair management
5. `frontend/src/test/crypto/envelopeEncryption.test.js` - Added 24 X-Wing tests

### Migration Strategy

1. **New markets**: Automatically use X-Wing (v2.0) by default
2. **Existing markets**: Remain readable with v1.0 decoder (X25519)
3. **Adding participants**: Preserves original algorithm of envelope
4. **Optional fallback**: `createEncrypted(metadata, { algorithm: 'x25519' })` for classical-only

### Testing

All 71 envelope encryption tests pass, including:
- X-Wing key derivation (determinism, correct sizes)
- X-Wing encryption/decryption for single and multiple recipients
- Backward compatibility with v1.0 envelopes
- Unified decrypt routing based on envelope version
- Algorithm preservation when adding participants

### Performance Benchmarks

| Operation | X25519 (v1.0) | X-Wing (v2.0) | Overhead |
|-----------|---------------|---------------|----------|
| Key derivation | ~50μs | ~500μs | 10x |
| Encapsulation | ~50μs | ~500μs | 10x |
| Decapsulation | ~50μs | ~500μs | 10x |
| Public key size | 32 bytes | 1216 bytes | 38x |
| Ciphertext size | 32 bytes | 1120 bytes | 35x |

All operations remain sub-millisecond, imperceptible to users.

## References

- [IETF X-Wing Draft](https://datatracker.ietf.org/doc/draft-connolly-cfrg-xwing-kem/)
- [X-Wing Cryptographic Paper](https://eprint.iacr.org/2024/039)
- [NIST FIPS 203 (ML-KEM)](https://csrc.nist.gov/pubs/fips/203/final)
- [NIST IR 8547 - Transition to Post-Quantum Cryptography](https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8547.ipd.pdf)
- [@noble/post-quantum](https://github.com/paulmillr/noble-post-quantum)
- Internal: `docs/developer-guide/envelope-encryption-spec.md`
- Internal: `docs/blog/private-prediction-markets-envelope-encryption.md`
- Related: ADR-001 Trail of Bits Toolchain

## Revision History

| Date | Changes | Author |
|------|---------|--------|
| 2026-01-24 | Initial version | Development Team |
