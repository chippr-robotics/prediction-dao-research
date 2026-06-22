# ADR-005: Remove the unused X3DH/Double-Ratchet messaging layer

**Status**: Accepted

**Date**: 2026-06-22

**Authors**: FairWins engineering

**Deciders**: realcodywburns

**Technical Story**: Issue #749 (security), PR #755

## Context

The frontend crypto module (`frontend/src/utils/crypto/`) shipped a hand-rolled,
Signal-style secure-messaging stack, added in January 2026 for "encrypted
communications in friend markets":

- `x3dh.js` — Extended Triple Diffie-Hellman key agreement
- `doubleRatchet.js` — Double Ratchet message encryption
- `senderKeys.js` — Sender Keys for group sessions
- `sessionManager.js` — a Session Manager combining X3DH + Double Ratchet

Two facts made this code a liability rather than an asset:

1. **It was never wired up.** No production code imported any of these modules,
   and the `utils/crypto` barrel that re-exported them was itself imported
   nowhere. The live privacy feature uses **envelope encryption**
   (`envelopeEncryption.js`, with X-Wing post-quantum key encapsulation per
   [ADR-003](./003-xwing-post-quantum-encryption.md)), which is entirely
   independent of this layer. No spec or roadmap references in-app messaging,
   X3DH, or the Double Ratchet.

2. **It shipped placeholder cryptography (issue #749).** `signPreKey()` returned
   an HMAC tag instead of an Ed25519 signature, and `verifyPreKeySignature()`
   returned `signature.length === 32` — i.e. it accepted *any* 32-byte value.
   The signed-pre-key authentication check was therefore a no-op, a latent
   MITM / pre-key-substitution vector the moment the layer were enabled.

The identity keys in this layer are X25519 (Montgomery) keys, so a "proper" fix
would require XEd25519 (signing with an X25519 key, à la Signal) or a separate
Ed25519 signing key — meaningful cryptographic engineering for code nothing uses.

## Decision

We will **remove the unused messaging layer entirely**: delete `x3dh.js`,
`doubleRatchet.js`, `senderKeys.js`, `sessionManager.js`, and
`sessionManager.test.js`, and drop their re-exports from
`frontend/src/utils/crypto/index.js`.

We will **not** harden the placeholder cryptography in place. If encrypted
messaging is built in the future, it will be implemented on a vetted, audited
library (e.g. libsignal) or a properly reviewed design — captured in a new ADR
at that time. We will not ship or maintain a hand-rolled partial Signal protocol.

## Rationale

- **Security-first.** Dead, unaudited cryptography containing a known no-op
  signature check is a standing liability. Removing it eliminates the #749
  vulnerability and reduces attack surface.
- **Behavior-neutral.** The layer has no importers, so removal does not affect
  the live application in any way.
- **Poor return on hardening.** Implementing XEd25519/Ed25519 and then
  maintaining a bespoke Signal implementation — for a feature that is not on the
  roadmap and that nothing calls — is effort spent preserving risk.

## Consequences

### Positive

- Eliminates the #749 latent MITM / pre-key-substitution vector.
- Removes ~1,950 lines of unaudited, hand-rolled cryptography and shrinks the
  client bundle.
- Clarifies the crypto module's scope to **envelope encryption only**, and sets
  the precedent that any future messaging must go through a vetted library + ADR.

### Negative

- If P2P or group messaging is later desired, the scaffolding must be rebuilt.
  **Mitigation:** rebuild on a vetted, audited library rather than hand-rolled
  primitives; the prior implementation remains in git history for reference.

### Risks

- Removing exports could break an importer. **Mitigation/verification:** a
  repo-wide search confirmed zero remaining references to any removed symbol;
  the frontend crypto/reports/lib test suites pass (197 tests) and eslint is
  clean on the changed module.

## Alternatives Considered

### Alternative 1: Harden in place (real Ed25519/XEd25519)

Replace the HMAC placeholder with genuine public-key signatures, keeping the
messaging layer.

**Pros:** preserves the scaffolding for a future messaging feature.

**Cons:** requires XEd25519 or a separate signing key; commits us to maintaining
a bespoke Signal implementation; keeps unaudited hand-rolled crypto in the tree.

**Why not chosen:** poor ROI for unused code, and security-first practice favors
removing latent crypto risk over hardening dormant code.

### Alternative 2: Guard the placeholder

Make `signPreKey()` / `verifyPreKeySignature()` throw a "not production-ready"
error so the layer cannot be used silently.

**Pros:** minimal change; keeps the scaffold available.

**Cons:** leaves dead, unaudited code in the tree that invites future misuse and
does not reduce attack surface.

**Why not chosen:** removal is cleaner and actually closes the risk.

## Implementation Notes

- Removed the four modules + their test and the barrel re-exports on branch
  `security/remove-dead-x3dh-layer` (PR #755). Closes #749.
- Untouched: `envelopeEncryption.js` (the live path), and the shared
  `primitives.js` / `constants.js` consumed by `codeVault` and `addressBook`.

## References

- Issue #749 — Security: X3DH signed-pre-key signing & verification are insecure placeholders
- PR #755 — security(crypto): remove unused X3DH/Double-Ratchet messaging layer
- [ADR-003: X-Wing Post-Quantum Encryption for Private Markets](./003-xwing-post-quantum-encryption.md)
- [Encryption Architecture](../developer-guide/encryption-architecture.md)

## Revision History

| Date | Changes | Author |
|------|---------|--------|
| 2026-06-22 | Initial version | FairWins engineering |
