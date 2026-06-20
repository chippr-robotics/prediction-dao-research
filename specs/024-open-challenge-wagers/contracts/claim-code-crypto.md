# Contract: Claim-Code Crypto (off-chain, frontend)

Pure, deterministic, unit-testable. Lives in `frontend/src/utils/claimCode/`. The same four words drive
discovery, accept authorization, and terms decryption. v1 derivation is **fast** (entropy-only,
FR-003a); the `v1` domain tags keep it swappable for a future hardened KDF.

## Wordlist (`wordlist.js`)

```
generateCode(): string
  // 44 bits CSPRNG (crypto.getRandomValues) → 4 indices into the BIP-39 English (LangEn) 2048 list
  // returns e.g. "river amber tiger kite"

normalizeCode(input: string): string
  // NFKC, lowercase, trim, collapse internal whitespace to single spaces

isValidCode(input: string): boolean
  // exactly 4 tokens, each a member of the wordlist (after normalize)
```

- Entropy: 2048⁴ = 2⁴⁴ (spec floor, FR-003). No new dependency — `LangEn` ships with ethers v6.

## Derivation (`deriveFromCode.js`)

```
deriveFromCode(code: string): {
  claimPrivateKey: Uint8Array,   // secp256k1, = keccak256("FairWins/claim/v1" || normalize(code)) reduced mod n (reject 0)
  claimAddress:    string,       // address(pubkey) — the on-chain claimAuthority + discovery key
  symKey:          Uint8Array,   // 32 bytes, = keccak256("FairWins/terms/v1" || normalize(code))  — envelope AEAD key
}
```

- Domain separation: the signing key and the encryption key are independent keccak outputs with distinct
  domain tags, so neither leaks the other.
- Determinism: identical normalized code ⇒ identical `claimAddress` / `symKey` on any device (required for
  taker discovery + decryption without server state).

## Accept signature (`deriveFromCode.js`)

```
signOpenAccept(code, { wagerId, taker, chainId, verifyingContract }): hexSignature
  // EIP-712:
  //   domain  = { name:"FairWins WagerRegistry", version:"1", chainId, verifyingContract }
  //   types   = { OpenAccept: [ {name:"wagerId",type:"uint256"}, {name:"taker",type:"address"} ] }
  //   message = { wagerId, taker }
  // signs with claimPrivateKey (NOT the wallet key); returns signature for acceptOpenWager(wagerId, sig)
```

- `taker` MUST equal the wallet that will send `acceptOpenWager` (`msg.sender`), binding the signature to
  that address — this is the front-running defense (FR-011, SC-006).
- Matches `OPEN_ACCEPT_TYPEHASH` and the registry's EIP-712 domain exactly.

## Code-keyed envelope (`crypto/envelopeEncryption.js`, new mode)

```
encryptEnvelopeCode(terms, symKey, termsVersion?): envelope   // XChaCha20-Poly1305, random 24-byte nonce, no recipients
decryptEnvelopeCode(envelope, symKey): terms                  // AEAD verify; throws on tamper
isCodeEnvelope(envelope): boolean                             // mode === "code"
```

- AAD binds the terms-version hash (parity with recipient-keyed envelopes).
- The IPFS reference to this envelope is hashed into the on-chain `metadataHash` for tamper-evidence
  (FR-019); the existing "terms unavailable" fallback applies if IPFS retrieval fails (FR-020).

## Frontend flow contracts

**Create (open challenge)** — `useFriendMarketCreation` open branch:
1. `code = generateCode()`; `{ claimAddress, symKey } = deriveFromCode(code)`.
2. Encrypt terms with `encryptEnvelopeCode(terms, symKey)` → IPFS → `metadataReference` → `metadataHash`.
3. `createOpenWager(claimAddress, arbitrator, token, stake, deadlines, resolutionType, oracleConditionId,
   creatorIsYes, metadataHash, metadataReference)` (restrict UI resolution choices to allowed set;
   single equal stake).
4. Display `code` once with a save/copy/share affordance + the honest residual-risk notice (FR-003a) and
   the "save the code to read this later" reminder (FR-018a). The code is never sent anywhere.

**Take (accept)** — `useOpenChallengeAccept`:
1. User enters words; `isValidCode` → `{ claimAddress, symKey } = deriveFromCode(code)`.
2. `wagerId = registry.openWagerIdForClaim(claimAddress)`; if `0` → "no challenge for that code".
3. Fetch wager + envelope; `decryptEnvelopeCode(envelope, symKey)` → show terms (verify `metadataHash`).
4. Non-member taker → buy-membership prompt (Q2); else `sig = signOpenAccept(code, {wagerId, taker,
   chainId, verifyingContract})`; `registry.acceptOpenWager(wagerId, sig)`.
5. Remind the (now) opponent to keep the code for future reads (FR-018a).
