# Phase 0 Research: Open-Challenge Wagers

All spec clarifications were resolved in two `/speckit-clarify` sessions (resolution-type scope,
equal-stakes, code uniqueness, post-accept readability, brute-force posture, taker membership), so this
phase resolves the remaining *technical* unknowns the design depends on.

## R1 — Commit to the code without storing it, and verify a taker knows it (front-running resistant)

**Decision**: Commit the code on-chain as an Ethereum **address** (`claimAuthority`) derived from a
deterministic secp256k1 keypair. To accept, the taker signs an **EIP-712** typed message with the
code-derived private key; the contract recovers the signer with OpenZeppelin `ECDSA.recover` and requires
it to equal `claimAuthority`.

The signed message binds the taker:

```
domain    = EIP712Domain(name="FairWins WagerRegistry", version="1",
                          chainId=block.chainid, verifyingContract=address(this))
OpenAccept = { uint256 wagerId, address taker }
digest     = _hashTypedDataV4(keccak256(abi.encode(OPEN_ACCEPT_TYPEHASH, wagerId, msg.sender)))
require(ECDSA.recover(digest, signature) == claimAuthority[wagerId])
```

**Rationale**:
- **Single transaction** (no commit-reveal round trip) while still front-running resistant: the
  signature is only valid for the `taker` (= `msg.sender`) embedded in the digest, so a mempool observer
  who copies the pending signature cannot reuse it for their own address — they would need the code to
  re-sign (FR-011, SC-006).
- **Replay-proof by construction**: the EIP-712 domain binds `chainId` + `verifyingContract` (no
  cross-chain / cross-contract replay) and the message binds `wagerId` (no cross-wager replay). After a
  successful accept the wager is `Active`, so the same signature cannot be reused on the same wager.
- **No code on-chain**: only the derived address is public; recovering the code from the address is the
  entropy barrier (FR-006). The address doubles as the discovery key and the uniqueness key.
- **Library, not raw `ecrecover`**: OZ `ECDSA.recover` rejects malleable `s`/invalid `v` and reverts on
  failure rather than returning `address(0)` — eliminating the classic "recover returns 0 == unset slot"
  pitfall (Principle I).

**Alternatives considered**:
- *Plain hash-lock* (`keccak256(code)` on-chain; submit `code` to accept): one transaction but the code is
  exposed in mempool calldata and is trivially front-run — rejected (fails FR-011).
- *Two-phase commit-reveal*: front-running resistant but costs two transactions and a waiting period —
  rejected as unnecessary friction given the signature scheme achieves the same in one tx.

## R2 — Fast vs. hardened key derivation (v1 posture)

**Decision**: v1 uses a **fast** derivation (single keccak/HKDF pass), per spec FR-003a / Clarification Q
(brute-force posture = casual-guessing only). Derivation is wrapped behind a versioned domain string so a
memory-hard upgrade (argon2id/scrypt) can ship later without breaking already-created wagers.

```
seed     = keccak256( "FairWins/claim/v1" || normalize(code) )      // 32 bytes
claimKey = secp256k1 private key from seed (reduce mod n, reject 0)  // for EIP-712 signing
symKey   = keccak256( "FairWins/terms/v1" || normalize(code) )      // 32 bytes, AEAD key
```

`normalize(code)` = lowercase, trim, collapse internal whitespace to single spaces, NFKC — so
"`River  Amber tiger Kite`" and "`river amber tiger kite`" derive the same values.

