# Contract: Encrypted Terms Bundle (arbitrator as reader)

The off-chain encryption contract. The envelope **format is unchanged** — the change is that the arbitrator is added to the recipient set when assigned.

## Recipient assembly (creation, private wager)

```
recipients = [
  { address: creator,   publicKey: lookupPublicKey(creator) },
  { address: opponent,  publicKey: lookupPublicKey(opponent) },
  // NEW — only for ThirdParty wagers with an assigned arbitrator:
  { address: arbitrator, publicKey: lookupPublicKey(arbitrator) },
]
envelope = encryptEnvelope(termsPlaintext, recipients)   // existing N-recipient API
```

Precondition (FR-007): every recipient address MUST have a registered key (`hasRegisteredKey`); otherwise creation is blocked and the missing party is named. The arbitrator must differ from creator and opponent.

## Invariants the bundle must satisfy

1. **One ciphertext, N wrapped keys**: `content` is encrypted once; `keys[]` has exactly one entry per recipient (2 without an arbitrator, 3 with).
2. **Decryptability**: `canDecrypt(envelope, addr) === true` for each recipient; `false` for any other address (FR-002, FR-004).
3. **No participant regression**: creator and opponent entries/decryption are identical to a two-recipient wager (FR-003).
4. **Integrity binding**: `Wager.metadataHash === keccak256(metadataReference)` where `metadataReference === "encrypted:ipfs://<CID>"`; a reader recomputes/compares so a substituted bundle is detected (FR-008).
5. **Confidentiality**: adding the arbitrator entry does not alter or weaken the creator/opponent wrapped keys (FR-011).
6. **Availability degradation**: if the bundle can't be fetched, readers see "terms unavailable"; on-chain funds/resolution proceed (FR-010).

## Decryption (unchanged)

- `useLazyMarketDecryption` / `canDecrypt` already key off `keys[].address`; the arbitrator decrypts exactly like a participant. No change beyond being a recipient.

## Out of scope (v1)

- Late-binding a reader after creation (re-preparing the bundle when a key is registered later) — blocked instead (D4).
- A separate read-only observer recipient — none (observer = arbitrator).
