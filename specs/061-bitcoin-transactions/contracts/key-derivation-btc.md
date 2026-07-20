# Contract: Bitcoin Key Derivation (spec 061)

Normative. Any change to these constants is a **wallet-breaking change** and
requires a versioned migration path — funds live at the derived addresses.
Implements the extension of the spec-041 derivation stack
(`frontend/src/lib/passkey/prfKeys.js` — "derived keys = existing derivation
stack fed from masterSeed").

## Inputs

- `masterSeed`: the 32-byte spec-041 per-account master seed (PRF-recoverable,
  memory-only). Never any other secret.

## Derivation

```
btcSeed   = HKDF-SHA256(ikm = masterSeed,
                        salt = 32 zero bytes,
                        info = "fairwins-btc-seed-v1",
                        length = 64)
root      = BIP32.fromMasterSeed(btcSeed)          // @scure/bip32
segwitAcct  = root.derive("m/84'/{coin}'/0'")      // BIP84  → P2WPKH bc1q…
taprootAcct = root.derive("m/86'/{coin}'/0'")      // BIP86  → P2TR   bc1p…
coin      = 0'  for network 'bitcoin' (mainnet)
            1'  for network 'bitcoin-testnet' (testnet4)
receive(i)  = acct.derive("0/" + i)                // external chain only
```

- Change chain (`…/1/i`) is RESERVED but unused in v1: change returns to the
  next unissued **external** receive address of the active type (keeps
  discovery/monitoring to one chain per account in v1). If a later version
  adopts the change chain, it must ship with widened discovery.
- Taproot output keys are BIP-341 tweaked (`@scure/btc-signer` `p2tr(internalKey)`
  key-path only, no script tree).

## Invariants (tested)

1. **Determinism**: same `masterSeed` ⇒ byte-identical addresses on every
   device, forever. Pinned test vectors: a fixed 32-byte test seed and its
   first 3 addresses per (type × network) are committed in the test suite; the
   BIP32/84/86 reference vectors validate the underlying libs.
2. **Domain separation**: no other consumer of `masterSeed` may use the info
   string `"fairwins-btc-seed-v1"`; the Bitcoin tree cannot collide with the
   spec-041 KEK path (different info) or future consumers.
3. **Memory-only**: `btcSeed`, `root`, account xprvs, and child private keys
   are never persisted, logged, serialized, or transmitted. Zeroize references
   on wallet lock where the runtime allows.
4. **xpub confinement**: account xpubs may be held in memory for address
   derivation but MUST NOT be persisted or sent to any service (the gateway
   receives bare addresses only, ≤50 per call).
5. **No wrong keys**: if the master seed is `unavailable`/`uninitialized`
   (non-PRF authenticator, external EVM wallet, no blob), the Bitcoin wallet
   status is `unavailable` with the honest reason — never a fallback
   derivation from any other material.
6. **Never-decreasing cursor**: the receive rotation index per (network, type)
   only increases; recovery sets it to `max(discovered used index, cached) + 1`.

## Availability matrix (drives FR-020 capability disclosure)

| Account situation | Bitcoin wallet |
|---|---|
| Passkey + PRF authenticator, seed blob present | `ready` after one PRF ceremony |
| Passkey + PRF, fresh account (no blob) | `ready` after `initMasterSeed` ceremony |
| Passkey, non-PRF authenticator | `unavailable` — honest reason, tx features elsewhere unaffected |
| Injected / WalletConnect EVM wallet | `unavailable` — Bitcoin requires a FairWins passkey account |
