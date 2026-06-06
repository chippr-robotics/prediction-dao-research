# Phase 1 Data Model: Multi-Recipient Wager Encryption

This feature adds the **arbitrator** as a reader and makes them discoverable. It does **not** change the encrypted-bundle format, the `Wager` struct shape, or resolution rules.

---

## 1. Reader set (off-chain, per wager)

The set of addresses entitled to decrypt a private wager's terms:

| Reader | Present when | Can act? |
|--------|--------------|----------|
| Creator | always | yes (per resolution type) |
| Opponent | always (once accepted) | yes (per resolution type) |
| **Arbitrator** | **when `Wager.arbitrator != 0` (ThirdParty)** | resolve / draw only |

Today: `{creator, opponent}`. This feature: `{creator, opponent, arbitrator?}`. There is no separate "observer" (decided: observer = arbitrator).

---

## 2. Encrypted Terms Bundle (unchanged format — recipient set grows)

The IPFS-stored envelope already supports N recipients. Shape (abridged, from `envelopeEncryption.js`):

```jsonc
{
  "version": "1.0" | "2.0",
  "algorithm": "x25519-chacha20poly1305" | "xwing-chacha20poly1305",
  "signingVersion": 2,
  "content": { "nonce": "<hex>", "ciphertext": "<hex>" },   // terms encrypted ONCE with a data key
  "keys": [                                                  // one wrapped data-key per reader
    { "address": "0x<creator>",   "wrappedKey": "<hex>", "nonce": "<hex>", "...": "..." },
    { "address": "0x<opponent>",  "wrappedKey": "<hex>", "nonce": "<hex>", "...": "..." },
    { "address": "0x<arbitrator>","wrappedKey": "<hex>", "nonce": "<hex>", "...": "..." }  // NEW entry when assigned
  ]
}
```

- **Change**: when an arbitrator is assigned, the creator includes a third `keys[]` entry for them (one extra key wrap). `content` is unchanged (encrypted once).
- **Decryption**: `canDecrypt(envelope, addr)` returns true iff `addr ∈ keys[].address` — so the arbitrator decrypts with no code change.
- **Integrity**: the on-chain `Wager.metadataHash = keccak256(metadataReference)` binds the bundle reference; a substituted/corrupted bundle fails the check (FR-008).
- **Storage**: one file on IPFS; on-chain `Wager.metadataUri = "encrypted:ipfs://<CID>"`.

---

## 3. On-chain change (the only one): index the arbitrator

`WagerRegistry.createWager`, in the Effects section alongside the existing creator/opponent index writes:

```solidity
_userWagerIds[msg.sender].add(wagerId);     // creator   (existing)
_userWagerIds[opponent].add(wagerId);       // opponent  (existing)
if (w.arbitrator != address(0)) {           // NEW
    _userWagerIds[w.arbitrator].add(wagerId);
}
```

- No new storage variable, event, or function — reuses `_userWagerIds` (EnumerableSet) and the existing `getUserWagerIds` / `getUserWagers` views.
- Only fires for `ThirdParty` wagers (the sole case `arbitrator != 0`, enforced by existing create-time checks: `ArbitratorRequired` for ThirdParty, `ArbitratorDisallowed` otherwise, and arbitrator ≠ creator/opponent).
- Append-only; never removed (matches creator/opponent behavior).
- Ships in the 004 **v3** redeploy.

---

## 4. Key-gate (creation precondition)

For a private `ThirdParty` wager, before upload/create:

| Check | Source | On fail |
|-------|--------|---------|
| Arbitrator has a registered encryption key | `hasRegisteredKey(arbitrator, provider)` | **Block** creation; message names the missing arbitrator (FR-007) |
| Fetch arbitrator public key for encryption | `lookupPublicKey(arbitrator, provider)` | (only reached when the above passed) |

Participants' own key checks already gate private creation; this extends the same gate to the arbitrator. (A public/plaintext ThirdParty wager has no encryption and thus no key-gate, but is still indexed for the arbitrator per §3.)

---

## 5. Entities

- **Wager** (on-chain, unchanged shape): `creator`, `opponent`, `arbitrator`, … `metadataHash`, `metadataUri`. Now additionally indexed by `arbitrator`.
- **Reader**: creator | opponent | arbitrator — an address with a `keys[]` entry in the bundle.
- **Encrypted Terms Bundle**: the IPFS envelope (§2), referenced + integrity-bound on-chain.
- **Encryption Key Directory**: `KeyRegistry` (address→public key); `keyRegistryService` reads it. Gates who can be a reader.
- **Arbitrator**: reader + resolver; discoverable via the per-user index; uses existing `declareWinner` (and 004 `declareDraw`) authority.

---

## 6. State / flow (additions in **bold**)

```
Create private ThirdParty wager:
  pick arbitrator addr ──► validate (addr; ≠ creator/opponent)
       │
       └─ **hasRegisteredKey(arbitrator)? ── no ──► BLOCK (FR-007, name missing party)**
                          │ yes
                          ▼
   recipients = [creator, opponent, **arbitrator**]  ──► encryptEnvelope ──► IPFS bundle
                          │
                          ▼
   createWager(..., arbitrator, ...)  ──►  **_userWagerIds[arbitrator].add(wagerId)**

Arbitrator later:
  getUserWagers(arbitrator) ──► **filter arbitrator == me ("Arbitrating" view)**
       │
       ├─ fetch bundle ──► canDecrypt(me) == true ──► read terms (verify vs metadataHash)
       └─ declareWinner / declareDraw (existing ThirdParty authority) ──► resolved
```

Non-readers: `canDecrypt == false` → terms remain unreadable (FR-002). Bundle unfetchable → "terms unavailable", on-chain actions unaffected (FR-010).
