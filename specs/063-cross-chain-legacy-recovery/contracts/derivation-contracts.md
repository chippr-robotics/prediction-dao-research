# Derivation Contracts (client-side, memory-only keys)

**Feature**: 063 | These are the internal module interfaces the frontend exposes to itself. All
inputs/outputs that carry key material are memory-only; nothing here persists, logs, or transmits a
seed or private key (FR-017/021). Signatures are illustrative (JS, no types).

---

## crossChainDerive (frontend/src/lib/recovery/crossChainDerive.js)

```
deriveCrossChainAccounts(seedBytes, { network, chains, accountRange, gapLimit }) -> {
  bitcoin?:  DerivedExternalAccount[],   // one per (purpose, accountIndex) with used addresses
  solana?:   DerivedExternalAccount[],   // per scheme+account
  zcash?:    DerivedExternalAccount[],   // transparent only
  monero?:   DerivedExternalAccount      // Phase 1: address + view key (balance via LWS)
}
```
- `seedBytes` = BIP-39 seed from the recovered mnemonic (memory-only).
- MUST NOT invoke the frozen passkey BTC path; uses the additive HKDF-free entry (FR-019).
- Raw private key ⇒ single EVM account + at most one BTC address; NOT scannable (FR-013).

## Bitcoin (extend frontend/src/lib/bitcoin/)

```
deriveAccountFromSeed(seedBytes, { purpose: 44|49|84|86, coinType, account, network }) -> HDAccount
encodeAddress(pubkey, { type: 'p2pkh'|'p2sh-p2wpkh'|'p2wpkh'|'p2tr', network }) -> string
```
- `deriveBtcSeed` / `fairwins-btc-seed-v1` and existing BIP84/86 account-0 derivation UNCHANGED
  (SC-007). New code is additive.

## Solana (frontend/src/lib/solana/)

```
deriveSolanaKeypair(seedBytes, { scheme: 'bip44Change'|'bip44'|'bareSeed', account }) -> { pubkey, secret }  // SLIP-0010 ed25519, hardened-only
encodeSolanaAddress(pubkey32) -> base58(pubkey)      // no checksum
isValidSolanaAddress(str) -> base58-decodes to exactly 32 bytes
buildSolTransfer({ from, to, lamports, blockhash }) -> unsignedMessageBytes  // @solana/kit
signSol(messageBytes, secret) -> signature          // ed25519
```

## Zcash — transparent only (frontend/src/lib/zcash/)

```
deriveZcashTransparent(seedBytes, { account, index, network }) -> { pubkey, taddr }   // m/44'/133'/a'/0/i
encodeTAddr(pubkeyHash20, network) -> base58check(2-byte prefix || hash160)            // t1.. / tm..
buildZcashV5Tx({ inputs, outputs, expiryHeight, branchId }) -> unsignedTx
zip244TransparentSighash(tx, inputIndex, { branchId }) -> 32-byte digest               // BLAKE2b, RISK-QUARANTINED
signZcashInput(sighash, privkey) -> ecdsaSig
```
- `branchId` MUST be fetched live (never hardcoded).
- `zip244TransparentSighash` MUST pass official ZIP-244 vectors + a `@bitgo/utxo-lib` differential
  check before mainnet use (test gate).

## Monero — Phase 1 (frontend/src/lib/monero/)

```
deriveMonero(seedBytes, { scheme: 'keccak-screduce'|'slip10', account, network }) -> {
  privSpend, privView, pubSpend, pubView, address     // address = Monero base58, 95 chars
}
encodeMoneroAddress(pubSpend, pubView, network) -> base58Monero(prefix || pubSpend || pubView || keccak[0:4])
```
- Phase 1 exposes `privView` to the LWS balance path ONLY (see gateway contract — escalated FR-021
  exception). `privSpend` NEVER leaves the device in Phase 1.
- Phase 2 (send) adds WASM-backed `buildMoneroTx`/`signMoneroTx` (`mymonero-core`/`monero-ts`).
- MUST NOT reuse the wrong `floppy-keystore/chains.js` scheme.

---

## Invariants (all modules)

- No function returns a value that is logged, persisted, or sent to a gateway if it contains a
  seed or private key (Monero view key is the single escalated exception, Phase 1 balance only).
- Derivation is deterministic and vector-pinned per chain/scheme (test-first).
- Testnet vs mainnet derivation/encoding never mix (FR-015).