**Rationale**: Matches the accepted v1 threat scope (entropy-only); the `v1` domain tag makes the
derivation function a swappable parameter (the plan's "keep the derivation swappable" requirement). Two
independent domain-separated outputs prevent the signing key and the encryption key from being the same
secret.

**Alternatives**: Memory-hard KDF now — deferred (Q1 = Option B); higher word count — deferred (entropy
floor fixed at 4 words).

## R3 — Keep the `Wager` struct and ABI backward compatible

**Decision**: Do **not** change the `Wager` struct or any existing function/event signature. Add new state
in side mappings, mirroring how the contract already stores `wagerTermsVersionHash` and `_drawConsent`
outside the struct:

```solidity
mapping(uint256 => address) public claimAuthority;      // wagerId   => code-derived address (0 if not open)
mapping(address => uint256) public openWagerIdByClaim;  // authority => active open wagerId (0 if none)
```

An "open" wager is simply one created via `createOpenWager`: `opponent == address(0)` while `status == Open`.
The existing `getWager` keeps returning the same struct (opponent is `0x0` until accepted, then the taker).

**Rationale**: FR-024 (backward compatibility) — existing integrators, the subgraph's `Wager` entity, and
the synced frontend ABI keep working unchanged; only *additive* surface appears. O(1) reads, no storage
migration.

**Alternatives**: Add fields to `Wager` — rejected (ABI/struct break, subgraph + frontend churn, violates
FR-024). A single struct for open wagers in a separate registry — rejected (duplicates the entire escrow,
splits liquidity/discovery, violates the "active contract is `wagerRegistry`" guardrail).

## R4 — Code-keyed encryption of the private terms

**Decision**: Add a **code-keyed envelope** mode to `frontend/src/utils/crypto/envelopeEncryption.js`
alongside the existing recipient-keyed (X25519 / X-Wing) modes. The terms are sealed with
XChaCha20-Poly1305 (`@noble/ciphers`, already a dependency) under `symKey` from R2; the envelope carries
its version + nonce but **no recipient list** (anyone with the code derives `symKey`). The on-chain
`metadataHash = keccak256(metadataReference)` continues to bind the bundle for tamper-evidence (FR-019),
and the AAD includes the bound terms-version hash exactly as the recipient-keyed path does.

**Rationale**: Solves the "cannot encrypt to an unknown taker" problem (FR-017/FR-018) by keying on the
shared secret instead of a registered public key. Reuses the existing IPFS upload + `metadataHash`
verification + "terms unavailable" fallback (FR-020), so the only new code is the seal/open by symmetric
key. Domain separation (R2) keeps this key independent of the signing key.

**Alternatives**: Reuse the recipient-keyed envelope with a throwaway keypair embedded in the code —
functionally equivalent but heavier; a plain unauthenticated cipher — rejected (no tamper detection,
fails FR-019). AES-GCM via WebCrypto — viable but XChaCha20-Poly1305 via `@noble/ciphers` matches the
existing crypto stack and avoids 96-bit-nonce reuse concerns.

## R5 — Subgraph handling of open wagers

**Decision**: Emit a dedicated `OpenWagerCreated(wagerId, creator, claimAuthority, token, stake,
resolutionType, metadataHash, metadataUri)` event from `createOpenWager` and add `handleOpenWagerCreated`
that writes a `Wager` with `opponent = null` and `status = "open"`. `handleWagerAccepted` already backfills
`opponent` from the accept event (the mapping comment explicitly anticipates "open wagers may have had a
zero opponent"), so the accept side needs no change.

**Rationale**: A separate creation event keeps the existing `WagerCreated` (with its non-null `opponent`
indexed argument) semantically honest for named wagers and lets the indexer/UI distinguish open challenges.
Acceptance/payout/refund/draw handlers are already type-agnostic.

**Alternatives**: Reuse `WagerCreated` with `opponent = address(0)` — workable but overloads an indexed
field that downstream consumers treat as a real participant; the dedicated event is clearer and cheap.

## R6 — Four-word code generation in the browser

**Decision**: Generate the code from the **BIP-39 English** wordlist (2048 words ⇒ 4 words ≈ 2⁴⁴, the
spec floor) using ethers v6's bundled `LangEn` wordlist — no new dependency. Generate 44 bits of CSPRNG
entropy (`crypto.getRandomValues`) and map to four word indices; `normalize()` per R2 on input.

**Rationale**: BIP-39 English is familiar, unambiguous (4-letter prefixes), already shipped with ethers,
and exactly hits the agreed entropy floor. Keeping generation client-side means the code is never sent to
a server (out-of-band sharing assumption).

**Alternatives**: A custom/emoji list — rejected by clarification (4 words chosen); what3words — external
dependency/licensing, rejected.

## Cross-cutting: EthTrust Security Level target

**Decision**: Target **EthTrust-SL L2** for the changed contract paths: comprehensive unit + fuzz tests,
checks-effects-interactions, reentrancy guard, audited signature library, documented invariants. Document
the v1 residual brute-force acceptance (FR-003a) as a known, scoped limitation rather than a contract
defect (it is an off-chain entropy choice, not an on-chain vulnerability).
